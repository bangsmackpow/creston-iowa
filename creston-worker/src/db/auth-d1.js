/**
 * src/db/auth-d1.js
 * Session-based authentication using D1.
 * Replaces the old single-password auth.js for admin routes.
 *
 * Session flow:
 *  1. User POSTs email + password to /admin/login
 *  2. We verify against D1 users table
 *  3. Create a session row in D1 sessions table
 *  4. Set HttpOnly session cookie + store token in sessionStorage
 *  5. Every subsequent request reads cookie → looks up session in D1
 *  6. Returns full user object with role + company info
 */

import { getSession, createSession, deleteSession, updateUserLastLogin } from './d1.js';
import { generateToken } from './crypto.js';

const SESSION_DAYS    = 7;
const COOKIE_NAME     = 'creston_session';

/**
 * Get the authenticated user from a request.
 * Returns the session row (includes user + company fields) or null.
 */
export async function getAuthUser(request, env) {
  const token = getSessionToken(request);
  if (!token) return null;

  try {
    const session = await getSession(env.DB, token);
    return session || null;
  } catch (err) {
    console.error('Auth lookup failed:', err);
    return null;
  }
}

/**
 * Require authentication. Returns user or a redirect Response.
 */
export async function requireAuth(request, env) {
  const user = await getAuthUser(request, env);
  if (!user) {
    return { user: null, response: redirectToLogin() };
  }
  return { user, response: null };
}

/**
 * Require superadmin role.
 */
export async function requireSuperadmin(request, env) {
  const { user, response } = await requireAuth(request, env);
  if (response) return { user: null, response };
  if (user.role !== 'superadmin') {
    return { user: null, response: new Response('Forbidden', { status: 403 }) };
  }
  return { user, response: null };
}

/**
 * Create a new session for a user. Returns { token, cookie }.
 */
export async function createUserSession(env, userId, request) {
  const token     = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000)
    .toISOString()
    .replace('T', ' ')
    .split('.')[0];

  const ip        = request.headers.get('CF-Connecting-IP') || null;
  const userAgent = request.headers.get('User-Agent') || null;

  await createSession(env.DB, { token, userId, expiresAt, ip, userAgent });
  await updateUserLastLogin(env.DB, userId);

  const cookie = buildCookie(token, new Date(Date.now() + SESSION_DAYS * 86400 * 1000));
  return { token, cookie };
}

/**
 * Destroy a session (logout).
 */
export async function destroySession(request, env) {
  const token = getSessionToken(request);
  if (token) {
    try { await deleteSession(env.DB, token); } catch {}
  }
  return clearCookie();
}

// ── Cookie helpers ─────────────────────────────────────────────

function getSessionToken(request) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  return cookies[COOKIE_NAME] || null;
}

function buildCookie(token, expires) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${expires.toUTCString()}`;
}

function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function parseCookies(str) {
  const out = {};
  for (const part of str.split(';')) {
    const [k, ...v] = part.split('=');
    if (k) out[k.trim()] = v.join('=').trim();
  }
  return out;
}

function redirectToLogin() {
  return new Response(null, { status: 302, headers: { Location: '/admin/login' } });
}
