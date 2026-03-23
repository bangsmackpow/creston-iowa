/**
 * src/handlers/permits.js
 * Permits & Licenses System
 *
 * Public:
 *   GET  /permits              → permit types + apply
 *   GET  /permits/apply/:type  → application form
 *   POST /permits/apply        → submit application
 *   GET  /permits/track?id=    → check status
 *
 * Admin:
 *   GET  /admin/permits        → applications queue
 *   POST /admin/permits/:id/update → approve/deny
 */

import { renderShell, escHtml } from '../shell.js';
import { getSiteConfig }        from '../db/site.js';
import { adminPage }            from './admin-page.js';

const PERMIT_TYPES = {
  garage_sale: {
    label:    'Garage Sale Permit',
    emoji:    '🏷️',
    desc:     'Required for garage/yard sales. Free — just register so the city knows your address.',
    fee:      0,
    fields:   ['address', 'dates', 'description'],
    dept:     'City Clerk',
    days:     1,  // approval turnaround
  },
  pet_license: {
    label:    'Pet License',
    emoji:    '🐾',
    desc:     'Annual license for dogs and cats. Required by city ordinance.',
    fee:      1000, // $10.00
    fields:   ['pet_name', 'breed', 'color', 'address'],
    dept:     'City Clerk',
    days:     2,
  },
  special_event: {
    label:    'Special Event Permit',
    emoji:    '🎉',
    desc:     'Required for public events, block parties, and gatherings over 25 people.',
    fee:      2500, // $25.00
    fields:   ['event_name', 'location', 'dates', 'expected_attendance', 'description'],
    dept:     'City Clerk',
    days:     10,
  },
  home_occupation: {
    label:    'Home Occupation Permit',
    emoji:    '🏠',
    desc:     'Required to operate a business from a residential property.',
    fee:      5000, // $50.00
    fields:   ['business_name', 'business_type', 'address', 'description'],
    dept:     'Planning & Zoning',
    days:     14,
  },
  burn:  {
    label:    'Open Burn Permit',
    emoji:    '🔥',
    desc:     'Required for open burning of brush, yard waste, or debris.',
    fee:      0,
    fields:   ['address', 'dates', 'description'],
    dept:     'Fire Department',
    days:     1,
  },
};

const STATUS_LABELS = {
  pending:  { label: 'Pending Review', color: '#c9933a', bg: '#fff3cd' },
  approved: { label: 'Approved',       color: '#2d5a3d', bg: '#e8f2eb' },
  denied:   { label: 'Denied',         color: '#b84040', bg: '#fde8e8' },
  expired:  { label: 'Expired',        color: '#888',    bg: '#f0f0f0' },
};

// ── Public routes ─────────────────────────────────────────────
export async function handlePermits(request, env, url) {
  const path = url.pathname;

  if (path === '/permits/apply' && request.method === 'POST') return submitApplication(request, env);
  if (path.startsWith('/permits/apply/')) {
    const type = path.replace('/permits/apply/', '');
    return renderApplicationForm(env, type, url);
  }
  if (path === '/permits/track') return renderTrack(request, env, url);
  return renderPermitTypes(env, url);
}

