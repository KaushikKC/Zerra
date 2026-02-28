/**
 * PostgreSQL (Supabase) database layer. Used when DATABASE_URL is set.
 * Same API as database-sqlite.js but all functions return Promises.
 */
import pg from "pg";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

let schemaDone = false;

async function ensureSchema() {
  if (schemaDone) return;
  const sqlPath = path.join(__dirname, "schema-pg.sql");
  const sql = readFileSync(sqlPath, "utf8");
  await pool.query(sql);
  schemaDone = true;
}

function rowToJob(row) {
  if (!row) return undefined;
  if (row.source_plan) row.source_plan = JSON.parse(row.source_plan);
  if (row.quote) row.quote = JSON.parse(row.quote);
  if (row.tx_hashes) row.tx_hashes = JSON.parse(row.tx_hashes);
  return row;
}

// ── payment_jobs ─────────────────────────────────────────────────────────────

export async function createJob(job) {
  await ensureSchema();
  const now = Date.now();
  await pool.query(
    `INSERT INTO payment_jobs
      (id, payer_address, merchant_address, target_amount, label, payment_ref,
       status, source_plan, quote, tx_hashes, error, expires_at, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      job.id,
      job.payer_address,
      job.merchant_address,
      job.target_amount,
      job.label ?? null,
      job.payment_ref ?? null,
      job.status ?? "SCANNING",
      job.source_plan ? JSON.stringify(job.source_plan) : null,
      job.quote ? JSON.stringify(job.quote) : null,
      job.tx_hashes ? JSON.stringify(job.tx_hashes) : null,
      job.error ?? null,
      job.expires_at ?? null,
      now,
      now,
    ]
  );
}

export async function updateJobStatus(id, status, extras = {}) {
  await ensureSchema();
  await pool.query(
    `UPDATE payment_jobs
     SET status = $1, source_plan = COALESCE($2, source_plan), quote = COALESCE($3, quote),
         tx_hashes = COALESCE($4, tx_hashes), error = COALESCE($5, error), updated_at = $6
     WHERE id = $7`,
    [
      status,
      extras.source_plan ? JSON.stringify(extras.source_plan) : null,
      extras.quote ? JSON.stringify(extras.quote) : null,
      extras.tx_hashes ? JSON.stringify(extras.tx_hashes) : null,
      extras.error ?? null,
      Date.now(),
      id,
    ]
  );
}

export async function updateJobTxHash(id, newHashes) {
  await ensureSchema();
  const { rows } = await pool.query("SELECT * FROM payment_jobs WHERE id = $1", [id]);
  const row = rows[0];
  if (!row) throw new Error(`Job not found: ${id}`);
  const existing = row.tx_hashes ? JSON.parse(row.tx_hashes) : {};
  const merged = { ...existing, ...newHashes };
  await pool.query(
    `UPDATE payment_jobs SET tx_hashes = $1, updated_at = $2 WHERE id = $3`,
    [JSON.stringify(merged), Date.now(), id]
  );
}

export async function getJob(id) {
  await ensureSchema();
  const { rows } = await pool.query("SELECT * FROM payment_jobs WHERE id = $1", [id]);
  return rowToJob(rows[0]);
}

export async function getMerchantPayments(merchantAddress, limit = 20, offset = 0) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT * FROM payment_jobs WHERE merchant_address = $1 AND status = 'COMPLETE'
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [merchantAddress, limit, offset]
  );
  return rows.map(rowToJob);
}

export async function getMerchantAllPayments(merchantAddress, limit = 20, offset = 0) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT * FROM payment_jobs WHERE merchant_address = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [merchantAddress, limit, offset]
  );
  return rows.map(rowToJob);
}

export async function expireStaleJobs() {
  await ensureSchema();
  const now = Date.now();
  const { rowCount } = await pool.query(
    `UPDATE payment_jobs SET status = 'EXPIRED', updated_at = $1
     WHERE status = 'AWAITING_CONFIRMATION' AND expires_at IS NOT NULL AND expires_at < $1`,
    [now]
  );
  return rowCount ?? 0;
}

// ── session_keys ──────────────────────────────────────────────────────────────

export async function saveSessionKey(key) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO session_keys
      (wallet_address, encrypted_private_key, session_address, allowed_contracts, spend_limit, expiry, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT(wallet_address) DO UPDATE SET
      encrypted_private_key = EXCLUDED.encrypted_private_key,
      session_address = EXCLUDED.session_address,
      allowed_contracts = EXCLUDED.allowed_contracts,
      spend_limit = EXCLUDED.spend_limit,
      expiry = EXCLUDED.expiry`,
    [
      key.wallet_address,
      key.encrypted_private_key,
      key.session_address,
      JSON.stringify(key.allowed_contracts),
      key.spend_limit,
      key.expiry,
      Date.now(),
    ]
  );
}

