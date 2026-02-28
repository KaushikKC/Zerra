import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, Loader2, ArrowRight, ShoppingBag } from 'lucide-react'
import { API_BASE } from '../config/wagmiConfig'

interface StorefrontItem {
  slug: string
  displayName: string
  walletAddress: string
  logoUrl: string | null
}

export default function Stores() {
  const [storefronts, setStorefronts] = useState<StorefrontItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/storefronts`)
      .then((r) => r.json())
      .then((data) => setStorefronts(data.storefronts ?? []))
      .catch(() => setError('Could not load stores'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <Loader2 className="w-12 h-12 text-[#132318]/30 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <p className="text-red-500 font-bold">{error}</p>
        <Link to="/" className="inline-block mt-6 text-[#132318] font-bold hover:underline">
          Back to home
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16 sm:py-24">
      <div className="mb-16">
        <div className="inline-flex items-center gap-2 pill-tag mb-6 border-[#132318]/10">
          <ShoppingBag className="w-3.5 h-3.5" />
          <span className="uppercase text-[10px] tracking-[0.2em] font-black">Browse</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-black text-[#132318] tracking-tighter leading-[0.95] mb-4">
          Stores
        </h1>
        <p className="text-xl text-[#132318]/60 font-medium max-w-xl">
          Choose a store to browse products and pay with one click from any chain.
        </p>
      </div>

      {storefronts.length === 0 ? (
        <div className="fin-card text-center py-20">
          <Store className="w-16 h-16 text-[#132318]/20 mx-auto mb-6" />
          <h2 className="text-2xl font-black text-[#132318] mb-2">No stores yet</h2>
          <p className="text-[#132318]/50 font-medium mb-8 max-w-md mx-auto">
            Be the first to open a store and start accepting USDC payments.
          </p>
          <Link
            to="/merchant"
            className="btn-primary inline-flex items-center gap-2"
          >
            Open your store <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {storefronts.map((store) => (
            <Link
              key={store.slug}
              to={`/store/${store.slug}`}
              className="fin-card group block p-8 hover:border-[#E1FF76]/40 hover:shadow-lg hover:shadow-[#132318]/5 transition-all duration-300"
            >
              <div className="flex items-start gap-5">
                <div className="w-16 h-16 rounded-2xl bg-[#132318]/5 flex items-center justify-center shrink-0 group-hover:bg-[#E1FF76]/20 transition-colors">
                  {store.logoUrl ? (
                    <img
                      src={store.logoUrl}
                      alt=""
                      className="w-10 h-10 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-black text-[#132318]/60">
                      {store.displayName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-black text-[#132318] tracking-tight group-hover:text-[#132318] truncate">
                    {store.displayName}
                  </h3>
                  <p className="text-sm text-[#132318]/40 font-mono mt-1">/{store.slug}</p>
                  <span className="inline-flex items-center gap-1.5 mt-4 text-sm font-bold text-[#132318]/60 group-hover:text-[#E1FF76] transition-colors">
                    View store <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-16 text-center">
        <Link
          to="/merchant"
          className="inline-flex items-center gap-2 text-[#132318]/60 font-bold hover:text-[#132318] transition-colors"
        >
          Sell on Zerra — open your store
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
