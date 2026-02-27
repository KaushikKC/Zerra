import { useParams, Link } from 'react-router-dom'
import { useState } from 'react'
import { AlertTriangle, RefreshCw, Loader2, ArrowLeft } from 'lucide-react'
import { usePayment, retryJob } from '../hooks/usePayment'
import { useNavigate } from 'react-router-dom'

export default function PaymentFailed() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const { data: job } = usePayment(jobId)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  const handleRetry = async () => {
    if (!jobId) return
    setRetrying(true)
    setRetryError(null)
    try {
      await retryJob(jobId)
      navigate(`/progress/${jobId}`)
    } catch (err: unknown) {
      setRetryError(err instanceof Error ? err.message : 'Retry failed')
      setRetrying(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-24 sm:py-40 text-center">
      <div className="relative inline-block mb-16">
        <div className="absolute inset-0 bg-red-400 blur-[80px] opacity-20" />
        <div className="relative mx-auto flex h-28 w-28 items-center justify-center rounded-[2.5rem] bg-red-50 border-2 border-red-100 shadow-xl">
          <AlertTriangle className="h-14 w-14 text-red-400" />
        </div>
      </div>

      <div className="mb-16">
        <h1 className="text-5xl md:text-7xl font-black text-[#132318] tracking-tighter leading-[0.9] mb-6">
          Payment Failed.
        </h1>
        <p className="text-xl text-[#132318]/50 font-medium max-w-sm mx-auto">
          Something went wrong during execution. Your funds have not been moved.
        </p>
      </div>

      {job?.error && (
        <div className="fin-card text-left mb-12 !p-8">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#132318]/40 mb-3">Error Details</p>
          <p className="font-mono text-sm text-red-500 leading-relaxed break-all">{job.error}</p>
          {job.status && (
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-[#132318]/30">
              Failed at: {job.status.replace(/_/g, ' ')}
            </p>
          )}
        </div>
      )}

      {retryError && (
        <div className="mb-8 p-5 rounded-2xl bg-red-50 border border-red-100">
          <p className="text-red-600 font-bold text-sm">{retryError}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-6 justify-center">
        <Link to="/" className="btn-secondary !text-xl !px-10 !py-6">
          <ArrowLeft className="w-6 h-6" /> Go Home
        </Link>
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="btn-primary !text-xl !px-10 !py-6 !bg-[#132318] shadow-2xl shadow-[#132318]/20 disabled:opacity-60"
        >
          {retrying ? (
            <><Loader2 className="w-6 h-6 animate-spin" /> Retrying…</>
          ) : (
            <><RefreshCw className="w-6 h-6" /> Retry Payment</>
          )}
        </button>
      </div>
    </div>
  )
}
