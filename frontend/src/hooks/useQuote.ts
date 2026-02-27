import { useQuery } from '@tanstack/react-query'
import { API_BASE } from '../config/wagmiConfig'

export interface SourceStep {
  chain: string
  chainId: number
  type: 'usdc' | 'swap'
  amount?: string
  fromToken?: string
  fromAmount?: string
  toUsdc?: string
}

export interface FeeBreakdown {
  swapFee: string
  bridgeFee: string
  arcGas: string
  totalFees: string
}

export interface Quote {
  sourcePlan: SourceStep[]
  breakdown: FeeBreakdown | null
  totalFees: string | null
  userAuthorizes: string | null
  merchantReceives: string
  sufficientFunds: boolean
  shortfallUsdc?: string
}

async function fetchQuote(walletAddress: string, targetAmount: string): Promise<Quote> {
  const res = await fetch(`${API_BASE}/api/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, targetAmount }),
  })
  if (!res.ok) throw new Error(`Quote failed: ${res.statusText}`)
  return res.json()
}

export function useQuote(walletAddress: string | undefined, targetAmount: string | undefined, version = 0) {
  return useQuery({
    queryKey: ['quote', walletAddress, targetAmount, version],
    queryFn: () => fetchQuote(walletAddress!, targetAmount!),
    enabled: !!walletAddress && !!targetAmount && parseFloat(targetAmount) > 0,
    staleTime: 20_000,
  })
}
