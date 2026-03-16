/**
 * src/db/d1.js
 * D1 database query helpers.
 * All queries go through here — never raw SQL in handlers.
 */

// ── Users ──────────────────────────────────────────────────────

export async function getUserByEmail(db, email) {
  return await db.prepare(
    'SELECT * FROM users WHERE email = ? AND active = 1'
  ).bind(email.toLowerCase().trim()).first();
}

export async function getUserById(db, id) {
  return await db.prepare(
    'SELECT u.*, c.name as company_name, c.slug as company_slug FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.id = ?'
  ).bind(id).first();
}

export async function getAllUsers(db) {
  return await db.prepare(
    `SELECT u.*, c.name as company_name
     FROM users u
     LEFT JOIN companies c ON u.company_id = c.id
     ORDER BY u.created_at DESC`
  ).all();
}

export async function createUser(db, { email, passwordHash, name, role, companyId }) {
  return await db.prepare(
    'INSERT INTO users (email, password_hash, name, role, company_id) VALUES (?, ?, ?, ?, ?)'
  ).bind(email.toLowerCase().trim(), passwordHash, name, role, companyId || null).run();
}

export async function updateUserPassword(db, userId, passwordHash) {
  return await db.prepare(
    'UPDATE users SET password_hash = ? WHERE id = ?'
  ).bind(passwordHash, userId).run();
}

export async function updateUserLastLogin(db, userId) {
  return await db.prepare(
    "UPDATE users SET last_login = datetime('now') WHERE id = ?"
  ).bind(userId).run();
}

export async function updateUserActive(db, userId, active) {
  return await db.prepare(
    'UPDATE users SET active = ? WHERE id = ?'
  ).bind(active ? 1 : 0, userId).run();
}

export async function deleteUser(db, userId) {
  return await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
}

// ── Sessions ───────────────────────────────────────────────────

export async function createSession(db, { token, userId, expiresAt, ip, userAgent }) {
  return await db.prepare(
    'INSERT INTO sessions (token, user_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)'
  ).bind(token, userId, expiresAt, ip || null, userAgent || null).run();
}

export async function getSession(db, token) {
  return await db.prepare(
    `SELECT s.*, u.id as uid, u.email, u.name, u.role, u.company_id,
            c.name as company_name, c.slug as company_slug, c.active as company_active,
            c.jobs_remaining
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     LEFT JOIN companies c ON u.company_id = c.id
     WHERE s.token = ? AND s.expires_at > datetime('now') AND u.active = 1`
  ).bind(token).first();
}

export async function deleteSession(db, token) {
  return await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

export async function cleanExpiredSessions(db) {
  return await db.prepare(
    "DELETE FROM sessions WHERE expires_at < datetime('now')"
  ).run();
}

// ── Companies ──────────────────────────────────────────────────

export async function getAllCompanies(db) {
  return await db.prepare(
    `SELECT c.*, COUNT(u.id) as user_count, COUNT(j.id) as job_count
     FROM companies c
     LEFT JOIN users u ON u.company_id = c.id AND u.active = 1
     LEFT JOIN job_posts j ON j.company_id = c.id AND j.status = 'active'
     GROUP BY c.id
     ORDER BY c.created_at DESC`
  ).all();
}

export async function getCompanyById(db, id) {
  return await db.prepare('SELECT * FROM companies WHERE id = ?').bind(id).first();
}

export async function getCompanyBySlug(db, slug) {
  return await db.prepare('SELECT * FROM companies WHERE slug = ?').bind(slug).first();
}

export async function createCompany(db, { name, slug, contactEmail, phone, website, plan }) {
  return await db.prepare(
    'INSERT INTO companies (name, slug, contact_email, phone, website, plan) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(name, slug, contactEmail, phone || null, website || null, plan || 'basic').run();
}

export async function updateCompany(db, id, fields) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  vals.push(id);
  return await db.prepare(
    `UPDATE companies SET ${sets.join(', ')} WHERE id = ?`
  ).bind(...vals).run();
}

export async function updateCompanyCredits(db, companyId, delta) {
  return await db.prepare(
    'UPDATE companies SET jobs_remaining = MAX(0, jobs_remaining + ?) WHERE id = ?'
  ).bind(delta, companyId).run();
}

export async function deleteCompany(db, id) {
  return await db.prepare('DELETE FROM companies WHERE id = ?').bind(id).run();
}

// ── Invites ────────────────────────────────────────────────────

export async function createInvite(db, { token, email, companyId, role, createdBy, expiresAt }) {
  return await db.prepare(
    'INSERT INTO invites (token, email, company_id, role, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(token, email.toLowerCase(), companyId || null, role, createdBy, expiresAt).run();
}

export async function getInvite(db, token) {
  return await db.prepare(
    `SELECT i.*, c.name as company_name
     FROM invites i
     LEFT JOIN companies c ON i.company_id = c.id
     WHERE i.token = ? AND i.used = 0 AND i.expires_at > datetime('now')`
  ).bind(token).first();
}

export async function markInviteUsed(db, token) {
  return await db.prepare('UPDATE invites SET used = 1 WHERE token = ?').bind(token).run();
}

export async function getPendingInvites(db) {
  return await db.prepare(
    `SELECT i.*, c.name as company_name
     FROM invites i
     LEFT JOIN companies c ON i.company_id = c.id
     WHERE i.used = 0 AND i.expires_at > datetime('now')
     ORDER BY i.created_at DESC`
  ).all();
}

// ── Job Posts ──────────────────────────────────────────────────

export async function createJobPost(db, { slug, companyId, r2Key, title, plan, expiresAt, createdBy }) {
  return await db.prepare(
    'INSERT INTO job_posts (slug, company_id, r2_key, title, plan, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(slug, companyId, r2Key, title, plan || 'basic', expiresAt || null, createdBy || null).run();
}

export async function getJobsByCompany(db, companyId) {
  return await db.prepare(
    'SELECT * FROM job_posts WHERE company_id = ? ORDER BY posted_at DESC'
  ).bind(companyId).all();
}

export async function updateJobStatus(db, r2Key, status) {
  return await db.prepare(
    'UPDATE job_posts SET status = ? WHERE r2_key = ?'
  ).bind(status, r2Key).run();
}

export async function deleteJobPost(db, r2Key) {
  return await db.prepare('DELETE FROM job_posts WHERE r2_key = ?').bind(r2Key).run();
}
