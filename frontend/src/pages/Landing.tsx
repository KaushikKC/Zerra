import { Link } from 'react-router-dom'
import { ArrowRight, Globe, Zap, Shield } from 'lucide-react'

export default function Landing() {
  return (
    <div className="min-h-screen selection:bg-fin-lime selection:text-fin-dark">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex h-24 items-center justify-between px-8 md:px-16 bg-[#FFFCF5]/80 backdrop-blur-xl border-b border-[#132318]/5">
        <Link to="/" className="text-2xl font-black tracking-tighter text-[#132318] flex items-center gap-3 group transition-transform hover:scale-105">
          <div className="w-10 h-10 bg-[#132318] rounded-xl flex items-center justify-center shadow-lg group-hover:bg-[#E1FF76] group-hover:rotate-12 transition-all duration-500">
            <span className="text-[#E1FF76] font-black text-2xl group-hover:text-[#132318]">Z</span>
          </div>
          Zerra
        </Link>
        <div className="hidden md:flex items-center gap-12 text-sm font-bold uppercase tracking-widest text-[#132318]/60">
          <a href="#how-it-works" className="hover:text-[#132318] transition-colors">How it works</a>
          <a href="#features" className="hover:text-[#132318] transition-colors">Features</a>
          <Link to="/store/arc-dev" className="hover:text-[#132318] transition-colors">Demo Store</Link>
          <Link to="/merchant" className="hover:text-[#132318] transition-colors">Sell</Link>
        </div>
        <Link to="/pay" className="btn-primary py-3 px-8">
          Connect <ArrowRight className="w-5 h-5" />
        </Link>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-56 pb-32 px-8 md:px-16 overflow-hidden">
        <div className="max-w-[1400px] mx-auto grid lg:grid-cols-2 gap-20 items-center">
          <div className="z-10">
            <div className="inline-flex items-center gap-3 pill-tag mb-10 shadow-lg border-[#132318]/10 text-[#132318]">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#132318] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#132318]"></span>
              </span>
              <span className="font-black uppercase tracking-[0.2em] text-[10px]">Autopilot Active</span>
            </div>
            <h1 className="text-hero mb-12">
              Pay from <span className="italic underline decoration-[#E1FF76] decoration-[16px] underline-offset-[12px]">Any Chain</span>.
            </h1>
            <p className="text-2xl md:text-3xl text-[#132318]/70 max-w-xl mb-14 leading-[1.4] font-medium tracking-tight">
              Recipient gets USDC on Zerra. One Signature. Zero Headaches.
            </p>
            <div className="flex flex-wrap gap-6">
              <Link to="/pay" className="btn-primary text-xl px-12 py-6 shadow-2xl shadow-[#132318]/20">
                Pay Now <ArrowRight className="w-6 h-6" />
              </Link>
              <Link to="/store/arc-dev" className="btn-secondary text-xl px-12 py-6">
                View Demo Store
              </Link>
              <Link to="/merchant" className="btn-secondary text-xl px-12 py-6">
                Open Your Store
              </Link>
            </div>
          </div>
          <div className="relative flex justify-center lg:justify-end">
            <div className="relative w-full max-w-2xl aspect-square">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140%] h-[140%] bg-[#E1FF76]/10 rounded-full blur-[120px] -z-10" />
              <img
                src="/illustration.png"
                alt="Zerra Illustration"
                className="w-full h-full object-contain animate-float drop-shadow-[0_35px_35px_rgba(0,0,0,0.05)] illustration-blend"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Marquee Section */}
      <div className="py-16 bg-[#132318] overflow-hidden -rotate-1 scale-105 border-y-4 border-[#E1FF76]">
        <div className="animate-marquee flex gap-16 text-[#E1FF76] text-3xl font-black items-center">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="flex items-center gap-16">
              <span>ONE SIGNATURE</span>
              <div className="w-3 h-3 bg-[#E1FF76] rounded-full shadow-[0_0_10px_#E1FF76]" />
              <span>ANY CHAIN</span>
              <div className="w-3 h-3 bg-[#E1FF76] rounded-full shadow-[0_0_10px_#E1FF76]" />
              <span>INSTANT USDC</span>
              <div className="w-3 h-3 bg-[#E1FF76] rounded-full shadow-[0_0_10px_#E1FF76]" />
              <span>ZERRA PROTOCOL</span>
              <div className="w-3 h-3 bg-[#E1FF76] rounded-full shadow-[0_0_10px_#E1FF76]" />
            </div>
          ))}
        </div>
      </div>

      {/* How It Works */}
      <section id="how-it-works" className="py-48 px-8 md:px-16">
        <div className="max-w-7xl mx-auto">
          <div className="mb-32">
            <h2 className="text-5xl md:text-8xl font-black text-[#132318] tracking-tighter mb-8 max-w-3xl leading-[0.9]">How it works.</h2>
            <p className="text-2xl text-[#132318]/60 max-w-2xl font-medium tracking-tight">Full-stack liquidity abstraction in three simple steps.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                step: '01',
                title: 'Connect Wallet',
                desc: 'Link your wallet. We read balances across Ethereum, Base, and Arc automatically.',
                icon: <Globe className="w-8 h-8" />
              },
              {
                step: '02',
                title: 'Auto Liquidity',
                desc: 'We swap and bridge from your existing holdings so you don’t move a thing manually.',
                icon: <Zap className="w-8 h-8" />
              },
              {
                step: '03',
                title: 'Instant USDC',
                desc: 'Recipient receives USDC on Zerra in one single flow. You sign once, we do the rest.',
                icon: <Shield className="w-8 h-8" />
              },
            ].map((card) => (
              <div key={card.step} className="fin-card group !p-12">
                <div className="flex justify-between items-start mb-12">
                  <div className="p-4 bg-[#E1FF76] rounded-2xl text-[#132318] group-hover:scale-110 group-hover:bg-[#132318] group-hover:text-white transition-all duration-500 shadow-lg">
                    {card.icon}
                  </div>
                  <span className="step-number">{card.step}</span>
                </div>
                <h3 className="text-3xl font-black text-[#132318] mb-6 tracking-tight">{card.title}</h3>
                <p className="text-[#132318]/70 text-lg leading-relaxed font-medium">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why It's Different - Feature Highlight */}
      <section id="features" className="py-48 px-8 md:px-16 bg-[#132318]/5">
        <div className="max-w-7xl mx-auto">
          <div className="fin-card !bg-[#132318] text-white !p-16 md:!p-24 overflow-hidden relative shadow-[0_50px_100px_rgba(0,0,0,0.1)]">
            <div className="absolute top-0 right-0 w-1/2 h-full hidden lg:block opacity-40 illustration-blend">
              <img
                src="/feature_illustration.png"
                alt="Features"
                className="w-full h-full object-cover grayscale brightness-200"
              />
            </div>
            <div className="max-w-2xl relative z-10">
              <h2 className="text-5xl md:text-8xl font-black mb-12 tracking-tighter leading-[0.9]">Why Zerra?</h2>
              <div className="space-y-8">
                {[
                  { label: '5+ signatures', highlight: '1 Signature' },
                  { label: 'manual jumping', highlight: 'Auto Routing' },
                  { label: 'opaque status', highlight: 'Zero Friction' }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-6 group">
                    <div className="w-10 h-10 rounded-xl bg-[#E1FF76] flex items-center justify-center group-hover:rotate-12 transition-transform shadow-[0_0_20px_#E1FF7644]">
                      <ArrowRight className="w-6 h-6 text-[#132318]" />
                    </div>
                    <p className="text-2xl font-bold text-white/90">
                      <span className="text-[#E1FF76] uppercase tracking-wider">{item.highlight}</span> instead of {item.label}
                    </p>
                  </div>
                ))}
              </div>
              <Link to="/pay" className="btn-primary mt-16 !bg-[#E1FF76] !text-[#132318] hover:!bg-white text-xl px-12 py-6">
                Experience it now <ArrowRight className="w-6 h-6" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Sell on Zerra Section */}
      <section className="py-48 px-8 md:px-16">
        <div className="max-w-7xl mx-auto">
          <div className="fin-card !p-16 md:!p-24 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#E1FF76]/20 rounded-full blur-[80px] -z-10" />
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-3 pill-tag mb-10 shadow-lg border-[#132318]/10 text-[#132318]">
                <span className="font-black uppercase tracking-[0.2em] text-[10px]">For Creators & Businesses</span>
              </div>
              <h2 className="text-5xl md:text-7xl font-black text-[#132318] tracking-tighter mb-8 leading-[0.9]">Sell anything.<br/>Get paid in USDC.</h2>
              <p className="text-xl text-[#132318]/60 max-w-xl mb-12 leading-relaxed font-medium">
                Set up your storefront in minutes. List products, accept one-time payments, or create recurring subscriptions. Your customers pay from any chain — you receive Arc USDC.
              </p>
              <div className="flex flex-wrap gap-6">
                <Link to="/merchant" className="btn-primary text-xl px-12 py-6 shadow-2xl shadow-[#132318]/20">
                  Open Your Store <ArrowRight className="w-6 h-6" />
                </Link>
                <Link to="/store/arc-dev" className="btn-secondary text-xl px-12 py-6">
                  See Example Store
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-32 px-8 md:px-16 border-t border-[#132318]/5 bg-[#FFFCF5]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-20">
          <div>
            <Link to="/" className="text-3xl font-black tracking-tighter text-[#132318] flex items-center gap-3 mb-8 group overflow-hidden">
              <div className="w-10 h-10 bg-[#132318] rounded-xl flex items-center justify-center group-hover:bg-[#E1FF76] transition-all duration-500">
                <span className="text-[#E1FF76] font-black text-2xl group-hover:text-[#132318]">Z</span>
              </div>
              Zerra
            </Link>
            <p className="text-[#132318]/40 max-w-xs font-bold leading-relaxed">
              Redefining the standard for multi-chain liquidity abstraction.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-20 md:gap-40">
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-[#132318]/30 mb-8">Ecosystem</h4>
              <ul className="space-y-4 font-bold text-[#132318]/60">
                <li><a href="#" className="hover:text-[#132318]">Explorer</a></li>
                <li><a href="#" className="hover:text-[#132318]">Documentation</a></li>
                <li><a href="#" className="hover:text-[#132318]">Protocols</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-[#132318]/30 mb-8">Social</h4>
              <ul className="space-y-4 font-bold text-[#132318]/60">
                <li><a href="#" className="hover:text-[#132318]">Twitter</a></li>
                <li><a href="#" className="hover:text-[#132318]">Discord</a></li>
                <li><a href="#" className="hover:text-[#132318]">Github</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-32 pt-12 border-t border-[#132318]/5 flex flex-col md:flex-row justify-between items-center gap-8 text-[#132318]/30 text-xs font-black tracking-[0.2em] uppercase">
          <div>© 2026 Zerra Protocol. All rights reserved.</div>
          <div className="flex gap-12">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
