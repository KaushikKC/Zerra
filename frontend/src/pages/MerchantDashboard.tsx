import { useState, useEffect } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import {
  Copy, Check, QrCode, ExternalLink, Plus, User, DollarSign, Tag,
  Loader2, History, Store, RefreshCw, Settings, Webhook, Trash2,
  Globe, Package, AlertCircle, CheckCircle2,
} from 'lucide-react'
import { API_BASE } from '../config/wagmiConfig'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MerchantProfile {
  wallet_address: string
  display_name: string
  logo_url?: string
  slug?: string
  webhook_url?: string
  split_config?: string
  created_at: number
}

interface Payment {
  id: string
  payer_address: string
  target_amount: string
  quote: { merchantReceives: string; totalFees: string } | null
  label: string | null
  payment_ref: string | null
  status: string
  tx_hashes: { pay?: string } | null
  expires_at: number | null
  created_at: number
}

interface Product {
  id?: string
  name: string
  description: string
  price: string
  imageUrl: string
}

interface SplitRecipient {
  address: string
  pct: string // percentage string, e.g. "90"
}

interface WebhookDelivery {
  id: string
  job_id: string
  url: string
  status: string
  response_code: number | null
  attempts: number
  created_at: number
}

interface Subscription {
  id: string
  payer_address: string
  amount_usdc: string
  label: string | null
  interval_days: number
  next_charge_at: number
  status: string
}

