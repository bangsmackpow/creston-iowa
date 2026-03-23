/**
 * src/handlers/stripe.js
 * Stripe billing for the Creston Job Board.
 *
 * Packages:
 *   Basic    — $49  — 1 job credit  (30-day listing)
 *   Featured — $89  — 1 job credit  (featured placement, 30 days)
 *   Premium  — $149 — 3 job credits (multi-post bundle, 30 days each)
 *
 * Required secrets (set via: npx wrangler secret put <name> --remote):
 *   STRIPE_SECRET_KEY       — sk_live_xxx or sk_test_xxx
 *   STRIPE_WEBHOOK_SECRET   — whsec_xxx (from Stripe dashboard → Webhooks)
 *   STRIPE_PRICE_BASIC      — price_xxx (create in Stripe dashboard)
 *   STRIPE_PRICE_FEATURED   — price_xxx
 *   STRIPE_PRICE_PREMIUM    — price_xxx
 *
 * Routes:
 *   GET  /jobs/post              → purchase page (public)
 *   POST /api/stripe/checkout    → create Checkout session
 *   POST /api/stripe/webhook     → Stripe webhook (no auth — verified by signature)
 *   GET  /admin/billing          → order history (superadmin)
 */

import { renderShell, escHtml } from '../shell.js';
import { getSiteConfig }        from '../db/site.js';
import { getAuthUser }          from '../db/auth-d1.js';
import { adminPage } from './admin-page.js';

const STRIPE_API = 'https://api.stripe.com/v1';

const PACKAGES = {
  basic: {
    name:        'Basic Listing',
    price:       4900,      // cents
    credits:     1,
    description: '1 job posting · 30-day listing · Standard placement',
    features:    ['Listed on the Creston Job Board', '30-day active listing', 'Apply link or email', 'Edit anytime'],
    badge:       '',
  },
  featured: {
    name:        'Featured Listing',
    price:       8900,
    credits:     1,
    description: '1 job posting · 30-day listing · Featured placement',
    features:    ['⭐ Featured badge on listing', 'Top placement in search', 'Highlighted in job board', '30-day active listing'],
    badge:       'Most Popular',
  },
  premium: {
    name:        'Premium Bundle',
    price:       14900,
    credits:     3,
    description: '3 job postings · 30-day listings · Featured placement',
    features:    ['3 job posting credits', '⭐ Featured badge on all', 'Best value per post ($49.67 each)', '60 days to use credits'],
    badge:       'Best Value',
  },
};

