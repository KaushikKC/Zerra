import { useQuery } from '@tanstack/react-query'
import { API_BASE } from '../config/wagmiConfig'

export interface ChainBalance {
  native: string
  nativeSymbol: string
  usdc: string
  chainId: number
  hasSwap: boolean
  error?: string
}

export type BalanceMap = Record<string, ChainBalance>

async function fetchBalances(walletAddress: string): Promise<BalanceMap> {
  const res = await fetch(`${API_BASE}/api/balances/${walletAddress}`)
  if (!res.ok) throw new Error(`Balance scan failed: ${res.statusText}`)
  return res.json()
}

export function useBalances(walletAddress: string | undefined) {
  return useQuery({
    queryKey: ['balances', walletAddress],
    queryFn: () => fetchBalances(walletAddress!),
    enabled: !!walletAddress,
    staleTime: 30_000,
  })
}
