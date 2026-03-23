/**
 * src/handlers/sms.js
 * SMS alerts via Twilio.
 *
 * Required secrets:
 *   TWILIO_ACCOUNT_SID  — from Twilio console
 *   TWILIO_AUTH_TOKEN   — from Twilio console
 *   TWILIO_FROM_NUMBER  — your Twilio phone number (+16411234567)
 *
 * Public:
 *   POST /api/sms/subscribe   → opt-in (called from /subscribe page)
 *   POST /api/sms/unsubscribe → opt-out (from SMS reply or web link)
 *
 * Admin:
 *   GET  /admin/sms           → subscriber list + send interface
 *   POST /admin/sms/send      → send to all or category subscribers
 */

import { adminPage }    from './admin-page.js';
import { getSiteConfig } from '../db/site.js';
import { escapeHtml }   from '../shell.js';

const TWILIO_API = 'https://api.twilio.com/2010-04-01';

// ── Public: subscribe ─────────────────────────────────────────
export async function handleSMSSubscribe(request, env) {
  try {
    const body  = await request.json();
    const phone = normalizePhone(body.phone || '');
    if (!phone) return jsonRes({ error: 'Valid US phone number required' }, 400);

    const existing = await env.DB.prepare(
      `SELECT id, active FROM sms_subscribers WHERE phone = ?`
    ).bind(phone).first().catch(() => null);

    if (existing) {
      if (!existing.active) {
        await env.DB.prepare(
          `UPDATE sms_subscribers SET active = 1, opted_out_at = NULL, opted_in_at = datetime('now') WHERE phone = ?`
        ).bind(phone).run();
      }
    } else {
      await env.DB.prepare(
        `INSERT INTO sms_subscribers (phone, name, categories) VALUES (?, ?, 'all')`
      ).bind(phone, body.name || '').run();
    }

    // Send welcome SMS
    if (env.TWILIO_ACCOUNT_SID) {
      const cfg = await getSiteConfig(env);
      await sendSMS(env, phone,
        `You're subscribed to ${cfg.name || 'Creston, Iowa'} alerts! Reply STOP to unsubscribe.`
      );
    }

    return jsonRes({ ok: true });
  } catch (err) {
    return jsonRes({ error: err.message }, 500);
  }
}

// ── Public: unsubscribe ───────────────────────────────────────
export async function handleSMSUnsubscribe(request, env) {
  try {
    const body  = await request.json().catch(() => ({}));
    const phone = normalizePhone(body.phone || '');
    if (!phone) return jsonRes({ error: 'Phone required' }, 400);

    await env.DB.prepare(
      `UPDATE sms_subscribers SET active = 0, opted_out_at = datetime('now') WHERE phone = ?`
    ).bind(phone).run().catch(() => {});

    return jsonRes({ ok: true });
  } catch (err) {
    return jsonRes({ error: err.message }, 500);
  }
}

