import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ShieldCheck, Database, Layers, ExternalLink } from 'lucide-react'

const SOURCES = [
  { chain: 'Base', detail: '55 USDC', icon: <Database className="w-5 h-5" /> },
  { chain: 'Polygon', detail: '30 USDC', icon: <Layers className="w-5 h-5" /> },
  { chain: 'Ethereum', detail: '0.5 ETH → 20 USDC', icon: <ExternalLink className="w-5 h-5" /> },
]

export default function Review() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state || {}) as { amount?: string; recipient?: string }
  const amount = state.amount ?? '100'
  const recipient = state.recipient ?? '0x742d...3f2a'

  const bridgeFees = 2.1
  const gas = 1.1
  const totalPay = (parseFloat(amount) || 0) + bridgeFees + gas
  const recipientGets = amount

  const handleConfirm = () => {
    const jobId = 'job-' + Date.now()
    navigate(`/progress/${jobId}`)
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-24 sm:py-40">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-[#132318]/40 hover:text-[#132318] mb-16 transition-all group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to details
      </button>

      <div className="mb-16">
        <div className="inline-flex items-center gap-2 pill-tag mb-6 border-[#132318]/10">
          <ShieldCheck className="w-3.5 h-3.5 text-[#132318]" /> <span className="uppercase text-[10px] tracking-[0.2em] font-black">Verification Mode</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-black text-[#132318] tracking-tighter leading-[0.9]">
          Transaction Summary.
        </h1>
        <p className="mt-6 text-xl text-[#132318]/50 font-medium max-w-md leading-relaxed">
          Verify the sourcing strategy and fee breakdown before authorizing.
        </p>
      </div>

      <div className="space-y-8">
        {/* Sourcing Card */}
        <div className="fin-card !p-12">
          <h2 className="text-label mb-10 flex items-center gap-3">
            <Database className="w-5 h-5 text-[#132318]/40" /> Liquidity Sources
          </h2>
          <div className="space-y-5">
            {SOURCES.map((s) => (
              <div key={s.chain} className="flex items-center justify-between p-6 rounded-[1.25rem] bg-[#132318]/[0.02] border border-[#132318]/5 hover:bg-[#132318]/[0.04] transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#132318] shadow-sm border border-[#132318]/5">
                    {s.icon}
                  </div>
                  <span className="font-black text-[#132318] tracking-tight">{s.chain}</span>
                </div>
                <span className="font-mono text-base font-black text-[#132318]">{s.detail}</span>
              </div>
            ))}
          </div>
          <div className="mt-12 p-8 bg-[#E1FF76]/10 rounded-[1.5rem] border border-[#E1FF76]/30 flex flex-wrap items-center justify-center gap-6 text-[#132318] font-black text-xs uppercase tracking-[0.4em]">
            <span>SCAN</span>
            <ArrowRight className="w-5 h-5 text-[#132318]/20" />
            <span className="px-5 py-2 bg-white border border-[#132318]/5 rounded-xl shadow-sm">ZERRA NODE</span>
            <ArrowRight className="w-5 h-5 text-[#132318]/20" />
            <span className="px-5 py-2 bg-[#E1FF76] rounded-xl shadow-[0_0_20px_#E1FF7655]">DEPOSIT</span>
          </div>
        </div>

        {/* Fees Card */}
        <div className="fin-card !bg-[#132318] text-white !p-12 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-[100px] rounded-full -z-0" />

          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 mb-10 relative z-10">
            Total Breakdown
          </h2>
          <div className="space-y-4 mb-10 relative z-10">
            <div className="flex justify-between text-white/50 font-bold tracking-tight">
              <span>Infrastructure & L2 Gas</span>
              <span className="text-white">{gas.toFixed(2)} USDC</span>
            </div>
            <div className="flex justify-between text-white/50 font-bold tracking-tight">
              <span>Circle CCTP Protocol Fee</span>
              <span className="text-white">{bridgeFees.toFixed(2)} USDC</span>
            </div>
          </div>
          <div className="h-px bg-white/10 mb-10 relative z-10" />
          <div className="space-y-8 relative z-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-2">Total Authorization</p>
                <h3 className="text-5xl font-black tracking-tighter">{totalPay.toFixed(2)} <span className="text-[#E1FF76]">USDC</span></h3>
              </div>
              <div className="md:text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#E1FF76]/50 mb-2">Recipient Settlement</p>
                <h3 className="text-3xl font-black text-[#E1FF76] opacity-80">{recipientGets} USDC</h3>
              </div>
            </div>
            <div className="p-6 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-md">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-3">Destination Smart Account (ZERRA)</p>
              <p className="font-mono text-xs text-[#E1FF76] break-all tracking-wider leading-relaxed">{recipient}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-16">
        <button
          type="button"
          onClick={handleConfirm}
          className="btn-primary w-full py-8 text-2xl justify-center !bg-[#E1FF76] !text-[#132318] hover:!bg-white shadow-[0_30px_60px_#E1FF7622]"
        >
          Confirm & Authorize <ShieldCheck className="w-8 h-8" />
        </button>
        <div className="mt-10 text-center space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#132318] leading-relaxed">
            Authorized via Single Atomic Signature (EIP-4337)
          </p>
          <p className="text-[10px] font-bold text-[#132318]/30 uppercase tracking-[0.1em]">
            No manual bridging or approval steps required.
          </p>
        </div>
      </div>
    </div>
  )
}