type Tab = 'overview' | 'storefront' | 'subscriptions' | 'settings'

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    COMPLETE:              { label: 'Complete',  cls: 'bg-green-100 text-green-700' },
    AWAITING_CONFIRMATION: { label: 'Pending',   cls: 'bg-yellow-100 text-yellow-700' },
    EXPIRED:               { label: 'Expired',   cls: 'bg-gray-100 text-gray-500' },
    FAILED:                { label: 'Failed',    cls: 'bg-red-100 text-red-600' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MerchantDashboard() {
  const { address, isConnected } = useAccount()

  const [merchant, setMerchant] = useState<MerchantProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [registerName, setRegisterName] = useState('')
  const [registerLogo, setRegisterLogo] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // ── Overview state ──────────────────────────────────────────────────────────
  const [amount, setAmount] = useState('')
  const [label, setLabel] = useState('')
  const [ref, setRef] = useState('')
  const [generating, setGenerating] = useState(false)
  const [paymentLink, setPaymentLink] = useState<{ url: string; qrCode: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [payments, setPayments] = useState<Payment[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)

  // ── Storefront state ────────────────────────────────────────────────────────
  const [slugInput, setSlugInput] = useState('')
  const [slugSaving, setSlugSaving] = useState(false)
  const [slugMsg, setSlugMsg] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [productForm, setProductForm] = useState<Product>({ name: '', description: '', price: '', imageUrl: '' })
  const [productSaving, setProductSaving] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)

  // ── Split config state ──────────────────────────────────────────────────────
  const [splits, setSplits] = useState<SplitRecipient[]>([{ address: '', pct: '100' }])
  const [splitSaving, setSplitSaving] = useState(false)
  const [splitMsg, setSplitMsg] = useState('')

  // ── Webhook state ───────────────────────────────────────────────────────────
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookSaving, setWebhookSaving] = useState(false)
  const [webhookMsg, setWebhookMsg] = useState('')
  const [webhookTesting, setWebhookTesting] = useState(false)
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDelivery[]>([])

  // ── Subscription state ──────────────────────────────────────────────────────
  const [subAmount, setSubAmount] = useState('')
  const [subInterval, setSubInterval] = useState('30')
  const [subLabel, setSubLabel] = useState('')
  const [subPayerAddress, setSubPayerAddress] = useState('')
  const [subCreating, setSubCreating] = useState(false)
  const [subLink, setSubLink] = useState('')
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])

  // ── Load merchant on wallet connect ────────────────────────────────────────
  useEffect(() => {
    if (!address) { setMerchant(null); return }
    setLoading(true)
    fetch(`${API_BASE}/api/merchant/${address}`)
      .then((r) => r.ok ? r.json() : null)
      .then((m) => {
        setMerchant(m)
        if (m?.webhook_url) setWebhookUrl(m.webhook_url)
        if (m?.slug) setSlugInput(m.slug)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [address])

  // ── Load data when merchant changes ────────────────────────────────────────
  useEffect(() => {
    if (!merchant) return
    loadPayments()
    loadProducts()
    loadSubscriptions()
    loadWebhookDeliveries()
    loadSplitConfig()
  }, [merchant])

  function loadPayments() {
    setPaymentsLoading(true)
    fetch(`${API_BASE}/api/merchant/${merchant!.wallet_address}/payments?limit=20&all=1`)
      .then((r) => r.json())
      .then((data) => { setPayments(data.payments ?? []); setPaymentsLoading(false) })
      .catch(() => setPaymentsLoading(false))
  }

  function loadProducts() {
    if (!merchant?.slug) return
    fetch(`${API_BASE}/api/storefront/${merchant.slug}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setProducts(d.products ?? []))
      .catch(() => {})
  }

  function loadSubscriptions() {
    fetch(`${API_BASE}/api/subscriptions/merchant/${merchant!.wallet_address}`)
      .then((r) => r.json())
      .then((d) => setSubscriptions(d.subscriptions ?? []))
      .catch(() => {})
  }

  function loadWebhookDeliveries() {
    fetch(`${API_BASE}/api/merchant/${merchant!.wallet_address}/webhooks`)
      .then((r) => r.json())
      .then((d) => setWebhookDeliveries(d.deliveries ?? []))
      .catch(() => {})
  }

  function loadSplitConfig() {
    fetch(`${API_BASE}/api/merchant/${merchant!.wallet_address}/split`)
      .then((r) => r.json())
      .then((d) => {
        if (d.splits && d.splits.length > 0) {
          setSplits(d.splits.map((s: { address: string; bps: number }) => ({
            address: s.address,
            pct: String(s.bps / 100),
          })))
        }
      })
      .catch(() => {})
  }

  // ── Register ────────────────────────────────────────────────────────────────
  const handleRegister = async () => {
    if (!address || !registerName.trim()) return
    setLoading(true)
    const res = await fetch(`${API_BASE}/api/merchant/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: address, displayName: registerName.trim(), logoUrl: registerLogo || null }),
    })
    const m = await res.json()
    setMerchant(m)
    setLoading(false)
  }

  // ── Payment link ────────────────────────────────────────────────────────────
  const handleGenerateLink = async () => {
    if (!merchant || !amount || !label) return
    setGenerating(true)
    setPaymentLink(null)
    const res = await fetch(`${API_BASE}/api/payment-link/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantAddress: merchant.wallet_address, amount, label, ref, expiryHours: 24 }),
    })
    const data = await res.json()
    setPaymentLink(data)
    setGenerating(false)
  }

  const handleCopy = () => {
    if (!paymentLink) return
    navigator.clipboard.writeText(paymentLink.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Slug ────────────────────────────────────────────────────────────────────
  const handleSaveSlug = async () => {
    if (!merchant || !slugInput.trim()) return
    setSlugSaving(true)
    setSlugMsg('')
    try {
      const res = await fetch(`${API_BASE}/api/storefront/slug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: merchant.wallet_address, slug: slugInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setSlugMsg(data.error); return }
      setMerchant(data)
      setSlugMsg('Saved!')
      loadProducts()
    } catch { setSlugMsg('Failed') }
    finally { setSlugSaving(false) }
  }

  // ── Products ────────────────────────────────────────────────────────────────
  const handleSaveProduct = async () => {
    if (!merchant || !productForm.name || !productForm.price) return
    setProductSaving(true)
    try {
      const url = editingProductId
        ? `${API_BASE}/api/storefront/product/${editingProductId}`
        : `${API_BASE}/api/storefront/product`
      const method = editingProductId ? 'PUT' : 'POST'
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantAddress: merchant.wallet_address,
          ...productForm,
        }),
      })
      setProductForm({ name: '', description: '', price: '', imageUrl: '' })
      setEditingProductId(null)
      loadProducts()
    } finally { setProductSaving(false) }
  }

  const handleDeleteProduct = async (id: string) => {
    if (!merchant) return
    await fetch(`${API_BASE}/api/storefront/product/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantAddress: merchant.wallet_address }),
    })
    loadProducts()
  }

  // ── Split config ────────────────────────────────────────────────────────────
  const handleSaveSplit = async () => {
    if (!merchant) return
    setSplitSaving(true)
    setSplitMsg('')
    try {
      const total = splits.reduce((s, r) => s + parseFloat(r.pct || '0'), 0)
      if (Math.abs(total - 100) > 0.001) { setSplitMsg('Percentages must sum to 100%'); return }
      const res = await fetch(`${API_BASE}/api/merchant/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: merchant.wallet_address,
          splits: splits.map((s) => ({ address: s.address, bps: Math.round(parseFloat(s.pct) * 100) })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSplitMsg(data.error); return }
      setSplitMsg('Saved!')
    } catch { setSplitMsg('Failed') }
    finally { setSplitSaving(false) }
  }

  // ── Webhooks ────────────────────────────────────────────────────────────────
  const handleSaveWebhook = async () => {
    if (!merchant || !webhookUrl) return
    setWebhookSaving(true)
    setWebhookMsg('')
    try {
      const res = await fetch(`${API_BASE}/api/merchant/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: merchant.wallet_address, webhookUrl }),
      })
      if (!res.ok) { setWebhookMsg('Failed'); return }
      setWebhookMsg('Saved!')
    } finally { setWebhookSaving(false) }
  }

  const handleTestWebhook = async () => {
    if (!merchant) return
    setWebhookTesting(true)
    try {
      await fetch(`${API_BASE}/api/merchant/webhook/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: merchant.wallet_address }),
      })
      setTimeout(loadWebhookDeliveries, 2000)
    } finally { setWebhookTesting(false) }
  }

  // ── Subscriptions ───────────────────────────────────────────────────────────
  const handleCreateSub = async () => {
    if (!merchant || !subAmount || !subInterval || !subPayerAddress) return
    setSubCreating(true)
    setSubLink('')
    try {
      const res = await fetch(`${API_BASE}/api/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantAddress: merchant.wallet_address,
          payerAddress: subPayerAddress,
          amountUsdc: subAmount,
          intervalDays: parseInt(subInterval, 10),
          label: subLabel || null,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSubLink(data.authorizeUrl)
        loadSubscriptions()
      }
    } finally { setSubCreating(false) }
  }

  // ── Not connected ───────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-40 text-center">
        <div className="inline-flex items-center gap-2 pill-tag mb-8 border-[#132318]/10">
          <User className="w-3.5 h-3.5" />
          <span className="uppercase text-[10px] tracking-[0.2em] font-black">Merchant Portal</span>
        </div>
        <h1 className="text-5xl font-black text-[#132318] tracking-tighter mb-8">Connect your Arc wallet</h1>
        <p className="text-[#132318]/50 font-medium mb-12">Connect to create payment links and view your history.</p>
        <div className="flex justify-center">
          <ConnectButton label="Connect Arc Wallet" />
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-40 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#132318]/30 animate-spin" />
      </div>
    )
  }

  // ── Registration ────────────────────────────────────────────────────────────
  if (!merchant) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 sm:py-40">
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 pill-tag mb-6 border-[#132318]/10">
            <User className="w-3.5 h-3.5" />
            <span className="uppercase text-[10px] tracking-[0.2em] font-black">Register as Merchant</span>
          </div>
          <h1 className="text-5xl font-black text-[#132318] tracking-tighter">Set up your profile</h1>
        </div>
        <div className="fin-card space-y-8">
          <div>
            <label className="text-label mb-3 block">Display Name <span className="text-red-400">*</span></label>
            <input
              className="input-field"
              placeholder="e.g. Alice's Design Studio"
              value={registerName}
              onChange={(e) => setRegisterName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-label mb-3 block">Logo URL <span className="text-[#132318]/30">(optional)</span></label>
            <input
              className="input-field"
              placeholder="https://..."
              value={registerLogo}
              onChange={(e) => setRegisterLogo(e.target.value)}
            />
          </div>
          <div className="pt-4">
            <button
              onClick={handleRegister}
              disabled={!registerName.trim()}
              className="btn-primary w-full py-6 text-xl justify-center disabled:opacity-50"
            >
              Create Profile <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview',      label: 'Overview',      icon: <History className="w-4 h-4" /> },
    { id: 'storefront',    label: 'Storefront',    icon: <Store className="w-4 h-4" /> },
    { id: 'subscriptions', label: 'Subscriptions', icon: <RefreshCw className="w-4 h-4" /> },
    { id: 'settings',      label: 'Settings',      icon: <Settings className="w-4 h-4" /> },
  ]

  const appUrl = import.meta.env.VITE_APP_URL ?? 'http://localhost:5173'
  const storeUrl = merchant.slug ? `${appUrl}/store/${merchant.slug}` : null

  return (
    <div className="mx-auto max-w-4xl px-6 py-24">
      {/* Profile header */}
      <div className="mb-10 flex items-center gap-6">
        <div className="w-16 h-16 bg-[#132318] rounded-[1.5rem] flex items-center justify-center text-[#E1FF76] font-black text-2xl shadow-xl">
          {merchant.display_name[0].toUpperCase()}
        </div>
        <div>
          <h1 className="text-4xl font-black text-[#132318] tracking-tighter">{merchant.display_name}</h1>
          <p className="font-mono text-sm text-[#132318]/40 mt-1">{merchant.wallet_address}</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-10 p-1 rounded-2xl bg-[#132318]/[0.04] w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-black transition-all ${
              activeTab === t.id
                ? 'bg-[#132318] text-[#E1FF76] shadow-sm'
                : 'text-[#132318]/50 hover:text-[#132318]'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Overview ─────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid md:grid-cols-2 gap-8">
          {/* Create payment request */}
          <div className="space-y-6">
            <h2 className="text-label">New Payment Request</h2>
            <div className="fin-card space-y-6">
              <div>
                <label className="text-label mb-2 block text-sm">Amount (USDC) <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input
                    className="input-field !text-3xl font-black pr-24"
                    placeholder="0.00"
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <span className="absolute right-5 top-1/2 -translate-y-1/2 font-black text-[#132318]/30 text-sm">USDC</span>
                </div>
              </div>
              <div>
                <label className="text-label mb-2 block text-sm">Label <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input
                    className="input-field"
                    placeholder="e.g. Freelance Invoice #001"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                  <Tag className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#132318]/20" />
                </div>
              </div>
              <div>
                <label className="text-label mb-2 block text-sm">Reference ID <span className="text-[#132318]/30">(optional)</span></label>
                <input
                  className="input-field"
                  placeholder="Internal reference"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                />
              </div>
              <button
                onClick={handleGenerateLink}
                disabled={!amount || !label || generating}
                className="btn-primary w-full py-5 text-lg justify-center disabled:opacity-50"
              >
                {generating ? <><Loader2 className="w-5 h-5 animate-spin" /> Generating…</> : <><QrCode className="w-5 h-5" /> Generate Payment Link</>}
              </button>
            </div>

            {paymentLink && (
              <div className="fin-card space-y-6">
                <div className="flex justify-center">
                  <img src={paymentLink.qrCode} alt="QR Code" className="w-48 h-48 rounded-2xl border border-[#132318]/5 shadow-lg" />
                </div>
                <div className="p-4 rounded-2xl bg-[#132318]/[0.03] border border-[#132318]/5">
                  <p className="font-mono text-xs text-[#132318]/60 break-all leading-relaxed">{paymentLink.url}</p>
                </div>
                <button onClick={handleCopy} className="btn-secondary w-full py-4 justify-center">
                  {copied ? <><Check className="w-5 h-5 text-green-500" /> Copied!</> : <><Copy className="w-5 h-5" /> Copy Link</>}
                </button>
              </div>
            )}
          </div>

          {/* Payment history */}
          <div className="space-y-6">
            <h2 className="text-label flex items-center gap-2">
              <History className="w-4 h-4 text-[#132318]/40" /> Recent Payments
            </h2>
            {paymentsLoading ? (
              <div className="fin-card py-16 flex justify-center"><Loader2 className="w-8 h-8 text-[#132318]/20 animate-spin" /></div>
            ) : payments.length === 0 ? (
              <div className="fin-card py-16 text-center">
                <DollarSign className="w-10 h-10 text-[#132318]/10 mx-auto mb-3" />
                <p className="text-[#132318]/30 font-bold text-sm">No payments yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {payments.map((p) => (
                  <div key={p.id} className="fin-card !p-5 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-black text-[#132318] tracking-tight truncate">{p.label ?? 'Payment'}</p>
                        <p className="font-mono text-[10px] text-[#132318]/30 mt-0.5 truncate">{p.payer_address}</p>
                      </div>
                      <span className="font-black text-[#132318] text-lg whitespace-nowrap">
                        {p.quote?.merchantReceives ?? p.target_amount} USDC
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <StatusBadge status={p.status} />
                      <div className="flex items-center gap-3">
                        <a href={`/receipt/${p.id}`} className="text-[10px] font-black text-[#132318]/40 hover:text-[#132318] uppercase tracking-wider transition-colors">Receipt</a>
                        {p.tx_hashes?.pay && (
                          <a href={`https://testnet.arcscan.app/tx/${p.tx_hashes.pay}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-black text-[#132318]/40 hover:text-[#132318] uppercase tracking-wider transition-colors">
                            <ExternalLink className="w-3 h-3" /> ArcScan
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Storefront ───────────────────────────────────────────────── */}
      {activeTab === 'storefront' && (
        <div className="space-y-10">
          {/* Slug claim */}
          <div className="fin-card space-y-6">
            <h2 className="font-black text-[#132318] text-xl tracking-tight">Your Store URL</h2>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[#132318]/30 font-bold text-sm">store/</span>
                <input
                  className="input-field !pl-16"
                  placeholder="your-store-name"
                  value={slugInput}
                  onChange={(e) => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                />
              </div>
              <button onClick={handleSaveSlug} disabled={slugSaving || !slugInput} className="btn-primary px-6 py-4 disabled:opacity-50">
                {slugSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save'}
              </button>
            </div>
            {slugMsg && <p className={`text-sm font-bold ${slugMsg === 'Saved!' ? 'text-green-600' : 'text-red-500'}`}>{slugMsg}</p>}
            {storeUrl && (
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-[#132318]/[0.03]">
                <Globe className="w-5 h-5 text-[#132318]/30 flex-shrink-0" />
                <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-[#132318]/60 hover:text-[#132318] transition-colors truncate">
                  {storeUrl}
                </a>
                <ExternalLink className="w-4 h-4 text-[#132318]/30 flex-shrink-0" />
              </div>
            )}
          </div>

          {merchant.slug && (
            <>
              {/* Add product form */}
              <div className="fin-card space-y-6">
                <h2 className="font-black text-[#132318] text-xl tracking-tight">
                  {editingProductId ? 'Edit Product' : 'Add Product'}
                </h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-label mb-2 block text-sm">Name <span className="text-red-400">*</span></label>
                    <input className="input-field" placeholder="Product name" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-label mb-2 block text-sm">Price (USDC) <span className="text-red-400">*</span></label>
                    <input className="input-field" type="number" placeholder="0.00" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-label mb-2 block text-sm">Description</label>
                    <input className="input-field" placeholder="Short description" value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-label mb-2 block text-sm">Image URL</label>
                    <input className="input-field" placeholder="https://..." value={productForm.imageUrl} onChange={(e) => setProductForm({ ...productForm, imageUrl: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={handleSaveProduct} disabled={productSaving || !productForm.name || !productForm.price} className="btn-primary py-4 px-6 disabled:opacity-50">
                    {productSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Plus className="w-5 h-5" /> {editingProductId ? 'Update' : 'Add'} Product</>}
                  </button>
                  {editingProductId && (
                    <button onClick={() => { setEditingProductId(null); setProductForm({ name: '', description: '', price: '', imageUrl: '' }) }} className="btn-secondary py-4 px-6">Cancel</button>
                  )}
                </div>
              </div>

              {/* Product list */}
              {products.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-label">Products ({products.length})</h2>
                  {products.map((p: any) => (
                    <div key={p.id} className="fin-card !p-5 flex items-center gap-4">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-14 h-14 rounded-xl object-cover bg-[#132318]/5 flex-shrink-0" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-[#132318]/5 flex-shrink-0 flex items-center justify-center">
                          <Package className="w-6 h-6 text-[#132318]/20" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-[#132318] truncate">{p.name}</p>
                        {p.description && <p className="text-sm text-[#132318]/40 truncate">{p.description}</p>}
                      </div>
                      <span className="font-black text-[#132318] whitespace-nowrap">{p.price} USDC</span>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingProductId(p.id); setProductForm({ name: p.name, description: p.description ?? '', price: p.price, imageUrl: p.imageUrl ?? '' }) }} className="p-2 rounded-lg hover:bg-[#132318]/5 transition-colors">
                          <Tag className="w-4 h-4 text-[#132318]/40" />
                        </button>
                        <button onClick={() => handleDeleteProduct(p.id)} className="p-2 rounded-lg hover:bg-red-50 transition-colors">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TAB: Subscriptions ────────────────────────────────────────────── */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-10">
          {/* Create subscription */}
          <div className="fin-card space-y-6">
            <h2 className="font-black text-[#132318] text-xl tracking-tight">Create Subscription</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-label mb-2 block text-sm">Amount (USDC) <span className="text-red-400">*</span></label>
                <input className="input-field" type="number" placeholder="10.00" value={subAmount} onChange={(e) => setSubAmount(e.target.value)} />
              </div>
              <div>
                <label className="text-label mb-2 block text-sm">Interval (days) <span className="text-red-400">*</span></label>
                <input className="input-field" type="number" min="1" placeholder="30" value={subInterval} onChange={(e) => setSubInterval(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-label mb-2 block text-sm">Payer Address <span className="text-red-400">*</span></label>
                <input className="input-field font-mono" placeholder="0x..." value={subPayerAddress} onChange={(e) => setSubPayerAddress(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-label mb-2 block text-sm">Label <span className="text-[#132318]/30">(optional)</span></label>
                <input className="input-field" placeholder="Monthly plan" value={subLabel} onChange={(e) => setSubLabel(e.target.value)} />
              </div>
            </div>
            <button onClick={handleCreateSub} disabled={subCreating || !subAmount || !subInterval || !subPayerAddress} className="btn-primary py-4 px-6 disabled:opacity-50">
              {subCreating ? <><Loader2 className="w-5 h-5 animate-spin" /> Creating…</> : <><Plus className="w-5 h-5" /> Create Subscription</>}
            </button>
            {subLink && (
              <div className="p-4 rounded-2xl bg-green-50 border border-green-100 space-y-2">
                <p className="text-sm font-black text-green-700">Share this link with your customer to authorize:</p>
                <div className="flex items-center gap-3">
                  <p className="font-mono text-xs text-green-600 truncate flex-1">{subLink}</p>
                  <button onClick={() => navigator.clipboard.writeText(subLink)} className="p-2 rounded-lg hover:bg-green-100">
                    <Copy className="w-4 h-4 text-green-600" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Subscription list */}
          {subscriptions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-label">Active Subscriptions</h2>
              {subscriptions.map((s) => (
                <div key={s.id} className="fin-card !p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-black text-[#132318]">{s.label ?? 'Subscription'}</p>
                      <p className="font-mono text-[10px] text-[#132318]/30 mt-0.5">{s.payer_address}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-[#132318]">{s.amount_usdc} USDC</p>
                      <p className="text-[10px] text-[#132318]/40 font-bold">every {s.interval_days}d</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${s.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.status}
                    </span>
                    <span className="text-[10px] text-[#132318]/30 font-mono">
                      Next: {new Date(s.next_charge_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Settings ─────────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="space-y-10">
          {/* Split config */}
          <div className="fin-card space-y-6">
            <h2 className="font-black text-[#132318] text-xl tracking-tight">Split Payments</h2>
            <p className="text-sm text-[#132318]/50">Distribute each payment across multiple recipients. Percentages must sum to 100%.</p>
            <div className="space-y-3">
              {splits.map((s, i) => (
                <div key={i} className="flex gap-3 items-center">
                  <input
                    className="input-field flex-1 font-mono"
                    placeholder="0x... recipient address"
                    value={s.address}
                    onChange={(e) => {
                      const n = [...splits]; n[i] = { ...n[i], address: e.target.value }; setSplits(n)
                    }}
                  />
                  <div className="relative w-28">
                    <input
                      className="input-field !pr-8"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="50"
                      value={s.pct}
                      onChange={(e) => {
                        const n = [...splits]; n[i] = { ...n[i], pct: e.target.value }; setSplits(n)
                      }}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#132318]/30 font-bold text-sm">%</span>
                  </div>
                  {splits.length > 1 && (
                    <button onClick={() => setSplits(splits.filter((_, j) => j !== i))} className="p-2 rounded-lg hover:bg-red-50">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSplits([...splits, { address: '', pct: '' }])} className="btn-secondary py-3 px-4">
                <Plus className="w-4 h-4" /> Add Recipient
              </button>
              <button onClick={handleSaveSplit} disabled={splitSaving} className="btn-primary py-3 px-5 disabled:opacity-50">
                {splitSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Split Config'}
              </button>
            </div>
            {splitMsg && (
              <p className={`text-sm font-bold ${splitMsg === 'Saved!' ? 'text-green-600' : 'text-red-500'}`}>{splitMsg}</p>
            )}
          </div>

          {/* Webhooks */}
          <div className="fin-card space-y-6">
            <h2 className="font-black text-[#132318] text-xl tracking-tight">Webhooks</h2>
            <p className="text-sm text-[#132318]/50">Get notified via HTTP POST when a payment completes. Requests are signed with <code className="bg-[#132318]/5 px-1 rounded">X-Zerra-Signature</code>.</p>
            <div className="flex gap-3">
              <input
                className="input-field flex-1"
                placeholder="https://your-app.com/webhooks/zerra"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <button onClick={handleSaveWebhook} disabled={webhookSaving || !webhookUrl} className="btn-primary px-5 py-4 disabled:opacity-50">
                {webhookSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save'}
              </button>
            </div>
            {webhookMsg && <p className={`text-sm font-bold ${webhookMsg === 'Saved!' ? 'text-green-600' : 'text-red-500'}`}>{webhookMsg}</p>}
            {merchant.webhook_url && (
              <button onClick={handleTestWebhook} disabled={webhookTesting} className="btn-secondary py-3 px-5 disabled:opacity-50">
                {webhookTesting ? <><Loader2 className="w-5 h-5 animate-spin" /> Sending…</> : <><Webhook className="w-5 h-5" /> Send Test Webhook</>}
              </button>
            )}

            {/* Delivery history */}
            {webhookDeliveries.length > 0 && (
              <div className="space-y-2">
                <p className="text-label text-sm">Recent Deliveries</p>
                {webhookDeliveries.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-[#132318]/[0.02] border border-[#132318]/5">
                    <div className="flex items-center gap-3">
                      {d.status === 'DELIVERED'
                        ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        : <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                      <span className="font-mono text-xs text-[#132318]/50 truncate max-w-[180px]">{d.url}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {d.response_code && (
                        <span className={`text-xs font-black ${d.response_code < 300 ? 'text-green-600' : 'text-red-500'}`}>
                          HTTP {d.response_code}
                        </span>
                      )}
                      <span className="text-[10px] text-[#132318]/30 font-mono">
                        {new Date(d.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