async function renderPermitTypes(env, url) {
  const cfg     = await getSiteConfig(env);
  const success = url.searchParams.get('success');
  const permId  = url.searchParams.get('id');

  const cards = Object.entries(PERMIT_TYPES).map(([key, pt]) => `
    <div class="permit-card">
      <div class="permit-emoji">${pt.emoji}</div>
      <div class="permit-body">
        <div class="permit-label">${escHtml(pt.label)}</div>
        <p class="permit-desc">${escHtml(pt.desc)}</p>
        <div class="permit-meta">
          <span>🏛️ ${escHtml(pt.dept)}</span>
          <span>⏱️ ~${pt.days} business day${pt.days > 1 ? 's' : ''}</span>
          <span>💰 ${pt.fee === 0 ? 'Free' : `$${(pt.fee / 100).toFixed(2)}`}</span>
        </div>
      </div>
      <a href="/permits/apply/${key}" class="btn btn-outline">Apply →</a>
    </div>`).join('');

  const content = `
    <section class="section">
      <div class="container" style="max-width:760px;">
        ${success ? `
        <div style="background:#e8f2eb;border:2px solid #4a8c5c;border-radius:12px;padding:20px 24px;margin-bottom:24px;text-align:center;">
          <h3 style="color:#1a3a2a;margin-bottom:6px;">✅ Application Submitted</h3>
          <p style="color:#444;">Your permit ID is <strong style="font-family:monospace;">${escHtml(permId||'')}</strong>.
          You'll receive an email when reviewed.</p>
          <a href="/permits/track?id=${escHtml(permId||'')}" class="btn btn-outline" style="margin-top:12px;">Track Status →</a>
        </div>` : ''}

        <div class="permit-list">${cards}</div>
        <p style="text-align:center;margin-top:24px;font-family:var(--font-ui);font-size:.83rem;color:#888;">
          Questions? <a href="/contact">Contact City Hall</a> or call <a href="tel:6417828426">(641) 782-8426</a>
        </p>
      </div>
    </section>
    <style>
      .permit-list { display:flex; flex-direction:column; gap:14px; }
      .permit-card { background:white; border:1.5px solid #e0e0e0; border-radius:12px; padding:20px; display:grid; grid-template-columns:48px 1fr auto; gap:16px; align-items:center; transition:border-color .15s; }
      .permit-card:hover { border-color:var(--green-mid); }
      .permit-emoji { font-size:1.8rem; text-align:center; }
      .permit-label { font-family:var(--font-ui); font-size:.95rem; font-weight:700; color:var(--green-deep); margin-bottom:4px; }
      .permit-desc { font-family:var(--font-body); font-size:.83rem; color:#666; margin-bottom:8px; line-height:1.5; }
      .permit-meta { display:flex; gap:12px; font-family:var(--font-ui); font-size:.75rem; color:#888; flex-wrap:wrap; }
    </style>`;

  return new Response(await renderShell({
    title: 'Permits & Licenses', description: `Apply for city permits and licenses online in ${cfg.name||'Creston, Iowa'}.`,
    eyebrow: '📋 City Services', heading: 'Permits & Licenses',
    subheading: 'Apply online — most permits approved within 1-2 business days.', config: cfg, content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function renderApplicationForm(env, type, url) {
  const cfg = await getSiteConfig(env);
  const pt  = PERMIT_TYPES[type];
  if (!pt) return new Response('Permit type not found', { status: 404 });

  const fieldHtml = {
    address:             () => `<div class="form-group" style="margin-bottom:14px;"><label class="form-label">Address *</label><input type="text" name="address" class="form-input" required placeholder="123 Main St, Creston, IA"></div>`,
    dates:               () => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;"><div class="form-group"><label class="form-label">Start Date *</label><input type="date" name="date_start" class="form-input" required></div><div class="form-group"><label class="form-label">End Date *</label><input type="date" name="date_end" class="form-input" required></div></div>`,
    description:         () => `<div class="form-group" style="margin-bottom:14px;"><label class="form-label">Description *</label><textarea name="description" class="form-input" rows="3" required placeholder="Describe your request..."></textarea></div>`,
    pet_name:            () => `<div class="form-group" style="margin-bottom:14px;"><label class="form-label">Pet Name *</label><input type="text" name="pet_name" class="form-input" required></div>`,
    breed:               () => `<div class="form-group" style="margin-bottom:14px;"><label class="form-label">Breed *</label><input type="text" name="breed" class="form-input" required></div>`,
    color:               () => `<div class="form-group" style="margin-bottom:14px;"><label class="form-label">Color / Markings *</label><input type="text" name="color" class="form-input" required></div>`,
    event_name:          () => `<div class="form-group" style="margin-bottom:14px;"><label class="form-label">Event Name *</label><input type="text" name="event_name" class="form-input" required></div>`,
    location:            () => `<div class="form-group" style="margin-bottom:14px;"><label class="form-label">Location / Venue *</label><input type="text" name="location" class="form-input" required></div>`,
    expected_attendance: () => `<div class="form-group" style="margin-bottom:14px;"><label class="form-label">Expected Attendance *</label><input type="number" name="expected_attendance" class="form-input" required min="1" style="max-width:160px;"></div>`,
    business_name:       () => `<div class="form-group" style="margin-bottom:14px;"><label class="form-label">Business Name *</label><input type="text" name="business_name" class="form-input" required></div>`,
    business_type:       () => `<div class="form-group" style="margin-bottom:14px;"><label class="form-label">Type of Business *</label><input type="text" name="business_type" class="form-input" required placeholder="e.g. Online retail, Tutoring, Catering"></div>`,
  };

  const fields = pt.fields.map(f => fieldHtml[f] ? fieldHtml[f]() : '').join('');

  const content = `
    <section class="section">
      <div class="container" style="max-width:640px;">
        <a href="/permits" class="btn btn-outline" style="margin-bottom:20px;display:inline-flex;">← All Permits</a>
        <div style="background:white;border:1.5px solid #e0e0e0;border-radius:14px;padding:28px 32px;">
          <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px;">
            <span style="font-size:2rem;">${pt.emoji}</span>
            <div>
              <h2 style="font-family:var(--font-display);font-size:1.2rem;color:var(--green-deep);margin-bottom:2px;">${escHtml(pt.label)}</h2>
              <div style="font-family:var(--font-ui);font-size:.78rem;color:#888;">
                ${escHtml(pt.dept)} · ~${pt.days} business day${pt.days>1?'s':''} · ${pt.fee===0?'Free':'$'+(pt.fee/100).toFixed(2)+' fee'}
              </div>
            </div>
          </div>
          <p style="font-family:var(--font-body);font-size:.88rem;color:#555;margin-bottom:20px;line-height:1.6;">
            ${escHtml(pt.desc)}
          </p>
          <form method="POST" action="/permits/apply">
            <input type="hidden" name="type" value="${escHtml(type)}">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
              <div class="form-group"><label class="form-label">Your Name *</label><input type="text" name="applicant_name" class="form-input" required></div>
              <div class="form-group"><label class="form-label">Email *</label><input type="email" name="applicant_email" class="form-input" required></div>
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label">Phone</label>
              <input type="tel" name="applicant_phone" class="form-input" style="max-width:220px;">
            </div>
            ${fields}
            <button type="submit" class="btn btn-primary btn-lg">Submit Application →</button>
          </form>
        </div>
      </div>
    </section>`;

  return new Response(await renderShell({
    title: pt.label, description: `Apply for ${pt.label} online in ${cfg.name||'Creston, Iowa'}.`,
    eyebrow: `${pt.emoji} Permits`, heading: pt.label, config: cfg, content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function submitApplication(request, env) {
  try {
    const form  = await request.formData();
    const type  = form.get('type') || '';
    const pt    = PERMIT_TYPES[type];
    if (!pt) return new Response('Invalid permit type', { status: 400 });

    const name  = (form.get('applicant_name')  || '').trim();
    const email = (form.get('applicant_email') || '').trim();
    const phone = (form.get('applicant_phone') || '').trim();

    if (!name || !email) return new Response('Name and email required', { status: 400 });

    // Build description from all form fields
    const desc = pt.fields.map(f => {
      const val = form.get(f);
      return val ? `${f.replace(/_/g,' ')}: ${val}` : '';
    }).filter(Boolean).join('\n');

    const year  = new Date().getFullYear();
    const count = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM permits WHERE permit_id LIKE 'PRMT-${year}-%'`).first().catch(()=>({cnt:0}));
    const num   = String((count?.cnt||0)+1).padStart(4,'0');
    const permId = `PRMT-${year}-${num}`;

    await env.DB.prepare(`
      INSERT INTO permits (permit_id, type, applicant_name, applicant_email, applicant_phone, description, status, fee_cents)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).bind(permId, type, name, email, phone, desc, pt.fee).run();

    const cfg = await getSiteConfig(env);
    if (env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.CONTACT_FROM || 'noreply@creston-iowa.com',
          to: [email],
          subject: `[${permId}] Permit Application Received — ${cfg.name||'City'}`,
          html: `<div style="font-family:sans-serif;max-width:560px;padding:24px;"><h2 style="color:#1a3a2a;">${pt.emoji} Permit Application Received</h2><p>Your application <strong>${permId}</strong> for <strong>${pt.label}</strong> has been received.</p><p>You'll receive an email when it's reviewed (typically within ${pt.days} business day${pt.days>1?'s':''}).</p><a href="${cfg.url||''}/permits/track?id=${permId}" style="display:inline-block;background:#2d5a3d;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:12px;">Track Status →</a></div>`,
        }),
      }).catch(()=>{});
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.CONTACT_FROM || 'noreply@creston-iowa.com',
          to: [env.CONTACT_EMAIL],
          subject: `[${permId}] New Permit Application — ${pt.label}`,
          html: `<div style="font-family:sans-serif;max-width:560px;padding:24px;"><h2>New Permit Application</h2><p><strong>${permId}</strong> · ${pt.label}</p><p>${name} (${email})</p><pre style="background:#f5f5f5;padding:12px;border-radius:6px;">${escHtml(desc)}</pre><a href="${cfg.url||''}/admin/permits" style="display:inline-block;background:#2d5a3d;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:12px;">Review in Admin →</a></div>`,
        }),
      }).catch(()=>{});
    }

    return new Response(null, { status: 302, headers: { Location: `/permits?success=1&id=${permId}` } });
  } catch (err) {
    console.error('Permit submit error:', err.message);
    return new Response('Submission failed: ' + err.message, { status: 500 });
  }
}

