import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useSendTransaction } from 'wagmi'
import { RefreshCw, CheckCircle2, Loader2, AlertTriangle, X } from 'lucide-react'
import { API_BASE } from '../config/wagmiConfig'

interface Subscription {
  id: string
  merchant_address: string
  payer_address: string
  amount_usdc: string
  label: string | null
  interval_days: number
  next_charge_at: number
  status: string
}

type PageState = 'loading' | 'review' | 'authorizing' | 'done' | 'error'

export default function SubscriptionAuth() {
  const { subscriptionId } = useParams<{ subscriptionId: string }>()
  const { address, isConnected } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()

  const [sub, setSub] = useState<Subscription | null>(null)
  const [pageState, setPageState] = useState<PageState>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!subscriptionId) return
    fetch(`${API_BASE}/api/subscriptions/${subscriptionId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Subscription not found')
        return r.json()
      })
      .then((data) => {
        setSub(data)
        setPageState('review')
      })
      .catch((err) => {
        setErrorMsg(err.message)
        setPageState('error')
      })
  }, [subscriptionId])

  const handleAuthorize = async () => {
    if (!address || !sub) return
    setPageState('authorizing')
    setErrorMsg(null)

    try {
      // 1. Create a 365-day session key — backend derives smart account + fund tx
      const sessionRes = await fetch(`${API_BASE}/api/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          spendLimitUsdc: sub.amount_usdc,
          expirySeconds: 365 * 24 * 3600, // 1 year
        }),
      })
      if (!sessionRes.ok) throw new Error('Failed to create session key')
      const { fundTxes } = await sessionRes.json()

      // 2. Fund the smart account — transfers USDC from payer EOA to smart account
      for (const tx of fundTxes) {
        await sendTransactionAsync({
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: BigInt(tx.value ?? 0),
          chainId: tx.chainId,
        })
      }

      // 3. Authorize the subscription with the session key
      const authRes = await fetch(`${API_BASE}/api/subscriptions/${subscriptionId}/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      })
      if (!authRes.ok) {
        const err = await authRes.json()
        throw new Error(err.error ?? 'Authorization failed')
      }

      setPageState('done')
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Authorization failed')
      setPageState('review')
    }
  }

  if (pageState === 'loading') {
    return (
      <div className="mx-auto max-w-lg px-6 py-40 flex justify-center">
        <Loader2 className="w-10 h-10 text-[#132318]/30 animate-spin" />
      </div>
    )
  }

  if (pageState === 'error') {
    return (
      <div className="mx-auto max-w-lg px-6 py-40 text-center">
        <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-6" />
        <h1 className="text-3xl font-black text-[#132318] mb-4">Error</h1>
        <p className="text-[#132318]/50">{errorMsg}</p>
      </div>
    )
  }

  if (pageState === 'done') {
    return (
      <div className="mx-auto max-w-lg px-6 py-40 text-center">
        <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-8" />
        <h1 className="text-4xl font-black text-[#132318] tracking-tighter mb-4">Authorized!</h1>
        <p className="text-[#132318]/50 font-medium mb-8">
          Your subscription is active. You'll be charged automatically.
        </p>
        {sub && (
          <div className="fin-card text-left space-y-3">
            <DetailRow label="Amount" value={`${sub.amount_usdc} USDC`} />
            <DetailRow label="Every" value={`${sub.interval_days} day(s)`} />
            {sub.label && <DetailRow label="Label" value={sub.label} />}
          </div>
        )}
      </div>
    )
  }

  if (!sub) return null

  return (
    <div className="mx-auto max-w-lg px-6 py-24">
      <div className="mb-12 text-center">
        <div className="inline-flex items-center gap-2 pill-tag mb-6 border-[#132318]/10">
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="uppercase text-[10px] tracking-[0.2em] font-black">Recurring Payment</span>
        </div>
        <h1 className="text-4xl font-black text-[#132318] tracking-tighter">Authorize Subscription</h1>
      </div>

      <div className="fin-card space-y-8">
        {/* Subscription summary */}
        <div className="text-center py-4">
          <p className="text-5xl font-black text-[#132318] tracking-tighter">{sub.amount_usdc} USDC</p>
          <p className="text-[#132318]/50 font-medium mt-2">every {sub.interval_days} day(s)</p>
          {sub.label && (
            <p className="text-sm text-[#132318]/40 font-bold mt-1">{sub.label}</p>
          )}
        </div>

        <div className="space-y-3 border-t border-[#132318]/5 pt-6">
          <DetailRow label="Merchant" value={sub.merchant_address.slice(0, 10) + '…' + sub.merchant_address.slice(-6)} mono />
          <DetailRow label="First charge" value={new Date(sub.next_charge_at).toLocaleDateString()} />
        </div>

        {/* Terms notice */}
        <div className="p-4 rounded-2xl bg-[#132318]/[0.03] border border-[#132318]/5">
          <p className="text-xs text-[#132318]/40 leading-relaxed">
            By authorizing, you grant a session key that allows the merchant to charge{' '}
            <strong>{sub.amount_usdc} USDC</strong> from your wallet every {sub.interval_days} day(s).
            You can cancel at any time.
          </p>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-100">
            <X className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 font-medium">{errorMsg}</p>
          </div>
        )}

        {!isConnected ? (
          <div className="flex justify-center">
            <ConnectButton label="Connect Wallet to Authorize" />
          </div>
        ) : (
          <button
            onClick={handleAuthorize}
            disabled={pageState === 'authorizing'}
            className="btn-primary w-full py-6 text-xl justify-center disabled:opacity-50"
          >
            {pageState === 'authorizing' ? (
              <><Loader2 className="w-6 h-6 animate-spin" /> Authorizing…</>
            ) : (
              <><RefreshCw className="w-6 h-6" /> Authorize Subscription</>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-[#132318]/40 font-bold">{label}</span>
      <span className={`text-sm text-[#132318] font-bold ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
