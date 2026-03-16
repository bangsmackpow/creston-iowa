/**
 * src/db/crypto.js
 * Password hashing using the Web Crypto API.
 * Available natively in Cloudflare Workers — no npm deps needed.
 *
 * Uses PBKDF2 with SHA-256, 100k iterations, 32-byte key.
 * Format stored: pbkdf2:salt:hash  (all hex encoded)
 */

const ITERATIONS = 100_000;
const KEY_LEN    = 32;

/**
 * Hash a plaintext password. Returns a storable string.
 */
export async function hashPassword(password) {
  const salt    = crypto.getRandomValues(new Uint8Array(16));
  const keyMat  = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name:       'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash:       'SHA-256',
    },
    keyMat,
    KEY_LEN * 8
  );
  const hash    = new Uint8Array(bits);
  const saltHex = toHex(salt);
  const hashHex = toHex(hash);
  return `pbkdf2:${saltHex}:${hashHex}`;
}

/**
 * Verify a plaintext password against a stored hash string.
 * Returns true if they match.
 */
export async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('pbkdf2:')) return false;
  const [, saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;

  const salt   = fromHex(saltHex);
  const keyMat = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits    = await crypto.subtle.deriveBits(
    {
      name:       'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash:       'SHA-256',
    },
    keyMat,
    KEY_LEN * 8
  );
  const computed = toHex(new Uint8Array(bits));

  // Constant-time comparison to prevent timing attacks
  return safeEqual(computed, hashHex);
}

/**
 * Generate a cryptographically random token (hex string).
 * Default 32 bytes = 64 hex chars.
 */
export function generateToken(bytes = 32) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return toHex(arr);
}

// ── Helpers ────────────────────────────────────────────────────

function toHex(arr) {
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
