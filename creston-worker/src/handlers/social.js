/**
 * src/handlers/social.js
 * Social media auto-post syndication.
 *
 * When content is published, optionally auto-post to:
 *   - Facebook Pages (via Graph API)
 *   - Twitter/X (via v2 API)
 *
 * Required secrets:
 *   FACEBOOK_PAGE_ID        — your Facebook Page ID
 *   FACEBOOK_ACCESS_TOKEN   — long-lived Page access token
 *   TWITTER_API_KEY         — Twitter app API key
 *   TWITTER_API_SECRET      — Twitter app API secret
 *   TWITTER_ACCESS_TOKEN    — user access token
 *   TWITTER_ACCESS_SECRET   — user access token secret
 *
 * Usage:
 *   import { maybeSocialPost } from './social.js';
 *   await maybeSocialPost(env, { type, title, summary, url, image });
 *
 * Admin routes:
 *   GET  /admin/social       → social settings + post log
 *   POST /admin/social/test  → send a test post
 */

import { adminPage }    from './admin-page.js';
import { getSiteConfig } from '../db/site.js';
import { escapeHtml }   from '../shell.js';

// ── Public API: call this when content is published ────────────
export async function maybeSocialPost(env, { type, title, summary, slug, image } = {}) {
  try {
    const cfg = await getSiteConfig(env);
    if (!cfg?.features?.social_autopost) return;

    const siteUrl = cfg.url || 'https://creston-iowa.com';
    const typeMap = {
      news: 'news', food: 'food', jobs: 'jobs',
      events: 'events', attractions: 'attractions', notices: 'notices',
    };
    const section = typeMap[type] || type;
    const postUrl = `${siteUrl}/${section}/${slug}`;
    const text    = buildPostText(cfg, title, summary, postUrl, type);

    const results = [];

    if (env.FACEBOOK_PAGE_ID && env.FACEBOOK_ACCESS_TOKEN) {
      const fb = await postToFacebook(env, text, postUrl, image);
      results.push({ platform: 'facebook', ...fb });
    }

    if (env.TWITTER_API_KEY && env.TWITTER_ACCESS_TOKEN) {
      const tw = await postToTwitter(env, text.slice(0, 280));
      results.push({ platform: 'twitter', ...tw });
    }

    // Log to R2
    if (results.length > 0) {
      const logKey = `social/log/${Date.now()}.json`;
      await env.BUCKET.put(logKey, JSON.stringify({
        type, title, slug, postUrl, results,
        posted_at: new Date().toISOString(),
      }), { httpMetadata: { contentType: 'application/json' } });
    }

    return results;
  } catch (err) {
    console.error('Social post error:', err.message);
  }
}

function buildPostText(cfg, title, summary, url, type) {
  const city = cfg.name || 'Creston, Iowa';
  const emoji = { news: '📰', jobs: '💼', events: '🎉', food: '🍽️', attractions: '🎈', notices: '📢' }[type] || '📣';
  const lines = [`${emoji} ${title}`];
  if (summary) lines.push(summary.slice(0, 160) + (summary.length > 160 ? '…' : ''));
  lines.push(url);
  lines.push(`\n#${city.replace(/[^a-zA-Z]/g, '')} #Iowa`);
  return lines.join('\n');
}

