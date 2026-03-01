# Zerra

**A one-click USDC commerce platform built on Arc Network.**

Zerra gives merchants a complete storefront — products, subscriptions, payment links, analytics, treasury payouts — and lets any customer pay in USDC from any chain with a single wallet tap. Arc is the settlement layer. Circle CCTP is the bridge. The payer never has to think about any of it.

---

## Links

| | |
|---|---|
| **Live app** | [https://zerra-three.vercel.app/](https://zerra-three.vercel.app/) |
| **Demo video** | [https://youtu.be/6gU8e4Zfrhk](https://youtu.be/6gU8e4Zfrhk) |

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

## Features in Detail

### Merchant features

- **Storefront** — Public page at `/store/:slug`. Display name, products with names and USDC prices, and “Buy Now” per product.
- **Payment links** — Generate shareable links (and QR codes) for a fixed amount. Perfect for invoices or one-off requests.
- **Revenue splits** — Configure split recipients and basis points (e.g. 80% merchant, 20% co-founder). `PaymentRouter.sol` enforces splits on-chain on every payment.
- **Webhooks** — Optional URL per merchant. Backend receives a signed payload when a payment confirms (job status, amount, chain, refId).
- **Subscriptions** — Recurring USDC billing. Customer authorizes once; subsequent charges run against the session/setup without repeated full flows.
- **Batch treasury payouts** — Send USDC from the merchant’s Arc balance to multiple addresses in one operation (e.g. payroll, profit sharing).
- **Deposit to Arc Gateway** — Move USDC from the merchant wallet on Arc into Circle’s CCTP GatewayWallet (domain 26). From there, merchants can bridge out to Ethereum, Base, or any supported chain. Arc is the hub, not a silo.
- **Analytics & dashboard** — View payments, balances, and job history in the merchant dashboard.

### Payer / customer experience

- **One entry point** — Payment link or “Buy Now” on a product. No need to choose chain or bridge first.
- **Auto balance scan** — Zerra checks USDC and ETH balances on Ethereum Sepolia, Base Sepolia, and Arc Testnet and picks the best source.
- **Optimal routing** — If the user has ETH (e.g. on Ethereum Sepolia), Zerra swaps to USDC via Uniswap V2 then bridges via Circle CCTPv2. If they already have USDC on Base Sepolia or Arc, it bridges or pays directly. One signature from the user: a single USDC transfer to a session key.
- **No gas hassle** — User never buys gas on a destination chain. Settlement on Arc uses USDC as gas.
- **Receipts** — Every completed payment has a receipt at `/receipt/:jobId` (amount, merchant, status, tx refs).

### Security & reliability

- **Session keys** — Temporary EOAs (AES-256-CBC encrypted at rest). They hold and move USDC only for the duration of a job; backend performs swap/bridge and `pay()` / `splitPay()` so the user signs once.
- **HMAC-signed links** — Payment and API links are signed so amounts and recipients can’t be tampered with.
- **Wallet-sign middleware** — Merchant dashboard and sensitive API actions require a wallet signature to prevent unauthorized access.

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

## Architecture

### High-level flow

1. **User** opens a payment link or clicks “Buy Now” on the frontend ([zerra-three.vercel.app](https://zerra-three.vercel.app/)).
2. **Frontend** (React) lets the user connect a wallet (wagmi + RainbowKit), then calls the backend to create a **job** and get a **session key** (or reuse one).
3. **Backend** (Node) creates the job, provisions or looks up a session key EOA, and returns the pay-in details (chain, amount, session key address).
4. **User** signs **one transaction**: USDC (or in the ETH case, the frontend may coordinate swap then transfer) to the session key. All swap and bridge steps are executed by the backend using the session key so the user never leaves the app.
5. **Backend** watches for the transfer, then (if needed) runs **Uniswap V2** (ETH → USDC) and **Circle CCTPv2** to bring USDC onto Arc. Once USDC is on Arc, it calls **PaymentRouter.sol** `pay()` or `splitPay()` to settle to the merchant (and any split recipients).
6. **Merchant** receives USDC on Arc. Optional **webhook** is fired. Receipt is available at `/receipt/:jobId`.

### Components

| Component | Role |
|-----------|------|
| **Frontend** | Storefront (`/store/:slug`), Pay page (payment link flow), Merchant dashboard (products, links, splits, webhooks, subscriptions, payouts, Gateway deposit), Receipt page, Pitch deck. Uses `VITE_*` env for API URL and chain/contract config. |
| **Backend API** | REST over Node. Creates jobs, manages session keys (encrypted), triggers swap + CCTP bridge, calls PaymentRouter, runs cron for subscription and bridge finalization, sends webhooks. Uses Supabase (prod) or SQLite (dev) for jobs, merchants, session keys, subscriptions. |
| **PaymentRouter.sol** | Deployed on Arc Testnet. `pay(merchant, amount, refId)` for single recipient; `splitPay(merchant, recipients, bps, amount, refId)` for revenue splits. Platform fee (bps) and merchant/split payouts in USDC. USDC is used for gas on Arc. |
| **Circle CCTPv2** | Cross-chain USDC. User’s chain → Attestation API → Arc. 1 bps fee. No manual attestation in the flow; backend uses Bridge Kit / API. |
| **Uniswap V2** | On Ethereum Sepolia, used to swap ETH → USDC when the user only has ETH. |

### Data flow (payment)

```
[Customer wallet]  ──(1 sign)──►  [Session Key EOA]
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
              [Uniswap V2]        [CCTPv2 bridge]     [Direct if on Arc]
              (ETH → USDC)        (USDC → Arc)       (no bridge)
                    │                   │                   │
                    └───────────────────┼───────────────────┘
                                        ▼
                              [Arc Testnet]
                                        │
                                        ▼
                              [PaymentRouter.pay / splitPay]
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
              [Platform fee]     [Merchant wallet]   [Split recipients]
```

### Supported chains (testnet)

- **Ethereum Sepolia** — Source chain; ETH can be swapped to USDC via Uniswap V2, then bridged via CCTPv2.
- **Base Sepolia** — Source chain; USDC bridged via CCTPv2 to Arc.
- **Arc Testnet (chainId 5042002)** — Settlement layer. All payments land here; USDC is native gas. Merchants can then deposit to Circle’s GatewayWallet and bridge out to other chains.

---

## Project Structure

- **`/frontend`** — React app (storefront, pay page, merchant dashboard, pitch deck).
- **`/backend`** — Node API (jobs, session keys, CCTP, PaymentRouter, webhooks).
- **Contracts** — `PaymentRouter.sol` on Arc (pay, splitPay, USDC gas).

---

## Getting Started

- **Try the app:** [Live](https://zerra-three.vercel.app/) · [Demo video](https://youtu.be/6gU8e4Zfrhk)
- **Run locally:** See **`frontend/README.md`** for frontend setup and **`backend/README.md`** (or backend docs) for API and environment configuration.

---

## License

Built for the Arc DeFi Hackathon.
