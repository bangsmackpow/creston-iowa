/**
 * src/handlers/residents.js
 * Resident Portal — public accounts for Creston residents.
 *
 * Separate from admin users — residents are community members,
 * not content editors. They can:
 *   - Create an account (email + password)
 *   - Log in and see their activity
 *   - Track 311 requests they submitted
 *   - Track FOIA requests they submitted
 *   - Manage email/SMS notification preferences
 *   - (Phase 5) Pay bills, view permits
 *
 * Routes:
 *   GET  /residents/register     → registration form
 *   POST /residents/register     → create account
 *   GET  /residents/login        → login form
 *   POST /residents/login        → authenticate
 *   GET  /residents/logout       → destroy session
 *   GET  /my-account             → dashboard (auth required)
 *   GET  /my-account/requests    → 311 requests
 *   GET  /my-account/foia        → FOIA requests
 *   POST /my-account/preferences → update notification prefs
 */

import { renderShell, escHtml } from '../shell.js';
import { getSiteConfig }        from '../db/site.js';
import { hashPassword, verifyPassword, generateToken } from '../db/crypto.js';

const SESSION_COOKIE = 'resident_session';
const SESSION_DAYS   = 30;

// ── Router ────────────────────────────────────────────────────
export async function handleResidents(request, env, url) {
  const path = url.pathname;
  if (path === '/residents/register') return handleRegister(request, env, url);
  if (path === '/residents/login')    return handleResidentLogin(request, env, url);
  if (path === '/residents/logout')   return handleResidentLogout(request, env);
  return new Response('Not found', { status: 404 });
}

export async function handleMyAccount(request, env, url) {
  const resident = await getResidentSession(request, env);
  if (!resident) {
    return new Response(null, { status: 302, headers: { Location: '/residents/login?next=/my-account' } });
  }

  const path = url.pathname;
  if (path === '/my-account/preferences' && request.method === 'POST') {
    return handlePreferences(request, env, resident);
  }
  if (path === '/my-account/requests') return renderMyRequests(env, url, resident);
  if (path === '/my-account/foia')     return renderMyFOIA(env, url, resident);
  return renderDashboard(env, resident);
}

// ── Registration ──────────────────────────────────────────────
async function handleRegister(request, env, url) {
  const cfg = await getSiteConfig(env);

  if (request.method === 'POST') {
    const form  = await request.formData();
    const email = (form.get('email') || '').trim().toLowerCase();
    const name  = (form.get('name')  || '').trim();
    const pass  = form.get('password') || '';
    const conf  = form.get('confirm')  || '';

    if (!email || !name || !pass) {
      return renderRegisterPage(cfg, 'All fields are required.');
    }
    if (pass.length < 8) {
      return renderRegisterPage(cfg, 'Password must be at least 8 characters.');
    }
    if (pass !== conf) {
      return renderRegisterPage(cfg, 'Passwords do not match.');
    }

    try {
      const existing = await env.DB.prepare(
        'SELECT id FROM residents WHERE email = ?'
      ).bind(email).first();

      if (existing) {
        return renderRegisterPage(cfg, 'An account with that email already exists. Try logging in.');
      }

      const hash = await hashPassword(pass);
      await env.DB.prepare(`
        INSERT INTO residents (email, password_hash, name, verified, active)
        VALUES (?, ?, ?, 1, 1)
      `).bind(email, hash, name).run();

      // Auto-login after registration
      const resident = await env.DB.prepare(
        'SELECT * FROM residents WHERE email = ?'
      ).bind(email).first();
      return createSessionResponse(env, resident, '/my-account');

    } catch (err) {
      console.error('Register error:', err.message);
      return renderRegisterPage(cfg, 'Registration failed. Please try again.');
    }
  }

  return renderRegisterPage(cfg);
}

