import { useParams, Link } from 'react-router-dom'
import { CheckCircle, ExternalLink, RefreshCw, PartyPopper, Share2 } from 'lucide-react'
import { usePayment } from '../hooks/usePayment'

export default function Success() {
  const { jobId } = useParams<{ jobId: string }>()
  const { data: job } = usePayment(jobId)

  const payTxHash = job?.txHashes?.pay ?? null
  const amount = job?.quote?.merchantReceives ?? job?.targetAmount ?? '—'
  const label = job?.label ?? 'Payment'

  return (
    <div className="mx-auto max-w-2xl px-6 py-24 sm:py-48 text-center">
      <div className="relative inline-block mb-16">
        <div className="absolute inset-0 bg-[#E1FF76] blur-[100px] opacity-40 animate-pulse" />
        <div className="relative mx-auto flex h-32 w-32 items-center justify-center rounded-[2.5rem] bg-[#132318] text-[#E1FF76] shadow-[0_50px_100px_rgba(0,0,0,0.2)] rotate-12 group hover:rotate-0 transition-all duration-700">
          <PartyPopper className="h-16 w-16 group-hover:scale-110 transition-transform" />
        </div>
      </div>

      <div className="mb-20">
        <h1 className="text-6xl md:text-8xl font-black text-[#132318] tracking-tighter leading-[0.85] mb-8">
          Transaction<br />Complete.
        </h1>
        <p className="text-2xl text-[#132318]/50 font-bold tracking-tight">
          {label} settled on Arc Network.
        </p>
      </div>

      <div className="fin-card text-left relative overflow-hidden mb-16 !p-12">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#E1FF76]/5 rounded-full blur-[80px] -z-10" />

        <div className="flex flex-col gap-10">
          <div className="flex justify-between items-center p-8 rounded-[2rem] bg-[#E1FF76]/20 border-2 border-[#E1FF76] shadow-xl shadow-[#E1FF7611]">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#132318]/40 mb-3">Amount Settled</p>
              <h3 className="text-5xl font-black text-[#132318] tracking-tighter">
                {amount} <span className="opacity-20">USDC</span>
              </h3>
            </div>
            <div className="p-5 bg-[#132318] rounded-[1.5rem] text-[#E1FF76] shadow-lg">
              <CheckCircle className="w-10 h-10" />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#132318]/40">Chain</p>
              <div className="px-5 py-3 rounded-xl bg-[#132318] text-[#E1FF76] inline-block font-black text-xs uppercase tracking-[0.2em]">
                Arc Testnet
              </div>
            </div>
            <div className="space-y-3 md:text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#132318]/40">Settlement</p>
              <div className="px-5 py-3 rounded-xl bg-[#132318]/5 text-[#132318]/60 inline-block font-black text-xs uppercase tracking-[0.2em] border border-[#132318]/5">
                Atomic Cross-Chain
              </div>
            </div>
          </div>

          <div className="h-px bg-[#132318]/5" />

          <div className="space-y-6">
            {payTxHash && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#132318]/40 mb-3 flex items-center gap-2">
                  <Share2 className="w-3 h-3" /> Arc Transaction Hash
                </p>
                <div className="p-6 rounded-[1.5rem] bg-[#132318]/[0.02] border border-[#132318]/5 font-mono text-sm font-bold text-[#132318] break-all select-all leading-relaxed">
                  {payTxHash}
                </div>
              </div>
            )}
            {jobId && (
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.4em] text-[#132318]/20">
                <span>Job ID</span>
                <span className="text-[#132318]/40">{jobId}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 justify-center">
        {payTxHash && (
          <a
            href={`https://testnet.arcscan.app/tx/${payTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary !text-xl !px-12 !py-6"
          >
            View on ArcScan <ExternalLink className="w-6 h-6" />
          </a>
        )}
        <Link
          to="/merchant"
          className="btn-primary !text-xl !px-12 !py-6 !bg-[#132318] shadow-2xl shadow-[#132318]/20"
        >
          Merchant Dashboard <RefreshCw className="w-6 h-6" />
        </Link>
      </div>

      <div className="mt-32 pt-12 border-t border-[#132318]/5">
        <p className="text-[10px] font-black uppercase tracking-[0.6em] text-[#132318]/10">
          Powered by Zerra · Circle Gateway · Arc Network
        </p>
      </div>
    </div>
  )
}
