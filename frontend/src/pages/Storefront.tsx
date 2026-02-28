import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ShoppingCart, Loader2, Package, RefreshCw } from 'lucide-react'
import { API_BASE } from '../config/wagmiConfig'

interface Product {
  id: string
  name: string
  description: string | null
  price: string
  imageUrl: string | null
  type: string
  intervalDays: number | null
}

interface Merchant {
  walletAddress: string
  displayName: string
  logoUrl: string | null
  slug: string
}

interface StorefrontData {
  merchant: Merchant
  products: Product[]
}

export default function Storefront() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<StorefrontData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [buying, setBuying] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    fetch(`${API_BASE}/api/storefront/${slug}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null }
        return r.json()
      })
      .then((d) => d && setData(d))
      .catch(() => setNotFound(true))
  }, [slug])

  const handleBuyNow = async (product: Product) => {
    if (!data) return
    setBuying(product.id)
    try {
      const res = await fetch(`${API_BASE}/api/payment-link/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantAddress: data.merchant.walletAddress,
          amount: product.price,
          label: product.name,
          expiryHours: 24,
        }),
      })
      const { url } = await res.json()
      // Navigate to the pay page using the generated URL's query string
      const payUrl = new URL(url)
      navigate(`/pay?${payUrl.searchParams.toString()}`)
    } catch (err) {
      console.error('Failed to create payment link:', err)
    } finally {
      setBuying(null)
    }
  }

  const handleSubscribe = (product: Product) => {
    if (!data) return
    const params = new URLSearchParams({
      merchantAddress: data.merchant.walletAddress,
      amount: product.price,
      intervalDays: String(product.intervalDays ?? 30),
      label: product.name,
    })
    navigate(`/subscribe/new?${params.toString()}`)
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-40 text-center">
        <Package className="w-20 h-20 text-[#132318]/10 mx-auto mb-8" />
        <h1 className="text-4xl font-black text-[#132318] tracking-tighter mb-4">Store not found</h1>
        <p className="text-[#132318]/40 font-medium">
          The store <span className="font-mono bg-[#132318]/5 px-2 py-0.5 rounded">/{slug}</span> doesn't exist.
        </p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-40 flex justify-center">
        <Loader2 className="w-10 h-10 text-[#132318]/30 animate-spin" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-24">
      {/* Store header */}
      <div className="mb-16 text-center">
        {data.merchant.logoUrl ? (
          <img
            src={data.merchant.logoUrl}
            alt={data.merchant.displayName}
            className="w-20 h-20 rounded-[1.5rem] mx-auto mb-6 object-cover shadow-xl"
          />
        ) : (
          <div className="w-20 h-20 bg-[#132318] rounded-[1.5rem] mx-auto mb-6 flex items-center justify-center text-[#E1FF76] font-black text-3xl shadow-xl">
            {data.merchant.displayName[0].toUpperCase()}
          </div>
        )}
        <h1 className="text-5xl font-black text-[#132318] tracking-tighter">
          {data.merchant.displayName}
        </h1>
        <p className="text-[#132318]/40 font-mono text-sm mt-2">store/{data.merchant.slug}</p>
      </div>

      {/* Product grid */}
      {data.products.length === 0 ? (
        <div className="fin-card py-24 text-center">
          <Package className="w-12 h-12 text-[#132318]/10 mx-auto mb-4" />
          <p className="text-[#132318]/30 font-bold">No products yet</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onBuy={() => product.type === 'subscription' ? handleSubscribe(product) : handleBuyNow(product)}
              loading={buying === product.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProductCard({
  product,
  onBuy,
  loading,
}: {
  product: Product
  onBuy: () => void
  loading: boolean
}) {
  const isSub = product.type === 'subscription'
  return (
    <div className="fin-card flex flex-col gap-4">
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-40 object-cover rounded-2xl bg-[#132318]/5"
        />
      ) : (
        <div className="w-full h-40 rounded-2xl bg-[#132318]/5 flex items-center justify-center">
          {isSub
            ? <RefreshCw className="w-10 h-10 text-[#132318]/20" />
            : <Package className="w-10 h-10 text-[#132318]/20" />
          }
        </div>
      )}
      <div className="flex-1">
        <div className="flex items-start gap-2 mb-1">
          <h3 className="font-black text-[#132318] text-lg tracking-tight flex-1">{product.name}</h3>
          {isSub && (
            <span className="inline-block px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-[#E1FF76] text-[#132318] whitespace-nowrap flex-shrink-0">
              Recurring
            </span>
          )}
        </div>
        {product.description && (
          <p className="text-sm text-[#132318]/50 mt-1 leading-relaxed">{product.description}</p>
        )}
      </div>
      <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#132318]/5">
        <div>
          <span className="text-2xl font-black text-[#132318]">{product.price}</span>
          {' '}
          <span className="text-base text-[#132318]/40">USDC</span>
          {isSub && (
            <span className="text-sm text-[#132318]/40 font-bold"> / mo</span>
          )}
        </div>
        <button
          onClick={onBuy}
          disabled={loading}
          className="btn-primary py-3 px-5 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isSub ? (
            <><RefreshCw className="w-4 h-4" /> Subscribe</>
          ) : (
            <><ShoppingCart className="w-5 h-5" /> Buy</>
          )}
        </button>
      </div>
    </div>
  )
}
