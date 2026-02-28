import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import '@rainbow-me/rainbowkit/styles.css'
import './index.css'
import App from './App'
import { wagmiConfig } from './config/wagmiConfig'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#E1FF76',
            accentColorForeground: '#132318',
            borderRadius: 'large',
          })}
        >
            <App />
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#132318',
                color: '#FFFCF5',
                border: '1px solid rgba(225,255,118,0.15)',
                borderRadius: '1rem',
                fontFamily: 'Outfit, sans-serif',
                fontWeight: '700',
              },
              classNames: {
                success: 'toast-success',
                error: 'toast-error',
              },
            }}
          />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
