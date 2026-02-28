import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useSendTransaction, useSwitchChain } from 'wagmi'
import { waitForTransactionReceipt } from '@wagmi/core'
import { wagmiConfig } from '../config/wagmiConfig'
import {
  ShieldCheck, Database, Layers,
  AlertTriangle, Loader2, CheckCircle2, Info, RefreshCw,
} from 'lucide-react'
import { useQuote } from '../hooks/useQuote'
import { API_BASE } from '../config/wagmiConfig'

// ── Types ─────────────────────────────────────────────────────────────────────

type FlowState = 'invalid' | 'landing' | 'quoting' | 'review' | 'authorizing'

interface MerchantProfile {
  wallet_address: string
  display_name: string
  logo_url?: string
}

interface LinkParams {
  to: string
  amount: string
  label: string
  ref: string
}

// ── Chain display helpers ─────────────────────────────────────────────────────

const CHAIN_LABELS: Record<string, string> = {
  'arc-testnet': 'Arc Testnet',
  'ethereum-sepolia': 'Ethereum Sepolia',
  'base-sepolia': 'Base Sepolia',
}

function ChainIcon({ chain }: { chain: string }) {
  if (chain.includes('arc')) return <ShieldCheck className="w-5 h-5" />
  if (chain.includes('base')) return <Layers className="w-5 h-5" />
  return <Database className="w-5 h-5" />
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Pay() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { address: walletAddress, isConnected } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()

  const [flowState, setFlowState] = useState<FlowState>('landing')
  const [linkParams, setLinkParams] = useState<LinkParams | null>(null)
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [quoteVersion, setQuoteVersion] = useState(0)

  // ── Step 1: verify payment link on mount ────────────────────────────────────
  useEffect(() => {
    const params = Object.fromEntries(searchParams.entries())
    if (!params.to || !params.amount || !params.sig) {
      setFlowState('invalid')
      setVerifyError('Missing payment link parameters.')
      return
    }

    fetch(`${API_BASE}/api/payment-link/verify?${searchParams.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.valid) {
          setFlowState('invalid')
          setVerifyError(data.error ?? 'Invalid payment link signature.')
          return
        }
        setLinkParams({
          to: data.merchantAddress,
          amount: data.amount,
          label: data.label,
          ref: data.ref,
        })
        // Fetch merchant profile (non-blocking — show address if not found)
        fetch(`${API_BASE}/api/merchant/${data.merchantAddress}`)
          .then((r) => r.ok ? r.json() : null)
          .then((m) => setMerchant(m))
          .catch(() => {})
      })
      .catch(() => {
        setFlowState('invalid')
        setVerifyError('Could not verify payment link. Please try again.')
      })
  }, [searchParams])

  // ── Step 2: auto-fetch quote when wallet connects ────────────────────────────
  useEffect(() => {
    if (isConnected && linkParams && flowState === 'landing') {
      setFlowState('quoting')
    }
  }, [isConnected, linkParams, flowState])

  const { data: quote, isLoading: quoteLoading, error: quoteError } = useQuote(
    flowState === 'quoting' || flowState === 'review' ? walletAddress : undefined,
    linkParams?.amount,
    quoteVersion
  )

  // Refresh: bump version (new cache key = fresh fetch) then show loading state
  const handleRefresh = () => {
    setAuthError(null)
    setQuoteVersion((v) => v + 1)
    setFlowState('quoting')
  }

  useEffect(() => {
    if (quote && flowState === 'quoting') {
      setFlowState('review')
    }
  }, [quote, flowState])

  // ── Step 3: Confirm & Authorize ──────────────────────────────────────────────
  const handleAuthorize = async () => {
    if (!walletAddress || !linkParams || !quote) return
    setFlowState('authorizing')
    setAuthError(null)

    try {
      // 1. Create session key — backend derives payer address + fund txes.
      //    payerAddress = sessionAddress (session key EOA) in all cases.
      //    Arc-direct: EOA holds USDC on Arc, pays directly.
      //    Cross-chain: Bridge Kit bridges USDC to same EOA on Arc, then pays directly.
      const sessionRes = await fetch(`${API_BASE}/api/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          spendLimitUsdc: quote.userAuthorizes,
          expirySeconds: 3600,
          sourcePlan: quote.sourcePlan,
        }),
      })
      if (!sessionRes.ok) throw new Error('Failed to create session key')
      const { payerAddress, fundTxes } = await sessionRes.json()

      // 2. Send fund transactions — user signs each tx to transfer assets.
      //    Switch to the correct chain first so MetaMask doesn't reject the tx.
      //    Arc-direct: switch to Arc Testnet, transfer USDC to session key EOA.
      //    Cross-chain: switch to Base/Ethereum Sepolia, transfer USDC to session key EOA.
      for (const tx of fundTxes) {
        await switchChainAsync({ chainId: tx.chainId })
        const hash = await sendTransactionAsync({
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: BigInt(tx.value ?? 0),
          chainId: tx.chainId,
        })
        await waitForTransactionReceipt(wagmiConfig, { hash, chainId: tx.chainId })
      }

      // 3. Start the payment job — backend orchestrator takes it from here
      const payRes = await fetch(`${API_BASE}/api/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payerAddress,
          merchantAddress: linkParams.to,
          targetAmount: linkParams.amount,
          label: linkParams.label,
          paymentRef: linkParams.ref,
        }),
      })
      if (!payRes.ok) throw new Error('Failed to start payment job')
      const { jobId } = await payRes.json()

      // 4. Navigate to progress page — job auto-executes on the backend
      //    (no separate /confirm needed; user confirmed by signing the fund txs)
      navigate(`/progress/${jobId}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authorization failed'
      setAuthError(msg)
      setFlowState('review')
    }
  }

  // ── Renders ──────────────────────────────────────────────────────────────────

  if (flowState === 'invalid') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-40 text-center">
        <div className="w-20 h-20 bg-red-500/10 rounded-[2rem] flex items-center justify-center mx-auto mb-8">
          <AlertTriangle className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-4xl font-black text-[#132318] tracking-tighter mb-4">Invalid Link</h1>
        <p className="text-[#132318]/50 font-medium">{verifyError ?? 'This payment link is invalid or has expired.'}</p>
      </div>
    )
  }

  if (!linkParams) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-40 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#132318]/30 animate-spin" />
      </div>
    )
  }

  const merchantName = merchant?.display_name ?? `${linkParams.to.slice(0, 6)}…${linkParams.to.slice(-4)}`

  return (
    <div className="mx-auto max-w-2xl px-6 py-24 sm:py-40">
      {/* Header */}
      <div className="mb-16">
        <div className="inline-flex items-center gap-2 pill-tag mb-6 border-[#132318]/10">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span className="uppercase text-[10px] tracking-[0.2em] font-black">Secure Checkout</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-black text-[#132318] tracking-tighter leading-[0.9]">
          {linkParams.label || 'Payment Request'}
        </h1>
        <p className="mt-6 text-xl text-[#132318]/50 font-medium max-w-md">
          {merchantName} is requesting <span className="font-black text-[#132318]">{linkParams.amount} USDC</span>
        </p>
      </div>

      <div className="space-y-8">
        {/* Payment card */}
        <div className="fin-card relative">
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#E1FF76]/10 rounded-bl-[100px] -z-10" />
          <div className="space-y-8">
            <div className="flex items-center justify-between p-6 rounded-[1.5rem] bg-[#132318]/[0.03] border border-[#132318]/5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#132318]/40 mb-1">Recipient</p>
                <p className="font-black text-[#132318] text-lg">{merchantName}</p>
                <p className="font-mono text-xs text-[#132318]/40 mt-1">{linkParams.to}</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-6 rounded-[1.5rem] bg-[#E1FF76]/10 border border-[#E1FF76]/20">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#132318]/40 mb-1">Amount</p>
                <p className="text-5xl font-black text-[#132318] tracking-tighter">{linkParams.amount} <span className="opacity-30">USDC</span></p>
              </div>
            </div>
            {linkParams.ref && (
              <div className="flex items-center gap-2 p-4 bg-[#132318]/[0.02] rounded-2xl border border-[#132318]/5">
                <Info className="w-4 h-4 text-[#132318]/40 shrink-0" />
                <p className="text-xs text-[#132318]/60 font-bold">Ref: {linkParams.ref}</p>
              </div>
            )}
          </div>
        </div>

        {/* Wallet connection / quote / authorize */}
        {!isConnected ? (
          <div className="fin-card text-center py-16">
            <p className="text-[#132318]/50 font-bold mb-8">Connect your wallet to see sourcing quote</p>
            <div className="flex justify-center">
              <ConnectButton label="Connect Wallet" />
            </div>
          </div>
        ) : flowState === 'quoting' || quoteLoading ? (
          <div className="fin-card py-16 text-center">
            <Loader2 className="w-10 h-10 text-[#132318]/30 animate-spin mx-auto mb-4" />
            <p className="text-[#132318]/50 font-bold text-sm uppercase tracking-widest">Scanning your balances across chains…</p>
          </div>
        ) : quoteError ? (
          <div className="fin-card py-12 text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-red-500 font-bold">{(quoteError as Error).message}</p>
          </div>
        ) : quote ? (
          <>
            {/* Sourcing plan */}
            {!quote.sufficientFunds ? (
              <div className="fin-card bg-red-50 border-red-100 py-10 text-center">
                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
                <p className="font-black text-red-600">Insufficient funds</p>
                <p className="text-red-400 text-sm mt-1">
                  You need {quote.shortfallUsdc} USDC more across your wallets.
                </p>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-red-200 text-red-600 font-bold text-sm hover:bg-red-50 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" /> Refresh Balance
                </button>
              </div>
            ) : (
              <>
                {/* Sourcing card */}
                <div className="fin-card !p-10">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-label flex items-center gap-3">
                      <Database className="w-5 h-5 text-[#132318]/40" /> Liquidity Sources
                    </h2>
                    <button
                      type="button"
                      onClick={handleRefresh}
                      title="Refresh balances"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#132318]/[0.04] border border-[#132318]/10 text-[#132318]/50 hover:text-[#132318] hover:bg-[#132318]/[0.07] text-xs font-bold transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                  </div>
                  <div className="space-y-4">
                    {quote.sourcePlan.map((step, i) => (
                      <div key={i} className="flex items-center justify-between p-5 rounded-[1.25rem] bg-[#132318]/[0.02] border border-[#132318]/5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#132318] shadow-sm border border-[#132318]/5">
                            <ChainIcon chain={step.chain} />
                          </div>
                          <div>
                            <p className="font-black text-[#132318] tracking-tight text-sm">{CHAIN_LABELS[step.chain] ?? step.chain}</p>
                            <p className="text-[10px] text-[#132318]/40 font-bold uppercase tracking-wider mt-0.5">
                              {step.type === 'swap' ? `Swap ${step.fromAmount} ETH → USDC` : 'USDC Balance'}
                            </p>
                          </div>
                        </div>
                        <span className="font-mono text-sm font-black text-[#132318]">
                          {step.type === 'swap' ? `~${step.toUsdc} USDC` : `${step.amount} USDC`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fee breakdown card */}
                <div className="fin-card !bg-[#132318] text-white !p-10 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-[100px] rounded-full" />
                  <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 mb-8 relative z-10">Total Breakdown</h2>
                  <div className="space-y-3 mb-8 relative z-10">
                    {quote.breakdown && (
                      <>
                        <div className="flex justify-between text-white/50 font-bold">
                          <span>Swap fee</span>
                          <span className="text-white">{quote.breakdown.swapFee} USDC</span>
                        </div>
                        <div className="flex justify-between text-white/50 font-bold">
                          <span>Circle Gateway bridge fee</span>
                          <span className="text-white">{quote.breakdown.bridgeFee} USDC</span>
                        </div>
                        <div className="flex justify-between text-white/50 font-bold">
                          <span>Arc gas (USDC)</span>
                          <span className="text-white">{quote.breakdown.arcGas} USDC</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="h-px bg-white/10 mb-8 relative z-10" />
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative z-10">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-2">You authorize</p>
                      <h3 className="text-5xl font-black tracking-tighter">{quote.userAuthorizes} <span className="text-[#E1FF76]">USDC</span></h3>
                    </div>
                    <div className="md:text-right">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#E1FF76]/50 mb-2">Merchant receives</p>
                      <h3 className="text-3xl font-black text-[#E1FF76] opacity-80">{quote.merchantReceives} USDC</h3>
                    </div>
                  </div>
                </div>

                {authError && (
                  <div className="flex items-center gap-3 p-5 rounded-2xl bg-red-50 border border-red-100">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                    <p className="text-red-600 font-bold text-sm">{authError}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleAuthorize}
                  disabled={flowState === 'authorizing'}
                  className="btn-primary w-full py-8 text-2xl justify-center !bg-[#E1FF76] !text-[#132318] hover:!bg-white shadow-[0_30px_60px_#E1FF7622] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {flowState === 'authorizing' ? (
                    <><Loader2 className="w-7 h-7 animate-spin" /> Authorizing…</>
                  ) : (
                    <><CheckCircle2 className="w-7 h-7" /> Confirm & Authorize</>
                  )}
                </button>
                <div className="text-center space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#132318] leading-relaxed">
                    {(quote as { isDirect?: boolean }).isDirect
                      ? 'Direct on Arc — no bridging needed.'
                      : quote.sourcePlan.length > 1
                        ? `${quote.sourcePlan.length} wallet signatures. No manual bridging.`
                        : 'One wallet signature. No manual bridging.'}
                  </p>
                  <p className="text-[10px] font-bold text-[#132318]/30 uppercase tracking-[0.1em]">
                    Session key expires in 1 hour.
                  </p>
                </div>
              </>
            )}
          </>
        ) : null}
      </div>

      <div className="mt-16 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-[#132318]/20">
          {(quote as { isDirect?: boolean } | null)?.isDirect
            ? 'Direct on Arc · Powered by Zerra'
            : 'Powered by Circle Gateway · Arc Network'}
        </p>
      </div>
    </div>
  )
}
