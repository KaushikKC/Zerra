-- Supabase / PostgreSQL schema for Zerra backend (run once in Supabase SQL Editor).
-- Same structure as SQLite; use when DATABASE_URL is set (e.g. Supabase connection string).

CREATE TABLE IF NOT EXISTS merchants (
  wallet_address  TEXT PRIMARY KEY,
  display_name    TEXT NOT NULL,
  logo_url        TEXT,
  slug            TEXT,
  webhook_url     TEXT,
  split_config    TEXT,
  created_at      BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_jobs (
  id               TEXT PRIMARY KEY,
  payer_address    TEXT NOT NULL,
  merchant_address TEXT NOT NULL,
  target_amount    TEXT NOT NULL,
  label            TEXT,
  payment_ref      TEXT,
  status           TEXT NOT NULL DEFAULT 'SCANNING',
  source_plan      TEXT,
  quote            TEXT,
  tx_hashes        TEXT,
  error            TEXT,
  expires_at       BIGINT,
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_keys (
  wallet_address        TEXT PRIMARY KEY,
  encrypted_private_key  TEXT NOT NULL,
  session_address       TEXT NOT NULL,
  allowed_contracts     TEXT NOT NULL,
  spend_limit           TEXT NOT NULL,
  expiry                BIGINT NOT NULL,
  created_at            BIGINT NOT NULL,
  circle_wallet_id      TEXT,
  circle_wallet_address TEXT
);

CREATE TABLE IF NOT EXISTS gateway_cache (
  chain_name      TEXT PRIMARY KEY,
  wallet_contract TEXT NOT NULL,
  fetched_at      BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS store_products (
  id               TEXT PRIMARY KEY,
  merchant_address TEXT NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  price            TEXT NOT NULL,
  image_url        TEXT,
  active           SMALLINT NOT NULL DEFAULT 1,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  type             TEXT DEFAULT 'one_time',
  interval_days     INTEGER,
  created_at       BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                    TEXT PRIMARY KEY,
  merchant_address      TEXT NOT NULL,
  payer_address         TEXT NOT NULL,
  amount_usdc           TEXT NOT NULL,
  label                 TEXT,
  interval_days          INTEGER NOT NULL,
  next_charge_at        BIGINT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'ACTIVE',
  encrypted_session_key TEXT,
  session_address       TEXT,
  session_expiry        BIGINT,
  created_at            BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL,
  url           TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'PENDING',
  response_code INTEGER,
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  delivered_at  BIGINT,
  created_at    BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_slug ON merchants(slug) WHERE slug IS NOT NULL;