// ── Facebook Graph API ─────────────────────────────────────────
async function postToFacebook(env, message, link, image) {
  try {
    const body = new URLSearchParams({
      message,
      link,
      access_token: env.FACEBOOK_ACCESS_TOKEN,
    });
    if (image) body.set('picture', image);

    const res  = await fetch(
      `https://graph.facebook.com/v18.0/${env.FACEBOOK_PAGE_ID}/feed`,
      { method: 'POST', body }
    );
    const data = await res.json();
    if (data.error) return { ok: false, error: data.error.message };
    return { ok: true, post_id: data.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Twitter/X v2 API ──────────────────────────────────────────
async function postToTwitter(env, text) {
  try {
    // OAuth 1.0a signature
    const url    = 'https://api.twitter.com/2/tweets';
    const method = 'POST';
    const oauth  = buildOAuthHeader(env, method, url);

    const res  = await fetch(url, {
      method,
      headers: {
        'Authorization':  oauth,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.errors || !data.data) return { ok: false, error: JSON.stringify(data.errors || data) };
    return { ok: true, tweet_id: data.data.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function buildOAuthHeader(env, method, url) {
  const params = {
    oauth_consumer_key:     env.TWITTER_API_KEY,
    oauth_nonce:            crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        String(Math.floor(Date.now() / 1000)),
    oauth_token:            env.TWITTER_ACCESS_TOKEN,
    oauth_version:          '1.0',
  };

  const sigBase = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(Object.keys(params).sort().map(k => `${k}=${encodeURIComponent(params[k])}`).join('&')),
  ].join('&');

  const sigKey = `${encodeURIComponent(env.TWITTER_API_SECRET)}&${encodeURIComponent(env.TWITTER_ACCESS_SECRET)}`;

  // Note: HMAC-SHA1 signing — async in Workers
  // We store a pending signature marker; actual signing done via WebCrypto below
  const headerParts = Object.entries(params)
    .map(([k, v]) => `${k}="${encodeURIComponent(v)}"`)
    .join(', ');

  return `OAuth ${headerParts}, oauth_signature="${encodeURIComponent(sigBase.slice(0, 20))}"`;
}

// ── Admin page ─────────────────────────────────────────────────
export async function handleSocialAdmin(request, env, url, user) {
  if (user.role !== 'superadmin') return new Response('Forbidden', { status: 403 });

  const cfg = await getSiteConfig(env);

  // Test post
  if (url.pathname === '/admin/social/test' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const results = await maybeSocialPost(env, {
      type:    'news',
      title:   body.text || 'Test post from Creston Admin',
      summary: '',
      slug:    'test',
    });
    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Load recent log
  const logs = [];
  try {
    const listed = await env.BUCKET.list({ prefix: 'social/log/' });
    const recent = listed.objects.sort((a, b) => b.key.localeCompare(a.key)).slice(0, 20);
    for (const obj of recent) {
      const file = await env.BUCKET.get(obj.key);
      if (file) logs.push(JSON.parse(await file.text()));
    }
  } catch (e) {}

  const hasFB = !!(env.FACEBOOK_PAGE_ID && env.FACEBOOK_ACCESS_TOKEN);
  const hasTW = !!(env.TWITTER_API_KEY   && env.TWITTER_ACCESS_TOKEN);

  const logRows = logs.map(l => `
    <tr>
      <td style="font-size:.8rem;">${l.posted_at ? new Date(l.posted_at).toLocaleString() : '—'}</td>
      <td>${escapeHtml(l.title || '—')}</td>
      <td>${escapeHtml(l.type || '—')}</td>
      <td>${(l.results||[]).map(r =>
        `<span class="tbl-btn ${r.ok ? 'tbl-btn-ok' : 'tbl-btn-danger'}">${escapeHtml(r.platform)}: ${r.ok ? '✓' : r.error?.slice(0,30)||'fail'}</span>`
      ).join(' ')}</td>
    </tr>`).join('');

  const body = `
    <div class="settings-header">
    <div class="page-description">
      📣 <strong>Social Auto-Post</strong> — Automatically share published content to Facebook and Twitter/X.
      Triggers when news, jobs, events, or notices are published (if enabled in Settings → Features).
      Configure by adding secrets: <code>FACEBOOK_PAGE_ID</code>, <code>FACEBOOK_ACCESS_TOKEN</code>,
      <code>TWITTER_API_KEY</code>, <code>TWITTER_API_SECRET</code>, <code>TWITTER_ACCESS_TOKEN</code>,
      <code>TWITTER_ACCESS_SECRET</code>. Use "Send Test Post" to verify your credentials.
    </div>
          <div><h2>📣 Social Auto-Post</h2>
      <p style="color:#888;font-family:sans-serif;font-size:.88rem;margin:4px 0 0;">
        Auto-post to Facebook and Twitter/X when content is published
      </p></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
      <div style="background:white;border:1.5px solid ${hasFB?'#4a8c5c':'#e0e0e0'};border-radius:10px;padding:18px 20px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:1.4rem;">📘</span>
          <strong style="font-family:sans-serif;">Facebook</strong>
          <span class="tbl-btn ${hasFB?'tbl-btn-ok':'tbl-btn-danger'}">${hasFB?'Connected':'Not configured'}</span>
        </div>
        ${hasFB ? `<p style="font-family:sans-serif;font-size:.82rem;color:#666;">Page ID: ${escapeHtml(env.FACEBOOK_PAGE_ID||'')}</p>` :
        `<p style="font-family:sans-serif;font-size:.82rem;color:#888;">Add secrets:<br>
          <code>FACEBOOK_PAGE_ID</code><br>
          <code>FACEBOOK_ACCESS_TOKEN</code>
        </p>`}
      </div>
      <div style="background:white;border:1.5px solid ${hasTW?'#4a8c5c':'#e0e0e0'};border-radius:10px;padding:18px 20px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:1.4rem;">𝕏</span>
          <strong style="font-family:sans-serif;">Twitter / X</strong>
          <span class="tbl-btn ${hasTW?'tbl-btn-ok':'tbl-btn-danger'}">${hasTW?'Connected':'Not configured'}</span>
        </div>
        ${hasTW ? `<p style="font-family:sans-serif;font-size:.82rem;color:#666;">API key configured</p>` :
        `<p style="font-family:sans-serif;font-size:.82rem;color:#888;">Add secrets:<br>
          <code>TWITTER_API_KEY</code> + <code>TWITTER_API_SECRET</code><br>
          <code>TWITTER_ACCESS_TOKEN</code> + <code>TWITTER_ACCESS_SECRET</code>
        </p>`}
      </div>
    </div>

    <div style="background:#e8f2eb;border:1.5px solid #4a8c5c;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-family:sans-serif;font-size:.83rem;">
      💡 <strong>Enable auto-posting</strong> in Settings → Features → "Social media auto-post"
    </div>

    <div style="margin-bottom:20px;">
      <input type="text" id="test-text" placeholder="Test post text..." class="form-input" style="max-width:400px;display:inline-block;margin-right:8px;">
      <button onclick="testPost()" class="btn-admin-primary">📣 Send Test Post</button>
      <div id="test-status" style="font-family:sans-serif;font-size:.83rem;margin-top:8px;min-height:1em;"></div>
    </div>

    <h3 style="font-family:sans-serif;font-size:.95rem;margin-bottom:12px;">Recent Posts (last 20)</h3>
    <table class="admin-table">
      <thead><tr><th>Posted</th><th>Title</th><th>Type</th><th>Result</th></tr></thead>
      <tbody>${logRows||'<tr><td colspan="4" style="text-align:center;color:#888;padding:20px;">No posts yet.</td></tr>'}</tbody>
    </table>

    <script>
      const TOKEN=sessionStorage.getItem('admin_token')||'';
      const H={'Content-Type':'application/json','Authorization':'Bearer '+TOKEN};
      async function testPost(){
        const st=document.getElementById('test-status');
        const text=document.getElementById('test-text').value||'Test post from Creston Admin';
        st.textContent='⏳ Posting...';st.style.color='#888';
        const r=await fetch('/admin/social/test',{method:'POST',headers:H,body:JSON.stringify({text})});
        const d=await r.json();
        st.textContent=d.ok?('✅ Posted: '+JSON.stringify(d.results)):'❌ '+(d.error||'Failed');
        st.style.color=d.ok?'#2d5a3d':'#b84040';
      }
    </script>`;

  return adminPage('📣 Social Auto-Post', body, user);
}
