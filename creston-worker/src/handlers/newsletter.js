/**
 * src/handlers/newsletter.js
 * Newsletter management via Resend Broadcasts API.
 *
 * Requires secrets:
 *   RESEND_API_KEY      — your Resend API key
 *   RESEND_AUDIENCE_ID  — audience ID from Resend dashboard
 *
 * Admin routes:
 *   GET  /admin/newsletter           → subscriber stats + campaign list
 *   GET  /admin/newsletter/new       → campaign composer
 *   POST /admin/newsletter/send      → send broadcast via Resend
 *
 * Public routes:
 *   POST /subscribe                  → add subscriber to Resend audience
 *   GET  /unsubscribe?email=         → remove subscriber
 */

import { escHtml }   from '../shell.js';
import { adminPage } from './admin.js';

const RESEND_API = 'https://api.resend.com';

// ── Admin UI ───────────────────────────────────────────────────
export async function handleNewsletterAdmin(request, env, url, user) {
  if (user.role !== 'superadmin') return new Response('Forbidden', { status: 403 });

  const path = url.pathname;

  if (path === '/admin/newsletter/new') {
    return renderCampaignComposer(env, user);
  }

  if (path === '/admin/newsletter/send' && request.method === 'POST') {
    return sendBroadcast(request, env, user);
  }

  if (path === '/admin/newsletter/subscribers') {
    return renderSubscriberList(env, user);
  }

  return renderNewsletterDashboard(env, user);
}

// ── Newsletter dashboard ───────────────────────────────────────
async function renderNewsletterDashboard(env, user) {
  const hasKeys = !!(env.RESEND_API_KEY && env.RESEND_AUDIENCE_ID);

  let stats = { total: 0, subscribed: 0, unsubscribed: 0 };
  let broadcasts = [];

  if (hasKeys) {
    try {
      // Get audience stats
      const audienceRes = await fetch(`${RESEND_API}/audiences/${env.RESEND_AUDIENCE_ID}`, {
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}` }
      });
      if (audienceRes.ok) {
        const data = await audienceRes.json();
        stats = data || stats;
      }

      // Get broadcasts list
      const broadRes = await fetch(`${RESEND_API}/broadcasts`, {
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}` }
      });
      if (broadRes.ok) {
        const data = await broadRes.json();
        broadcasts = (data.data || []).slice(0, 10);
      }
    } catch (err) {
      console.error('Newsletter API error:', err);
    }
  }

  const broadcastRows = broadcasts.map(b => `
    <tr>
      <td><strong>${escHtml(b.name || b.subject || 'Untitled')}</strong></td>
      <td>${escHtml(b.status || '—')}</td>
      <td>${b.created_at ? new Date(b.created_at).toLocaleDateString() : '—'}</td>
      <td>${b.metrics?.recipients || '—'}</td>
      <td>${b.metrics?.open_rate ? Math.round(b.metrics.open_rate * 100) + '%' : '—'}</td>
    </tr>`).join('');

  const body = `
    <div class="settings-header">
      <div>
        <h2>📧 Newsletter</h2>
        <p style="color:#888;font-family:sans-serif;font-size:.88rem;margin:4px 0 0;">
          Powered by Resend Broadcasts
        </p>
      </div>
      <a href="/admin/newsletter/new" class="btn-admin-primary">+ New Campaign</a>
    </div>

    ${!hasKeys ? `
    <div class="alert-box alert-warn">
      ⚠️ <strong>Setup required.</strong> Add these secrets to your Cloudflare Pages environment:
      <code style="display:block;margin:8px 0;padding:8px 12px;background:rgba(0,0,0,.05);border-radius:6px;font-size:.82rem;">
        RESEND_API_KEY &nbsp;&nbsp;&nbsp;— from resend.com/api-keys<br>
        RESEND_AUDIENCE_ID — from resend.com/audiences
      </code>
      <a href="https://resend.com/audiences" target="_blank">Create an audience in Resend →</a>
    </div>` : ''}

    <div class="admin-stats" style="margin-bottom:28px;">
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-num">${stats.total || 0}</div>
        <div class="stat-label">Total Subscribers</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">✅</div>
        <div class="stat-num">${stats.subscribed || 0}</div>
        <div class="stat-label">Active</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📤</div>
        <div class="stat-num">${broadcasts.length}</div>
        <div class="stat-label">Campaigns Sent</div>
      </div>
    </div>

    <h3 style="font-family:sans-serif;font-size:1rem;margin-bottom:12px;">Recent Campaigns</h3>
    <table class="admin-table">
      <thead><tr><th>Campaign</th><th>Status</th><th>Date</th><th>Recipients</th><th>Open Rate</th></tr></thead>
      <tbody>${broadcastRows || '<tr><td colspan="5" style="text-align:center;color:#888;padding:24px;">No campaigns yet. <a href="/admin/newsletter/new">Create one →</a></td></tr>'}</tbody>
    </table>

    <div style="margin-top:16px;font-family:sans-serif;font-size:.82rem;color:#888;">
      💡 Subscriber list management, unsubscribe handling, and bounce processing are handled automatically by
      <a href="https://resend.com/audiences" target="_blank">Resend Audiences</a>.
    </div>`;

  return adminPage('📧 Newsletter', body, user);
}

