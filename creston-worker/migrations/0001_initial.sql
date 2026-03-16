-- migrations/0001_initial.sql
-- Creston Iowa — Multi-user auth schema
-- Run with: npx wrangler d1 migrations apply creston-auth

-- ── Companies ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  slug          TEXT    NOT NULL UNIQUE,  -- used as R2 prefix: jobs/active/{slug}/
  contact_email TEXT    NOT NULL,
  phone         TEXT,
  website       TEXT,
  active        INTEGER NOT NULL DEFAULT 1,  -- 0 = suspended
  plan          TEXT    NOT NULL DEFAULT 'basic',  -- basic | featured | premium
  jobs_remaining INTEGER NOT NULL DEFAULT 0,  -- purchased job post credits
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  notes         TEXT    -- superadmin notes
);

-- ── Users ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'company_admin',
  -- roles: superadmin | company_admin | editor
  company_id    INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login    TEXT
);

-- ── Sessions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  ip          TEXT,
  user_agent  TEXT
);

-- ── Invite Tokens ────────────────────────────────────────────
-- Used to invite company admins without them self-registering
CREATE TABLE IF NOT EXISTS invites (
  token       TEXT    PRIMARY KEY,
  email       TEXT    NOT NULL,
  company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  role        TEXT    NOT NULL DEFAULT 'company_admin',
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT    NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0
);

-- ── Job Posts (metadata mirror) ──────────────────────────────
-- Mirrors R2 markdown metadata for fast querying/reporting
-- R2 is still the source of truth for content
CREATE TABLE IF NOT EXISTS job_posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  r2_key      TEXT    NOT NULL UNIQUE,  -- full R2 path
  title       TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'active',  -- active | expired | draft
  plan        TEXT    NOT NULL DEFAULT 'basic',
  posted_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT,
  created_by  INTEGER REFERENCES users(id)
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email      ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_company    ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_company     ON job_posts(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status      ON job_posts(status);
CREATE INDEX IF NOT EXISTS idx_invites_email    ON invites(email);