export async function getSessionKey(walletAddress) {
  await ensureSchema();
  const { rows } = await pool.query("SELECT * FROM session_keys WHERE wallet_address = $1", [
    walletAddress,
  ]);
  const row = rows[0];
  if (!row) return undefined;
  if (row.allowed_contracts) row.allowed_contracts = JSON.parse(row.allowed_contracts);
  return row;
}

export async function deleteSessionKey(walletAddress) {
  await ensureSchema();
  await pool.query("DELETE FROM session_keys WHERE wallet_address = $1", [walletAddress]);
}

export async function updateSessionKeyCircleWallet(
  walletAddress,
  circleWalletId,
  circleWalletAddress
) {
  await ensureSchema();
  await pool.query(
    `UPDATE session_keys SET circle_wallet_id = $1, circle_wallet_address = $2 WHERE wallet_address = $3`,
    [circleWalletId, circleWalletAddress, walletAddress]
  );
}

// ── merchants ─────────────────────────────────────────────────────────────────

export async function registerMerchant(merchant) {
  await ensureSchema();
  const now = Date.now();
  await pool.query(
    `INSERT INTO merchants (wallet_address, display_name, logo_url, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(wallet_address) DO UPDATE SET display_name = EXCLUDED.display_name, logo_url = EXCLUDED.logo_url`,
    [
      merchant.wallet_address,
      merchant.display_name,
      merchant.logo_url ?? null,
      now,
    ]
  );
  return getMerchant(merchant.wallet_address);
}

export async function getMerchant(walletAddress) {
  await ensureSchema();
  const { rows } = await pool.query("SELECT * FROM merchants WHERE wallet_address = $1", [
    walletAddress,
  ]);
  return rows[0] ?? null;
}

export async function setMerchantSlug(walletAddress, slug) {
  await ensureSchema();
  await pool.query("UPDATE merchants SET slug = $1 WHERE wallet_address = $2", [
    slug,
    walletAddress,
  ]);
}

export async function getMerchantBySlug(slug) {
  await ensureSchema();
  const { rows } = await pool.query("SELECT * FROM merchants WHERE slug = $1", [slug]);
  return rows[0] ?? null;
}

export async function getStorefrontsList() {
  await ensureSchema();
  const { rows } = await pool.query(
    "SELECT wallet_address, display_name, slug, logo_url FROM merchants WHERE slug IS NOT NULL ORDER BY display_name ASC"
  );
  return rows;
}

export async function setMerchantWebhookUrl(walletAddress, webhookUrl) {
  await ensureSchema();
  await pool.query("UPDATE merchants SET webhook_url = $1 WHERE wallet_address = $2", [
    webhookUrl,
    walletAddress,
  ]);
}

export async function setMerchantSplitConfig(walletAddress, splitConfig) {
  await ensureSchema();
  await pool.query("UPDATE merchants SET split_config = $1 WHERE wallet_address = $2", [
    splitConfig ? JSON.stringify(splitConfig) : null,
    walletAddress,
  ]);
}

// ── gateway_cache ───────────────────────────────────────────────────────────

