import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { ArrowRight, ChevronDown, User, LogOut, Plus } from 'lucide-react'

// Mock: replace with real wallet state (e.g. wagmi)
const MOCK_CONNECTED = true
const MOCK_ADDRESS = '0x742d...3f2a'
const MOCK_NETWORK = 'Zerra'

export default function Navbar() {
  const location = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-white/30 backdrop-blur-xl border-b border-black/5">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 sm:px-12">
        <div className="flex items-center gap-12">
          <Link to="/" className="flex items-center gap-3 group transition-transform hover:scale-105">
            <div className="w-10 h-10 bg-[#132318] rounded-xl flex items-center justify-center transition-all duration-500 group-hover:bg-[#E1FF76] group-hover:rotate-12 shadow-lg">
              <span className="text-[#E1FF76] font-black text-2xl group-hover:text-[#132318] transition-colors">Z</span>
            </div>
            <span className="text-2xl font-black tracking-tighter text-[#132318]">Zerra</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-2">
            <Link
              to="/pay"
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${location.pathname === '/pay'
                ? 'bg-fin-dark text-white'
                : 'text-black/60 hover:text-black hover:bg-black/5'
                }`}
            >
              Payments
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {MOCK_CONNECTED ? (
            <>
              <div className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-full border border-black/5 bg-white/50 text-xs font-semibold">
                <div className="w-2 h-2 rounded-full bg-fin-lime animate-pulse" />
                {MOCK_NETWORK}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-3 px-4 py-2 rounded-full border border-black/10 bg-white/80 transition-all hover:bg-white hover:border-black/20 focus:outline-none"
                >
                  <div className="w-6 h-6 rounded-full bg-fin-teal flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-fin-dark" />
                  </div>
                  <span className="font-mono text-xs font-bold text-fin-dark">{MOCK_ADDRESS}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                </button>
                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-10" aria-hidden="true" onClick={() => setProfileOpen(false)} />
                    <div className="absolute right-0 z-20 mt-3 w-56 p-2 overflow-hidden rounded-3xl border border-black/5 bg-white shadow-2xl animate-in fade-in slide-in-from-top-2">
                      <Link
                        to="/pay"
                        className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-black/70 hover:bg-black/5 hover:text-black rounded-2xl transition-colors"
                        onClick={() => setProfileOpen(false)}
                      >
                        <Plus className="w-4 h-4" /> New payment
                      </Link>
                      <button
                        type="button"
                        className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 rounded-2xl transition-colors"
                        onClick={() => setProfileOpen(false)}
                      >
                        <LogOut className="w-4 h-4" /> Disconnect
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <Link
              to="/pay"
              className="btn-primary py-2.5 px-6 text-sm"
            >
              Connect Wallet <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