// ── Public job board purchase page ─────────────────────────────
export async function handleJobsPost(request, env, url) {
  const cfg      = await getSiteConfig(env);
  const success  = url.searchParams.get('success') === '1';
  const canceled = url.searchParams.get('canceled') === '1';
  const hasStripe = !!(env.STRIPE_SECRET_KEY);

  const cards = Object.entries(PACKAGES).map(([key, pkg]) => `
    <div class="pricing-card ${key === 'featured' ? 'pricing-card-featured' : ''}">
      ${pkg.badge ? `<div class="pricing-badge">${escHtml(pkg.badge)}</div>` : ''}
      <div class="pricing-name">${escHtml(pkg.name)}</div>
      <div class="pricing-price">
        <span class="pricing-dollar">$</span>${Math.floor(pkg.price / 100)}
        ${pkg.credits > 1 ? `<span class="pricing-credits"> / ${pkg.credits} posts</span>` : ''}
      </div>
      <div class="pricing-desc">${escHtml(pkg.description)}</div>
      <ul class="pricing-features">
        ${pkg.features.map(f => `<li>✓ ${escHtml(f)}</li>`).join('')}
      </ul>
      ${hasStripe
        ? `<button onclick="startCheckout('${key}')" class="btn ${key === 'featured' ? 'btn-gold' : 'btn-primary'} btn-lg" style="width:100%;justify-content:center;">
             Get Started →
           </button>`
        : `<a href="/contact?type=Job+Board+Posting" class="btn btn-outline btn-lg" style="width:100%;justify-content:center;">
             Contact Us to Post
           </a>`}
    </div>`).join('');

  const content = `
    <section class="section">
      <div class="container">

        ${success ? `
        <div style="background:#e8f2eb;border:2px solid #4a8c5c;border-radius:12px;padding:24px 28px;margin-bottom:32px;text-align:center;">
          <div style="font-size:2.5rem;margin-bottom:8px;">🎉</div>
          <h2 style="color:#1a3a2a;margin-bottom:8px;">Payment Successful!</h2>
          <p style="color:#444;">Your job credits have been added to your account. <a href="/admin/jobs/new" style="color:var(--green-mid);">Post your first job →</a></p>
        </div>` : ''}

        ${canceled ? `
        <div style="background:#fde8e8;border:2px solid #e0a0a0;border-radius:12px;padding:20px 24px;margin-bottom:32px;text-align:center;">
          <p style="color:#b84040;margin:0;">Payment canceled — no charge was made. <a href="/jobs/post" style="color:#b84040;">Try again</a> whenever you're ready.</p>
        </div>` : ''}

        <div style="text-align:center;margin-bottom:40px;">
          <div class="eyebrow">Creston Job Board</div>
          <h1 style="font-family:var(--font-display);font-size:2.2rem;color:var(--green-deep);margin-bottom:12px;">Post a Job in Creston</h1>
          <p style="font-family:var(--font-body);font-size:1.05rem;color:#555;max-width:560px;margin:0 auto;">
            Reach local job seekers in Creston and Union County. One-time flat fee — no subscriptions, no per-click charges.
          </p>
        </div>

        <div class="pricing-grid">${cards}</div>

        <div style="text-align:center;margin-top:32px;font-family:var(--font-ui);font-size:.85rem;color:#888;">
          <p>Secure payment powered by <strong>Stripe</strong> · All major credit cards accepted</p>
          <p style="margin-top:6px;">Questions? <a href="/contact">Contact us</a> or email <a href="mailto:${escHtml(cfg.email_jobs || cfg.email_general || 'hello@creston-iowa.com')}">${escHtml(cfg.email_jobs || cfg.email_general || 'hello@creston-iowa.com')}</a></p>
        </div>

        <div id="checkout-status" style="text-align:center;margin-top:16px;font-family:sans-serif;font-size:.88rem;min-height:1.4em;"></div>
      </div>
    </section>

    <style>
      .pricing-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:20px; max-width:900px; margin:0 auto; }
      .pricing-card { background:white; border:1.5px solid #e0e0e0; border-radius:16px; padding:28px 24px; position:relative; display:flex; flex-direction:column; gap:12px; }
      .pricing-card-featured { border-color:var(--gold); box-shadow:0 8px 32px rgba(201,147,58,.15); }
      .pricing-badge { position:absolute; top:-12px; left:50%; transform:translateX(-50%); background:var(--gold); color:white; padding:3px 16px; border-radius:100px; font-family:var(--font-ui); font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; white-space:nowrap; }
      .pricing-name { font-family:var(--font-ui); font-size:.85rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--gold); }
      .pricing-price { font-family:var(--font-display); font-size:2.8rem; font-weight:900; color:var(--green-deep); line-height:1; display:flex; align-items:flex-start; gap:2px; }
      .pricing-dollar { font-size:1.4rem; margin-top:6px; }
      .pricing-credits { font-size:.85rem; font-weight:400; color:#888; align-self:flex-end; margin-bottom:4px; }
      .pricing-desc { font-family:var(--font-ui); font-size:.82rem; color:#888; }
      .pricing-features { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; flex:1; }
      .pricing-features li { font-family:var(--font-ui); font-size:.85rem; color:#444; padding:4px 0; border-bottom:1px solid #f5f5f5; }
      .pricing-features li:last-child { border:none; }
    </style>

    <script>
      async function startCheckout(pkg) {
        const st = document.getElementById('checkout-status');
        st.textContent = '⏳ Preparing checkout...';
        st.style.color = '#888';
        try {
          const r = await fetch('/api/stripe/checkout', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ package: pkg }),
          });
          const d = await r.json();
          if (!r.ok || d.error) {
            st.textContent = '❌ ' + (d.error || 'Could not start checkout');
            st.style.color = '#b84040';
            return;
          }
          if (d.url) window.location.href = d.url;
        } catch(e) {
          st.textContent = '❌ Network error — please try again.';
          st.style.color = '#b84040';
        }
      }
    </script>`;

  return new Response(await renderShell({
    title:      'Post a Job — Creston Job Board',
    description: `Post a job opening on the Creston, Iowa job board. Reach local job seekers in Union County. One-time flat fee starting at $49.`,
    eyebrow:    '💼 Job Board',
    heading:    'Post a Job in Creston',
    subheading: 'Reach local job seekers. One-time flat fee, no subscription.',
    activeNav:  'Jobs',
    config:     cfg,
    content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ── Create Stripe Checkout session ─────────────────────────────
export async function handleStripeCheckout(request, env) {
  if (!env.STRIPE_SECRET_KEY) {
    return jsonRes({ error: 'Stripe not configured — add STRIPE_SECRET_KEY secret' }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return jsonRes({ error: 'Invalid JSON' }, 400); }

  const pkg = PACKAGES[body.package];
  if (!pkg) return jsonRes({ error: 'Invalid package' }, 400);

  const cfg      = await getSiteConfig(env);
  const siteUrl  = cfg?.url || 'https://creston-iowa.com';
  const priceId  = env[`STRIPE_PRICE_${body.package.toUpperCase()}`];

  // Get company info if user is logged in
  const user      = await getAuthUser(request, env).catch(() => null);
  const companyId = user?.company_id || null;
  const email     = user?.email || '';

  let sessionBody;

  if (priceId) {
    // Use pre-configured Stripe Price IDs (recommended for production)
    sessionBody = new URLSearchParams({
      mode:                          'payment',
      'line_items[0][price]':        priceId,
      'line_items[0][quantity]':     '1',
      success_url:                   `${siteUrl}/jobs/post?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:                    `${siteUrl}/jobs/post?canceled=1`,
      'metadata[package]':           body.package,
      'metadata[credits]':           String(pkg.credits),
      'metadata[company_id]':        String(companyId || ''),
      'metadata[site]':              cfg?.name || 'creston-iowa',
    });
    if (email) sessionBody.set('customer_email', email);
  } else {
    // Fallback: create price on-the-fly (no pre-configured price IDs needed)
    sessionBody = new URLSearchParams({
      mode:                                'payment',
      'line_items[0][price_data][currency]':     'usd',
      'line_items[0][price_data][product_data][name]': `${cfg?.name || 'Creston'} Job Board — ${pkg.name}`,
      'line_items[0][price_data][product_data][description]': pkg.description,
      'line_items[0][price_data][unit_amount]':  String(pkg.price),
      'line_items[0][quantity]':                 '1',
      success_url:                               `${siteUrl}/jobs/post?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:                                `${siteUrl}/jobs/post?canceled=1`,
      'metadata[package]':                       body.package,
      'metadata[credits]':                       String(pkg.credits),
      'metadata[company_id]':                    String(companyId || ''),
      'metadata[site]':                          cfg?.name || 'creston-iowa',
    });
    if (email) sessionBody.set('customer_email', email);
  }

  try {
    const res  = await stripeRequest(env, 'POST', '/checkout/sessions', sessionBody);
    const data = await res.json();
    if (!res.ok) return jsonRes({ error: data.error?.message || 'Stripe error' }, 400);

    // Record pending order in D1
    if (env.DB) {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO stripe_orders
          (checkout_session_id, company_id, company_email, package, credits, amount_cents, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
      `).bind(data.id, companyId, email, body.package, pkg.credits, pkg.price).run();
    }

    return jsonRes({ url: data.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    return jsonRes({ error: err.message }, 500);
  }
}

// ── Stripe webhook ─────────────────────────────────────────────
export async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET not set');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  const body      = await request.text();
  const signature = request.headers.get('stripe-signature') || '';

  // Verify webhook signature
  const valid = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    console.error('Stripe webhook signature verification failed');
    return new Response('Invalid signature', { status: 400 });
  }

  let event;
  try { event = JSON.parse(body); }
  catch { return new Response('Invalid JSON', { status: 400 }); }

  // Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session   = event.data.object;
    const sessionId = session.id;
    const meta      = session.metadata || {};
    const pkg       = meta.package || 'basic';
    const credits   = parseInt(meta.credits || '1', 10);
    const companyId = meta.company_id ? parseInt(meta.company_id, 10) : null;

    console.log(`Checkout completed: ${sessionId}, package: ${pkg}, credits: ${credits}, company: ${companyId}`);

    if (env.DB) {
      try {
        // Update order status
        await env.DB.prepare(`
          UPDATE stripe_orders
          SET status = 'completed',
              stripe_payment_intent = ?,
              completed_at = datetime('now')
          WHERE checkout_session_id = ?
        `).bind(session.payment_intent || '', sessionId).run();

        // Add credits to company
        if (companyId) {
          await env.DB.prepare(`
            UPDATE companies
            SET jobs_remaining = jobs_remaining + ?,
                plan = ?
            WHERE id = ?
          `).bind(credits, pkg, companyId).run();
          console.log(`Added ${credits} credits to company ${companyId}`);
        } else {
          // No company ID — try to find by email
          const email = session.customer_details?.email || session.customer_email || '';
          if (email) {
            const user = await env.DB.prepare(
              `SELECT u.company_id FROM users u WHERE u.email = ? AND u.company_id IS NOT NULL`
            ).bind(email).first();

            if (user?.company_id) {
              await env.DB.prepare(`
                UPDATE companies
                SET jobs_remaining = jobs_remaining + ?,
                    plan = ?
                WHERE id = ?
              `).bind(credits, pkg, user.company_id).run();
              console.log(`Added ${credits} credits to company ${user.company_id} via email lookup`);
            } else {
              // Store a note — admin will need to manually assign
              console.warn(`Could not find company for email ${email} — manual credit assignment needed`);
              await env.DB.prepare(`
                UPDATE stripe_orders
                SET status = 'completed_unassigned'
                WHERE checkout_session_id = ?
              `).bind(sessionId).run();
            }
          }
        }
      } catch (err) {
        console.error('Webhook D1 error:', err.message);
      }
    }
  }

  return new Response('ok', { status: 200 });
}

// ── Admin billing dashboard ─────────────────────────────────────
export async function handleBillingAdmin(request, env, url, user) {
  if (user.role !== 'superadmin') return new Response('Forbidden', { status: 403 });

  const hasStripe = !!(env.STRIPE_SECRET_KEY);

  // Fetch recent orders from D1
  let orders = [];
  try {
    const result = await env.DB.prepare(`
      SELECT o.*, c.name as company_name
      FROM stripe_orders o
      LEFT JOIN companies c ON o.company_id = c.id
      ORDER BY o.created_at DESC
      LIMIT 50
    `).all();
    orders = result.results || [];
  } catch (err) {
    console.error('Billing query error:', err.message);
  }

  const totalRevenue = orders
    .filter(o => o.status === 'completed' || o.status === 'completed_unassigned')
    .reduce((sum, o) => sum + (o.amount_cents || 0), 0);

  const rows = orders.map(o => `
    <tr>
      <td style="font-family:monospace;font-size:.75rem;">${escHtml((o.checkout_session_id||'').slice(-12))}</td>
      <td>${escHtml(o.company_name || o.company_email || '—')}</td>
      <td><span class="tbl-btn ${o.package==='premium'?'tbl-btn-ok':o.package==='featured'?'':'tbl-btn-view'}">${escHtml(o.package||'—')}</span></td>
      <td>$${((o.amount_cents||0)/100).toFixed(2)}</td>
      <td>${o.credits || 1} credit${(o.credits||1)>1?'s':''}</td>
      <td><span class="tbl-btn ${o.status==='completed'?'tbl-btn-ok':o.status==='pending'?'':'tbl-btn-danger'}">${escHtml(o.status||'—')}</span></td>
      <td style="font-size:.78rem;">${o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}</td>
    </tr>`).join('');

  const body = `
    <div class="settings-header">
      <div>
        <h2>💳 Billing & Orders</h2>
        <p style="color:#888;font-family:sans-serif;font-size:.88rem;margin:4px 0 0;">
          Job board revenue — powered by Stripe
        </p>
      </div>
      <a href="https://dashboard.stripe.com" target="_blank" class="btn-admin-secondary">
        Stripe Dashboard →
      </a>
    </div>

    ${!hasStripe ? `
    <div class="alert-box alert-warn" style="margin-bottom:20px;">
      ⚠️ <strong>Stripe not configured.</strong> Add these secrets:
      <code style="display:block;margin:8px 0;padding:8px 12px;background:rgba(0,0,0,.05);border-radius:6px;font-size:.8rem;line-height:1.8;">
        STRIPE_SECRET_KEY       → sk_live_xxx (from Stripe Dashboard → API Keys)<br>
        STRIPE_WEBHOOK_SECRET   → whsec_xxx (from Stripe Dashboard → Webhooks)<br>
        STRIPE_PRICE_BASIC      → price_xxx (optional — or prices auto-created)<br>
        STRIPE_PRICE_FEATURED   → price_xxx<br>
        STRIPE_PRICE_PREMIUM    → price_xxx
      </code>
      Webhook endpoint to register in Stripe: <code>${escHtml((env.SITE_URL||'https://creston-iowa.com') + '/api/stripe/webhook')}</code><br>
      Events to listen for: <code>checkout.session.completed</code>
    </div>` : ''}

    <div class="admin-stats" style="margin-bottom:28px;">
      <div class="stat-card">
        <div class="stat-icon">💰</div>
        <div class="stat-num">$${(totalRevenue/100).toFixed(0)}</div>
        <div class="stat-label">Total Revenue</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📋</div>
        <div class="stat-num">${orders.filter(o=>o.status==='completed').length}</div>
        <div class="stat-label">Completed Orders</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⏳</div>
        <div class="stat-num">${orders.filter(o=>o.status==='pending').length}</div>
        <div class="stat-label">Pending</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⚠️</div>
        <div class="stat-num">${orders.filter(o=>o.status==='completed_unassigned').length}</div>
        <div class="stat-label">Unassigned</div>
      </div>
    </div>

    <h3 style="font-family:sans-serif;font-size:1rem;margin-bottom:12px;">Recent Orders (last 50)</h3>
    <table class="admin-table">
      <thead><tr><th>Session ID</th><th>Company / Email</th><th>Package</th><th>Amount</th><th>Credits</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#888;padding:24px;">No orders yet. Share <a href="/jobs/post">/jobs/post</a> with employers.</td></tr>'}</tbody>
    </table>

    <p style="font-family:sans-serif;font-size:.82rem;color:#888;margin-top:12px;">
      For detailed analytics, refunds, and dispute management visit the
      <a href="https://dashboard.stripe.com" target="_blank">Stripe Dashboard →</a>
    </p>`;

  return adminPage('💳 Billing', body, user);
}

// ── Stripe signature verification ─────────────────────────────
async function verifyStripeSignature(payload, sigHeader, secret) {
  try {
    const parts     = sigHeader.split(',');
    const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1];
    const signatures = parts.filter(p => p.startsWith('v1=')).map(p => p.split('=')[1]);

    if (!timestamp || !signatures.length) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const encoder       = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const computed = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    return signatures.some(s => s === computed);
  } catch (err) {
    console.error('Signature verification error:', err.message);
    return false;
  }
}

// ── Stripe API helper ──────────────────────────────────────────
function stripeRequest(env, method, path, body) {
  return fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type':  'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
    body: body?.toString(),
  });
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