async function renderTrack(request, env, url) {
  const cfg    = await getSiteConfig(env);
  const permId = url.searchParams.get('id') || '';
  let   permit = null;
  if (permId) {
    permit = await env.DB.prepare(`SELECT * FROM permits WHERE permit_id = ?`).bind(permId.toUpperCase()).first().catch(()=>null);
  }
  const si  = permit ? (STATUS_LABELS[permit.status] || STATUS_LABELS.pending) : null;
  const pt  = permit ? PERMIT_TYPES[permit.type] : null;

  const content = `
    <section class="section"><div class="container" style="max-width:600px;">
      <h2 style="font-family:var(--font-display);font-size:1.3rem;color:var(--green-deep);margin-bottom:20px;">Track Permit Application</h2>
      <form method="GET" action="/permits/track" style="display:flex;gap:10px;margin-bottom:24px;">
        <input type="text" name="id" value="${escHtml(permId)}" class="form-input" placeholder="PRMT-2025-0001" style="flex:1;">
        <button type="submit" class="btn btn-primary">Track →</button>
      </form>
      ${permId && !permit ? `<div style="background:#fde8e8;border-radius:10px;padding:20px;text-align:center;"><p style="color:#b84040;">No application found with ID <strong>${escHtml(permId)}</strong>.</p></div>` : ''}
      ${permit ? `
      <div style="background:white;border:1.5px solid #e0e0e0;border-radius:12px;overflow:hidden;">
        <div style="background:${si.bg};padding:16px 24px;border-bottom:1px solid #e0e0e0;display:flex;justify-content:space-between;align-items:center;">
          <div><div style="font-family:monospace;font-size:.88rem;color:#888;">${escHtml(permit.permit_id)}</div>
          <div style="font-family:var(--font-ui);font-weight:700;color:var(--green-deep);">${pt ? escHtml(pt.label) : escHtml(permit.type)}</div></div>
          <span style="background:${si.color};color:white;padding:3px 12px;border-radius:100px;font-size:.78rem;font-weight:700;">${si.label}</span>
        </div>
        <div style="padding:20px 24px;font-family:var(--font-ui);font-size:.88rem;line-height:2.2;">
          <div><span style="color:#888;width:120px;display:inline-block;">Applicant</span>${escHtml(permit.applicant_name)}</div>
          <div><span style="color:#888;width:120px;display:inline-block;">Submitted</span>${new Date(permit.created_at).toLocaleDateString()}</div>
        </div>
        ${permit.notes ? `<div style="padding:0 24px 20px;font-size:.85rem;color:#555;">${escHtml(permit.notes)}</div>` : ''}
      </div>` : ''}
    </div></section>`;

  return new Response(await renderShell({
    title: 'Track Permit', description: 'Check the status of your permit application.',
    eyebrow: '📋 Permits', heading: 'Track Application', config: cfg, content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ── Admin ─────────────────────────────────────────────────────
export async function handlePermitsAdmin(request, env, url, user) {
  if (user.role === 'company_admin') return new Response('Forbidden', { status: 403 });
  const path     = url.pathname;
  const idMatch  = path.match(/\/admin\/permits\/(\d+)\/update/);

  if (idMatch && request.method === 'POST') {
    const body = await request.json().catch(()=>({}));
    const id   = idMatch[1];
    const sets = []; const vals = [];
    if (body.status) { sets.push('status = ?'); vals.push(body.status); }
    if (body.notes)  { sets.push('notes = ?');  vals.push(body.notes); }
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    await env.DB.prepare(`UPDATE permits SET ${sets.join(',')} WHERE id = ?`).bind(...vals).run();

    if (body.status && env.RESEND_API_KEY) {
      const permit = await env.DB.prepare(`SELECT * FROM permits WHERE id = ?`).bind(id).first();
      const cfg    = await getSiteConfig(env);
      const pt     = permit ? PERMIT_TYPES[permit.type] : null;
      if (permit) {
        const si = STATUS_LABELS[body.status];
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: env.CONTACT_FROM||'noreply@creston-iowa.com', to: [permit.applicant_email],
            subject: `[${permit.permit_id}] Permit ${si?.label||body.status}`,
            html: `<div style="font-family:sans-serif;max-width:560px;padding:24px;"><h2>${pt?.emoji||'📋'} Permit Application Update</h2><p>Your application <strong>${permit.permit_id}</strong> has been <strong>${si?.label||body.status}</strong>.</p>${body.notes?`<p>${escHtml(body.notes)}</p>`:''}</div>`,
          }),
        }).catch(()=>{});
      }
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const filter  = url.searchParams.get('status') || '';
  const permits = await env.DB.prepare(
    `SELECT * FROM permits ${filter?'WHERE status = ?':''} ORDER BY created_at DESC LIMIT 100`
  ).bind(...(filter?[filter]:[])).all().catch(()=>({results:[]}));

  const counts = await env.DB.prepare(
    `SELECT status, COUNT(*) as cnt FROM permits GROUP BY status`
  ).all().catch(()=>({results:[]}));
  const countMap = Object.fromEntries((counts.results||[]).map(r=>[r.status,r.cnt]));

  const rows = (permits.results||[]).map(p => {
    const si = STATUS_LABELS[p.status]||STATUS_LABELS.pending;
    const pt = PERMIT_TYPES[p.type];
    return `<tr>
      <td style="font-family:monospace;font-size:.78rem;">${escHtml(p.permit_id)}</td>
      <td>${pt?pt.emoji:''} ${escHtml(pt?.label||p.type)}</td>
      <td>${escHtml(p.applicant_name)}<br><span style="font-size:.72rem;color:#888;">${escHtml(p.applicant_email)}</span></td>
      <td>
        <select onchange="updatePermit(${p.id},'status',this.value)" style="font-size:.78rem;padding:3px 6px;border-radius:4px;border:1px solid #ddd;">
          ${Object.entries(STATUS_LABELS).map(([k,v])=>`<option value="${k}" ${p.status===k?'selected':''}>${v.label}</option>`).join('')}
        </select>
      </td>
      <td style="font-size:.78rem;">${p.fee_cents?'$'+(p.fee_cents/100).toFixed(2):'Free'}</td>
      <td style="font-size:.78rem;">${new Date(p.created_at).toLocaleDateString()}</td>
      <td><a href="mailto:${escHtml(p.applicant_email)}" class="tbl-btn tbl-btn-view">Email</a></td>
    </tr>`;
  }).join('');

  const body2 = `
    <div class="settings-header">
      <div><h2>📋 Permits & Licenses</h2>
      <p style="color:#888;font-family:sans-serif;font-size:.88rem;margin:4px 0 0;">
        ${countMap.pending||0} pending · ${countMap.approved||0} approved · ${countMap.denied||0} denied
      </p></div>
      <a href="/permits" target="_blank" class="btn-admin-secondary">Public Form →</a>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;font-family:sans-serif;font-size:.82rem;">
      <a href="/admin/permits" class="cat-pill ${!filter?'active':''}">All (${Object.values(countMap).reduce((a,b)=>a+b,0)||0})</a>
      ${Object.entries(STATUS_LABELS).map(([k,v])=>`<a href="/admin/permits?status=${k}" class="cat-pill ${filter===k?'active':''}">${v.label} (${countMap[k]||0})</a>`).join('')}
    </div>
    <div id="pm-msg" style="font-family:sans-serif;font-size:.85rem;min-height:1em;margin-bottom:8px;"></div>
    <table class="admin-table">
      <thead><tr><th>ID</th><th>Type</th><th>Applicant</th><th>Status</th><th>Fee</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>${rows||'<tr><td colspan="7" style="text-align:center;color:#888;padding:24px;">No applications yet.</td></tr>'}</tbody>
    </table>
    <script>
      const TOKEN=sessionStorage.getItem('admin_token')||'';
      const H={'Content-Type':'application/json','Authorization':'Bearer '+TOKEN};
      const msg=document.getElementById('pm-msg');
      async function updatePermit(id,field,value){
        msg.textContent='⏳ Saving...';msg.style.color='#888';
        const r=await fetch('/admin/permits/'+id+'/update',{method:'POST',headers:H,body:JSON.stringify({[field]:value})});
        const d=await r.json();
        msg.textContent=d.ok?'✅ Updated':'❌ '+(d.error||'Error');
        msg.style.color=d.ok?'#2d5a3d':'#b84040';
        setTimeout(()=>msg.textContent='',3000);
      }
    </script>`;

  return adminPage('📋 Permits', body2, user);
}
