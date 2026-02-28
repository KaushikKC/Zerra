# Zerra Frontend

React 19 + Tailwind 4 + wagmi + RainbowKit frontend for **Zerra** — the one-click USDC commerce platform on Arc Network.

For full product overview, problem, features, and tech stack, see the [root README](../README.md).

## What's in this app

- **Storefront** — Public store pages at `/store/:slug` with products and Buy Now.
- **Pay page** — Payment link flow: connect wallet, auto balance scan, optimal route (Uniswap V2 + Circle CCTPv2), one signature, receipt at `/receipt/:jobId`.
- **Merchant dashboard** — Register store, products, payment links, revenue splits, webhooks, subscriptions, batch treasury payouts, deposit to Arc Gateway.
- **Pitch deck** — `/deck` — slide deck for the Arc DeFi Hackathon.

## Setup

```bash
npm install
cp .env.example .env   # set VITE_* vars
npm run dev
```

Build:

```bash
npm run build
```

## Env

- `VITE_API_URL` — Backend API base URL.
- Other `VITE_*` as needed for chain IDs, contract addresses, etc.

## Stack

- React 19, Vite, TypeScript
- Tailwind 4
- wagmi + RainbowKit (wallet connect)
- PWA-ready, mobile-first
