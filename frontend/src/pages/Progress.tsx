import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Loader2, Sparkles } from 'lucide-react'

const STEPS = [
  { id: 'scan', label: 'Wallet scanned', done: true },
  { id: 'session', label: 'Session key approved', done: true },
  { id: 'swap', label: 'Swapping on Base', done: false, active: true },
  { id: 'bridge', label: 'Bridging via CCTP', done: false },
  { id: 'attestation', label: 'Waiting attestation', done: false },
  { id: 'pay', label: 'Executing payment on Zerra', done: false },
]

export default function Progress() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const [progress, setProgress] = useState(25)
  const [steps, setSteps] = useState(STEPS)

  useEffect(() => {
    const t1 = setTimeout(() => {
      setProgress(45)
      setSteps((s) =>
        s.map((x) =>
          x.id === 'swap' ? { ...x, done: true } : x.id === 'bridge' ? { ...x, active: true } : x
        )
      )
    }, 2000)
    const t2 = setTimeout(() => {
      setProgress(65)
      setSteps((s) =>
        s.map((x) =>
          x.id === 'bridge' ? { ...x, done: true } : x.id === 'attestation' ? { ...x, active: true } : x
        )
      )
    }, 4500)
    const t3 = setTimeout(() => {
      setProgress(85)
      setSteps((s) =>
        s.map((x) =>
          x.id === 'attestation' ? { ...x, done: true } : x.id === 'pay' ? { ...x, active: true } : x
        )
      )
    }, 7000)
    const t4 = setTimeout(() => {
      setProgress(100)
      setSteps((s) => s.map((x) => ({ ...x, done: true, active: false })))
      navigate(`/success/${jobId}`)
    }, 9500)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
    }
  }, [jobId, navigate])

  return (
    <div className="mx-auto max-w-2xl px-6 py-24 sm:py-40">
      <div className="mb-16">
        <div className="inline-flex items-center gap-3 pill-tag mb-6 border-[#132318]/10">
          <Sparkles className="w-4 h-4 text-[#132318] animate-pulse" /> <span className="uppercase text-[10px] tracking-[0.2em] font-black">Execution Active</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-black text-[#132318] tracking-tighter leading-[0.9]">
          Processing...
        </h1>
        <p className="mt-6 text-xl text-[#132318]/60 font-bold max-w-sm leading-relaxed">
          The Zerra Protocol is orchestrating your liquidity flow across chains.
        </p>
      </div>

      <div className="fin-card !p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#E1FF76]/5 rounded-full blur-[80px] -z-10" />

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
              Estimated Wait: {Math.max(0, 90 - Math.floor(progress * 0.9))}s
            </div>
          </div>
        </div>

        {/* Live tracker */}
        <div className="space-y-10 relative">
          {/* Timeline Line */}
          <div className="absolute left-[13px] top-4 bottom-4 w-0.5 bg-[#132318]/[0.05]" />

          {steps.map((step) => (
            <div key={step.id} className={`flex items-start gap-8 transition-all duration-500 ${step.done ? 'opacity-30' : step.active ? 'opacity-100 scale-105' : 'opacity-40'}`}>
              <div className="relative z-10 flex flex-col items-center">
                {step.done ? (
                  <div className="w-7 h-7 bg-[#132318] rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-[#E1FF76]" />
                  </div>
                ) : step.active ? (
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
              <div>
                <h3 className={`text-xl font-black leading-none mb-2 tracking-tight ${step.active ? 'text-[#132318]' : 'text-[#132318]/60'}`}>
                  {step.label}
                </h3>
                {step.active && (
                  <p className="text-[10px] font-black text-[#132318]/40 uppercase tracking-widest animate-pulse italic">
                    Verifying on-chain state...
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-20 text-center">
        <p className="text-xs font-black uppercase tracking-[0.5em] text-[#132318]/20 leading-relaxed max-w-xs mx-auto">
          One atomic signature. Orchestrating across 12 nodes.
        </p>
      </div>
    </div>
  )
}
