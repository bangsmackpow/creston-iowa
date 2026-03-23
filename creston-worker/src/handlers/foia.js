/**
 * src/handlers/foia.js
 * FOIA / Open Records Request System.
 *
 * Public:
 *   GET  /foia               → request form + info
 *   POST /foia/submit        → submit request
 *   GET  /foia/track?id=     → status check
 *
 * Admin:
 *   GET  /admin/foia         → request queue
 *   POST /admin/foia/:id/update → update status, upload fulfillment
 */

import { renderShell, escHtml } from '../shell.js';
import { getSiteConfig }        from '../db/site.js';
import { adminPage }            from './admin.js';

const STATUS_LABELS = {
  received:   { label: 'Received',    color: '#2d5a3d', bg: '#e8f2eb' },
  in_review:  { label: 'In Review',   color: '#7a5a00', bg: '#fff3cd' },
  fulfilled:  { label: 'Fulfilled',   color: '#0c447c', bg: '#e6f1fb' },
  partial:    { label: 'Partial',     color: '#7a5a00', bg: '#fff3cd' },
  denied:     { label: 'Denied',      color: '#b84040', bg: '#fde8e8' },
};

const DEPARTMENTS = ['City Clerk', 'Police Department', 'Finance', 'Public Works', 'City Council', 'Other'];

export async function handleFOIA(request, env, url) {
  const path = url.pathname;
  if (path === '/foia/submit' && request.method === 'POST') return handleSubmit(request, env);
  if (path === '/foia/track') return handleTrack(request, env, url);
  return renderFOIAPage(request, env, url);
}