export async function cacheGatewayContract(chainName, walletContract) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO gateway_cache (chain_name, wallet_contract, fetched_at)
     VALUES ($1, $2, $3)
     ON CONFLICT(chain_name) DO UPDATE SET wallet_contract = EXCLUDED.wallet_contract, fetched_at = EXCLUDED.fetched_at`,
    [chainName, walletContract, Date.now()]
  );
}

export async function getGatewayCache(chainName) {
  await ensureSchema();
  const { rows } = await pool.query("SELECT * FROM gateway_cache WHERE chain_name = $1", [
    chainName,
  ]);
  return rows[0] ?? null;
}

export async function getAllGatewayContracts() {
  await ensureSchema();
  const { rows } = await pool.query("SELECT * FROM gateway_cache");
  return Object.fromEntries(rows.map((r) => [r.chain_name, r.wallet_contract]));
}

// ── store_products ───────────────────────────────────────────────────────────

export async function addProduct(product) {
  await ensureSchema();
  const now = Date.now();
  await pool.query(
    `INSERT INTO store_products
      (id, merchant_address, name, description, price, image_url, active, sort_order, type, interval_days, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10)`,
    [
      product.id,
      product.merchant_address,
      product.name,
      product.description ?? null,
      product.price,
      product.image_url ?? null,
      product.sort_order ?? 0,
      product.type ?? "one_time",
      product.interval_days ?? null,
      now,
    ]
  );
}

export async function updateProduct(id, merchantAddress, updates) {
  await ensureSchema();
  await pool.query(
    `UPDATE store_products
     SET name = COALESCE($1, name), description = COALESCE($2, description), price = COALESCE($3, price),
         image_url = COALESCE($4, image_url), sort_order = COALESCE($5, sort_order),
         type = COALESCE($6, type), interval_days = COALESCE($7, interval_days)
     WHERE id = $8 AND merchant_address = $9`,
    [
      updates.name ?? null,
      updates.description ?? null,
      updates.price ?? null,
      updates.image_url ?? null,
      updates.sort_order ?? null,
      updates.type ?? null,
      updates.interval_days ?? null,
      id,
      merchantAddress,
    ]
  );
}

export async function deleteProduct(id, merchantAddress) {
  await ensureSchema();
  await pool.query("UPDATE store_products SET active = 0 WHERE id = $1 AND merchant_address = $2", [
    id,
    merchantAddress,
  ]);
}

export async function getProducts(merchantAddress) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT * FROM store_products WHERE merchant_address = $1 AND active = 1 ORDER BY sort_order ASC, created_at ASC`,
    [merchantAddress]
  );
  return rows;
}

export async function getProduct(id) {
  await ensureSchema();
  const { rows } = await pool.query("SELECT * FROM store_products WHERE id = $1", [id]);
  return rows[0];
}

// ── subscriptions ───────────────────────────────────────────────────────────

export async function createSubscriptionDb(sub) {
  await ensureSchema();
  const now = Date.now();
  await pool.query(
    `INSERT INTO subscriptions
      (id, merchant_address, payer_address, amount_usdc, label, interval_days, next_charge_at, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8)`,
    [
      sub.id,
      sub.merchant_address,
      sub.payer_address,
      sub.amount_usdc,
      sub.label ?? null,
      sub.interval_days,
      sub.next_charge_at,
      now,
    ]
  );
}

