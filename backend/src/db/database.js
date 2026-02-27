import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../../../data/arc.db");

// Ensure data directory exists
import { mkdirSync } from "fs";
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS payment_jobs (
    id               TEXT PRIMARY KEY,
    wallet_address   TEXT,
    recipient_address TEXT,
    target_amount    TEXT,
    status           TEXT,
    source_plan      TEXT,
    tx_hashes        TEXT,
    error            TEXT,
    created_at       INTEGER,
    updated_at       INTEGER
  );

  CREATE TABLE IF NOT EXISTS session_keys (
    wallet_address      TEXT PRIMARY KEY,
    session_private_key TEXT,
    session_address     TEXT,
    expiry              INTEGER,
    created_at          INTEGER
  );

  CREATE TABLE IF NOT EXISTS bridge_watches (
    job_id              TEXT,
    source_chain        TEXT,
    tx_hash             TEXT,
    message_hash        TEXT,
    attestation_status  TEXT,
    created_at          INTEGER
  );
`);

// ── Prepared statements ───────────────────────────────────────────────────────

const stmts = {
  insertJob: db.prepare(`
    INSERT INTO payment_jobs
      (id, wallet_address, recipient_address, target_amount, status, source_plan,
       tx_hashes, error, created_at, updated_at)
    VALUES
      (@id, @wallet_address, @recipient_address, @target_amount, @status, @source_plan,
       @tx_hashes, @error, @created_at, @updated_at)
  `),

  updateJob: db.prepare(`
    UPDATE payment_jobs
    SET status = @status,
        tx_hashes  = COALESCE(@tx_hashes, tx_hashes),
        error      = COALESCE(@error, error),
        updated_at = @updated_at
    WHERE id = @id
  `),

  getJob: db.prepare(`SELECT * FROM payment_jobs WHERE id = ?`),

  upsertSessionKey: db.prepare(`
    INSERT INTO session_keys
      (wallet_address, session_private_key, session_address, expiry, created_at)
    VALUES
      (@wallet_address, @session_private_key, @session_address, @expiry, @created_at)
    ON CONFLICT(wallet_address) DO UPDATE SET
      session_private_key = excluded.session_private_key,
      session_address     = excluded.session_address,
      expiry              = excluded.expiry,
      created_at          = excluded.created_at
  `),

  getSessionKey: db.prepare(`SELECT * FROM session_keys WHERE wallet_address = ?`),
};

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * Create a new payment job record.
 * @param {object} job - Job fields (id, wallet_address, recipient_address,
 *                       target_amount, status, source_plan)
 */
export function createJob(job) {
  const now = Date.now();
  stmts.insertJob.run({
    id: job.id,
    wallet_address: job.wallet_address,
    recipient_address: job.recipient_address,
    target_amount: job.target_amount,
    status: job.status ?? "pending",
    source_plan: job.source_plan ? JSON.stringify(job.source_plan) : null,
    tx_hashes: job.tx_hashes ? JSON.stringify(job.tx_hashes) : null,
    error: job.error ?? null,
    created_at: now,
    updated_at: now,
  });
}

/**
 * Update the status (and optionally tx_hashes / error) of a job.
 * @param {string} id
 * @param {string} status
 * @param {object} [extras] - Optional { tx_hashes, error }
 */
export function updateJobStatus(id, status, extras = {}) {
  stmts.updateJob.run({
    id,
    status,
    tx_hashes: extras.tx_hashes ? JSON.stringify(extras.tx_hashes) : null,
    error: extras.error ?? null,
    updated_at: Date.now(),
  });
}

/**
 * Retrieve a payment job by id. Returns the row or undefined.
 * source_plan and tx_hashes are automatically JSON-parsed if present.
 */
export function getJob(id) {
  const row = stmts.getJob.get(id);
  if (!row) return undefined;
  if (row.source_plan) row.source_plan = JSON.parse(row.source_plan);
  if (row.tx_hashes) row.tx_hashes = JSON.parse(row.tx_hashes);
  return row;
}

/**
 * Persist (upsert) a session key for a smart-account wallet.
 * @param {object} key - { wallet_address, session_private_key, session_address, expiry }
 */
export function saveSessionKey(key) {
  stmts.upsertSessionKey.run({
    wallet_address: key.wallet_address,
    session_private_key: key.session_private_key,
    session_address: key.session_address,
    expiry: key.expiry,
    created_at: Date.now(),
  });
}

/**
 * Retrieve a session key by wallet address. Returns the row or undefined.
 */
export function getSessionKey(walletAddress) {
  return stmts.getSessionKey.get(walletAddress);
}

export default db;