// ── Twilio webhook: inbound SMS (handle STOP/START) ───────────
export async function handleSMSWebhook(request, env) {
  const text  = await request.text();
  const params = new URLSearchParams(text);
  const from  = params.get('From') || '';
  const body  = (params.get('Body') || '').trim().toUpperCase();

  if (body === 'STOP' || body === 'UNSUBSCRIBE' || body === 'CANCEL') {
    await env.DB.prepare(
      `UPDATE sms_subscribers SET active = 0, opted_out_at = datetime('now') WHERE phone = ?`
    ).bind(from).run().catch(() => {});
  } else if (body === 'START' || body === 'SUBSCRIBE') {
    await env.DB.prepare(
      `UPDATE sms_subscribers SET active = 1, opted_out_at = NULL WHERE phone = ?`
    ).bind(from).run().catch(() => {});
  }

  // Twilio expects TwiML response
  return new Response('<Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  });
}

// ── Send SMS to all subscribers (or category) ─────────────────
export async function sendBulkSMS(env, message, category = 'all', sentBy = null) {
  if (!env.TWILIO_ACCOUNT_SID) throw new Error('Twilio not configured');

  const where = category === 'all'
    ? `active = 1`
    : `active = 1 AND (categories = 'all' OR categories LIKE '%${category}%')`;

  const subs = await env.DB.prepare(
    `SELECT phone FROM sms_subscribers WHERE ${where} LIMIT 1000`
  ).all().catch(() => ({ results: [] }));

  const phones = (subs.results || []).map(r => r.phone);
  let sent = 0, failed = 0;

  for (const phone of phones) {
    const result = await sendSMS(env, phone, message);
    if (result.ok) sent++; else failed++;
  }

  // Log
  await env.DB.prepare(
    `INSERT INTO sms_messages (message, category, recipients, sent_by, status) VALUES (?,?,?,?,'sent')`
  ).bind(message, category, sent, sentBy).run().catch(() => {});

  return { sent, failed, total: phones.length };
}

// ── Send single SMS via Twilio ────────────────────────────────
export async function sendSMS(env, to, body) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    return { ok: false, error: 'Twilio not configured' };
  }
  try {
    const params = new URLSearchParams({
      To:   to,
      From: env.TWILIO_FROM_NUMBER || '',
      Body: body,
    });
    const res = await fetch(
      `${TWILIO_API}/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: params,
      }
    );
    const data = await res.json();
    if (data.status === 'queued' || data.status === 'sent') return { ok: true, sid: data.sid };
    return { ok: false, error: data.message || data.code };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Admin page ─────────────────────────────────────────────────
export async function handleSMSAdmin(request, env, url, user) {
  if (user.role !== 'superadmin') return new Response('Forbidden', { status: 403 });

  const hasTwilio = !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);

  // Send bulk SMS
  if (url.pathname === '/admin/sms/send' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (!body.message?.trim()) return jsonRes({ error: 'Message required' }, 400);
    if (!hasTwilio) return jsonRes({ error: 'Twilio not configured' }, 503);
    const result = await sendBulkSMS(env, body.message, body.category || 'all', user.id);
    return jsonRes({ ok: true, ...result });
  }

  // Load subscribers + log
  const [subs, messages] = await Promise.all([
    env.DB.prepare(`SELECT * FROM sms_subscribers ORDER BY opted_in_at DESC LIMIT 100`).all().catch(()=>({results:[]})),
    env.DB.prepare(`SELECT * FROM sms_messages ORDER BY created_at DESC LIMIT 20`).all().catch(()=>({results:[]})),
  ]);

  const activeCount = (subs.results||[]).filter(s => s.active).length;

  const subRows = (subs.results||[]).map(s => `
    <tr>
      <td style="font-family:monospace;font-size:.82rem;">${escapeHtml(maskPhone(s.phone))}</td>
      <td>${escapeHtml(s.name||'—')}</td>
      <td><span class="tbl-btn ${s.active?'tbl-btn-ok':'tbl-btn-danger'}">${s.active?'Active':'Opted out'}</span></td>
      <td style="font-size:.78rem;">${s.opted_in_at ? new Date(s.opted_in_at).toLocaleDateString() : '—'}</td>
    </tr>`).join('');

  const msgRows = (messages.results||[]).map(m => `
    <tr>
      <td style="font-size:.78rem;">${m.created_at ? new Date(m.created_at).toLocaleString() : '—'}</td>
      <td>${escapeHtml((m.message||'').slice(0,60))}${(m.message||'').length>60?'…':''}</td>
      <td>${m.recipients||0} sent</td>
      <td><span class="tbl-btn tbl-btn-ok">${escapeHtml(m.status||'sent')}</span></td>
    </tr>`).join('');

  const body = `
    <div class="settings-header">
      <div><h2>📱 SMS Alerts</h2>
      <p style="color:#888;font-family:sans-serif;font-size:.88rem;margin:4px 0 0;">
        ${activeCount} active subscriber${activeCount!==1?'s':''} · powered by Twilio
      </p></div>
    </div>

    ${!hasTwilio ? `
    <div style="background:#fde8e8;border:1.5px solid #e0a0a0;border-radius:8px;padding:14px 18px;margin-bottom:20px;font-family:sans-serif;font-size:.85rem;color:#b84040;">
      ⚠️ <strong>Twilio not configured.</strong> Add these secrets:<br>
      <code style="display:block;margin:8px 0;padding:8px;background:rgba(0,0,0,.05);border-radius:4px;line-height:2;">
        TWILIO_ACCOUNT_SID<br>TWILIO_AUTH_TOKEN<br>TWILIO_FROM_NUMBER
      </code>
      Webhook URL for inbound SMS (STOP handling):
      <code>https://creston-iowa.com/api/sms/webhook</code>
    </div>` : ''}

    <div style="background:white;border:1.5px solid #e0e0e0;border-radius:10px;padding:20px;margin-bottom:24px;">
      <h3 style="font-family:sans-serif;font-size:.95rem;margin-bottom:14px;">Send Alert</h3>
      <div style="display:flex;flex-direction:column;gap:10px;max-width:540px;">
        <div>
          <label class="form-label">Message (160 chars max for 1 SMS)</label>
          <textarea id="sms-msg" class="form-input" rows="3" maxlength="320"
            placeholder="⚠️ City Hall closed Monday for holiday. Regular hours resume Tuesday."></textarea>
          <div style="font-family:sans-serif;font-size:.72rem;color:#888;margin-top:3px;" id="sms-count">0 / 160</div>
        </div>
        <div>
          <label class="form-label">Send to</label>
          <select id="sms-cat" class="form-select" style="max-width:220px;">
            <option value="all">All subscribers (${activeCount})</option>
            <option value="emergency">Emergency alerts only</option>
            <option value="news">News subscribers</option>
            <option value="events">Events subscribers</option>
          </select>
        </div>
        <div>
          <button onclick="sendSMS()" class="btn-admin-primary" ${!hasTwilio?'disabled':''}>📱 Send SMS</button>
          <span id="sms-status" style="font-family:sans-serif;font-size:.83rem;margin-left:12px;"></span>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div>
        <h3 style="font-family:sans-serif;font-size:.92rem;margin-bottom:10px;">Subscribers (${(subs.results||[]).length})</h3>
        <table class="admin-table">
          <thead><tr><th>Phone</th><th>Name</th><th>Status</th><th>Joined</th></tr></thead>
          <tbody>${subRows||'<tr><td colspan="4" style="text-align:center;color:#888;padding:16px;">No subscribers yet.</td></tr>'}</tbody>
        </table>
      </div>
      <div>
        <h3 style="font-family:sans-serif;font-size:.92rem;margin-bottom:10px;">Recent Messages</h3>
        <table class="admin-table">
          <thead><tr><th>Sent</th><th>Message</th><th>Delivery</th><th>Status</th></tr></thead>
          <tbody>${msgRows||'<tr><td colspan="4" style="text-align:center;color:#888;padding:16px;">No messages yet.</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <script>
      const TOKEN=sessionStorage.getItem('admin_token')||'';
      const H={'Content-Type':'application/json','Authorization':'Bearer '+TOKEN};
      const msg=document.getElementById('sms-msg');
      const cnt=document.getElementById('sms-count');
      if(msg)msg.addEventListener('input',()=>{
        const l=msg.value.length;
        cnt.textContent=l+' / 160'+(l>160?' (2 messages)':'');
        cnt.style.color=l>160?'#c9933a':'#888';
      });
      async function sendSMS(){
        const st=document.getElementById('sms-status');
        const message=msg.value.trim();
        const category=document.getElementById('sms-cat').value;
        if(!message){st.textContent='⚠️ Enter a message.';st.style.color='#c9933a';return;}
        if(!confirm('Send SMS to '+category+' subscribers?'))return;
        st.textContent='⏳ Sending...';st.style.color='#888';
        const r=await fetch('/admin/sms/send',{method:'POST',headers:H,body:JSON.stringify({message,category})});
        const d=await r.json();
        if(d.ok){st.textContent='✅ Sent to '+d.sent+' subscribers'+(d.failed?' ('+d.failed+' failed)':'');st.style.color='#2d5a3d';}
        else{st.textContent='❌ '+(d.error||'Failed');st.style.color='#b84040';}
      }
    </script>`;

  return adminPage('📱 SMS Alerts', body, user);
}

// ── Helpers ────────────────────────────────────────────────────
function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return '';
}

function maskPhone(phone) {
  return phone.replace(/(\+\d)(\d{3})(\d{3})(\d{4})/, '$1($2)***-$4');
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
