/**
 * src/handlers/service-requests.js
 * 311 Community Service Request System.
 *
 * Public:
 *   GET  /311               → submit form + public status lookup
 *   POST /311/submit        → submit new request
 *   GET  /311/track?id=     → resident status check by ticket ID
 *
 * Admin:
 *   GET  /admin/311         → request queue with filters
 *   POST /admin/311/:id/update → update status, assign, add notes
 */

import { renderShell, escHtml, adSlot } from '../shell.js';
import { getSiteConfig }                from '../db/site.js';
import { adminPage }                    from './admin.js';

const CATEGORIES = {
  pothole:        { label: 'Pothole / Road Damage',   emoji: '🕳️',  dept: 'Public Works' },
  streetlight:    { label: 'Streetlight Outage',       emoji: '💡',  dept: 'Public Works' },
  sign:           { label: 'Missing / Damaged Sign',   emoji: '🚧',  dept: 'Public Works' },
  tree:           { label: 'Fallen Tree / Debris',     emoji: '🌳',  dept: 'Public Works' },
  park:           { label: 'Park / Trail Issue',       emoji: '🏞️',  dept: 'Parks & Rec' },
  drainage:       { label: 'Drainage / Flooding',      emoji: '🌊',  dept: 'Public Works' },
  graffiti:       { label: 'Graffiti / Vandalism',     emoji: '🎨',  dept: 'Police' },
  noise:          { label: 'Noise Complaint',          emoji: '📢',  dept: 'Police' },
  abandoned:      { label: 'Abandoned Vehicle',        emoji: '🚗',  dept: 'Police' },
  snow:           { label: 'Snow / Ice Removal',       emoji: '❄️',  dept: 'Public Works' },
  water:          { label: 'Water / Sewer Issue',      emoji: '🚰',  dept: 'Utilities' },
  other:          { label: 'Other Issue',              emoji: '📋',  dept: 'City Clerk' },
};

const STATUS_LABELS = {
  open:        { label: 'Open',        color: '#b84040', bg: '#fde8e8' },
  in_progress: { label: 'In Progress', color: '#7a5a00', bg: '#fff3cd' },
  resolved:    { label: 'Resolved',    color: '#2d5a3d', bg: '#e8f2eb' },
  closed:      { label: 'Closed',      color: '#555',    bg: '#f0f0f0' },
};

