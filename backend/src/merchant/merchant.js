import {
  registerMerchant as dbRegisterMerchant,
  getMerchant as dbGetMerchant,
  getMerchantPayments as dbGetMerchantPayments,
  getMerchantAllPayments as dbGetMerchantAllPayments,
  setMerchantWebhookUrl as dbSetWebhookUrl,
  setMerchantSplitConfig as dbSetSplitConfig,
} from "../db/database.js";

/**
 * Register or update a merchant profile.
 */
export function registerMerchant(walletAddress, displayName, logoUrl = null) {
  if (!walletAddress || !displayName) {
    throw new Error("walletAddress and displayName are required");
  }
  return dbRegisterMerchant({ wallet_address: walletAddress, display_name: displayName, logo_url: logoUrl });
}

/**
 * Get a merchant profile by wallet address.
 */
export function getMerchant(walletAddress) {
  return dbGetMerchant(walletAddress);
}

/**
 * Get paginated completed payment history for a merchant.
 */
export function getMerchantPayments(walletAddress, limit = 20, offset = 0) {
  return dbGetMerchantPayments(walletAddress, limit, offset);
}

/**
 * Get paginated payment history (all statuses) for a merchant.
 */
export function getMerchantAllPayments(walletAddress, limit = 20, offset = 0) {
  return dbGetMerchantAllPayments(walletAddress, limit, offset);
}

/**
 * Set or update the merchant's webhook URL.
 */
export function updateWebhookUrl(walletAddress, webhookUrl) {
  if (!walletAddress || !webhookUrl) {
    throw new Error("walletAddress and webhookUrl are required");
  }
  dbSetWebhookUrl(walletAddress, webhookUrl);
  return dbGetMerchant(walletAddress);
}

/**
 * Set the split payment config for a merchant.
 * splits must be an array of { address, bps } summing to 10000.
 */
export function setSplitConfig(walletAddress, splits) {
  if (!Array.isArray(splits) || splits.length === 0) {
    throw new Error("splits must be a non-empty array");
  }
  const total = splits.reduce((sum, s) => sum + Number(s.bps), 0);
  if (total !== 10000) {
    throw new Error(`Split bps must sum to 10000, got ${total}`);
  }
  for (const s of splits) {
    if (!s.address || typeof s.bps !== "number") {
      throw new Error("Each split must have address (string) and bps (number)");
    }
  }
  dbSetSplitConfig(walletAddress, splits);
  return dbGetMerchant(walletAddress);
}

/**
 * Get the split config for a merchant (returns null if none set).
 */
export function getSplitConfig(walletAddress) {
  const merchant = dbGetMerchant(walletAddress);
  if (!merchant?.split_config) return null;
  try {
    return JSON.parse(merchant.split_config);
  } catch {
    return null;
  }
}