function renderRegisterPage(cfg, error = '') {
  const content = `
    <section class="section">
      <div class="container" style="max-width:480px;">
        <div style="background:white;border:1.5px solid #e0e0e0;border-radius:16px;padding:36px 32px;">
          <h2 style="font-family:var(--font-display);font-size:1.4rem;color:var(--green-deep);margin-bottom:6px;">
            Create a Resident Account
          </h2>
          <p style="font-family:var(--font-ui);font-size:.85rem;color:#888;margin-bottom:24px;">
            Track service requests, FOIA filings, and city communications.
          </p>
          ${error ? `<div style="background:#fde8e8;border:1.5px solid #e0a0a0;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-family:sans-serif;font-size:.85rem;color:#b84040;">⚠️ ${escHtml(error)}</div>` : ''}
          <form method="POST">
            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label">Full Name *</label>
              <input type="text" name="name" class="form-input" required placeholder="Your name" autofocus>
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label">Email Address *</label>
              <input type="email" name="email" class="form-input" required placeholder="your@email.com">
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label">Password * (min 8 chars)</label>
              <input type="password" name="password" class="form-input" required minlength="8">
            </div>
            <div class="form-group" style="margin-bottom:20px;">
              <label class="form-label">Confirm Password *</label>
              <input type="password" name="confirm" class="form-input" required>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">
              Create Account →
            </button>
          </form>
          <p style="text-align:center;margin-top:16px;font-family:var(--font-ui);font-size:.83rem;color:#888;">
            Already have an account? <a href="/residents/login">Sign in →</a>
          </p>
        </div>
      </div>
    </section>`;

  return new Response(renderShellSync({
    title: 'Create Account', heading: 'Resident Portal', config: cfg, content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ── Login ─────────────────────────────────────────────────────
async function handleResidentLogin(request, env, url) {
  const cfg  = await getSiteConfig(env);
  const next = url.searchParams.get('next') || '/my-account';

  if (request.method === 'POST') {
    const form  = await request.formData();
    const email = (form.get('email') || '').trim().toLowerCase();
    const pass  = form.get('password') || '';

    if (!email || !pass) {
      return renderLoginPage(cfg, next, 'Email and password are required.');
    }

    try {
      const resident = await env.DB.prepare(
        'SELECT * FROM residents WHERE email = ? AND active = 1'
      ).bind(email).first();

      if (!resident || !await verifyPassword(pass, resident.password_hash)) {
        return renderLoginPage(cfg, next, 'Invalid email or password.');
      }

      await env.DB.prepare(
        "UPDATE residents SET last_login = datetime('now') WHERE id = ?"
      ).bind(resident.id).run();

      return createSessionResponse(env, resident, next);
    } catch (err) {
      return renderLoginPage(cfg, next, 'Login error. Please try again.');
    }
  }

  return renderLoginPage(cfg, next);
}

function renderLoginPage(cfg, next = '/my-account', error = '') {
  const content = `
    <section class="section">
      <div class="container" style="max-width:440px;">
        <div style="background:white;border:1.5px solid #e0e0e0;border-radius:16px;padding:36px 32px;">
          <h2 style="font-family:var(--font-display);font-size:1.4rem;color:var(--green-deep);margin-bottom:24px;">
            Resident Sign In
          </h2>
          ${error ? `<div style="background:#fde8e8;border:1.5px solid #e0a0a0;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-family:sans-serif;font-size:.85rem;color:#b84040;">⚠️ ${escHtml(error)}</div>` : ''}
          <form method="POST">
            <input type="hidden" name="next" value="${escHtml(next)}">
            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label">Email</label>
              <input type="email" name="email" class="form-input" required autofocus placeholder="your@email.com">
            </div>
            <div class="form-group" style="margin-bottom:20px;">
              <label class="form-label">Password</label>
              <input type="password" name="password" class="form-input" required>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">
              Sign In →
            </button>
          </form>
          <p style="text-align:center;margin-top:16px;font-family:var(--font-ui);font-size:.83rem;color:#888;">
            New resident? <a href="/residents/register">Create an account →</a>
          </p>
        </div>
      </div>
    </section>`;

  return new Response(renderShellSync({
    title: 'Sign In', heading: 'Resident Portal', config: cfg, content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ── Logout ────────────────────────────────────────────────────
async function handleResidentLogout(request, env) {
  const token = getSessionToken(request);
  if (token) {
    await env.DB.prepare('DELETE FROM resident_sessions WHERE token = ?').bind(token).run().catch(() => {});
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location:   '/residents/login',
      'Set-Cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
    }
  });
}

// ── My Account Dashboard ──────────────────────────────────────
async function renderDashboard(env, resident) {
  const cfg = await getSiteConfig(env);

  const [srResult, foiaResult] = await Promise.all([
    env.DB.prepare('SELECT * FROM service_requests WHERE email = ? ORDER BY created_at DESC LIMIT 5')
      .bind(resident.email).all().catch(() => ({ results: [] })),
    env.DB.prepare('SELECT * FROM foia_requests WHERE requester_email = ? ORDER BY created_at DESC LIMIT 5')
      .bind(resident.email).all().catch(() => ({ results: [] })),
  ]);

  const requests = srResult.results || [];
  const foias    = foiaResult.results || [];

  const statusColor = { open:'#e8593c', in_progress:'#c9933a', resolved:'#2d5a3d', closed:'#888' };

  const srRows = requests.length === 0
    ? `<p style="color:#888;font-family:var(--font-ui);font-size:.85rem;padding:12px 0;">No requests submitted yet.</p>`
    : requests.map(r => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0f0f0;">
        <div>
          <div style="font-family:var(--font-ui);font-size:.85rem;font-weight:600;">${escHtml(r.title)}</div>
          <div style="font-family:monospace;font-size:.72rem;color:#888;">${escHtml(r.ticket_id)}</div>
        </div>
        <span style="background:${statusColor[r.status]||'#888'};color:white;padding:2px 10px;border-radius:100px;font-family:var(--font-ui);font-size:.72rem;font-weight:600;">${escHtml(r.status)}</span>
      </div>`).join('');

  const foiaRows = foias.length === 0
    ? `<p style="color:#888;font-family:var(--font-ui);font-size:.85rem;padding:12px 0;">No FOIA requests submitted yet.</p>`
    : foias.map(f => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0f0f0;">
        <div>
          <div style="font-family:var(--font-ui);font-size:.85rem;font-weight:600;">${escHtml(f.department)}</div>
          <div style="font-family:monospace;font-size:.72rem;color:#888;">${escHtml(f.request_id)} · Due ${escHtml(f.due_date||'—')}</div>
        </div>
        <span style="background:#e6f1fb;color:#0c447c;padding:2px 10px;border-radius:100px;font-family:var(--font-ui);font-size:.72rem;font-weight:600;">${escHtml(f.status)}</span>
      </div>`).join('');

  const content = `
    <section class="section">
      <div class="container" style="max-width:800px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;flex-wrap:wrap;gap:12px;">
          <div>
            <h2 style="font-family:var(--font-display);font-size:1.4rem;color:var(--green-deep);margin-bottom:4px;">
              Welcome, ${escHtml(resident.name)}
            </h2>
            <p style="font-family:var(--font-ui);font-size:.83rem;color:#888;">${escHtml(resident.email)}</p>
          </div>
          <a href="/residents/logout" class="btn btn-outline" style="font-size:.82rem;">Sign Out</a>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
          <a href="/311" class="stat-card" style="text-decoration:none;text-align:center;background:white;border:1.5px solid #e0e0e0;border-radius:12px;padding:20px;display:block;">
            <div style="font-size:2rem;margin-bottom:8px;">📋</div>
            <div style="font-family:var(--font-ui);font-weight:700;color:var(--green-deep);">311 Requests</div>
            <div style="font-family:var(--font-ui);font-size:.78rem;color:#888;margin-top:4px;">Report a city issue</div>
          </a>
          <a href="/foia" class="stat-card" style="text-decoration:none;text-align:center;background:white;border:1.5px solid #e0e0e0;border-radius:12px;padding:20px;display:block;">
            <div style="font-size:2rem;margin-bottom:8px;">⚖️</div>
            <div style="font-family:var(--font-ui);font-weight:700;color:var(--green-deep);">Public Records</div>
            <div style="font-family:var(--font-ui);font-size:.78rem;color:#888;margin-top:4px;">Request city records</div>
          </a>
        </div>

        <div style="background:white;border:1.5px solid #e0e0e0;border-radius:12px;padding:20px 24px;margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h3 style="font-family:var(--font-ui);font-size:.95rem;font-weight:700;color:#333;">My 311 Requests</h3>
            <a href="/311" class="btn btn-outline" style="font-size:.75rem;padding:4px 12px;">+ New Request</a>
          </div>
          ${srRows}
        </div>

        <div style="background:white;border:1.5px solid #e0e0e0;border-radius:12px;padding:20px 24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h3 style="font-family:var(--font-ui);font-size:.95rem;font-weight:700;color:#333;">My FOIA Requests</h3>
            <a href="/foia" class="btn btn-outline" style="font-size:.75rem;padding:4px 12px;">+ New Request</a>
          </div>
          ${foiaRows}
        </div>
      </div>
    </section>`;

  return new Response(renderShellSync({ title: 'My Account', heading: 'My Account', config: cfg, content }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function handlePreferences(request, env, resident) {
  const form  = await request.formData().catch(() => new FormData());
  const phone = (form.get('phone') || '').trim();
  const sms   = form.get('sms_alerts') === 'on' ? 1 : 0;

  await env.DB.prepare(
    'UPDATE residents SET phone = ? WHERE id = ?'
  ).bind(phone || null, resident.id).run().catch(() => {});

  return new Response(null, { status: 302, headers: { Location: '/my-account?saved=1' } });
}

// ── Session management ────────────────────────────────────────
async function createSessionResponse(env, resident, redirectTo) {
  const token   = generateToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  const expiresStr = expires.toISOString().replace('T', ' ').split('.')[0];

  await env.DB.prepare(`
    INSERT INTO resident_sessions (token, resident_id, expires_at)
    VALUES (?, ?, ?)
  `).bind(token, resident.id, expiresStr).run();

  return new Response(null, {
    status: 302,
    headers: {
      Location:   redirectTo || '/my-account',
      'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; SameSite=Lax; Secure`,
    }
  });
}

export async function getResidentSession(request, env) {
  const token = getSessionToken(request);
  if (!token) return null;

  try {
    const now = new Date().toISOString().replace('T', ' ').split('.')[0];
    const row = await env.DB.prepare(`
      SELECT r.* FROM residents r
      JOIN resident_sessions s ON r.id = s.resident_id
      WHERE s.token = ? AND s.expires_at > ? AND r.active = 1
    `).bind(token, now).first();
    return row || null;
  } catch { return null; }
}

function getSessionToken(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match  = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

// ── Sync shell renderer ───────────────────────────────────────
// renderShell is async but we need sync here — use a simple inline version
function renderShellSync({ title, heading, config: cfg, content }) {
  const name = cfg?.name || 'Creston, Iowa';
  return `<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)} — ${escHtml(name)}</title>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/theme.css">
</head><body>
  <div id="nav-placeholder"></div>
  ${content}
  <script src="/js/nav.js"></script>
</body></html>`;
}
