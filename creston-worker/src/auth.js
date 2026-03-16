/**
 * auth.js
 * Simple token-based auth for the admin UI.
 * 
 * Setup:
 *   wrangler secret put ADMIN_PASSWORD   → your chosen password
 *   wrangler secret put ADMIN_TOKEN      → a random 32+ char string
 *                                           e.g. openssl rand -hex 32
 */

/**
 * Check if a request has a valid admin session cookie or Bearer token.
 */
export function isAuthenticated(request, env) {
  // Check Authorization header (used by API calls)
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    return token === env.ADMIN_TOKEN;
  }

  // Check session cookie (used by browser admin UI)
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  return cookies['admin_token'] === env.ADMIN_TOKEN;
}

/**
 * Validate a password attempt and return a Set-Cookie header if correct.
 */
export function validatePassword(password, env) {
  return password === env.ADMIN_PASSWORD;
}

/**
 * Build a Set-Cookie header for the admin session.
 * HttpOnly + Secure + SameSite=Strict — no JS access.
 */
export function buildSessionCookie(env) {
  // 7-day expiry
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  return `admin_token=${env.ADMIN_TOKEN}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Expires=${expires}`;
}

/**
 * Build a cookie that clears the session.
 */
export function clearSessionCookie() {
  return `admin_token=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

/**
 * Parse a Cookie header string into a key→value object.
 */
function parseCookies(cookieStr) {
  const out = {};
  for (const part of cookieStr.split(';')) {
    const [k, ...vParts] = part.split('=');
    if (k) out[k.trim()] = vParts.join('=').trim();
  }
  return out;
}

/**
 * Return a 401 redirect to the login page.
 */
export function unauthorizedResponse() {
  return new Response(null, {
    status: 302,
    headers: { Location: '/admin/login' }
  });
}
