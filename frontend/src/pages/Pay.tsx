import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Settings, DollarSign, UserCheck, Info } from 'lucide-react'

export default function Pay() {
  const navigate = useNavigate()
  const [amount, setAmount] = useState('100')
  const [recipient, setRecipient] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleContinue = () => {
    navigate('/review', { state: { amount, recipient: recipient || '0x742d35Cc6634C0532925a3b844Bc9e7595f2a3f2' } })
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-24 sm:py-40">
      <div className="mb-16">
        <div className="inline-flex items-center gap-2 pill-tag mb-6 border-[#132318]/10">
          <DollarSign className="w-3.5 h-3.5" /> <span className="uppercase text-[10px] tracking-[0.2em] font-black">Secure Checkout</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-black text-[#132318] tracking-tighter leading-[0.9]">
          Payment Details.
        </h1>
        <p className="mt-6 text-xl text-[#132318]/50 font-medium max-w-md">
          Specify amount and recipient. We handle technical cross-chain complexity.
        </p>
      </div>

      <div className="fin-card relative">
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#E1FF76]/10 rounded-bl-[100px] -z-10" />

        <div className="space-y-12">
          <div>
            <label htmlFor="amount" className="text-label mb-4 block">
              Amount to send
            </label>
            <div className="relative group">
              <input
                id="amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="block w-full text-5xl md:text-7xl font-black bg-transparent border-none p-0 text-[#132318] placeholder-[#132318]/30 focus:ring-0 transition-all outline-none"
                placeholder="0.00"
              />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-3 px-5 py-3 bg-[#132318] text-[#E1FF76] rounded-2xl font-black text-xl shadow-xl">
                USDC
              </div>
            </div>
          </div>

          <div className="h-px bg-[#132318]/5" />

          <div>
            <label htmlFor="recipient" className="text-label mb-4 block">
              Recipient address
            </label>
            <div className="relative">
              <input
                id="recipient"
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="input-field !text-2xl font-bold py-6"
                placeholder="0x... or ENS name"
              />
              <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[#132318]/20">
                <UserCheck className="w-7 h-7" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 p-4 bg-[#E1FF76]/10 rounded-2xl border border-[#E1FF76]/20">
              <Info className="w-4 h-4 text-[#132318]/60" />
              <p className="text-xs text-[#132318]/60 font-bold uppercase tracking-wider">
                Funds will be settled on Zerra Network.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#132318]/40 hover:text-[#132318] transition-colors self-start"
            >
              <Settings className={`w-4 h-4 transition-transform duration-500 ${showAdvanced ? 'rotate-90' : ''}`} />
              {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
            </button>

            {showAdvanced && (
              <div className="p-8 rounded-[1.5rem] bg-[#132318] text-white animate-in fade-in slide-in-from-top-4 duration-500">
                <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 mb-6">Execution Strategy</h4>
                <div className="space-y-4 font-bold text-sm">
                  <div className="flex justify-between border-b border-white/5 pb-4">
                    <span className="text-white/40">Slippage Range</span>
                    <span className="text-[#E1FF76]">0.5% (Optimized)</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-4">
                    <span className="text-white/40">Routing Pattern</span>
                    <span>Multi-chain Atomic</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Gas Strategy</span>
                    <span>Ultra-low (L2 focus)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-16">
          <button
            type="button"
            onClick={handleContinue}
            className="btn-primary w-full py-8 text-2xl justify-center shadow-2xl shadow-[#132318]/10"
          >
            Review Payment <ArrowRight className="w-8 h-8" />
          </button>
        </div>
      </div>

      <div className="mt-16 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-[#132318]/20">
          Zero friction cross-chain liquidity
        </p>
      </div>
    </div>
  )
}