// ── Public page ────────────────────────────────────────────────
export async function handleServiceRequests(request, env, url) {
  const path = url.pathname;

  if (path === '/311/submit' && request.method === 'POST') return handleSubmit(request, env);
  if (path === '/311/track')                                return handleTrack(request, env, url);

  const cfg      = await getSiteConfig(env);
  const success  = url.searchParams.get('success');
  const ticketId = url.searchParams.get('ticket');

  const catCards = Object.entries(CATEGORIES).map(([key, cat]) => `
    <button type="button" onclick="selectCat('${key}')"
            class="cat-select-card" id="cat-${key}" data-cat="${key}">
      <span style="font-size:1.8rem;display:block;margin-bottom:4px;">${cat.emoji}</span>
      <span style="font-family:var(--font-ui);font-size:.78rem;font-weight:600;color:var(--green-deep);">${escHtml(cat.label)}</span>
    </button>`).join('');

  const content = `
    <section class="section">
      <div class="container" style="max-width:840px;">

        ${success ? `
        <div style="background:#e8f2eb;border:2px solid #4a8c5c;border-radius:12px;padding:20px 24px;margin-bottom:28px;text-align:center;">
          <div style="font-size:2rem;margin-bottom:6px;">✅</div>
          <h3 style="color:#1a3a2a;margin-bottom:6px;">Request Submitted!</h3>
          <p style="color:#444;">Your ticket ID is <strong style="font-family:monospace;">${escHtml(ticketId||'')}</strong> — save this to track your request.</p>
          <a href="/311/track?id=${escHtml(ticketId||'')}" class="btn btn-outline" style="margin-top:12px;">Track This Request →</a>
        </div>` : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start;">
          <div>
            <h2 style="font-family:var(--font-display);font-size:1.4rem;color:var(--green-deep);margin-bottom:8px;">Submit a Service Request</h2>
            <p style="font-family:var(--font-ui);font-size:.88rem;color:#666;margin-bottom:20px;">
              Report a non-emergency issue in our community. Your request will be reviewed by city staff.
              For emergencies, call <strong>911</strong>.
            </p>

            <div id="submit-status" style="font-family:sans-serif;font-size:.88rem;min-height:1em;margin-bottom:12px;"></div>

            <div class="form-group" style="margin-bottom:16px;">
              <label class="form-label">Issue Category *</label>
              <div class="cat-select-grid">${catCards}</div>
              <input type="hidden" id="category-input" value="">
            </div>

            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label">Title / Brief Description *</label>
              <input type="text" id="sr-title" class="form-input" maxlength="100"
                     placeholder="e.g. Large pothole at Main St and 2nd Ave">
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label">Full Description *</label>
              <textarea id="sr-desc" class="form-input" rows="4" maxlength="2000"
                        placeholder="Provide as much detail as possible — exact location, severity, how long it's been an issue..."></textarea>
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label">Location / Address *</label>
              <input type="text" id="sr-location" class="form-input"
                     placeholder="Street address or nearest intersection">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
              <div class="form-group">
                <label class="form-label">Your Name *</label>
                <input type="text" id="sr-name" class="form-input" placeholder="Full name">
              </div>
              <div class="form-group">
                <label class="form-label">Email *</label>
                <input type="email" id="sr-email" class="form-input" placeholder="for status updates">
              </div>
            </div>
            <div class="form-group" style="margin-bottom:20px;">
              <label class="form-label">Phone (optional)</label>
              <input type="tel" id="sr-phone" class="form-input" placeholder="(641) 782-XXXX" style="max-width:220px;">
            </div>
            <button onclick="submitSR()" class="btn btn-primary btn-lg">Submit Request →</button>
          </div>

          <aside>
            <div class="sidebar-widget">
              <div class="widget-header">🔍 Track a Request</div>
              <div class="widget-body">
                <p style="font-family:var(--font-ui);font-size:.83rem;color:#666;margin-bottom:12px;">
                  Check the status of an existing request with your ticket ID.
                </p>
                <input type="text" id="track-input" class="form-input" placeholder="SR-2025-0001" style="margin-bottom:8px;">
                <a onclick="trackRequest()" class="btn btn-outline" style="cursor:pointer;width:100%;justify-content:center;">
                  Check Status →
                </a>
              </div>
            </div>
            <div class="sidebar-widget" style="margin-top:16px;">
              <div class="widget-header">📞 Emergency Contacts</div>
              <div class="widget-body">
                <div style="font-family:var(--font-ui);font-size:.85rem;line-height:2.2;">
                  <div><strong>Emergency:</strong> <a href="tel:911">911</a></div>
                  <div><strong>Police (non-emerg):</strong> <a href="tel:6417828402">(641) 782-8402</a></div>
                  <div><strong>City Hall:</strong> <a href="tel:6417828426">(641) 782-8426</a></div>
                  <div><strong>Public Works:</strong> <a href="tel:6417828427">(641) 782-8427</a></div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>

    <style>
      .cat-select-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:8px; }
      .cat-select-card { background:white; border:1.5px solid #e0e0e0; border-radius:10px; padding:12px 8px; text-align:center; cursor:pointer; transition:all .15s; }
      .cat-select-card:hover { border-color:var(--green-mid); background:#f9fdf9; }
      .cat-select-card.selected { border-color:var(--green-deep); background:#e8f2eb; }
    </style>

    <script>
      function selectCat(cat) {
        document.querySelectorAll('.cat-select-card').forEach(el => el.classList.remove('selected'));
        document.getElementById('cat-' + cat)?.classList.add('selected');
        document.getElementById('category-input').value = cat;
      }

      async function submitSR() {
        const st = document.getElementById('submit-status');
        const data = {
          category: document.getElementById('category-input').value,
          title:    document.getElementById('sr-title').value.trim(),
          description: document.getElementById('sr-desc').value.trim(),
          location: document.getElementById('sr-location').value.trim(),
          name:     document.getElementById('sr-name').value.trim(),
          email:    document.getElementById('sr-email').value.trim(),
          phone:    document.getElementById('sr-phone').value.trim(),
        };
        if (!data.category) { st.textContent = '⚠️ Please select an issue category.'; st.style.color='#c9933a'; return; }
        if (!data.title)    { st.textContent = '⚠️ Please enter a title.'; st.style.color='#c9933a'; return; }
        if (!data.description) { st.textContent = '⚠️ Please describe the issue.'; st.style.color='#c9933a'; return; }
        if (!data.location) { st.textContent = '⚠️ Please provide a location.'; st.style.color='#c9933a'; return; }
        if (!data.name)     { st.textContent = '⚠️ Please enter your name.'; st.style.color='#c9933a'; return; }
        if (!data.email || !data.email.includes('@')) { st.textContent = '⚠️ Please enter a valid email.'; st.style.color='#c9933a'; return; }

        st.textContent = '⏳ Submitting...'; st.style.color='#888';
        const r = await fetch('/311/submit', {
          method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
        });
        const d = await r.json();
        if (r.ok && d.ok) {
          window.location.href = '/311?success=1&ticket=' + encodeURIComponent(d.ticket_id);
        } else {
          st.textContent = '❌ ' + (d.error || 'Submission failed. Please try again.');
          st.style.color = '#b84040';
        }
      }

      function trackRequest() {
        const id = document.getElementById('track-input').value.trim();
        if (id) window.location.href = '/311/track?id=' + encodeURIComponent(id);
      }
    </script>`;

  return new Response(await renderShell({
    title:      '311 Service Requests',
    description: `Report potholes, streetlight outages, and other non-emergency issues in ${cfg.name||'Creston'}. Track your request status online.`,
    eyebrow:    '📋 City Services',
    heading:    '311 Service Requests',
    subheading: 'Report non-emergency issues. Track your request status online.',
    config: cfg,
    content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ── Submit handler ─────────────────────────────────────────────
async function handleSubmit(request, env) {
  try {
    const body = await request.json();
    const { category, title, description, location, name, email, phone } = body;

    if (!category || !title || !description || !location || !name || !email) {
      return jsonRes({ error: 'All required fields must be filled out.' }, 400);
    }

    if (!(category in CATEGORIES)) return jsonRes({ error: 'Invalid category' }, 400);

    // Generate ticket ID
    const year     = new Date().getFullYear();
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM service_requests WHERE ticket_id LIKE 'SR-${year}-%'`
    ).first();
    const num      = String((countRow?.cnt || 0) + 1).padStart(4, '0');
    const ticketId = `SR-${year}-${num}`;

    await env.DB.prepare(`
      INSERT INTO service_requests
        (ticket_id, category, title, description, location, name, email, phone, status, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 'normal')
    `).bind(ticketId, category, title, description, location, name, email, phone || '').run();

    // Send confirmation email
    if (env.RESEND_API_KEY) {
      const cfg = await getSiteConfig(env);
      const cat = CATEGORIES[category];
      await sendEmail(env, {
        to:      email,
        subject: `[${ticketId}] Service Request Received — ${cfg.name||'City'}`,
        html: confirmEmail(ticketId, title, cat, cfg),
      });
      // Notify admin
      await sendEmail(env, {
        to:      env.CONTACT_EMAIL,
        subject: `[${ticketId}] New 311 Request: ${title}`,
        html: adminNotifyEmail(ticketId, body, cat, cfg),
      });
    }

    return jsonRes({ ok: true, ticket_id: ticketId });
  } catch (err) {
    console.error('SR submit error:', err.message);
    return jsonRes({ error: err.message }, 500);
  }
}

// ── Track handler ──────────────────────────────────────────────
async function handleTrack(request, env, url) {
  const cfg      = await getSiteConfig(env);
  const ticketId = url.searchParams.get('id') || '';
  let   sr       = null;

  if (ticketId) {
    sr = await env.DB.prepare(
      `SELECT * FROM service_requests WHERE ticket_id = ?`
    ).bind(ticketId.toUpperCase()).first();
  }

  const statusInfo = sr ? (STATUS_LABELS[sr.status] || STATUS_LABELS.open) : null;
  const cat        = sr ? CATEGORIES[sr.category] : null;

  const content = `
    <section class="section">
      <div class="container" style="max-width:640px;">
        <h2 style="font-family:var(--font-display);font-size:1.4rem;color:var(--green-deep);margin-bottom:20px;">Track Your Request</h2>

        <form method="GET" action="/311/track" style="display:flex;gap:10px;margin-bottom:28px;">
          <input type="text" name="id" value="${escHtml(ticketId)}" class="form-input"
                 placeholder="SR-2025-0001" style="flex:1;">
          <button type="submit" class="btn btn-primary">Track →</button>
        </form>

        ${ticketId && !sr ? `
        <div style="background:#fde8e8;border:1.5px solid #e0a0a0;border-radius:10px;padding:20px;text-align:center;">
          <p style="color:#b84040;">No request found with ID <strong>${escHtml(ticketId)}</strong>. Please check your ticket number.</p>
        </div>` : ''}

        ${sr ? `
        <div style="background:white;border:1.5px solid #e0e0e0;border-radius:12px;overflow:hidden;">
          <div style="background:${statusInfo.bg};padding:16px 24px;border-bottom:1px solid #e0e0e0;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-family:monospace;font-size:.9rem;color:#888;">Ticket ${escHtml(sr.ticket_id)}</div>
                <div style="font-family:var(--font-display);font-size:1.1rem;font-weight:700;color:var(--green-deep);margin-top:2px;">${escHtml(sr.title)}</div>
              </div>
              <span style="background:${statusInfo.color};color:white;padding:4px 14px;border-radius:100px;font-family:var(--font-ui);font-size:.8rem;font-weight:700;">
                ${statusInfo.label}
              </span>
            </div>
          </div>
          <div style="padding:20px 24px;font-family:var(--font-ui);font-size:.88rem;line-height:2;">
            <div><span style="color:#888;width:120px;display:inline-block;">Category</span> ${cat?.emoji||''} ${escHtml(cat?.label||sr.category)}</div>
            <div><span style="color:#888;width:120px;display:inline-block;">Location</span> ${escHtml(sr.location||'—')}</div>
            <div><span style="color:#888;width:120px;display:inline-block;">Submitted</span> ${new Date(sr.created_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>
            <div><span style="color:#888;width:120px;display:inline-block;">Department</span> ${escHtml(cat?.dept||'City Staff')}</div>
            ${sr.resolved_at ? `<div><span style="color:#888;width:120px;display:inline-block;">Resolved</span> ${new Date(sr.resolved_at).toLocaleDateString()}</div>` : ''}
          </div>
          ${sr.description ? `<div style="padding:0 24px 20px;font-family:var(--font-body);font-size:.88rem;color:#555;line-height:1.7;">${escHtml(sr.description)}</div>` : ''}
        </div>
        <p style="margin-top:16px;font-family:var(--font-ui);font-size:.82rem;color:#888;text-align:center;">
          Questions? Contact City Hall at <a href="tel:6417828426">(641) 782-8426</a>
        </p>` : ''}
      </div>
    </section>`;

  return new Response(await renderShell({
    title:     'Track Service Request',
    description: 'Check the status of your 311 service request.',
    eyebrow:   '📋 311 Status',
    heading:   'Request Status',
    subheading: ticketId ? `Tracking: ${ticketId}` : 'Enter your ticket ID to check status.',
    config: cfg,
    content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ── Admin queue ────────────────────────────────────────────────
export async function handleSRAdmin(request, env, url, user) {
  if (user.role === 'company_admin') return new Response('Forbidden', { status: 403 });

  const path   = url.pathname;
  const idMatch = path.match(/\/admin\/311\/(\d+)\/update/);

  if (idMatch && request.method === 'POST') {
    const body   = await request.json().catch(() => ({}));
    const id     = idMatch[1];
    const fields = [];
    const vals   = [];

    if (body.status)   { fields.push("status = ?");      vals.push(body.status); }
    if (body.priority) { fields.push("priority = ?");    vals.push(body.priority); }
    if (body.notes)    { fields.push("notes = ?");       vals.push(body.notes); }
    fields.push("updated_at = datetime('now')");
    if (body.status === 'resolved') {
      fields.push("resolved_at = datetime('now')");
    }
    vals.push(id);

    await env.DB.prepare(`UPDATE service_requests SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();

    // Email resident on status change
    if (body.status && env.RESEND_API_KEY) {
      const sr  = await env.DB.prepare(`SELECT * FROM service_requests WHERE id = ?`).bind(id).first();
      const cfg = await getSiteConfig(env);
      if (sr) {
        await sendEmail(env, {
          to:      sr.email,
          subject: `[${sr.ticket_id}] Status Update — ${STATUS_LABELS[body.status]?.label || body.status}`,
          html:    statusUpdateEmail(sr, body.status, cfg),
        });
      }
    }

    return jsonRes({ ok: true });
  }

  // List view with filters
  const status   = url.searchParams.get('status') || '';
  const category = url.searchParams.get('cat')    || '';
  const where    = [];
  const vals2    = [];
  if (status)   { where.push('status = ?');   vals2.push(status); }
  if (category) { where.push('category = ?'); vals2.push(category); }
  const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const requests = await env.DB.prepare(
    `SELECT * FROM service_requests ${whereStr} ORDER BY
      CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
      created_at DESC LIMIT 100`
  ).bind(...vals2).all();

  const counts = await env.DB.prepare(
    `SELECT status, COUNT(*) as cnt FROM service_requests GROUP BY status`
  ).all();
  const countMap = Object.fromEntries((counts.results||[]).map(r => [r.status, r.cnt]));

  const rows = (requests.results || []).map(sr => {
    const si  = STATUS_LABELS[sr.status] || STATUS_LABELS.open;
    const cat = CATEGORIES[sr.category]  || CATEGORIES.other;
    return `
      <tr>
        <td style="font-family:monospace;font-size:.78rem;">${escHtml(sr.ticket_id)}</td>
        <td>${cat.emoji} <strong>${escHtml(sr.title)}</strong><br>
            <span style="font-size:.75rem;color:#888;">📍 ${escHtml(sr.location||'—')}</span></td>
        <td>${escHtml(cat.label)}</td>
        <td>
          <select onchange="updateSR(${sr.id},'status',this.value)" style="font-size:.78rem;padding:3px 6px;border-radius:4px;border:1px solid #ddd;">
            ${Object.entries(STATUS_LABELS).map(([k,v]) =>
              `<option value="${k}" ${sr.status===k?'selected':''}>${v.label}</option>`
            ).join('')}
          </select>
        </td>
        <td>
          <select onchange="updateSR(${sr.id},'priority',this.value)" style="font-size:.78rem;padding:3px 6px;border-radius:4px;border:1px solid #ddd;">
            <option value="low"    ${sr.priority==='low'   ?'selected':''}>Low</option>
            <option value="normal" ${sr.priority==='normal'?'selected':''}>Normal</option>
            <option value="high"   ${sr.priority==='high'  ?'selected':''}>High</option>
            <option value="urgent" ${sr.priority==='urgent'?'selected':''}>Urgent</option>
          </select>
        </td>
        <td style="font-size:.78rem;">${new Date(sr.created_at).toLocaleDateString()}</td>
        <td>
          <button onclick="showNotes(${sr.id},'${escHtml(sr.notes||'')}')" class="tbl-btn">Notes</button>
          <a href="mailto:${escHtml(sr.email)}" class="tbl-btn tbl-btn-view">Email</a>
        </td>
      </tr>`;
  }).join('');

  const body = `
    <div class="settings-header">
      <div>
        <h2>📋 311 Service Requests</h2>
        <p style="color:#888;font-family:sans-serif;font-size:.88rem;margin:4px 0 0;">
          ${countMap.open||0} open · ${countMap.in_progress||0} in progress · ${countMap.resolved||0} resolved
        </p>
      </div>
      <a href="/311" target="_blank" class="btn-admin-secondary">Public Form →</a>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;font-family:sans-serif;font-size:.82rem;">
      <a href="/admin/311" class="cat-pill ${!status?'active':''}">All (${Object.values(countMap).reduce((a,b)=>a+b,0)||0})</a>
      ${Object.entries(STATUS_LABELS).map(([k,v]) => `
        <a href="/admin/311?status=${k}" class="cat-pill ${status===k?'active':''}">
          ${v.label} (${countMap[k]||0})
        </a>`).join('')}
    </div>

    <div id="sr-msg" style="font-family:sans-serif;font-size:.85rem;min-height:1em;margin-bottom:8px;"></div>

    <table class="admin-table">
      <thead><tr><th>Ticket</th><th>Issue</th><th>Category</th><th>Status</th><th>Priority</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#888;padding:24px;">No requests found.</td></tr>'}</tbody>
    </table>

    <div id="notes-panel" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:999;align-items:center;justify-content:center;">
      <div style="background:white;border-radius:12px;padding:24px;width:480px;max-width:90vw;">
        <h3 style="font-family:sans-serif;margin:0 0 12px;">Internal Notes</h3>
        <textarea id="notes-input" class="form-input" rows="5" style="width:100%;margin-bottom:12px;"></textarea>
        <div style="display:flex;gap:8px;">
          <button onclick="saveNotes()" class="btn-admin-primary">Save Notes</button>
          <button onclick="document.getElementById('notes-panel').style.display='none'" class="btn-admin-secondary">Cancel</button>
        </div>
      </div>
    </div>

    <script>
      const TOKEN = sessionStorage.getItem('admin_token') || '';
      const H = { 'Content-Type':'application/json', 'Authorization':'Bearer '+TOKEN };
      const msg = document.getElementById('sr-msg');
      let currentSRId = null;

      async function updateSR(id, field, value) {
        msg.textContent = '⏳ Saving...'; msg.style.color='#888';
        const r = await fetch('/admin/311/'+id+'/update', { method:'POST', headers:H, body:JSON.stringify({[field]:value}) });
        const d = await r.json();
        msg.textContent = d.ok ? '✅ Updated' : '❌ '+(d.error||'Error');
        msg.style.color = d.ok ? '#2d5a3d' : '#b84040';
        setTimeout(() => msg.textContent = '', 3000);
      }

      function showNotes(id, existing) {
        currentSRId = id;
        document.getElementById('notes-input').value = existing || '';
        document.getElementById('notes-panel').style.display = 'flex';
      }

      async function saveNotes() {
        const notes = document.getElementById('notes-input').value;
        await updateSR(currentSRId, 'notes', notes);
        document.getElementById('notes-panel').style.display = 'none';
      }
    </script>`;

  return adminPage('📋 311 Requests', body, user);
}

// ── Email helpers ──────────────────────────────────────────────
function confirmEmail(ticketId, title, cat, cfg) {
  return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#1a3a2a;color:white;padding:20px 24px;border-radius:8px 8px 0 0;">
      <h2 style="margin:0;font-size:1.1rem;">✅ Service Request Received</h2>
      <p style="margin:4px 0 0;opacity:.7;font-size:.85rem;">${cfg.name||'City'} · Ticket ${ticketId}</p>
    </div>
    <div style="background:white;border:1px solid #e0e0e0;padding:24px;border-top:none;border-radius:0 0 8px 8px;">
      <p>Your request has been received and will be reviewed by city staff.</p>
      <div style="background:#f5f5f5;border-radius:8px;padding:14px;margin:12px 0;">
        <div><strong>Ticket ID:</strong> <span style="font-family:monospace;">${ticketId}</span></div>
        <div><strong>Issue:</strong> ${title}</div>
        <div><strong>Category:</strong> ${cat?.label||''}</div>
      </div>
      <p>You can track your request status at <a href="${cfg.url||''}/311/track?id=${ticketId}">${cfg.url||''}/311/track</a></p>
    </div>
  </div>`;
}

function adminNotifyEmail(ticketId, data, cat, cfg) {
  return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
    <h2 style="color:#1a3a2a;">New 311 Request: ${ticketId}</h2>
    <table style="width:100%;font-size:.9rem;border-collapse:collapse;">
      ${Object.entries({Category:cat?.label||data.category,Issue:data.title,Location:data.location,Name:data.name,Email:data.email,Phone:data.phone||'—'})
        .map(([k,v])=>`<tr><td style="padding:6px 0;color:#888;width:100px;">${k}</td><td style="padding:6px 0;">${v}</td></tr>`).join('')}
    </table>
    <p style="background:#f5f5f5;border-radius:6px;padding:12px;">${data.description}</p>
    <a href="${cfg.url||''}/admin/311" style="display:inline-block;background:#2d5a3d;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Manage in Admin →</a>
  </div>`;
}

function statusUpdateEmail(sr, newStatus, cfg) {
  const si = STATUS_LABELS[newStatus] || STATUS_LABELS.open;
  return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
    <h2 style="color:#1a3a2a;">Request Status Update — ${sr.ticket_id}</h2>
    <p>Your service request <strong>${sr.title}</strong> has been updated to:</p>
    <div style="background:${si.bg};border-radius:8px;padding:14px;text-align:center;margin:16px 0;">
      <span style="color:${si.color};font-size:1.2rem;font-weight:700;">${si.label}</span>
    </div>
    <a href="${cfg.url||''}/311/track?id=${sr.ticket_id}" style="display:inline-block;background:#2d5a3d;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Track Your Request →</a>
  </div>`;
}

async function sendEmail(env, { to, subject, html }) {
  return fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ from: env.CONTACT_FROM || `noreply@creston-iowa.com`, to: [to], subject, html }),
  }).catch(e => console.error('Email error:', e.message));
}

function jsonRes(data, status=200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
