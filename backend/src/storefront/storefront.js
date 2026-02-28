import { randomUUID } from "crypto";
import {
  getMerchant,
  setMerchantSlug,
  getMerchantBySlug,
  addProduct as dbAddProduct,
  updateProduct as dbUpdateProduct,
  deleteProduct as dbDeleteProduct,
  getProducts,
} from "../db/database.js";

// Valid slug: lowercase letters, digits, hyphens, 3-40 chars
const SLUG_RE = /^[a-z0-9-]{3,40}$/;

/**
 * Claim a URL slug for a merchant.
 * @param {string} walletAddress
 * @param {string} slug - e.g. "alice-studio"
 * @returns {object} Updated merchant row
 */
export function setupSlug(walletAddress, slug) {
  if (!SLUG_RE.test(slug)) {
    throw new Error("Slug must be 3-40 lowercase letters, digits, or hyphens");
  }

  // Check uniqueness (getMerchantBySlug returns null if available)
  const existing = getMerchantBySlug(slug);
  if (existing && existing.wallet_address !== walletAddress) {
    throw new Error("Slug already taken");
  }

  setMerchantSlug(walletAddress, slug);
  return getMerchant(walletAddress);
}

/**
 * Add or update a product in a merchant's store.
 * Pass `id` to update an existing product, omit to add a new one.
 */
export function upsertProduct(merchantAddress, product) {
  if (!merchantAddress) throw new Error("merchantAddress is required");
  if (!product.name || !product.price) throw new Error("name and price are required");

  if (product.id) {
    // Update
    dbUpdateProduct(product.id, merchantAddress, {
      name: product.name,
      description: product.description,
      price: product.price,
      image_url: product.imageUrl,
      sort_order: product.sortOrder,
      type: product.type,
      interval_days: product.intervalDays ?? null,
    });
    return product.id;
  } else {
    // Insert
    const id = randomUUID();
    dbAddProduct({
      id,
      merchant_address: merchantAddress,
      name: product.name,
      description: product.description ?? null,
      price: product.price,
      image_url: product.imageUrl ?? null,
      sort_order: product.sortOrder ?? 0,
      type: product.type ?? "one_time",
      interval_days: product.intervalDays ?? null,
    });
    return id;
  }
}

/**
 * Deactivate (soft-delete) a product.
 */
export function removeProduct(id, merchantAddress) {
  dbDeleteProduct(id, merchantAddress);
}

/**
 * Get public storefront data for a slug.
 * @returns {{ merchant, products[] } | null}
 */
export function getStorefront(slug) {
  const merchant = getMerchantBySlug(slug);
  if (!merchant) return null;

  const products = getProducts(merchant.wallet_address);

  // Return only safe public fields
  return {
    merchant: {
      walletAddress: merchant.wallet_address,
      displayName: merchant.display_name,
      logoUrl: merchant.logo_url ?? null,
      slug: merchant.slug,
    },
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      price: p.price,
      imageUrl: p.image_url ?? null,
      sortOrder: p.sort_order,
      type: p.type ?? "one_time",
      intervalDays: p.interval_days ?? null,
    })),
  };
}
