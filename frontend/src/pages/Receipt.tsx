import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Clock, XCircle, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react'
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

const CHAIN_META: Record<string, { label: string; color: string }> = {
  'arc-testnet':        { label: 'Arc Testnet',        color: 'bg-indigo-100 text-indigo-700' },
  'ethereum-sepolia':   { label: 'Ethereum Sepolia',   color: 'bg-blue-100 text-blue-700' },
  'base-sepolia':       { label: 'Base Sepolia',        color: 'bg-sky-100 text-sky-700' },
  ethereum:             { label: 'Ethereum',            color: 'bg-blue-100 text-blue-700' },
  base:                 { label: 'Base',                color: 'bg-sky-100 text-sky-700' },
}

const TERMINAL = new Set(['COMPLETE', 'FAILED', 'EXPIRED'])

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
          if (!TERMINAL.has(data.status)) {
            setTimeout(poll, 3000)
          }
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
      <div className="mx-auto max-w-lg px-6 py-40 text-center">
        <XCircle className="w-16 h-16 text-red-400 mx-auto mb-6" />
        <h1 className="text-3xl font-black text-[#132318] mb-4">Not Found</h1>
        <p className="text-[#132318]/50">{error}</p>
      </div>
    )
  }

  if (!receipt) {
    return (
      <div className="mx-auto max-w-lg px-6 py-40 flex justify-center">
        <Loader2 className="w-10 h-10 text-[#132318]/30 animate-spin" />
      </div>
    )
  }

  const amount = receipt.merchantReceives ?? receipt.targetAmount

  return (
    <div className="mx-auto max-w-lg px-6 py-24">
      <div className="fin-card space-y-8">
        {/* Status icon */}
        <div className="flex justify-center">
          {receipt.status === 'COMPLETE' && (
            <CheckCircle2 className="w-20 h-20 text-green-500" />
          )}
          {receipt.status === 'EXPIRED' && (
            <AlertTriangle className="w-20 h-20 text-yellow-500" />
          )}
          {receipt.status === 'FAILED' && (
            <XCircle className="w-20 h-20 text-red-400" />
          )}
          {!TERMINAL.has(receipt.status) && (
            <Loader2 className="w-20 h-20 text-[#132318]/30 animate-spin" />
          )}
        </div>

        {/* Status label */}
        <div className="text-center">
          <StatusBadge status={receipt.status} />
          <p className="text-5xl font-black text-[#132318] tracking-tighter mt-4">
            {amount} USDC
          </p>
          {receipt.label && (
            <p className="text-[#132318]/50 font-medium mt-2">{receipt.label}</p>
          )}
        </div>

        {/* Details */}
        <div className="space-y-3 border-t border-[#132318]/5 pt-6">
          <DetailRow label="Payment ID" value={receipt.jobId.slice(0, 12) + '…'} mono />
          <DetailRow
            label="Merchant"
            value={receipt.merchantAddress.slice(0, 10) + '…' + receipt.merchantAddress.slice(-6)}
            mono
          />
          <DetailRow
            label="Created"
            value={new Date(receipt.createdAt).toLocaleString()}
          />
          {receipt.expiresAt && (
            <DetailRow
              label="Expires"
              value={new Date(receipt.expiresAt * 1000).toLocaleString()}
            />
          )}
        </div>

        {/* Tx hash link */}
        {receipt.txHash && (
          <a
            href={`https://testnet.arcscan.app/tx/${receipt.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary w-full py-4 justify-center"
          >
            <ExternalLink className="w-5 h-5" /> View on ArcScan
          </a>
        )}

        {/* Chain Provenance Panel */}
        {receipt.status === 'COMPLETE' && receipt.sourcePlan && receipt.sourcePlan.length > 0 && (
          <div className="space-y-3 border-t border-[#132318]/5 pt-6">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#132318]/40">
              Liquidity Sources
            </p>
            {receipt.sourcePlan.map((step, i) => {
              const meta = CHAIN_META[step.chain] ?? { label: step.chain, color: 'bg-gray-100 text-gray-600' }
              const amount = step.type === 'swap' ? step.toUsdc : step.amount
              const typeLabel = step.isDirect ? 'Direct USDC' : step.type === 'swap' ? 'Swap → USDC' : 'USDC Bridge'
              return (
                <div key={i} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${meta.color}`}>
                      {meta.label}
                    </span>
                    <span className="text-xs text-[#132318]/40 font-medium">{typeLabel}</span>
                  </div>
                  <span className="text-sm font-black text-[#132318] font-mono">{amount ?? '—'} USDC</span>
                </div>
              )
            })}
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#132318]/5">
              <div className="flex items-center gap-3">
                <span className="inline-block px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-[#132318] text-[#E1FF76]">
                  Arc Testnet
                </span>
                <span className="text-xs text-[#132318]/40 font-medium">Settled on Arc</span>
              </div>
              <span className="text-sm font-black text-[#132318] font-mono">{receipt.merchantReceives ?? receipt.targetAmount} USDC</span>
            </div>
          </div>
        )}

        {/* Pending state message */}
        {!TERMINAL.has(receipt.status) && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-[#132318]/[0.03]">
            <Clock className="w-5 h-5 text-[#132318]/30 flex-shrink-0" />
            <p className="text-sm text-[#132318]/50 font-medium">
              Waiting for payment — this page updates automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    COMPLETE:              { label: 'Paid',        cls: 'bg-green-100 text-green-700' },
    AWAITING_CONFIRMATION: { label: 'Pending',     cls: 'bg-yellow-100 text-yellow-700' },
    EXPIRED:               { label: 'Expired',     cls: 'bg-gray-100 text-gray-500' },
    FAILED:                { label: 'Failed',      cls: 'bg-red-100 text-red-600' },
    SCANNING:              { label: 'Processing',  cls: 'bg-blue-100 text-blue-600' },
    ROUTING:               { label: 'Processing',  cls: 'bg-blue-100 text-blue-600' },
    SWAPPING:              { label: 'Swapping',    cls: 'bg-blue-100 text-blue-600' },
    GATEWAY_DEPOSITING:    { label: 'Bridging',    cls: 'bg-purple-100 text-purple-600' },
    GATEWAY_TRANSFERRING:  { label: 'Bridging',    cls: 'bg-purple-100 text-purple-600' },
    MINTING:               { label: 'Minting',     cls: 'bg-purple-100 text-purple-600' },
    PAYING:                { label: 'Finalising',  cls: 'bg-indigo-100 text-indigo-600' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-black uppercase tracking-widest ${cls}`}>
      {label}
    </span>
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