// ── Campaign composer ──────────────────────────────────────────
async function renderCampaignComposer(env, user) {
  const body = `
    <div class="editor-header">
      <a href="/admin/newsletter" class="back-link">← Back to Newsletter</a>
      <h2>📧 New Campaign</h2>
    </div>
    <div class="editor-layout">
      <div class="editor-main">
        <div class="form-group" style="margin-bottom:16px;">
          <label class="form-label">Campaign Name (internal reference) *</label>
          <input type="text" id="campaign-name" class="form-input" placeholder="March 2025 Newsletter">
        </div>
        <div class="form-group" style="margin-bottom:16px;">
          <label class="form-label">Subject Line *</label>
          <input type="text" id="campaign-subject" class="form-input" placeholder="What's new in Creston this week">
        </div>
        <div class="form-group" style="margin-bottom:16px;">
          <label class="form-label">Preview Text</label>
          <input type="text" id="campaign-preview" class="form-input" placeholder="Short preview shown in email clients...">
        </div>
        <div class="editor-toolbar">
          <button type="button" onclick="ins('**','**')"><strong>B</strong></button>
          <button type="button" onclick="ins('*','*')"><em>I</em></button>
          <button type="button" onclick="ins('## ','')">H2</button>
          <button type="button" onclick="ins('### ','')">H3</button>
          <button type="button" onclick="ins('- ','')">• List</button>
          <button type="button" onclick="ins('[text](',')')">🔗 Link</button>
          <span class="toolbar-sep"></span>
          <button type="button" onclick="insertNewsTemplate()" style="color:#c9933a;">📋 Insert Template</button>
        </div>
        <textarea id="md-editor" class="md-editor" rows="20" placeholder="Write your newsletter content in markdown...

## What's New in Creston

Your content here...

---
*To unsubscribe, click the unsubscribe link in this email.*"></textarea>
        <div class="editor-actions" style="margin-top:16px;">
          <button onclick="sendCampaign('send')" class="btn-admin-primary">🚀 Send Now</button>
          <button onclick="sendCampaign('schedule')" class="btn-admin-secondary">📅 Schedule</button>
        </div>
        <div id="send-status" style="margin-top:12px;font-family:sans-serif;font-size:.9rem;min-height:1.4em;"></div>
      </div>
      <div class="editor-sidebar">
        <div class="preview-panel">
          <div class="preview-header">Email Preview</div>
          <div id="preview" class="preview-body markdown-body"></div>
        </div>
        <div class="sidebar-widget" style="margin-top:16px;">
          <div class="widget-header">✅ Pre-send Checklist</div>
          <div class="widget-body" style="font-family:sans-serif;font-size:.82rem;line-height:2;">
            <label><input type="checkbox"> Subject line set</label><br>
            <label><input type="checkbox"> Content proofread</label><br>
            <label><input type="checkbox"> Links tested</label><br>
            <label><input type="checkbox"> Unsubscribe note included</label>
          </div>
        </div>
      </div>
    </div>

    <script>
      const TOKEN = sessionStorage.getItem('admin_token') || '';
      const ed    = document.getElementById('md-editor');
      const prev  = document.getElementById('preview');
      const st    = document.getElementById('send-status');

      ed.addEventListener('input', render); render();

      function render() {
        let h = ed.value
          .replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>')
          .replace(/^# (.+)$/gm,'<h1>$1</h1>')
          .replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>').replace(/\\*(.+?)\\*/g,'<em>$1</em>')
          .replace(/^- (.+)$/gm,'<li>$1</li>')
          .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g,'<a href="$2">$1</a>')
          .replace(/^---$/gm,'<hr>')
          .split('\\n\\n').map(b => {
            b = b.trim();
            if (!b) return '';
            if (/^<(h[1-6]|li|hr)/.test(b)) return b;
            return '<p>' + b.replace(/\\n/g,'<br>') + '</p>';
          }).join('');
        prev.innerHTML = h;
      }

      function ins(a, b) {
        const s = ed.selectionStart, e = ed.selectionEnd, sel = ed.value.slice(s, e);
        ed.value = ed.value.slice(0,s) + a + sel + b + ed.value.slice(e);
        ed.selectionStart = s + a.length; ed.selectionEnd = e + a.length;
        ed.focus(); render();
      }

      function insertNewsTemplate() {
        const today = new Date().toLocaleDateString('en-US', { month:'long', year:'numeric' });
        ed.value = \`## Creston Community Update — \${today}

Hello Creston neighbors,

Here's what's happening in our community this week.

## 📰 Latest News

*Add news highlights here...*

## 💼 Job Opportunities

New jobs posted on the [Creston Job Board](https://creston-iowa.com/jobs).

## 🎈 Upcoming Events & Attractions

*Add events here...*

## 🍽️ Dining

*Restaurant news or specials...*

---

Thanks for being part of the Creston community!

[Visit Creston Iowa](https://creston-iowa.com) | [Unsubscribe]({{unsubscribe_url}})\`;
        render();
      }

      async function sendCampaign(action) {
        const name     = document.getElementById('campaign-name').value.trim();
        const subject  = document.getElementById('campaign-subject').value.trim();
        const preview  = document.getElementById('campaign-preview').value.trim();
        const content  = ed.value.trim();

        if (!name)    { alert('Enter a campaign name.'); return; }
        if (!subject) { alert('Enter a subject line.'); return; }
        if (!content) { alert('Write some content.'); return; }
        if (!TOKEN)   { alert('Session expired — log out and back in.'); return; }

        if (action === 'send' && !confirm(\`Send this campaign to all active subscribers?\\n\\nSubject: \${subject}\`)) return;

        st.textContent = '⏳ Sending campaign...';
        st.style.color = '#888';

        try {
          const r = await fetch('/admin/newsletter/send', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
            body:    JSON.stringify({ name, subject, preview, content }),
          });
          const data = await r.json();
          if (r.ok && data.ok) {
            st.textContent = '🚀 Campaign sent successfully! Check Resend dashboard for delivery stats.';
            st.style.color = '#2d5a3d';
          } else {
            st.textContent = '❌ Error: ' + (data.error || r.status);
            st.style.color = '#b84040';
          }
        } catch(e) {
          st.textContent = '❌ ' + e.message;
          st.style.color = '#b84040';
        }
      }
    </script>`;

  return adminPage('📧 New Campaign', body, user);
}

