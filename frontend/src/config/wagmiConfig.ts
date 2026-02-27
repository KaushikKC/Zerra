import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { sepolia, baseSepolia } from 'wagmi/chains'
import { defineChain } from 'viem'

// Arc Testnet — not in wagmi's chain library, define manually
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    // Arc uses USDC as gas — we still declare a native currency entry for wagmi
    name: 'USDC',
    symbol: 'USDC',
    decimals: 6,
  },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
})

export const wagmiConfig = getDefaultConfig({
  appName: 'Zerra OneClick Pay',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? 'zerra-dev',
  chains: [sepolia, baseSepolia, arcTestnet],
  ssr: false,
})

// Backend API base URL — set VITE_API_URL in frontend/.env to override
export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
