/**
 * Unified database entry point.
 * - If DATABASE_URL is set (e.g. Supabase Postgres): use database-pg.js (async).
 * - Otherwise: use database-sqlite.js (sync), wrapped so all exports return Promises.
 * All callers should await every DB function.
 */
const usePg = !!process.env.DATABASE_URL?.trim();

function wrapSync(syncFn) {
  return (...args) => Promise.resolve(syncFn(...args));
}

let api;

if (usePg) {
  const pg = await import("./database-pg.js");
  api = pg;
  if (process.env.NODE_ENV !== "test") {
    console.log("[db] Using Supabase/Postgres (DATABASE_URL)");
  }
} else {
  const sqlite = await import("./database-sqlite.js");
  api = {
    createJob: wrapSync(sqlite.createJob),
    updateJobStatus: wrapSync(sqlite.updateJobStatus),
    updateJobTxHash: wrapSync(sqlite.updateJobTxHash),
    getJob: wrapSync(sqlite.getJob),
    getMerchantPayments: wrapSync(sqlite.getMerchantPayments),
    getMerchantAllPayments: wrapSync(sqlite.getMerchantAllPayments),
    expireStaleJobs: wrapSync(sqlite.expireStaleJobs),
    saveSessionKey: wrapSync(sqlite.saveSessionKey),
    getSessionKey: wrapSync(sqlite.getSessionKey),
    deleteSessionKey: wrapSync(sqlite.deleteSessionKey),
    updateSessionKeyCircleWallet: wrapSync(sqlite.updateSessionKeyCircleWallet),
    registerMerchant: wrapSync(sqlite.registerMerchant),
    getMerchant: wrapSync(sqlite.getMerchant),
    setMerchantSlug: wrapSync(sqlite.setMerchantSlug),
    getMerchantBySlug: wrapSync(sqlite.getMerchantBySlug),
    getStorefrontsList: wrapSync(sqlite.getStorefrontsList),
    setMerchantWebhookUrl: wrapSync(sqlite.setMerchantWebhookUrl),
    setMerchantSplitConfig: wrapSync(sqlite.setMerchantSplitConfig),
    cacheGatewayContract: wrapSync(sqlite.cacheGatewayContract),
    getGatewayCache: wrapSync(sqlite.getGatewayCache),
    getAllGatewayContracts: wrapSync(sqlite.getAllGatewayContracts),
    addProduct: wrapSync(sqlite.addProduct),
    updateProduct: wrapSync(sqlite.updateProduct),
    deleteProduct: wrapSync(sqlite.deleteProduct),
    getProducts: wrapSync(sqlite.getProducts),
    getProduct: wrapSync(sqlite.getProduct),
    createSubscriptionDb: wrapSync(sqlite.createSubscriptionDb),
    getSubscriptionDb: wrapSync(sqlite.getSubscriptionDb),
    getDueSubscriptions: wrapSync(sqlite.getDueSubscriptions),
    updateSubscriptionNextCharge: wrapSync(sqlite.updateSubscriptionNextCharge),
    cancelSubscriptionDb: wrapSync(sqlite.cancelSubscriptionDb),
    authorizeSubscriptionDb: wrapSync(sqlite.authorizeSubscriptionDb),
    getMerchantSubscriptions: wrapSync(sqlite.getMerchantSubscriptions),
    getPayerSubscriptions: wrapSync(sqlite.getPayerSubscriptions),
    saveWebhookDelivery: wrapSync(sqlite.saveWebhookDelivery),
    updateWebhookDelivery: wrapSync(sqlite.updateWebhookDelivery),
    getWebhookDelivery: wrapSync(sqlite.getWebhookDelivery),
    getMerchantWebhookDeliveries: wrapSync(sqlite.getMerchantWebhookDeliveries),
    getPlatformStats: wrapSync(sqlite.getPlatformStats),
    findStuckJobs: wrapSync(sqlite.findStuckJobs),
    getTreasuryPayouts: wrapSync(sqlite.getTreasuryPayouts),
  };
  if (process.env.NODE_ENV !== "test") {
    console.log("[db] Using local SQLite (data/arc.db)");
  }
}

export const createJob = api.createJob;
export const updateJobStatus = api.updateJobStatus;
export const updateJobTxHash = api.updateJobTxHash;
export const getJob = api.getJob;
export const getMerchantPayments = api.getMerchantPayments;
export const getMerchantAllPayments = api.getMerchantAllPayments;
export const expireStaleJobs = api.expireStaleJobs;
export const saveSessionKey = api.saveSessionKey;
export const getSessionKey = api.getSessionKey;
export const deleteSessionKey = api.deleteSessionKey;
export const updateSessionKeyCircleWallet = api.updateSessionKeyCircleWallet;
export const registerMerchant = api.registerMerchant;
export const getMerchant = api.getMerchant;
export const setMerchantSlug = api.setMerchantSlug;
export const getMerchantBySlug = api.getMerchantBySlug;
export const getStorefrontsList = api.getStorefrontsList;
export const setMerchantWebhookUrl = api.setMerchantWebhookUrl;
export const setMerchantSplitConfig = api.setMerchantSplitConfig;
export const cacheGatewayContract = api.cacheGatewayContract;
export const getGatewayCache = api.getGatewayCache;
export const getAllGatewayContracts = api.getAllGatewayContracts;
export const addProduct = api.addProduct;
export const updateProduct = api.updateProduct;
export const deleteProduct = api.deleteProduct;
export const getProducts = api.getProducts;
export const getProduct = api.getProduct;
export const createSubscriptionDb = api.createSubscriptionDb;
export const getSubscriptionDb = api.getSubscriptionDb;
export const getDueSubscriptions = api.getDueSubscriptions;
export const updateSubscriptionNextCharge = api.updateSubscriptionNextCharge;
export const cancelSubscriptionDb = api.cancelSubscriptionDb;
export const authorizeSubscriptionDb = api.authorizeSubscriptionDb;
export const getMerchantSubscriptions = api.getMerchantSubscriptions;
export const getPayerSubscriptions = api.getPayerSubscriptions;
export const saveWebhookDelivery = api.saveWebhookDelivery;
export const updateWebhookDelivery = api.updateWebhookDelivery;
export const getWebhookDelivery = api.getWebhookDelivery;
export const getMerchantWebhookDeliveries = api.getMerchantWebhookDeliveries;
export const getPlatformStats = api.getPlatformStats;
export const findStuckJobs = api.findStuckJobs;
export const getTreasuryPayouts = api.getTreasuryPayouts;

// Default export: SQLite exposes the db instance; Postgres has no raw client.
export default usePg ? {} : (await import("./database-sqlite.js")).default;