export async function getSubscriptionDb(id) {
  await ensureSchema();
  const { rows } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function getDueSubscriptions() {
  await ensureSchema();
  const now = Date.now();
  const { rows } = await pool.query(
    `SELECT * FROM subscriptions
     WHERE next_charge_at <= $1 AND status = 'ACTIVE' AND session_expiry > $1 AND encrypted_session_key IS NOT NULL`,
    [now]
  );
  return rows;
}

export async function updateSubscriptionNextCharge(id, nextChargeAt) {
  await ensureSchema();
  await pool.query("UPDATE subscriptions SET next_charge_at = $1 WHERE id = $2", [
    nextChargeAt,
    id,
  ]);
}

export async function cancelSubscriptionDb(id) {
  await ensureSchema();
  await pool.query("UPDATE subscriptions SET status = 'CANCELLED' WHERE id = $1", [id]);
}

export async function authorizeSubscriptionDb(
  id,
  encryptedSessionKey,
  sessionAddress,
  sessionExpiry
) {
  await ensureSchema();
  await pool.query(
    `UPDATE subscriptions
     SET encrypted_session_key = $1, session_address = $2, session_expiry = $3
     WHERE id = $4`,
    [encryptedSessionKey, sessionAddress, sessionExpiry, id]
  );
}

export async function getMerchantSubscriptions(merchantAddress) {
  await ensureSchema();
  const { rows } = await pool.query(
    "SELECT * FROM subscriptions WHERE merchant_address = $1 ORDER BY created_at DESC",
    [merchantAddress]
  );
  return rows;
}

export async function getPayerSubscriptions(payerAddress) {
  await ensureSchema();
  const { rows } = await pool.query(
    "SELECT * FROM subscriptions WHERE payer_address = $1 AND status = 'ACTIVE' ORDER BY created_at DESC",
    [payerAddress]
  );
  return rows;
}

// ── webhook_deliveries ───────────────────────────────────────────────────────

export async function saveWebhookDelivery(delivery) {
  await ensureSchema();
  const now = Date.now();
  await pool.query(
    `INSERT INTO webhook_deliveries (id, job_id, url, status, response_code, attempts, last_error, delivered_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      delivery.id,
      delivery.job_id,
      delivery.url,
      delivery.status ?? "PENDING",
      delivery.response_code ?? null,
      delivery.attempts ?? 0,
      delivery.last_error ?? null,
      delivery.delivered_at ?? null,
      now,
    ]
  );
}

export async function updateWebhookDelivery(id, updates) {
  await ensureSchema();
  await pool.query(
    `UPDATE webhook_deliveries
     SET status = COALESCE($1, status), response_code = COALESCE($2, response_code),
         attempts = $3, last_error = COALESCE($4, last_error), delivered_at = COALESCE($5, delivered_at)
     WHERE id = $6`,
    [
      updates.status ?? null,
      updates.response_code ?? null,
      updates.attempts,
      updates.last_error ?? null,
      updates.delivered_at ?? null,
      id,
    ]
  );
}

export async function getWebhookDelivery(id) {
  await ensureSchema();
  const { rows } = await pool.query("SELECT * FROM webhook_deliveries WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function getMerchantWebhookDeliveries(merchantAddress, limit = 20) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT wd.* FROM webhook_deliveries wd
     JOIN payment_jobs pj ON pj.id = wd.job_id
     WHERE pj.merchant_address = $1 ORDER BY wd.created_at DESC LIMIT $2`,
    [merchantAddress, limit]
  );
  return rows;
}

// ── Platform stats ────────────────────────────────────────────────────────────

export async function getPlatformStats() {
  await ensureSchema();
  const { rows: jobs } = await pool.query(
    `SELECT target_amount, source_plan FROM payment_jobs WHERE status = 'COMPLETE'`
  );
  let totalUsdc = 0;
  const chainSet = new Set();
  for (const job of jobs) {
    totalUsdc += parseFloat(job.target_amount) || 0;
    if (job.source_plan) {
      try {
        const plan = typeof job.source_plan === "string" ? JSON.parse(job.source_plan) : job.source_plan;
        for (const step of plan) if (step.chain) chainSet.add(step.chain);
      } catch { /* ignore */ }
    }
  }
  const { rows: [{ n }] } = await pool.query(`SELECT COUNT(*) as n FROM merchants`);
  return {
    totalPayments: jobs.length,
    totalUsdcSettled: totalUsdc.toFixed(2),
    chainsAbstracted: chainSet.size,
    merchantCount: parseInt(n, 10),
  };
}

// ── Stuck job recovery ────────────────────────────────────────────────────────

export async function findStuckJobs() {
  await ensureSchema();
  const cutoff = Date.now() - 30 * 60 * 1000;
  const { rows } = await pool.query(
    `SELECT id FROM payment_jobs WHERE status IN ('BRIDGING','SWAPPING') AND updated_at < $1 LIMIT 20`,
    [cutoff]
  );
  return rows;
}

// ── Treasury payout queries ───────────────────────────────────────────────────

export async function getTreasuryPayouts(merchantAddress, limit = 50) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT * FROM payment_jobs WHERE payment_ref = $1 ORDER BY created_at DESC LIMIT $2`,
    [`treasury:${merchantAddress}`, limit]
  );
  return rows.map(rowToJob);
}
