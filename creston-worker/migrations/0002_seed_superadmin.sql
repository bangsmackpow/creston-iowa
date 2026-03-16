-- migrations/0002_seed_superadmin.sql
-- Creates the initial superadmin user.
-- Password is set via the admin UI after first login.
-- Default password hash is for "changeme" — CHANGE THIS IMMEDIATELY.
--
-- To generate a proper hash before running:
--   node -e "require('crypto').scrypt('yourpassword','salt',64,(e,k)=>console.log(k.toString('hex')))"
-- Or just log in with "changeme" and change it from the Users page.

INSERT OR IGNORE INTO companies (id, name, slug, contact_email, active)
VALUES (1, 'Creston Iowa Admin', 'admin', 'hello@creston-iowa.com', 1);

-- Password: changeme  (CHANGE IMMEDIATELY after first login)
-- This is a placeholder — the real hash is generated on first password set
INSERT OR IGNORE INTO users (email, password_hash, name, role, company_id, active)
VALUES (
  'admin@creston-iowa.com',
  'PLACEHOLDER_CHANGE_ON_FIRST_LOGIN',
  'Site Admin',
  'superadmin',
  1,
  1
);
