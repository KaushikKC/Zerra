import { useQuery } from '@tanstack/react-query'
import { API_BASE } from '../config/wagmiConfig'

export type JobStatus =
  | 'SCANNING'
  | 'ROUTING'
  | 'AWAITING_CONFIRMATION'
  | 'SWAPPING'
  | 'GATEWAY_DEPOSITING'
  | 'GATEWAY_TRANSFERRING'
  | 'MINTING'
  | 'PAYING'
  | 'COMPLETE'
  | 'FAILED'

export interface TxHashes {
  swap?: Record<string, string>
  deposit?: Record<string, string>
  transfer?: string
  mint?: string
  pay?: string
}

export interface PaymentJob {
  jobId: string
  status: JobStatus
  sourcePlan: unknown
  quote: {
    totalFees: string
    userAuthorizes: string
    merchantReceives: string
    breakdown: {
      swapFee: string
      bridgeFee: string
      arcGas: string
      totalFees: string
    }
  } | null
  txHashes: TxHashes | null
  error: string | null
  merchantAddress: string
  targetAmount: string
  label: string | null
  createdAt: number
  updatedAt: number
}

const TERMINAL_STATES: JobStatus[] = ['COMPLETE', 'FAILED']

async function fetchJobStatus(jobId: string): Promise<PaymentJob> {
  const res = await fetch(`${API_BASE}/api/pay/${jobId}/status`)
  if (!res.ok) throw new Error(`Status fetch failed: ${res.statusText}`)
  return res.json()
}

export function usePayment(jobId: string | undefined) {
  return useQuery({
    queryKey: ['payment', jobId],
    queryFn: () => fetchJobStatus(jobId!),
    enabled: !!jobId,
    // Poll every 2 seconds until terminal state
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && TERMINAL_STATES.includes(status) ? false : 2000
    },
  })
}

export async function retryJob(jobId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/pay/${jobId}/retry`, { method: 'POST' })
  if (!res.ok) throw new Error(`Retry failed: ${res.statusText}`)
}
