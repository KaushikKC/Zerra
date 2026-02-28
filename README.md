# Zerra

**A one-click USDC commerce platform built on Arc Network.**

Zerra gives merchants a complete storefront — products, subscriptions, payment links, analytics, treasury payouts — and lets any customer pay in USDC from any chain with a single wallet tap. Arc is the settlement layer. Circle CCTP is the bridge. The payer never has to think about any of it.

---

## The Problem

Crypto payments are broken in two directions:

**For payers:** You have USDC on Base. The merchant wants it on Arc. You must manually bridge, wait, pay gas on a chain you don't have gas for, switch networks, and sign three different transactions. Most users give up.

**For merchants:** You receive fragmented USDC across four chains, have no storefront, no invoicing, no recurring billing, and no way to manage treasury. You're using Notion + MetaMask + a spreadsheet.

Web2 solved this with Stripe. Crypto doesn't have a Stripe yet.

---

## What We Built

Zerra is the **Stripe of on-chain payments** — with Arc as the settlement rail.

### For the Merchant

1. **Connect wallet** → Register your store in 30 seconds.
2. **Set a storefront slug** (e.g. `/store/alices-studio`) and list products with prices.
3. Customers can browse and buy directly — or the merchant generates a **payment link** for a specific invoice.
4. **Revenue splits** (e.g. 80% you, 20% co-founder) enforced on-chain by `PaymentRouter.sol`.
5. **Webhooks** — your backend gets notified the moment a payment confirms.
6. **Subscriptions** — recurring billing with one-time customer authorization.
7. **Batch treasury payouts** — send USDC payroll to multiple addresses in one flow.
8. **Deposit earnings to Arc Gateway** — transfer USDC from Arc directly into Circle's CCTP GatewayWallet, making it instantly portable to any chain. Arc isn't a dead end; it's the hub.

### For the Payer / Customer

1. Click the payment link or product's **"Buy Now"**.
2. **Connect wallet** — Zerra scans balances across Ethereum Sepolia, Base Sepolia, and Arc Testnet automatically.
3. Zerra computes the **optimal route**:
   - ETH on Ethereum Sepolia? → Swap to USDC via Uniswap V2, then bridge via Circle CCTPv2.
   - USDC on Base Sepolia? → Bridge directly via Circle CCTPv2.
   - Already on Arc? → Direct payment, sub-second confirmation.
4. **Sign one transaction** — a USDC transfer to a temporary session key.
5. **Done.** Merchant receives USDC on Arc. A receipt is generated at `/receipt/:jobId`.

The customer never bridges manually, never switches networks, never manages gas.

---

## Arc as the Liquidity Hub

Arc is not just where payments land — it's where value circulates.

```
Any Chain (ETH / Base / Arc)
      │  one signature
      ▼
  Session Key EOA
      │  swap if needed (Uniswap V2)
      │  bridge if needed (Circle CCTPv2)
      ▼
  Arc Testnet  ◄──── settlement layer
      │  PaymentRouter.sol  (pay / splitPay)
      ▼
  Merchant Wallet on Arc
      │  merchant deposits earnings
      ▼
  Circle CCTP GatewayWallet on Arc
      │  indexed by Circle (domain 26)
      ▼
  Bridge out to Ethereum / Base / anywhere
```

Payments flow in from every chain. Merchants settle on Arc. From Arc, they can bridge out through Circle Gateway to any destination. **Arc is the hub — not a silo.**

---

## Key Technologies

| Layer        | Technology                    | Role |
|-------------|-------------------------------|------|
| **Settlement** | Arc Testnet (chainId 5042002) | All payments land here. USDC is native gas. |
| **Bridge**     | Circle Bridge Kit (CCTPv2)    | Cross-chain USDC — 1 bps fee, no manual attestation. |
| **Swap**       | Uniswap V2 (Ethereum Sepolia) | ETH → USDC before bridging. |
| **Smart Contract** | PaymentRouter.sol on Arc   | `pay()` + `splitPay()` — bps-based revenue sharing. |
| **Session Keys**  | AES-256-CBC encrypted EOAs | Temporary signers that hold and move USDC. |
| **Auth**        | HMAC-signed links + wallet-sig middleware | Tamper-proof links, protected merchant API. |
| **Database**    | SQLite (dev) / Supabase Postgres (prod) | Jobs, session keys, merchants, subscriptions. |
| **Frontend**    | React 19 + Tailwind 4 + wagmi + RainbowKit | PWA-ready, mobile-first. |

---

## Project Structure

- **`/frontend`** — React app (storefront, pay page, merchant dashboard, pitch deck).
- **`/backend`** — Node API (jobs, session keys, CCTP, PaymentRouter, webhooks).
- **Contracts** — `PaymentRouter.sol` on Arc (pay, splitPay, USDC gas).

---

## Getting Started

See **`frontend/README.md`** for frontend setup and **`backend/README.md`** (or backend docs) for API and environment configuration.

---

## License

Built for the Arc DeFi Hackathon.
