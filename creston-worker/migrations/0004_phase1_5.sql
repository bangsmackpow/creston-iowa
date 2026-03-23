-- migrations/0004_phase1_5.sql
-- Phase 1-5 feature tables
-- Run: npx wrangler d1 migrations apply creston-auth --remote

-- ── 311 Service Requests ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id    TEXT    NOT NULL UNIQUE,  -- SR-2025-0001 format
  category     TEXT    NOT NULL,         -- pothole | streetlight | park | other
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL,
  location     TEXT,                     -- address or intersection
  name         TEXT    NOT NULL,
  email        TEXT    NOT NULL,
  phone        TEXT,
  status       TEXT    NOT NULL DEFAULT 'open',    -- open | in_progress | resolved | closed
  priority     TEXT    NOT NULL DEFAULT 'normal',  -- low | normal | high | urgent
  assigned_to  INTEGER REFERENCES users(id),
  notes        TEXT,                     -- internal admin notes
  r2_key       TEXT,                     -- attached photo in R2
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  resolved_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_sr_status   ON service_requests(status);
CREATE INDEX IF NOT EXISTS idx_sr_email    ON service_requests(email);
CREATE INDEX IF NOT EXISTS idx_sr_category ON service_requests(category);

-- ── FOIA / Open Records Requests ─────────────────────────────
CREATE TABLE IF NOT EXISTS foia_requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id     TEXT    NOT NULL UNIQUE,  -- FOIA-2025-001
  requester_name TEXT    NOT NULL,
  requester_email TEXT   NOT NULL,
  requester_phone TEXT,
  organization   TEXT,
  description    TEXT    NOT NULL,          -- what records are requested
  department     TEXT,                      -- city clerk | police | finance | other
  format         TEXT    DEFAULT 'digital', -- digital | paper | both
  status         TEXT    NOT NULL DEFAULT 'received',  -- received | in_review | fulfilled | denied | partial
  due_date       TEXT,                      -- legal deadline (usually 10 business days)
  denial_reason  TEXT,
  fulfillment_r2 TEXT,                      -- R2 key of fulfilled documents
  notes          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  fulfilled_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_foia_status ON foia_requests(status);
CREATE INDEX IF NOT EXISTS idx_foia_due    ON foia_requests(due_date);

-- ── SMS Subscribers ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_subscribers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  phone       TEXT    NOT NULL UNIQUE,
  name        TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  opted_in_at TEXT    NOT NULL DEFAULT (datetime('now')),
  opted_out_at TEXT,
  categories  TEXT    DEFAULT 'all'   -- comma-separated: emergency,news,events
);

-- ── SMS Messages Log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  message      TEXT    NOT NULL,
  category     TEXT    DEFAULT 'general',
  recipients   INTEGER DEFAULT 0,
  sent_by      INTEGER REFERENCES users(id),
  status       TEXT    DEFAULT 'sent',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Analytics Events ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_daily (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT    NOT NULL,
  path         TEXT    NOT NULL,
  views        INTEGER DEFAULT 0,
  unique_ips   INTEGER DEFAULT 0,
  UNIQUE(date, path)
);

-- ── Resident Accounts (Phase 3 scaffold) ─────────────────────
CREATE TABLE IF NOT EXISTS residents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  phone         TEXT,
  address       TEXT,
  verified      INTEGER NOT NULL DEFAULT 0,
  verify_token  TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login    TEXT
);

-- ── Resident Sessions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resident_sessions (
  token      TEXT    PRIMARY KEY,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  expires_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Permits (Phase 3 scaffold) ────────────────────────────────
CREATE TABLE IF NOT EXISTS permits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  permit_id    TEXT    NOT NULL UNIQUE,  -- PRMT-2025-001
  type         TEXT    NOT NULL,         -- garage_sale | pet_license | building | event
  applicant_name TEXT  NOT NULL,
  applicant_email TEXT NOT NULL,
  applicant_phone TEXT,
  address      TEXT,
  description  TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'pending',  -- pending | approved | denied | expired
  fee_cents    INTEGER DEFAULT 0,
  paid         INTEGER DEFAULT 0,
  payment_intent TEXT,
  approved_by  INTEGER REFERENCES users(id),
  valid_from   TEXT,
  valid_until  TEXT,
  notes        TEXT,
  r2_key       TEXT,                     -- uploaded documents
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_permits_status ON permits(status);
CREATE INDEX IF NOT EXISTS idx_permits_email  ON permits(applicant_email);

-- ── Public Notices ────────────────────────────────────────────
-- Also stored as R2 markdown, but tracked here for deadline enforcement
CREATE TABLE IF NOT EXISTS public_notices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,
  title       TEXT    NOT NULL,
  category    TEXT    NOT NULL,   -- legal | bid | zoning | hearing | other
  publish_date TEXT   NOT NULL,
  expiry_date  TEXT,
  r2_key       TEXT   NOT NULL,
  created_at   TEXT   NOT NULL DEFAULT (datetime('now'))
);
