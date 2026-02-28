import { useParams, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { CheckCircle2, Circle, Loader2, Sparkles, ExternalLink } from 'lucide-react'
import { usePayment, type JobStatus } from '../hooks/usePayment'

// ── Step definitions ──────────────────────────────────────────────────────────

interface Step {
  id: string
  label: string
  activeLabel: string
  triggeredBy: JobStatus[]
  doneAt: JobStatus[]
  txKey?: string
  explorerBase?: string
}

const STEPS: Step[] = [
  {
    id: 'scan',
    label: 'Wallet scanned',
    activeLabel: 'Scanning USDC balances across chains…',
    triggeredBy: ['SCANNING'],
    doneAt: ['ROUTING', 'AWAITING_CONFIRMATION', 'SWAPPING', 'BRIDGING', 'PAYING', 'COMPLETE'],
  },
  {
    id: 'route',
    label: 'Route calculated',
    activeLabel: 'Building optimal multi-chain sourcing plan…',
    triggeredBy: ['ROUTING', 'AWAITING_CONFIRMATION'],
    doneAt: ['SWAPPING', 'BRIDGING', 'PAYING', 'COMPLETE'],
  },
  {
    id: 'swap',
    label: 'ETH swapped to USDC',
    activeLabel: 'Swapping ETH → USDC via Uniswap…',
    triggeredBy: ['SWAPPING'],
    doneAt: ['BRIDGING', 'PAYING', 'COMPLETE'],
    txKey: 'swap',
  },
  {
    id: 'bridge',
    label: 'Bridged to Arc via CCTPv2',
    activeLabel: 'Bridging USDC to Arc Testnet via Circle Bridge Kit…',
    triggeredBy: ['BRIDGING'],
    doneAt: ['PAYING', 'COMPLETE'],
  },
  {
    id: 'pay',
    label: 'Payment sent to merchant',
    activeLabel: 'Executing payment via PaymentRouter on Arc…',
    triggeredBy: ['PAYING'],
    doneAt: ['COMPLETE'],
    txKey: 'pay',
    explorerBase: 'https://testnet.arcscan.app/tx',
  },
]

// ── Progress percentage — smooth curve across all real states ─────────────────

const STATUS_PROGRESS: Record<JobStatus, number> = {
  SCANNING:             10,
  ROUTING:              22,
  AWAITING_CONFIRMATION: 28,
  SWAPPING:             42,
  BRIDGING:             60,
  PAYING:               90,
  COMPLETE:            100,
  FAILED:              100,
  EXPIRED:             100,
}

function getStepState(step: Step, status: JobStatus): 'done' | 'active' | 'pending' {
  if (step.doneAt.includes(status)) return 'done'
  if (step.triggeredBy.includes(status)) return 'active'
  return 'pending'
}

function getTxHash(txHashes: Record<string, unknown> | null, txKey?: string): string | null {
  if (!txKey || !txHashes) return null
  const val = txHashes[txKey]
  if (!val) return null
  if (typeof val === 'object') return Object.values(val as Record<string, string>)[0] ?? null
  return val as string
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Progress() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const { data: job } = usePayment(jobId)

  useEffect(() => {
    if (!job) return
    if (job.status === 'COMPLETE') navigate(`/success/${jobId}`)
    if (job.status === 'FAILED') navigate(`/failed/${jobId}`)
  }, [job?.status, jobId, navigate])

  const status: JobStatus = job?.status ?? 'SCANNING'
  const progress = STATUS_PROGRESS[status] ?? 0
  const txHashes = job?.txHashes ?? null

  // Show swap step only if job actually has swap steps in the source plan
  const rawPlan = job?.sourcePlan
  const sourcePlan = Array.isArray(rawPlan) ? rawPlan : []
  const hasSwap = sourcePlan.some((s) => s && typeof s === 'object' && s.type === 'swap')
  const visibleSteps = STEPS.filter((s) => s.id !== 'swap' || hasSwap)

  return (
    <div className="mx-auto max-w-2xl px-6 py-24 sm:py-40">
      <div className="mb-16">
        <div className="inline-flex items-center gap-3 pill-tag mb-6 border-[#132318]/10">
          <Sparkles className="w-4 h-4 text-[#132318] animate-pulse" />
          <span className="uppercase text-[10px] tracking-[0.2em] font-black">Execution Active</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-black text-[#132318] tracking-tighter leading-[0.9]">
          Processing...
        </h1>
        <p className="mt-6 text-xl text-[#132318]/60 font-bold max-w-sm leading-relaxed">
          OneClick Pay is orchestrating your liquidity across chains.
        </p>
      </div>

      <div className="fin-card !p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#E1FF76]/5 rounded-full blur-[80px] -z-10" />

        {/* Progress bar */}
        <div className="mb-20">
          <div className="flex justify-between items-end mb-6">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#132318]/40">System Progress</span>
            <span className="text-4xl font-black text-[#132318]">{progress}%</span>
          </div>
          <div className="h-6 w-full overflow-hidden rounded-full bg-[#132318]/[0.05] p-1.5 border border-[#132318]/5">
            <div
              className="h-full rounded-full bg-[#132318] transition-all duration-1000 ease-in-out relative flex items-center justify-end px-2"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
              <div className="w-1.5 h-1.5 bg-[#E1FF76] rounded-full shadow-[0_0_10px_#E1FF76]" />
            </div>
          </div>
          <div className="mt-8 flex justify-center">
            <div className="px-6 py-2 bg-[#E1FF76] rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-[#E1FF7633]">
              {status.replace(/_/g, ' ')}
            </div>
          </div>
        </div>

        {/* Live step tracker */}
        <div className="space-y-10 relative">
          <div className="absolute left-[13px] top-4 bottom-4 w-0.5 bg-[#132318]/[0.05]" />
          {visibleSteps.map((step) => {
            const state = getStepState(step, status)
            const txHash = getTxHash(txHashes as Record<string, unknown> | null, step.txKey)
            return (
              <div
                key={step.id}
                className={`flex items-start gap-8 transition-all duration-500 ${
                  state === 'done' ? 'opacity-30' : state === 'active' ? 'opacity-100 scale-105' : 'opacity-40'
                }`}
              >
                <div className="relative z-10">
                  {state === 'done' ? (
                    <div className="w-7 h-7 bg-[#132318] rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-[#E1FF76]" />
                    </div>
                  ) : state === 'active' ? (
                    <div className="relative">
                      <div className="w-7 h-7 bg-[#E1FF76] rounded-full flex items-center justify-center shadow-[0_0_20px_#E1FF76]">
                        <Loader2 className="w-4 h-4 text-[#132318] animate-spin" />
                      </div>
                      <div className="absolute inset-0 bg-[#E1FF76]/40 animate-ping rounded-full -z-10" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 bg-white border-2 border-[#132318]/10 rounded-full flex items-center justify-center">
                      <Circle className="w-3 h-3 text-[#132318]/20" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-xl font-black leading-none mb-2 tracking-tight ${state === 'active' ? 'text-[#132318]' : 'text-[#132318]/60'}`}>
                    {step.label}
                  </h3>
                  {state === 'active' && (
                    <p className="text-[10px] font-black text-[#132318]/40 uppercase tracking-widest animate-pulse italic">
                      {step.activeLabel}
                    </p>
                  )}
                  {txHash && step.explorerBase && (
                    <a
                      href={`${step.explorerBase}/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-2 text-[10px] font-black text-[#132318]/40 hover:text-[#132318] uppercase tracking-widest transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {txHash.slice(0, 10)}…{txHash.slice(-6)}
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-20 text-center">
        <p className="text-xs font-black uppercase tracking-[0.5em] text-[#132318]/20 leading-relaxed max-w-xs mx-auto">
          One signature. Settling on Arc Network.
        </p>
      </div>
    </div>
  )
}