// ── Send broadcast ─────────────────────────────────────────────
async function sendBroadcast(request, env, user) {
  if (!env.RESEND_API_KEY || !env.RESEND_AUDIENCE_ID) {
    return jsonRes({ error: 'RESEND_API_KEY and RESEND_AUDIENCE_ID secrets required' }, 400);
  }

  try {
    const { name, subject, preview, content } = await request.json();
    if (!subject || !content) return jsonRes({ error: 'subject and content required' }, 400);

    // Convert markdown to HTML for email
    const html = markdownToEmailHtml(content, subject);

    // Create broadcast in Resend
    const createRes = await fetch(`${RESEND_API}/broadcasts`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        audience_id:  env.RESEND_AUDIENCE_ID,
        from:         env.CONTACT_FROM || `newsletter@creston-iowa.com`,
        name:         name || subject,
        subject,
        preview_text: preview || '',
        html,
      }),
    });

    const createData = await createRes.json();
    if (!createRes.ok) {
      return jsonRes({ error: createData.message || 'Failed to create broadcast' }, 400);
    }

    const broadcastId = createData.id;

    // Send the broadcast
    const sendRes = await fetch(`${RESEND_API}/broadcasts/${broadcastId}/send`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({}),
    });

    const sendData = await sendRes.json();
    if (!sendRes.ok) {
      return jsonRes({ error: sendData.message || 'Failed to send broadcast' }, 400);
    }

    return jsonRes({ ok: true, id: broadcastId });

  } catch (err) {
    console.error('sendBroadcast error:', err);
    return jsonRes({ error: err.message }, 500);
  }
}

