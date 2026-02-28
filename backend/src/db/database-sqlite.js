import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../../../data/arc.db");

mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS merchants (
    wallet_address  TEXT PRIMARY KEY,
    display_name    TEXT NOT NULL,
    logo_url        TEXT,
    slug            TEXT,
    webhook_url     TEXT,
    split_config    TEXT,
    created_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payment_jobs (
    id               TEXT PRIMARY KEY,
    payer_address    TEXT NOT NULL,
    merchant_address TEXT NOT NULL,
    target_amount    TEXT NOT NULL,
    label            TEXT,
    payment_ref      TEXT,
    status           TEXT NOT NULL DEFAULT 'SCANNING',
    source_plan      TEXT,   -- JSON
    quote            TEXT,   -- JSON
    tx_hashes        TEXT,   -- JSON: { swap, deposit, transfer, mint, pay }
    error            TEXT,
    expires_at       INTEGER,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session_keys (
    wallet_address        TEXT PRIMARY KEY,
    encrypted_private_key TEXT NOT NULL,   -- AES-256-CBC encrypted, NEVER plaintext
    session_address       TEXT NOT NULL,
    allowed_contracts     TEXT NOT NULL,   -- JSON array
    spend_limit           TEXT NOT NULL,
    expiry                INTEGER NOT NULL,
    created_at            INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gateway_cache (
    chain_name      TEXT PRIMARY KEY,
    wallet_contract TEXT NOT NULL,
    fetched_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS store_products (
    id               TEXT PRIMARY KEY,
    merchant_address TEXT NOT NULL,
    name             TEXT NOT NULL,
    description      TEXT,
    price            TEXT NOT NULL,
    image_url        TEXT,
    active           INTEGER NOT NULL DEFAULT 1,
    sort_order       INTEGER NOT NULL DEFAULT 0,
    created_at       INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id                    TEXT PRIMARY KEY,
    merchant_address      TEXT NOT NULL,
    payer_address         TEXT NOT NULL,
    amount_usdc           TEXT NOT NULL,
    label                 TEXT,
    interval_days         INTEGER NOT NULL,
    next_charge_at        INTEGER NOT NULL,
    status                TEXT NOT NULL DEFAULT 'ACTIVE',
    encrypted_session_key TEXT,
    session_address       TEXT,
    session_expiry        INTEGER,
    created_at            INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id            TEXT PRIMARY KEY,
    job_id        TEXT NOT NULL,
    url           TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'PENDING',
    response_code INTEGER,
    attempts      INTEGER NOT NULL DEFAULT 0,
    last_error    TEXT,
    delivered_at  INTEGER,
    created_at    INTEGER NOT NULL
  );
`);

// Migrate existing tables — add new nullable columns (idempotent via try-catch)
for (const sql of [
  "ALTER TABLE merchants ADD COLUMN slug TEXT",
  "ALTER TABLE merchants ADD COLUMN webhook_url TEXT",
  "ALTER TABLE merchants ADD COLUMN split_config TEXT",
  "ALTER TABLE payment_jobs ADD COLUMN expires_at INTEGER",
  "ALTER TABLE session_keys ADD COLUMN circle_wallet_id TEXT",
  "ALTER TABLE session_keys ADD COLUMN circle_wallet_address TEXT",
  "ALTER TABLE store_products ADD COLUMN type TEXT DEFAULT 'one_time'",
  "ALTER TABLE store_products ADD COLUMN interval_days INTEGER",
]) {
  try { db.exec(sql); } catch { /* column already exists */ }
}

// Unique partial index on merchant slug (NULL slugs are not constrained)
db.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_slug ON merchants(slug) WHERE slug IS NOT NULL`
);

// ── Prepared statements ───────────────────────────────────────────────────────

const stmts = {
  // payment_jobs
  insertJob: db.prepare(`
    INSERT INTO payment_jobs
      (id, payer_address, merchant_address, target_amount, label, payment_ref,
       status, source_plan, quote, tx_hashes, error, expires_at, created_at, updated_at)
    VALUES
      (@id, @payer_address, @merchant_address, @target_amount, @label, @payment_ref,
       @status, @source_plan, @quote, @tx_hashes, @error, @expires_at, @created_at, @updated_at)
  `),

  updateJob: db.prepare(`
    UPDATE payment_jobs
    SET status      = @status,
        source_plan = COALESCE(@source_plan, source_plan),
        quote       = COALESCE(@quote, quote),
        tx_hashes   = COALESCE(@tx_hashes, tx_hashes),
        error       = COALESCE(@error, error),
        updated_at  = @updated_at
    WHERE id = @id
  `),

  getJob: db.prepare(`SELECT * FROM payment_jobs WHERE id = ?`),

  getMerchantJobs: db.prepare(`
    SELECT * FROM payment_jobs
    WHERE merchant_address = ? AND status = 'COMPLETE'
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `),

  getMerchantAllJobs: db.prepare(`
    SELECT * FROM payment_jobs
    WHERE merchant_address = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `),

  expireStaleJobs: db.prepare(`
    UPDATE payment_jobs
    SET status = 'EXPIRED', updated_at = @now
    WHERE status = 'AWAITING_CONFIRMATION'
      AND expires_at IS NOT NULL
      AND expires_at < @now
  `),

  // session_keys
  upsertSessionKey: db.prepare(`
    INSERT INTO session_keys
      (wallet_address, encrypted_private_key, session_address,
       allowed_contracts, spend_limit, expiry, created_at)
    VALUES
      (@wallet_address, @encrypted_private_key, @session_address,
       @allowed_contracts, @spend_limit, @expiry, @created_at)
    ON CONFLICT(wallet_address) DO UPDATE SET
      encrypted_private_key = excluded.encrypted_private_key,
      session_address       = excluded.session_address,
      allowed_contracts     = excluded.allowed_contracts,
      spend_limit           = excluded.spend_limit,
      expiry                = excluded.expiry,
      created_at            = excluded.created_at
  `),

  getSessionKey: db.prepare(`SELECT * FROM session_keys WHERE wallet_address = ?`),
  deleteSessionKey: db.prepare(`DELETE FROM session_keys WHERE wallet_address = ?`),

  updateSessionKeyCircleWallet: db.prepare(`
    UPDATE session_keys
    SET circle_wallet_id      = @circle_wallet_id,
        circle_wallet_address = @circle_wallet_address
    WHERE wallet_address = @wallet_address
  `),

  // merchants
  upsertMerchant: db.prepare(`
    INSERT INTO merchants (wallet_address, display_name, logo_url, created_at)
    VALUES (@wallet_address, @display_name, @logo_url, @created_at)
    ON CONFLICT(wallet_address) DO UPDATE SET
      display_name = excluded.display_name,
      logo_url     = excluded.logo_url
  `),

  getMerchant: db.prepare(`SELECT * FROM merchants WHERE wallet_address = ?`),

  setMerchantSlug: db.prepare(
    `UPDATE merchants SET slug = @slug WHERE wallet_address = @wallet_address`
  ),

  getMerchantBySlug: db.prepare(`SELECT * FROM merchants WHERE slug = ?`),
  getMerchantsWithSlug: db.prepare(
    `SELECT wallet_address, display_name, slug, logo_url FROM merchants WHERE slug IS NOT NULL ORDER BY display_name ASC`
  ),

  setMerchantWebhookUrl: db.prepare(
    `UPDATE merchants SET webhook_url = @webhook_url WHERE wallet_address = @wallet_address`
  ),

  setMerchantSplitConfig: db.prepare(
    `UPDATE merchants SET split_config = @split_config WHERE wallet_address = @wallet_address`
  ),

  // gateway_cache
  upsertGatewayCache: db.prepare(`
    INSERT INTO gateway_cache (chain_name, wallet_contract, fetched_at)
    VALUES (@chain_name, @wallet_contract, @fetched_at)
    ON CONFLICT(chain_name) DO UPDATE SET
      wallet_contract = excluded.wallet_contract,
      fetched_at      = excluded.fetched_at
  `),

  getGatewayCache: db.prepare(`SELECT * FROM gateway_cache WHERE chain_name = ?`),
  getAllGatewayCache: db.prepare(`SELECT * FROM gateway_cache`),

  // store_products
  insertProduct: db.prepare(`
    INSERT INTO store_products
      (id, merchant_address, name, description, price, image_url, active, sort_order, type, interval_days, created_at)
    VALUES
      (@id, @merchant_address, @name, @description, @price, @image_url, @active, @sort_order, @type, @interval_days, @created_at)
  `),

  updateProduct: db.prepare(`
    UPDATE store_products
    SET name          = COALESCE(@name, name),
        description   = COALESCE(@description, description),
        price         = COALESCE(@price, price),
        image_url     = COALESCE(@image_url, image_url),
        sort_order    = COALESCE(@sort_order, sort_order),
        type          = COALESCE(@type, type),
        interval_days = COALESCE(@interval_days, interval_days)
    WHERE id = @id AND merchant_address = @merchant_address
  `),

  deactivateProduct: db.prepare(`
    UPDATE store_products SET active = 0 WHERE id = @id AND merchant_address = @merchant_address
  `),

  getProducts: db.prepare(`
    SELECT * FROM store_products
    WHERE merchant_address = ? AND active = 1
    ORDER BY sort_order ASC, created_at ASC
  `),

  getProduct: db.prepare(`SELECT * FROM store_products WHERE id = ?`),

  // subscriptions
  insertSubscription: db.prepare(`
    INSERT INTO subscriptions
      (id, merchant_address, payer_address, amount_usdc, label, interval_days,
       next_charge_at, status, encrypted_session_key, session_address, session_expiry, created_at)
    VALUES
      (@id, @merchant_address, @payer_address, @amount_usdc, @label, @interval_days,
       @next_charge_at, @status, @encrypted_session_key, @session_address, @session_expiry, @created_at)
  `),

  getSubscription: db.prepare(`SELECT * FROM subscriptions WHERE id = ?`),

  getDueSubscriptions: db.prepare(`
    SELECT * FROM subscriptions
    WHERE next_charge_at <= @now
      AND status = 'ACTIVE'
      AND session_expiry > @now
      AND encrypted_session_key IS NOT NULL
  `),

  updateSubscriptionNextCharge: db.prepare(
    `UPDATE subscriptions SET next_charge_at = @next_charge_at WHERE id = @id`
  ),

  updateSubscriptionStatus: db.prepare(
    `UPDATE subscriptions SET status = @status WHERE id = @id`
  ),

  authorizeSubscription: db.prepare(`
    UPDATE subscriptions
    SET encrypted_session_key = @encrypted_session_key,
        session_address       = @session_address,
        session_expiry        = @session_expiry
    WHERE id = @id
  `),

  getMerchantSubscriptions: db.prepare(
    `SELECT * FROM subscriptions WHERE merchant_address = ? ORDER BY created_at DESC`
  ),

  getPayerSubscriptions: db.prepare(
    `SELECT * FROM subscriptions WHERE payer_address = ? AND status = 'ACTIVE' ORDER BY created_at DESC`
  ),

  // webhook_deliveries
  insertWebhookDelivery: db.prepare(`
    INSERT INTO webhook_deliveries
      (id, job_id, url, status, response_code, attempts, last_error, delivered_at, created_at)
    VALUES
      (@id, @job_id, @url, @status, @response_code, @attempts, @last_error, @delivered_at, @created_at)
  `),

  updateWebhookDelivery: db.prepare(`
    UPDATE webhook_deliveries
    SET status        = COALESCE(@status, status),
        response_code = COALESCE(@response_code, response_code),
        attempts      = @attempts,
        last_error    = COALESCE(@last_error, last_error),
        delivered_at  = COALESCE(@delivered_at, delivered_at)
    WHERE id = @id
  `),

  getWebhookDelivery: db.prepare(`SELECT * FROM webhook_deliveries WHERE id = ?`),

  getMerchantWebhookDeliveries: db.prepare(`
    SELECT wd.* FROM webhook_deliveries wd
    JOIN payment_jobs pj ON pj.id = wd.job_id
    WHERE pj.merchant_address = ?
    ORDER BY wd.created_at DESC
    LIMIT ?
  `),
};

// ── payment_jobs helpers ──────────────────────────────────────────────────────

export function createJob(job) {
  const now = Date.now();
  stmts.insertJob.run({
    id: job.id,
    payer_address: job.payer_address,
    merchant_address: job.merchant_address,
    target_amount: job.target_amount,
    label: job.label ?? null,
    payment_ref: job.payment_ref ?? null,
    status: job.status ?? "SCANNING",
    source_plan: job.source_plan ? JSON.stringify(job.source_plan) : null,
    quote: job.quote ? JSON.stringify(job.quote) : null,
    tx_hashes: job.tx_hashes ? JSON.stringify(job.tx_hashes) : null,
    error: job.error ?? null,
    expires_at: job.expires_at ?? null,
    created_at: now,
    updated_at: now,
  });
}

export function updateJobStatus(id, status, extras = {}) {
  stmts.updateJob.run({
    id,
    status,
    source_plan: extras.source_plan ? JSON.stringify(extras.source_plan) : null,
    quote: extras.quote ? JSON.stringify(extras.quote) : null,
    tx_hashes: extras.tx_hashes ? JSON.stringify(extras.tx_hashes) : null,
    error: extras.error ?? null,
    updated_at: Date.now(),
  });
}

export function updateJobTxHash(id, newHashes) {
  const row = stmts.getJob.get(id);
  if (!row) throw new Error(`Job not found: ${id}`);
  const existing = row.tx_hashes ? JSON.parse(row.tx_hashes) : {};
  const merged = { ...existing, ...newHashes };
  stmts.updateJob.run({
    id,
    status: row.status,
    source_plan: null,
    quote: null,
    tx_hashes: JSON.stringify(merged),
    error: null,
    updated_at: Date.now(),
  });
}

export function getJob(id) {
  const row = stmts.getJob.get(id);
  if (!row) return undefined;
  if (row.source_plan) row.source_plan = JSON.parse(row.source_plan);
  if (row.quote) row.quote = JSON.parse(row.quote);
  if (row.tx_hashes) row.tx_hashes = JSON.parse(row.tx_hashes);
  return row;
}

export function getMerchantPayments(merchantAddress, limit = 20, offset = 0) {
  return stmts.getMerchantJobs.all(merchantAddress, limit, offset).map((row) => {
    if (row.tx_hashes) row.tx_hashes = JSON.parse(row.tx_hashes);
    if (row.quote) row.quote = JSON.parse(row.quote);
    return row;
  });
}

export function getMerchantAllPayments(merchantAddress, limit = 20, offset = 0) {
  return stmts.getMerchantAllJobs.all(merchantAddress, limit, offset).map((row) => {
    if (row.tx_hashes) row.tx_hashes = JSON.parse(row.tx_hashes);
    if (row.quote) row.quote = JSON.parse(row.quote);
    return row;
  });
}

export function expireStaleJobs() {
  const now = Date.now();
  return stmts.expireStaleJobs.run({ now }).changes;
}

// ── session_keys helpers ──────────────────────────────────────────────────────

export function saveSessionKey(key) {
  stmts.upsertSessionKey.run({
    wallet_address: key.wallet_address,
    encrypted_private_key: key.encrypted_private_key,
    session_address: key.session_address,
    allowed_contracts: JSON.stringify(key.allowed_contracts),
    spend_limit: key.spend_limit,
    expiry: key.expiry,
    created_at: Date.now(),
  });
}

export function getSessionKey(walletAddress) {
  const row = stmts.getSessionKey.get(walletAddress);
  if (!row) return undefined;
  if (row.allowed_contracts) row.allowed_contracts = JSON.parse(row.allowed_contracts);
  return row;
}

export function deleteSessionKey(walletAddress) {
  stmts.deleteSessionKey.run(walletAddress);
}

export function updateSessionKeyCircleWallet(walletAddress, circleWalletId, circleWalletAddress) {
  stmts.updateSessionKeyCircleWallet.run({
    wallet_address: walletAddress,
    circle_wallet_id: circleWalletId,
    circle_wallet_address: circleWalletAddress,
  });
}

// ── merchants helpers ─────────────────────────────────────────────────────────

export function registerMerchant(merchant) {
  stmts.upsertMerchant.run({
    wallet_address: merchant.wallet_address,
    display_name: merchant.display_name,
    logo_url: merchant.logo_url ?? null,
    created_at: Date.now(),
  });
  return getMerchant(merchant.wallet_address);
}

export function getMerchant(walletAddress) {
  return stmts.getMerchant.get(walletAddress) ?? null;
}

export function setMerchantSlug(walletAddress, slug) {
  stmts.setMerchantSlug.run({ wallet_address: walletAddress, slug });
}

export function getMerchantBySlug(slug) {
  return stmts.getMerchantBySlug.get(slug) ?? null;
}

export function getStorefrontsList() {
  return stmts.getMerchantsWithSlug.all();
}

export function setMerchantWebhookUrl(walletAddress, webhookUrl) {
  stmts.setMerchantWebhookUrl.run({ wallet_address: walletAddress, webhook_url: webhookUrl });
}

export function setMerchantSplitConfig(walletAddress, splitConfig) {
  stmts.setMerchantSplitConfig.run({
    wallet_address: walletAddress,
    split_config: splitConfig ? JSON.stringify(splitConfig) : null,
  });
}

// ── gateway_cache helpers ─────────────────────────────────────────────────────

export function cacheGatewayContract(chainName, walletContract) {
  stmts.upsertGatewayCache.run({
    chain_name: chainName,
    wallet_contract: walletContract,
    fetched_at: Date.now(),
  });
}

export function getGatewayCache(chainName) {
  return stmts.getGatewayCache.get(chainName) ?? null;
}

export function getAllGatewayContracts() {
  const rows = stmts.getAllGatewayCache.all();
  return Object.fromEntries(rows.map((r) => [r.chain_name, r.wallet_contract]));
}

// ── store_products helpers ────────────────────────────────────────────────────

export function addProduct(product) {
  stmts.insertProduct.run({
    id: product.id,
    merchant_address: product.merchant_address,
    name: product.name,
    description: product.description ?? null,
    price: product.price,
    image_url: product.image_url ?? null,
    active: 1,
    sort_order: product.sort_order ?? 0,
    type: product.type ?? "one_time",
    interval_days: product.interval_days ?? null,
    created_at: Date.now(),
  });
}

export function updateProduct(id, merchantAddress, updates) {
  stmts.updateProduct.run({
    id,
    merchant_address: merchantAddress,
    name: updates.name ?? null,
    description: updates.description ?? null,
    price: updates.price ?? null,
    image_url: updates.image_url ?? null,
    sort_order: updates.sort_order ?? null,
    type: updates.type ?? null,
    interval_days: updates.interval_days ?? null,
  });
}

export function deleteProduct(id, merchantAddress) {
  stmts.deactivateProduct.run({ id, merchant_address: merchantAddress });
}

export function getProducts(merchantAddress) {
  return stmts.getProducts.all(merchantAddress);
}

export function getProduct(id) {
  return stmts.getProduct.get(id);
}

// ── subscriptions helpers ─────────────────────────────────────────────────────

export function createSubscriptionDb(sub) {
  stmts.insertSubscription.run({
    id: sub.id,
    merchant_address: sub.merchant_address,
    payer_address: sub.payer_address,
    amount_usdc: sub.amount_usdc,
    label: sub.label ?? null,
    interval_days: sub.interval_days,
    next_charge_at: sub.next_charge_at,
    status: "ACTIVE",
    encrypted_session_key: null,
    session_address: null,
    session_expiry: null,
    created_at: Date.now(),
  });
}

export function getSubscriptionDb(id) {
  return stmts.getSubscription.get(id) ?? null;
}

export function getDueSubscriptions() {
  return stmts.getDueSubscriptions.all({ now: Date.now() });
}

export function updateSubscriptionNextCharge(id, nextChargeAt) {
  stmts.updateSubscriptionNextCharge.run({ id, next_charge_at: nextChargeAt });
}

export function cancelSubscriptionDb(id) {
  stmts.updateSubscriptionStatus.run({ id, status: "CANCELLED" });
}

export function authorizeSubscriptionDb(id, encryptedSessionKey, sessionAddress, sessionExpiry) {
  stmts.authorizeSubscription.run({
    id,
    encrypted_session_key: encryptedSessionKey,
    session_address: sessionAddress,
    session_expiry: sessionExpiry,
  });
}

export function getMerchantSubscriptions(merchantAddress) {
  return stmts.getMerchantSubscriptions.all(merchantAddress);
}

export function getPayerSubscriptions(payerAddress) {
  return stmts.getPayerSubscriptions.all(payerAddress);
}

// ── webhook_deliveries helpers ────────────────────────────────────────────────

export function saveWebhookDelivery(delivery) {
  stmts.insertWebhookDelivery.run({
    id: delivery.id,
    job_id: delivery.job_id,
    url: delivery.url,
    status: delivery.status ?? "PENDING",
    response_code: delivery.response_code ?? null,
    attempts: delivery.attempts ?? 0,
    last_error: delivery.last_error ?? null,
    delivered_at: delivery.delivered_at ?? null,
    created_at: Date.now(),
  });
}

export function updateWebhookDelivery(id, updates) {
  stmts.updateWebhookDelivery.run({
    id,
    status: updates.status ?? null,
    response_code: updates.response_code ?? null,
    attempts: updates.attempts,
    last_error: updates.last_error ?? null,
    delivered_at: updates.delivered_at ?? null,
  });
}

export function getWebhookDelivery(id) {
  return stmts.getWebhookDelivery.get(id) ?? null;
}

export function getMerchantWebhookDeliveries(merchantAddress, limit = 20) {
  return stmts.getMerchantWebhookDeliveries.all(merchantAddress, limit);
}

// ── Platform stats (all merchants) ───────────────────────────────────────────

export function getPlatformStats() {
  const jobs = db.prepare(`SELECT target_amount, source_plan FROM payment_jobs WHERE status = 'COMPLETE'`).all();
  let totalUsdc = 0;
  const chainSet = new Set();
  for (const job of jobs) {
    totalUsdc += parseFloat(job.target_amount) || 0;
    if (job.source_plan) {
      try {
        for (const step of JSON.parse(job.source_plan)) {
          if (step.chain) chainSet.add(step.chain);
        }
      } catch { /* ignore malformed */ }
    }
  }
  const merchantCount = db.prepare(`SELECT COUNT(*) as n FROM merchants`).get().n;
  return {
    totalPayments: jobs.length,
    totalUsdcSettled: totalUsdc.toFixed(2),
    chainsAbstracted: chainSet.size,
    merchantCount,
  };
}

// ── Stuck job recovery ────────────────────────────────────────────────────────

const findStuckJobsStmt = db.prepare(`
  SELECT id FROM payment_jobs
  WHERE status IN ('BRIDGING','SWAPPING')
    AND updated_at < ?
  LIMIT 20
`);

export function findStuckJobs() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  return findStuckJobsStmt.all(cutoff);
}

// ── Treasury payout queries ───────────────────────────────────────────────────

const getTreasuryPayoutsStmt = db.prepare(`
  SELECT * FROM payment_jobs
  WHERE payment_ref = 'treasury:' || ?
  ORDER BY created_at DESC
  LIMIT ?
`);

export function getTreasuryPayouts(merchantAddress, limit = 50) {
  return getTreasuryPayoutsStmt.all(merchantAddress, limit).map((row) => {
    if (row.tx_hashes) row.tx_hashes = JSON.parse(row.tx_hashes);
    if (row.quote) row.quote = JSON.parse(row.quote);
    return row;
  });
}

export default db;