async function renderFOIAPage(request, env, url) {
  const cfg     = await getSiteConfig(env);
  const success = url.searchParams.get('success');
  const reqId   = url.searchParams.get('req');

  const content = `
    <section class="section">
      <div class="container" style="max-width:820px;">
        <div style="display:grid;grid-template-columns:1fr 300px;gap:32px;align-items:start;">
          <div>
            ${success ? `
            <div style="background:#e8f2eb;border:2px solid #4a8c5c;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
              <h3 style="color:#1a3a2a;margin-bottom:6px;">✅ Request Submitted</h3>
              <p style="color:#444;">Your FOIA request ID is <strong style="font-family:monospace;">${escHtml(reqId||'')}</strong>.
              You will receive a response within <strong>10 business days</strong> per Iowa law.</p>
            </div>` : ''}

            <h2 style="font-family:var(--font-display);font-size:1.4rem;color:var(--green-deep);margin-bottom:8px;">
              Open Records Request (FOIA)
            </h2>
            <p style="font-family:var(--font-ui);font-size:.88rem;color:#555;line-height:1.7;margin-bottom:20px;">
              Under the <strong>Iowa Open Records Act (Iowa Code Chapter 22)</strong>, you have the right to request
              access to public records maintained by the city. Requests must be fulfilled within
              <strong>10 business days</strong>. Some records may be exempt from disclosure.
            </p>

            <div id="submit-status" style="font-family:sans-serif;font-size:.88rem;min-height:1em;margin-bottom:12px;"></div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
              <div class="form-group">
                <label class="form-label">Your Name *</label>
                <input type="text" id="foia-name" class="form-input" placeholder="Full legal name">
              </div>
              <div class="form-group">
                <label class="form-label">Email *</label>
                <input type="email" id="foia-email" class="form-input" placeholder="for correspondence">
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
              <div class="form-group">
                <label class="form-label">Phone</label>
                <input type="tel" id="foia-phone" class="form-input" placeholder="Optional">
              </div>
              <div class="form-group">
                <label class="form-label">Organization</label>
                <input type="text" id="foia-org" class="form-input" placeholder="Optional">
              </div>
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label">Department / Office *</label>
              <select id="foia-dept" class="form-select">
                <option value="">Select department...</option>
                ${DEPARTMENTS.map(d => `<option value="${d}">${escHtml(d)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label">Records Requested *</label>
              <textarea id="foia-desc" class="form-input" rows="5" maxlength="3000"
                placeholder="Describe the specific records you are requesting. Be as specific as possible — include date ranges, record types, names, case numbers, or other identifying information that will help us locate the records."></textarea>
            </div>
            <div class="form-group" style="margin-bottom:20px;">
              <label class="form-label">Preferred Format</label>
              <select id="foia-format" class="form-select" style="max-width:220px;">
                <option value="digital">Digital (email / download)</option>
                <option value="paper">Paper copies</option>
                <option value="both">Both</option>
              </select>
            </div>
            <button onclick="submitFOIA()" class="btn btn-primary btn-lg">Submit Request →</button>
          </div>

          <aside>
            <div class="sidebar-widget">
              <div class="widget-header">⚖️ Your Rights</div>
              <div class="widget-body" style="font-family:var(--font-ui);font-size:.83rem;line-height:1.9;color:#555;">
                <p><strong>Iowa Code Chapter 22</strong> guarantees your right to inspect and copy public records.</p>
                <p style="margin-top:8px;"><strong>Response time:</strong> 10 business days</p>
                <p><strong>Cost:</strong> Reasonable copying fees may apply ($0.10/page for paper)</p>
                <p><strong>Exemptions:</strong> Personnel records, ongoing investigations, legally privileged records</p>
              </div>
            </div>
            <div class="sidebar-widget" style="margin-top:16px;">
              <div class="widget-header">🔍 Track a Request</div>
              <div class="widget-body">
                <input type="text" id="track-id" class="form-input" placeholder="FOIA-2025-001" style="margin-bottom:8px;">
                <a onclick="trackFOIA()" class="btn btn-outline" style="cursor:pointer;width:100%;justify-content:center;display:flex;">Check Status →</a>
              </div>
            </div>
            <div class="sidebar-widget" style="margin-top:16px;">
              <div class="widget-header">📞 City Clerk</div>
              <div class="widget-body" style="font-family:var(--font-ui);font-size:.85rem;">
                <p><a href="tel:6417828426">(641) 782-8426</a></p>
                <p style="color:#888;font-size:.78rem;margin-top:4px;">116 W. Adams St, Creston, IA 50801</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>

    <script>
      async function submitFOIA() {
        const st = document.getElementById('submit-status');
        const data = {
          requester_name:  document.getElementById('foia-name').value.trim(),
          requester_email: document.getElementById('foia-email').value.trim(),
          requester_phone: document.getElementById('foia-phone').value.trim(),
          organization:    document.getElementById('foia-org').value.trim(),
          department:      document.getElementById('foia-dept').value,
          description:     document.getElementById('foia-desc').value.trim(),
          format:          document.getElementById('foia-format').value,
        };
        if (!data.requester_name)  { st.textContent='⚠️ Name required.'; st.style.color='#c9933a'; return; }
        if (!data.requester_email) { st.textContent='⚠️ Email required.'; st.style.color='#c9933a'; return; }
        if (!data.department)      { st.textContent='⚠️ Select a department.'; st.style.color='#c9933a'; return; }
        if (!data.description)     { st.textContent='⚠️ Describe the records.'; st.style.color='#c9933a'; return; }

        st.textContent='⏳ Submitting...'; st.style.color='#888';
        const r = await fetch('/foia/submit', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
        const d = await r.json();
        if (r.ok && d.ok) {
          window.location.href = '/foia?success=1&req=' + encodeURIComponent(d.request_id);
        } else {
          st.textContent = '❌ ' + (d.error||'Submission failed.'); st.style.color='#b84040';
        }
      }
      function trackFOIA() {
        const id = document.getElementById('track-id').value.trim();
        if (id) window.location.href = '/foia/track?id=' + encodeURIComponent(id);
      }
    </script>`;

  return new Response(await renderShell({
    title: 'Open Records Request — FOIA',
    description: `Submit a public records request under the Iowa Open Records Act. City of ${cfg.name||'Creston'}.`,
    eyebrow: '⚖️ Open Government',
    heading: 'Open Records (FOIA)',
    subheading: 'Request public records under the Iowa Open Records Act.',
    config: cfg,
    content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function handleSubmit(request, env) {
  try {
    const body = await request.json();
    const { requester_name, requester_email, department, description } = body;
    if (!requester_name || !requester_email || !department || !description) {
      return jsonRes({ error: 'Required fields missing' }, 400);
    }

    const year   = new Date().getFullYear();
    const count  = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM foia_requests WHERE request_id LIKE 'FOIA-${year}-%'`).first();
    const num    = String((count?.cnt||0)+1).padStart(3,'0');
    const reqId  = `FOIA-${year}-${num}`;

    // Due date = 10 business days from now (approximate as 14 calendar days)
    const due = new Date();
    due.setDate(due.getDate() + 14);
    const dueStr = due.toISOString().split('T')[0];

    await env.DB.prepare(`
      INSERT INTO foia_requests
        (request_id, requester_name, requester_email, requester_phone, organization, department, description, format, status, due_date)
      VALUES (?,?,?,?,?,?,?,?,'received',?)
    `).bind(reqId, requester_name, requester_email, body.requester_phone||'', body.organization||'', department, description, body.format||'digital', dueStr).run();

    const cfg = await getSiteConfig(env);
    if (env.RESEND_API_KEY) {
      await sendEmail(env, {
        to: requester_email,
        subject: `[${reqId}] FOIA Request Received — ${cfg.name||'City'}`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
          <h2 style="color:#1a3a2a;">Open Records Request Received</h2>
          <p>Your request <strong>${reqId}</strong> has been received. Per Iowa law, we will respond within <strong>10 business days</strong> (by ${dueStr}).</p>
          <p style="background:#f5f5f5;padding:12px;border-radius:6px;">${escHtml(description)}</p>
          <a href="${cfg.url||''}/foia/track?id=${reqId}" style="display:inline-block;background:#2d5a3d;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Track Request →</a>
        </div>`,
      });
      await sendEmail(env, {
        to: env.CONTACT_EMAIL,
        subject: `[${reqId}] New FOIA Request — Due ${dueStr}`,
        html: `<div style="font-family:sans-serif;max-width:560px;padding:24px;">
          <h2 style="color:#b84040;">⚠️ New FOIA Request — Due ${dueStr}</h2>
          <p><strong>From:</strong> ${escHtml(requester_name)} (${escHtml(requester_email)})</p>
          <p><strong>Department:</strong> ${escHtml(department)}</p>
          <p><strong>Request:</strong> ${escHtml(description)}</p>
          <a href="${cfg.url||''}/admin/foia" style="display:inline-block;background:#2d5a3d;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Manage in Admin →</a>
        </div>`,
      });
    }

    return jsonRes({ ok: true, request_id: reqId });
  } catch (err) {
    return jsonRes({ error: err.message }, 500);
  }
}

async function handleTrack(request, env, url) {
  const cfg   = await getSiteConfig(env);
  const reqId = url.searchParams.get('id') || '';
  let   req   = null;
  if (reqId) {
    req = await env.DB.prepare(`SELECT * FROM foia_requests WHERE request_id = ?`).bind(reqId.toUpperCase()).first();
  }
  const si = req ? (STATUS_LABELS[req.status] || STATUS_LABELS.received) : null;

  const content = `
    <section class="section"><div class="container" style="max-width:600px;">
      <h2 style="font-family:var(--font-display);font-size:1.3rem;color:var(--green-deep);margin-bottom:20px;">Track FOIA Request</h2>
      <form method="GET" action="/foia/track" style="display:flex;gap:10px;margin-bottom:24px;">
        <input type="text" name="id" value="${escHtml(reqId)}" class="form-input" placeholder="FOIA-2025-001" style="flex:1;">
        <button type="submit" class="btn btn-primary">Track →</button>
      </form>
      ${reqId && !req ? `<div style="background:#fde8e8;border-radius:10px;padding:20px;text-align:center;"><p style="color:#b84040;">No request found with ID <strong>${escHtml(reqId)}</strong>.</p></div>` : ''}
      ${req ? `
      <div style="background:white;border:1.5px solid #e0e0e0;border-radius:12px;overflow:hidden;">
        <div style="background:${si.bg};padding:16px 24px;border-bottom:1px solid #e0e0e0;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-family:monospace;font-size:.9rem;color:#888;">${escHtml(req.request_id)}</div>
            <span style="background:${si.color};color:white;padding:3px 12px;border-radius:100px;font-size:.78rem;font-weight:700;">${si.label}</span>
          </div>
        </div>
        <div style="padding:20px 24px;font-family:var(--font-ui);font-size:.88rem;line-height:2.2;">
          <div><span style="color:#888;width:130px;display:inline-block;">Department</span>${escHtml(req.department||'—')}</div>
          <div><span style="color:#888;width:130px;display:inline-block;">Submitted</span>${new Date(req.created_at).toLocaleDateString()}</div>
          <div><span style="color:#888;width:130px;display:inline-block;">Due by</span>${req.due_date||'—'}</div>
          ${req.fulfilled_at ? `<div><span style="color:#888;width:130px;display:inline-block;">Fulfilled</span>${new Date(req.fulfilled_at).toLocaleDateString()}</div>` : ''}
          ${req.denial_reason ? `<div><span style="color:#888;width:130px;display:inline-block;">Denial reason</span>${escHtml(req.denial_reason)}</div>` : ''}
        </div>
      </div>` : ''}
    </div></section>`;

  return new Response(await renderShell({
    title: 'Track FOIA Request', description: 'Check the status of your open records request.',
    eyebrow: '⚖️ FOIA Status', heading: 'Request Status', config: cfg, content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function handleFOIAAdmin(request, env, url, user) {
  if (user.role === 'company_admin') return new Response('Forbidden', { status: 403 });
  const path    = url.pathname;
  const idMatch = path.match(/\/admin\/foia\/(\d+)\/update/);

  if (idMatch && request.method === 'POST') {
    const body = await request.json().catch(()=>({}));
    const id   = idMatch[1];
    const sets = []; const vals = [];
    if (body.status)        { sets.push('status = ?');        vals.push(body.status); }
    if (body.denial_reason) { sets.push('denial_reason = ?'); vals.push(body.denial_reason); }
    if (body.notes)         { sets.push('notes = ?');         vals.push(body.notes); }
    sets.push("updated_at = datetime('now')");
    if (body.status === 'fulfilled' || body.status === 'partial') {
      sets.push("fulfilled_at = datetime('now')");
    }
    vals.push(id);
    await env.DB.prepare(`UPDATE foia_requests SET ${sets.join(',')} WHERE id = ?`).bind(...vals).run();

    if (body.status && env.RESEND_API_KEY) {
      const req = await env.DB.prepare(`SELECT * FROM foia_requests WHERE id = ?`).bind(id).first();
      const cfg = await getSiteConfig(env);
      if (req) {
        await sendEmail(env, {
          to: req.requester_email,
          subject: `[${req.request_id}] FOIA Status Update`,
          html: `<div style="font-family:sans-serif;padding:24px;max-width:560px;">
            <h2>FOIA Request Update — ${req.request_id}</h2>
            <p>Status: <strong>${STATUS_LABELS[body.status]?.label||body.status}</strong></p>
            ${body.denial_reason ? `<p><strong>Reason:</strong> ${escHtml(body.denial_reason)}</p>` : ''}
            <a href="${cfg.url||''}/foia/track?id=${req.request_id}" style="display:inline-block;background:#2d5a3d;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Track Request →</a>
          </div>`,
        });
      }
    }
    return jsonRes({ ok: true });
  }

  const today   = new Date().toISOString().split('T')[0];
  const reqs    = await env.DB.prepare(`SELECT * FROM foia_requests ORDER BY created_at DESC LIMIT 100`).all();
  const overdue = (reqs.results||[]).filter(r => r.due_date && r.due_date < today && !['fulfilled','denied'].includes(r.status));

  const rows = (reqs.results||[]).map(r => {
    const si       = STATUS_LABELS[r.status] || STATUS_LABELS.received;
    const isOverdue = r.due_date && r.due_date < today && !['fulfilled','denied'].includes(r.status);
    return `<tr ${isOverdue?'style="background:#fdf5f5;"':''}>
      <td style="font-family:monospace;font-size:.78rem;">${escHtml(r.request_id)}</td>
      <td>${escHtml(r.requester_name)}<br><span style="font-size:.72rem;color:#888;">${escHtml(r.requester_email)}</span></td>
      <td style="font-size:.82rem;">${escHtml(r.department||'—')}</td>
      <td><span style="background:${si.bg};color:${si.color};padding:2px 8px;border-radius:100px;font-size:.72rem;font-weight:700;">${si.label}</span></td>
      <td style="font-size:.78rem;${isOverdue?'color:#b84040;font-weight:700;':''}">${r.due_date||'—'}${isOverdue?' ⚠️':''}</td>
      <td style="font-size:.78rem;">${new Date(r.created_at).toLocaleDateString()}</td>
      <td>
        <select onchange="updateFOIA(${r.id},'status',this.value)" style="font-size:.75rem;padding:2px 5px;border-radius:4px;border:1px solid #ddd;">
          ${Object.entries(STATUS_LABELS).map(([k,v])=>`<option value="${k}" ${r.status===k?'selected':''}>${v.label}</option>`).join('')}
        </select>
        <a href="mailto:${escHtml(r.requester_email)}" class="tbl-btn tbl-btn-view" style="margin-top:4px;display:inline-block;">Reply</a>
      </td>
    </tr>`;
  }).join('');

  const body = `
    <div class="settings-header">
      <div><h2>⚖️ FOIA / Open Records</h2>
      <p style="color:#888;font-family:sans-serif;font-size:.88rem;margin:4px 0 0;">
        ${(reqs.results||[]).filter(r=>r.status==='received').length} new · ${overdue.length} overdue · ${(reqs.results||[]).length} total
      </p></div>
      <a href="/foia" target="_blank" class="btn-admin-secondary">Public Form →</a>
    </div>
    ${overdue.length ? `<div style="background:#fde8e8;border:1.5px solid #e0a0a0;border-radius:8px;padding:10px 16px;margin-bottom:16px;font-family:sans-serif;font-size:.85rem;color:#b84040;">
      ⚠️ <strong>${overdue.length} overdue request${overdue.length>1?'s':''}</strong> — Iowa law requires response within 10 business days.
    </div>` : ''}
    <div id="foia-msg" style="font-family:sans-serif;font-size:.85rem;min-height:1em;margin-bottom:8px;"></div>
    <table class="admin-table">
      <thead><tr><th>Request ID</th><th>Requester</th><th>Department</th><th>Status</th><th>Due</th><th>Submitted</th><th>Actions</th></tr></thead>
      <tbody>${rows||'<tr><td colspan="7" style="text-align:center;color:#888;padding:24px;">No requests yet.</td></tr>'}</tbody>
    </table>
    <script>
      const TOKEN=sessionStorage.getItem('admin_token')||'';
      const H={'Content-Type':'application/json','Authorization':'Bearer '+TOKEN};
      const msg=document.getElementById('foia-msg');
      async function updateFOIA(id,field,value){
        msg.textContent='⏳ Saving...';msg.style.color='#888';
        const r=await fetch('/admin/foia/'+id+'/update',{method:'POST',headers:H,body:JSON.stringify({[field]:value})});
        const d=await r.json();
        msg.textContent=d.ok?'✅ Updated':'❌ '+(d.error||'Error');
        msg.style.color=d.ok?'#2d5a3d':'#b84040';
        setTimeout(()=>msg.textContent='',3000);
      }
    </script>`;

  return adminPage('⚖️ FOIA Requests', body, user);
}

async function sendEmail(env, { to, subject, html }) {
  return fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{'Authorization':`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({from:env.CONTACT_FROM||'noreply@creston-iowa.com',to:[to],subject,html}),
  }).catch(e=>console.error('Email:',e.message));
}

function jsonRes(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});}
