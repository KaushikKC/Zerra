import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, XCircle, AlertTriangle, ExternalLink, Loader2, Share2, Clock, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { API_BASE } from '../config/wagmiConfig'

interface SourceStep {
  chain: string
  type: 'usdc' | 'swap'
  amount?: string
  toUsdc?: string
  isDirect?: boolean
}

interface Receipt {
  jobId: string
  status: string
  merchantAddress: string
  targetAmount: string
  label: string | null
  merchantReceives: string | null
  txHash: string | null
  sourcePlan: SourceStep[] | null
  expiresAt: number | null
  createdAt: number
}

const CHAIN_META: Record<string, { label: string; dot: string }> = {
  'arc-testnet':      { label: 'Arc Testnet',        dot: 'bg-indigo-400' },
  'ethereum-sepolia': { label: 'Ethereum Sepolia',   dot: 'bg-blue-400' },
  'base-sepolia':     { label: 'Base Sepolia',        dot: 'bg-sky-400' },
  ethereum:           { label: 'Ethereum',            dot: 'bg-blue-400' },
  base:               { label: 'Base',                dot: 'bg-sky-400' },
}

const TERMINAL = new Set(['COMPLETE', 'FAILED', 'EXPIRED'])

function fmt(ts: number, ms = false) {
  return new Date(ms ? ts : ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtUsdc(value: string | null | undefined): string {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (Number.isNaN(n)) return value
  return n.toFixed(2)
}

// ── Dashed divider ─────────────────────────────────────────────────────────
function Tear() {
  return (
    <div className="relative my-1 flex items-center">
      <div className="absolute -left-8 w-5 h-5 rounded-full bg-[#F4F4F0]" />
      <div className="flex-1 border-t-2 border-dashed border-gray-200" />
      <div className="absolute -right-8 w-5 h-5 rounded-full bg-[#F4F4F0]" />
    </div>
  )
}

export default function Receipt() {
  const { jobId } = useParams<{ jobId: string }>()
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId) return
    let active = true

    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/api/pay/${jobId}/receipt`)
        if (!res.ok) { setError('Payment not found'); return }
        const data: Receipt = await res.json()
        if (active) {
          setReceipt(data)
          if (!TERMINAL.has(data.status)) setTimeout(poll, 3000)
        }
      } catch {
        if (active) setTimeout(poll, 5000)
      }
    }

    poll()
    return () => { active = false }
  }, [jobId])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-lg font-bold text-[#132318]">Receipt not found</p>
          <p className="text-sm text-[#132318]/40 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  if (!receipt) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#132318]/20 animate-spin" />
      </div>
    )
  }

  const amount = receipt.merchantReceives ?? receipt.targetAmount
  const isPending = !TERMINAL.has(receipt.status)

  return (
    <div className="min-h-screen bg-[#F4F4F0] flex flex-col items-center justify-center px-4 py-16">

      {/* ── Receipt card ─────────────────────────────────────────────────── */}
      <div className="w-full max-w-sm">

        {/* Top label */}
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#132318]/30">Receipt</span>
          <span className="text-[10px] font-mono text-[#132318]/30">#{jobId?.slice(0, 10).toUpperCase()}</span>
        </div>

        {/* Paper card */}
        <div className="bg-white rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] overflow-hidden">

          {/* ── Status banner ────────────────────────────────────────────── */}
          {receipt.status === 'COMPLETE' && (
            <div className="bg-[#132318] px-7 pt-8 pb-7 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[#E1FF76]/5" />
              <div className="relative">
                <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-[#E1FF76]/15 border border-[#E1FF76]/20 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-[#E1FF76]" />
                </div>
                <p className="text-[#E1FF76] font-black text-sm uppercase tracking-[0.2em]">Payment Confirmed</p>
              </div>
            </div>
          )}
          {receipt.status === 'FAILED' && (
            <div className="bg-red-600 px-7 pt-8 pb-7 text-center">
              <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                <XCircle className="w-7 h-7 text-white" />
              </div>
              <p className="text-white font-black text-sm uppercase tracking-[0.2em]">Payment Failed</p>
            </div>
          )}
          {receipt.status === 'EXPIRED' && (
            <div className="bg-gray-500 px-7 pt-8 pb-7 text-center">
              <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-white" />
              </div>
              <p className="text-white font-black text-sm uppercase tracking-[0.2em]">Expired</p>
            </div>
          )}
          {isPending && (
            <div className="bg-[#132318]/5 px-7 pt-8 pb-7 text-center">
              <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-[#132318]/5 flex items-center justify-center">
                <Loader2 className="w-7 h-7 text-[#132318]/40 animate-spin" />
              </div>
              <p className="text-[#132318]/50 font-black text-sm uppercase tracking-[0.2em]">Processing</p>
            </div>
          )}

          {/* ── Amount hero ──────────────────────────────────────────────── */}
          <div className="px-8 py-7 text-center border-b border-gray-100">
            <p className="text-[42px] font-black text-[#132318] tracking-tight leading-none tabular-nums">
              {fmtUsdc(amount)}
              <span className="text-xl font-bold text-[#132318]/25 ml-2">USDC</span>
            </p>
            {receipt.label && (
              <p className="text-sm text-[#132318]/40 font-medium mt-2">{receipt.label}</p>
            )}
          </div>

          {/* ── Details rows ─────────────────────────────────────────────── */}
          <div className="px-8 py-6 space-y-4">
            <Row label="Paid to">
              <span className="font-mono text-xs bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-100">
                {receipt.merchantAddress.slice(0, 8)}…{receipt.merchantAddress.slice(-6)}
              </span>
            </Row>
            <Row label="Date">
              {fmt(receipt.createdAt)}
            </Row>
            <Row label="Network">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E1FF76] ring-2 ring-[#132318]/10 inline-block" />
                Arc Testnet
              </span>
            </Row>
            <Row label="Settlement">
              Cross-chain USDC
            </Row>
            {receipt.expiresAt && receipt.status !== 'COMPLETE' && (
              <Row label="Expires">
                {fmt(receipt.expiresAt * 1000)}
              </Row>
            )}
          </div>

          {/* ── Tx hash ──────────────────────────────────────────────────── */}
          {receipt.txHash && (
            <>
              <Tear />
              <div className="px-8 py-5">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#132318]/30 mb-2">Transaction</p>
                <p className="font-mono text-[11px] text-[#132318]/60 break-all leading-relaxed bg-gray-50 rounded-xl p-3 border border-gray-100">
                  {receipt.txHash}
                </p>
                <a
                  href={`https://testnet.arcscan.app/tx/${receipt.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#132318]/50 hover:text-[#132318] transition-colors"
                >
                  View on ArcScan <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </>
          )}

          {/* ── Liquidity sources ─────────────────────────────────────────── */}
          {receipt.status === 'COMPLETE' && Array.isArray(receipt.sourcePlan) && receipt.sourcePlan.length > 0 && (
            <>
              <Tear />
              <div className="px-8 py-6">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#132318]/30 mb-5">
                  Liquidity Sources
                </p>
                <div className="space-y-3">
                  {receipt.sourcePlan.map((step, i) => {
                    const meta = CHAIN_META[step.chain] ?? { label: step.chain, dot: 'bg-gray-400' }
                    const stepAmount = step.type === 'swap' ? step.toUsdc : step.amount
                    const typeLabel = step.isDirect ? 'Direct' : step.type === 'swap' ? 'Swap → USDC' : 'Bridge'
                    return (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2 h-2 rounded-full ${meta.dot} flex-shrink-0`} />
                          <div>
                            <p className="text-xs font-bold text-[#132318]">{meta.label}</p>
                            <p className="text-[10px] text-[#132318]/40 font-medium">{typeLabel}</p>
                          </div>
                        </div>
                        <span className="text-xs font-black text-[#132318] tabular-nums">{fmtUsdc(stepAmount)} USDC</span>
                      </div>
                    )
                  })}
                </div>

                {/* Flow arrow to Arc */}
                <div className="my-4 flex items-center gap-3">
                  <div className="flex-1 border-t border-dashed border-gray-200" />
                  <ArrowRight className="w-3 h-3 text-[#132318]/20" />
                  <div className="flex-1 border-t border-dashed border-gray-200" />
                </div>

                <div className="flex items-center justify-between bg-[#132318] rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#E1FF76] flex-shrink-0" />
                    <div>
                      <p className="text-xs font-black text-[#E1FF76]">Arc Testnet</p>
                      <p className="text-[10px] text-[#E1FF76]/50 font-medium">Settled</p>
                    </div>
                  </div>
                  <span className="text-sm font-black text-[#E1FF76] tabular-nums">
                    {fmtUsdc(receipt.merchantReceives ?? receipt.targetAmount)} USDC
                  </span>
                </div>
              </div>
            </>
          )}

          {/* ── Pending notice ────────────────────────────────────────────── */}
          {isPending && (
            <>
              <Tear />
              <div className="px-8 py-5 flex items-center gap-3">
                <Clock className="w-4 h-4 text-[#132318]/25 flex-shrink-0" />
                <p className="text-xs text-[#132318]/40 font-medium leading-relaxed">
                  This page updates automatically every few seconds.
                </p>
              </div>
            </>
          )}

          {/* ── Actions ───────────────────────────────────────────────────── */}
          <Tear />
          <div className="px-8 py-6 flex gap-3">
            <button
              onClick={async () => {
                const url = window.location.href
                if (navigator.share) {
                  await navigator.share({ title: 'Zerra Receipt', text: `${fmtUsdc(amount)} USDC payment receipt`, url })
                } else {
                  await navigator.clipboard.writeText(url)
                  toast.success('Receipt link copied!')
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-gray-100 text-xs font-black text-[#132318]/60 hover:border-[#132318]/20 hover:text-[#132318] transition-all"
            >
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
            {receipt.txHash && (
              <a
                href={`https://testnet.arcscan.app/tx/${receipt.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-gray-100 text-xs font-black text-[#132318]/60 hover:border-[#132318]/20 hover:text-[#132318] transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" /> ArcScan
              </a>
            )}
          </div>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <div className="px-8 pb-7 text-center">
            <p className="text-[9px] font-black uppercase tracking-[0.35em] text-[#132318]/15">
              Powered by Zerra · Circle CCTP · Arc Network
            </p>
          </div>
        </div>

        {/* Receipt ID below card */}
        <p className="text-center mt-4 text-[10px] font-mono text-[#132318]/25 tracking-wider">
          {jobId}
        </p>
      </div>
    </div>
  )
}

// ── Row helper ──────────────────────────────────────────────────────────────
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-bold text-[#132318]/35 flex-shrink-0">{label}</span>
      <span className="text-xs font-bold text-[#132318] text-right">{children}</span>
    </div>
  )
}