// ── Public subscribe/unsubscribe ───────────────────────────────
export async function handleSubscribe(request, env) {
  if (!env.RESEND_API_KEY || !env.RESEND_AUDIENCE_ID) {
    return jsonRes({ error: 'Newsletter not configured' }, 503);
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let email, firstName;
  const ct = request.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    const body = await request.json();
    email     = body.email;
    firstName = body.first_name || body.name || '';
  } else {
    const fd  = await request.formData();
    email     = fd.get('email');
    firstName = fd.get('first_name') || fd.get('name') || '';
  }

  if (!email || !email.includes('@')) {
    return jsonRes({ error: 'Valid email required' }, 400);
  }

  try {
    const res = await fetch(`${RESEND_API}/audiences/${env.RESEND_AUDIENCE_ID}/contacts`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        email,
        first_name:   firstName,
        unsubscribed: false,
      }),
    });

    const data = await res.json();
    if (!res.ok && !data.name?.includes('already_exists')) {
      return jsonRes({ error: data.message || 'Subscribe failed' }, 400);
    }

    // JSON request → JSON response (for fetch-based forms)
    if (ct.includes('application/json')) {
      return jsonRes({ ok: true });
    }

    // Form POST → redirect back with success
    const referer = request.headers.get('Referer') || '/';
    return new Response(null, { status: 302, headers: { Location: referer + '?subscribed=1' } });

  } catch (err) {
    return jsonRes({ error: err.message }, 500);
  }
}

// ── Subscriber list ────────────────────────────────────────────
async function renderSubscriberList(env, user) {
  let contacts = [];
  if (env.RESEND_API_KEY && env.RESEND_AUDIENCE_ID) {
    try {
      const res = await fetch(`${RESEND_API}/audiences/${env.RESEND_AUDIENCE_ID}/contacts`, {
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}` }
      });
      if (res.ok) {
        const data = await res.json();
        contacts = data.data || [];
      }
    } catch {}
  }

  const rows = contacts.map(c => `
    <tr>
      <td>${escHtml(c.email)}</td>
      <td>${escHtml(c.first_name || '—')}</td>
      <td><span class="tbl-btn ${c.unsubscribed ? 'tbl-btn-danger' : 'tbl-btn-ok'}">${c.unsubscribed ? 'Unsubscribed' : 'Active'}</span></td>
      <td>${c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
    </tr>`).join('');

  const body = `
    <div class="list-header">
      <div>
        <a href="/admin/newsletter" class="back-link">← Newsletter</a>
        <h2 style="margin-top:8px;">Subscribers (${contacts.length})</h2>
      </div>
      <a href="https://resend.com/audiences/${env.RESEND_AUDIENCE_ID || ''}" target="_blank" class="btn-admin-secondary">
        Manage in Resend →
      </a>
    </div>
    <table class="admin-table">
      <thead><tr><th>Email</th><th>Name</th><th>Status</th><th>Subscribed</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#888;padding:24px;">No subscribers yet</td></tr>'}</tbody>
    </table>`;

  return adminPage('👥 Subscribers', body, user);
}

// ── Markdown → email HTML ──────────────────────────────────────
function markdownToEmailHtml(md, subject) {
  const body = md
    .replace(/^### (.+)$/gm, '<h3 style="color:#1a3a2a;font-family:Georgia,serif;margin:20px 0 8px;">$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2 style="color:#1a3a2a;font-family:Georgia,serif;margin:24px 0 10px;border-bottom:2px solid #e0e0e0;padding-bottom:8px;">$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1 style="color:#1a3a2a;font-family:Georgia,serif;margin:0 0 16px;">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,    '<em>$1</em>')
    .replace(/^- (.+)$/gm,   '<li style="margin:4px 0;">$1</li>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#2d5a3d;">$1</a>')
    .replace(/^---$/gm,      '<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;">')
    .split('\n\n').map(b => {
      b = b.trim();
      if (!b) return '';
      if (/^<(h[1-6]|li|hr)/.test(b)) return b;
      return `<p style="margin:0 0 16px;line-height:1.7;color:#333;">${b.replace(/\n/g,'<br>')}</p>`;
    }).join('\n');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#1a3a2a;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
      <h1 style="margin:0;color:white;font-family:Georgia,serif;font-size:1.5rem;">🌾 Creston, Iowa</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.7);font-size:.85rem;">Community Newsletter</p>
    </div>
    <div style="background:white;padding:32px;border:1px solid #e0e0e0;border-top:none;">
      ${body}
    </div>
    <div style="background:#f0f0f0;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;font-size:.75rem;color:#888;">
      You're receiving this because you subscribed at creston-iowa.com.<br>
      <a href="{{unsubscribe_url}}" style="color:#888;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>`;
}

// ── Helpers ────────────────────────────────────────────────────
function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}