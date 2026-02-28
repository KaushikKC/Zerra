/**
 * seed.js — Demo storefront data for the Zerra hackathon demo.
 *
 * Creates a "Arc Dev Tools" merchant with 3 digital products and a
 * subscription tier. Safe to call multiple times (idempotent).
 *
 * The merchant address is read from DEMO_MERCHANT_ADDRESS env var.
 * If not set, uses PRIVATE_KEY_RELAYER to derive the address.
 */

import { privateKeyToAccount } from "viem/accounts";
import { getMerchant } from "./database.js";
import { registerMerchant } from "../merchant/merchant.js";
import { setupSlug, upsertProduct, getStorefront } from "../storefront/storefront.js";

export async function seedDemoData() {
  // ── Derive merchant address ─────────────────────────────────────────────────
  let merchantAddress = process.env.DEMO_MERCHANT_ADDRESS?.trim();
  if (!merchantAddress) {
    let relayerKey = process.env.PRIVATE_KEY_RELAYER?.trim();
    if (!relayerKey) {
      console.log("[seed] Skipping demo seed: DEMO_MERCHANT_ADDRESS or PRIVATE_KEY_RELAYER not set");
      return;
    }
    if (!relayerKey.startsWith("0x")) relayerKey = "0x" + relayerKey;
    merchantAddress = privateKeyToAccount(relayerKey).address;
  }

  const slug = "arc-dev";

  // ── Skip if already seeded ─────────────────────────────────────────────────
  const existing = getStorefront(slug);
  if (existing) {
    console.log(`[seed] Demo storefront '${slug}' already exists — skipping`);
    return;
  }

  // ── Register merchant ──────────────────────────────────────────────────────
  const existingMerchant = getMerchant(merchantAddress);
  if (!existingMerchant) {
    registerMerchant(
      merchantAddress,
      "Arc Dev Tools",
      null  // no logo URL — initials avatar is shown
    );
    console.log(`[seed] Registered merchant: Arc Dev Tools (${merchantAddress})`);
  }

  // ── Claim slug ─────────────────────────────────────────────────────────────
  try {
    setupSlug(merchantAddress, slug);
    console.log(`[seed] Claimed slug: ${slug}`);
  } catch (err) {
    // Slug already claimed by another merchant
    console.warn(`[seed] Could not claim slug '${slug}':`, err.message);
    return;
  }

  // ── Create products ────────────────────────────────────────────────────────

  upsertProduct(merchantAddress, {
    name: "API Credits Pack",
    description:
      "100,000 Arc RPC API calls with guaranteed uptime. Instant activation. " +
      "Perfect for testing your DApp before mainnet. Valid 30 days.",
    price: "5",
    imageUrl: null,
    sortOrder: 0,
  });

  upsertProduct(merchantAddress, {
    name: "NFT Mint Pass",
    description:
      "Exclusive access to mint 1 NFT from the Arc Genesis Collection. " +
      "Limited to 1,000 total. Token delivered to your Arc wallet within 24 hours.",
    price: "15",
    imageUrl: null,
    sortOrder: 1,
  });

  upsertProduct(merchantAddress, {
    name: "Pro Developer Bundle",
    description:
      "Full Arc SDK access, dedicated RPC endpoint, on-chain analytics dashboard, " +
      "and priority Discord support. 90-day access. Includes testnet faucet credits.",
    price: "25",
    imageUrl: null,
    sortOrder: 2,
  });

  upsertProduct(merchantAddress, {
    name: "Developer Pro Monthly",
    description:
      "Unlimited API access, 1M RPC calls/month, advanced on-chain analytics, " +
      "priority Discord support, and early access to new Arc features. Cancel anytime.",
    price: "9",
    type: "subscription",
    intervalDays: 30,
    imageUrl: null,
    sortOrder: 3,
  });

  console.log(`[seed] Created 4 products for Arc Dev Tools (3 one-time + 1 subscription)`);
  console.log(`[seed] Demo storefront ready at: /store/${slug}`);
  console.log(`[seed] Merchant address: ${merchantAddress}`);
}
