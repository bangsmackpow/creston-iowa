/**
 * src/handlers/admin.js  (v2 — multi-user with D1)
 */

import { getAuthUser, createUserSession, destroySession } from '../db/auth-d1.js';
import { getUserByEmail, getAllUsers, createUser, updateUserPassword, updateUserActive,
         getAllCompanies, createCompany, getCompanyById, updateCompany,
         createInvite, getPendingInvites, getInvite, markInviteUsed } from '../db/d1.js';
import { verifyPassword, hashPassword, generateToken } from '../db/crypto.js';
import { escapeHtml } from '../shell.js';

export async function handleAdmin(request, env, url) {
  const path = url.pathname;

  if (path === '/admin/login')                    return handleLogin(request, env);
  if (path === '/admin/logout')                   return handleLogout(request, env);
  if (path.startsWith('/admin/accept-invite'))    return handleAcceptInvite(request, env, url);

  const user = await getAuthUser(request, env);
  if (!user) return new Response(null, { status: 302, headers: { Location: '/admin/login' } });

  if (path === '/admin' || path === '/admin/')    return renderDashboard(env, user);
  if (path.startsWith('/admin/users'))            return handleUsers(request, env, url, user);
  if (path.startsWith('/admin/companies'))        return handleCompanies(request, env, url, user);
  if (path.startsWith('/admin/account'))          return handleAccount(request, env, url, user);
  if (path.startsWith('/admin/'))                 return routeContent(request, env, url, path, user);

  return new Response('Not found', { status: 404 });
}

// ── Login ──────────────────────────────────────────────────────
async function handleLogin(request, env) {
  if (!env.DB) {
    return html(loginPage('', 'D1 database not bound. Add binding named "DB" in Cloudflare dashboard → Pages → Settings → Bindings.'));
  }

  if (request.method === 'POST') {
    const fd       = await request.formData();
    const email    = (fd.get('email') || '').trim();
    const password = fd.get('password') || '';

    if (!email || !password) return html(loginPage('Email and password are required.'));

    try {
      const dbUser = await getUserByEmail(env.DB, email);
      if (!dbUser) return html(loginPage('Invalid email or password.'), 401);

      const isPlaceholder = dbUser.password_hash === 'PLACEHOLDER_CHANGE_ON_FIRST_LOGIN';
      const valid = isPlaceholder
        ? password === 'changeme'
        : await verifyPassword(password, dbUser.password_hash);

      if (!valid) return html(loginPage('Invalid email or password.'), 401);

      const { token, cookie } = await createUserSession(env, dbUser.id, request);
      const redirect = isPlaceholder ? '/admin/account?first_login=1' : '/admin';

      return new Response(`<!DOCTYPE html><html><body><script>
        sessionStorage.setItem('admin_token','${token}');
        location.href='${redirect}';
      </script></body></html>`, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': cookie }
      });
    } catch (err) {
      console.error('Login error:', err);
      return html(loginPage('Login error — please try again.'), 500);
    }
  }

  const welcome = new URL(request.url).searchParams.get('welcome');
  return html(loginPage('', welcome ? 'Account created! Please log in.' : ''));
}

async function handleLogout(request, env) {
  const clearCookie = await destroySession(request, env);
  return new Response(`<!DOCTYPE html><html><body><script>
    sessionStorage.removeItem('admin_token');
    location.href='/admin/login';
  </script></body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': clearCookie }
  });
}

// ── Accept Invite ──────────────────────────────────────────────
async function handleAcceptInvite(request, env, url) {
  const token  = url.searchParams.get('token') || '';
  if (!token) return new Response('Invalid invite link', { status: 400 });

  const invite = await getInvite(env.DB, token);
  if (!invite) return html(invitePage('', null, 'This invite link is invalid or has expired.'));

  if (request.method === 'POST') {
    const fd      = await request.formData();
    const name    = (fd.get('name') || '').trim();
    const pw      = fd.get('password') || '';
    const confirm = fd.get('confirm') || '';

    if (!name || !pw)    return html(invitePage(token, invite, 'Name and password are required.'));
    if (pw !== confirm)  return html(invitePage(token, invite, 'Passwords do not match.'));
    if (pw.length < 8)   return html(invitePage(token, invite, 'Password must be at least 8 characters.'));

    const existing = await getUserByEmail(env.DB, invite.email);
    if (existing)        return html(invitePage(token, invite, 'An account with this email already exists.'));

    await createUser(env.DB, { email: invite.email, passwordHash: await hashPassword(pw), name, role: invite.role, companyId: invite.company_id });
    await markInviteUsed(env.DB, token);
    return new Response(null, { status: 302, headers: { Location: '/admin/login?welcome=1' } });
  }

  return html(invitePage(token, invite));
}

// ── Dashboard ──────────────────────────────────────────────────
async function renderDashboard(env, user) {
  const sup = user.role === 'superadmin';
  let statsHtml = '';

  if (sup) {
    const [jobs, food, news, attr, cos, us] = await Promise.all([
      env.BUCKET.list({ prefix: 'jobs/active/' }),
      env.BUCKET.list({ prefix: 'food/' }),
      env.BUCKET.list({ prefix: 'news/' }),
      env.BUCKET.list({ prefix: 'attractions/' }),
      getAllCompanies(env.DB),
      getAllUsers(env.DB),
    ]);
    statsHtml = statGrid([
      { href:'/admin/jobs',        icon:'💼', num: countMd(jobs),   label:'Active Jobs' },
      { href:'/admin/food',        icon:'🍽️', num: countMd(food),   label:'Restaurants' },
      { href:'/admin/news',        icon:'📰', num: countMd(news),   label:'News Articles' },
      { href:'/admin/attractions', icon:'🎈', num: countMd(attr),   label:'Attractions' },
      { href:'/admin/companies',   icon:'🏢', num: (cos.results||[]).length, label:'Companies' },
      { href:'/admin/users',       icon:'👥', num: (us.results||[]).length,  label:'Users' },
    ]);
  } else {
    const prefix = `jobs/active/${user.company_slug || 'default'}/`;
    const listed = await env.BUCKET.list({ prefix });
    statsHtml = statGrid([
      { href:'/admin/jobs', icon:'💼', num: countMd(listed), label:'Your Active Jobs', sub: `${user.jobs_remaining||0} credits remaining` },
    ]);
    if ((user.jobs_remaining || 0) < 1) {
      statsHtml += `<div class="alert-box alert-warn">⚠️ No posting credits remaining. <a href="mailto:jobs@creston-iowa.com">Contact us to add more.</a></div>`;
    }
  }

  const actions = sup ? `
    <a href="/admin/jobs/new"        class="action-btn btn-jobs">+ New Job</a>
    <a href="/admin/food/new"        class="action-btn btn-food">+ Add Restaurant</a>
    <a href="/admin/news/new"        class="action-btn btn-news">+ Write Article</a>
    <a href="/admin/attractions/new" class="action-btn btn-attr">+ Add Attraction</a>
    <a href="/admin/companies/new"   class="action-btn" style="background:#6a3a7a;">+ New Company</a>
    <a href="/admin/users/new"       class="action-btn" style="background:#2e4163;">+ Invite User</a>
    <a href="/admin/settings"        class="action-btn" style="background:#444444;">⚙️ Site Settings</a>` : `
    <a href="/admin/jobs/new" class="action-btn btn-jobs">+ Post a Job</a>
    <a href="/admin/account"  class="action-btn" style="background:#2e4163;">⚙️ My Account</a>`;

  return adminPage('Dashboard', `
    <div class="welcome-bar">
      Welcome back, <strong>${escapeHtml(user.name)}</strong>
      ${user.company_name ? ` — <span style="color:var(--gold,#c9933a)">${escapeHtml(user.company_name)}</span>` : ''}
      <span class="role-badge role-${user.role}">${user.role}</span>
    </div>
    ${statsHtml}
    <div class="admin-quick-actions">
      <h2>Quick Actions</h2>
      <div class="action-grid">${actions}</div>
    </div>
    <div class="admin-links">
      <h2>Live Site</h2>
      <div class="link-row">
        <a href="/jobs" target="_blank">🔗 /jobs</a>
        <a href="/food" target="_blank">🔗 /food</a>
        <a href="/news" target="_blank">🔗 /news</a>
        <a href="/attractions" target="_blank">🔗 /attractions</a>
      </div>
    </div>
  `, user);
}

// ── Users ──────────────────────────────────────────────────────
async function handleUsers(request, env, url, user) {
  if (user.role !== 'superadmin') return new Response('Forbidden', { status: 403 });
  const path = url.pathname;

  if ((path === '/admin/users/new' || path === '/admin/users/invite') && request.method === 'GET') {
    return renderInviteForm(env, user);
  }
  if (path === '/admin/users/invite' && request.method === 'POST') {
    return processInvite(request, env, user);
  }

  const result   = await getAllUsers(env.DB);
  const users    = result.results || [];
  const invResult = await getPendingInvites(env.DB);
  const invites  = invResult.results || [];

  const rows = users.map(u => `
    <tr>
      <td><strong>${escapeHtml(u.name)}</strong><br><small style="color:#888">${escapeHtml(u.email)}</small></td>
      <td>${escapeHtml(u.company_name || '—')}</td>
      <td><span class="role-badge role-${u.role}">${u.role}</span></td>
      <td>${u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</td>
      <td><span class="tbl-btn ${u.active ? 'tbl-btn-ok' : 'tbl-btn-danger'}">${u.active ? 'Active' : 'Suspended'}</span></td>
    </tr>`).join('');

  const invRows = invites.map(i => `
    <tr>
      <td>${escapeHtml(i.email)}</td>
      <td>${escapeHtml(i.company_name || '—')}</td>
      <td><span class="role-badge role-${i.role}">${i.role}</span></td>
      <td>Expires ${new Date(i.expires_at).toLocaleDateString()}</td>
      <td><span style="color:#c9933a;font-size:.78rem;">Pending</span></td>
    </tr>`).join('');

  return adminPage('👥 Users', `
    <div class="list-header">
      <h2>Users (${users.length})</h2>
      <a href="/admin/users/new" class="btn-admin-primary">+ Invite User</a>
    </div>
    <table class="admin-table">
      <thead><tr><th>Name / Email</th><th>Company</th><th>Role</th><th>Last Login</th><th>Status</th></tr></thead>
      <tbody>${rows || noItems(5, 'No users yet')}</tbody>
    </table>
    ${invRows ? `<h3 style="margin:32px 0 12px;">Pending Invites</h3>
    <table class="admin-table">
      <thead><tr><th>Email</th><th>Company</th><th>Role</th><th>Expires</th><th>Status</th></tr></thead>
      <tbody>${invRows}</tbody>
    </table>` : ''}
  `, user);
}

async function renderInviteForm(env, user) {
  const cos  = await getAllCompanies(env.DB);
  const opts = (cos.results || []).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  return adminPage('+ Invite User', `
    <div class="editor-header">
      <a href="/admin/users" class="back-link">← Back to Users</a>
      <h2>Invite a New User</h2>
    </div>
    <div class="form-card">
      <form method="POST" action="/admin/users/invite">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Email Address *</label>
            <input type="email" name="email" class="form-input" required placeholder="user@company.com">
          </div>
          <div class="form-group">
            <label class="form-label">Role *</label>
            <select name="role" class="form-select">
              <option value="company_admin">Company Admin — post &amp; manage their own jobs</option>
              <option value="editor">Editor — manage site content</option>
              <option value="superadmin">Superadmin — full access</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Company (required for Company Admin)</label>
            <select name="company_id" class="form-select">
              <option value="">— No company —</option>${opts}
            </select>
          </div>
        </div>
        <button type="submit" class="btn-admin-primary">Generate Invite Link</button>
      </form>
    </div>
  `, user);
}

async function processInvite(request, env, user) {
  const fd        = await request.formData();
  const email     = (fd.get('email') || '').trim();
  const role      = fd.get('role') || 'company_admin';
  const companyId = fd.get('company_id') || null;
  if (!email) return new Response('Email required', { status: 400 });

  const token     = generateToken(24);
  const expiresAt = new Date(Date.now() + 7*86400*1000).toISOString().replace('T',' ').split('.')[0];
  await createInvite(env.DB, { token, email, companyId: companyId ? parseInt(companyId) : null, role, createdBy: user.uid, expiresAt });

  const inviteUrl = `https://creston-iowa.com/admin/accept-invite?token=${token}`;
  return adminPage('✅ Invite Created', `
    <div class="form-card" style="max-width:600px;">
      <h2 style="margin-bottom:16px;">Invite Link Created</h2>
      <p style="margin-bottom:12px;">Send this link to <strong>${escapeHtml(email)}</strong>:</p>
      <div class="invite-url-box"><code style="word-break:break-all;">${escapeHtml(inviteUrl)}</code></div>
      <p style="color:#888;font-size:.82rem;margin-top:8px;">Expires in 7 days. Single use only.</p>
      <div style="display:flex;gap:12px;margin-top:20px;">
        <a href="/admin/users" class="btn-admin-primary">← Back to Users</a>
        <a href="/admin/users/new" class="btn-admin-secondary">+ Invite Another</a>
      </div>
    </div>
  `, user);
}

// ── Companies ──────────────────────────────────────────────────
async function handleCompanies(request, env, url, user) {
  if (user.role !== 'superadmin') return new Response('Forbidden', { status: 403 });
  const path  = url.pathname;
  const parts = path.replace('/admin/companies', '').replace(/^\//, '').split('/');
  const id    = parseInt(parts[0]);
  const sub   = parts[1];

  if (path === '/admin/companies/new') {
    if (request.method === 'POST') {
      const fd = await request.formData();
      await createCompany(env.DB, {
        name:         (fd.get('name')||'').trim(),
        slug:         sanitizeSlug(fd.get('slug')||''),
        contactEmail: (fd.get('contact_email')||'').trim(),
        phone:        fd.get('phone')||null,
        website:      fd.get('website')||null,
        plan:         fd.get('plan')||'basic',
      });
      // Set credits
      const credits = parseInt(fd.get('jobs_remaining')||'0');
      if (credits > 0) {
        const slug = sanitizeSlug(fd.get('slug')||'');
        const c    = await env.DB.prepare('SELECT id FROM companies WHERE slug=?').bind(slug).first();
        if (c) await env.DB.prepare('UPDATE companies SET jobs_remaining=? WHERE id=?').bind(credits, c.id).run();
      }
      return new Response(null, { status: 302, headers: { Location: '/admin/companies' } });
    }
    return renderCompanyForm(user, null);
  }

  if (id && sub === 'edit') {
    const company = await getCompanyById(env.DB, id);
    if (!company) return new Response('Not found', { status: 404 });
    if (request.method === 'POST') {
      const fd = await request.formData();
      await updateCompany(env.DB, id, {
        name:          (fd.get('name')||'').trim(),
        contact_email: (fd.get('contact_email')||'').trim(),
        phone:         fd.get('phone')||null,
        website:       fd.get('website')||null,
        plan:          fd.get('plan')||'basic',
        active:        fd.get('active')==='1' ? 1 : 0,
        jobs_remaining: parseInt(fd.get('jobs_remaining')||'0'),
        notes:         fd.get('notes')||null,
      });
      return new Response(null, { status: 302, headers: { Location: '/admin/companies' } });
    }
    return renderCompanyForm(user, company);
  }

  const result    = await getAllCompanies(env.DB);
  const companies = result.results || [];
  const rows = companies.map(c => `
    <tr>
      <td><strong>${escapeHtml(c.name)}</strong><br><small style="color:#888">${escapeHtml(c.contact_email)}</small></td>
      <td><code style="font-size:.8rem">${escapeHtml(c.slug)}</code></td>
      <td><span class="tag tag-${c.active ? 'green' : 'red'}">${c.active ? 'Active' : 'Suspended'}</span></td>
      <td>${c.jobs_remaining} credits</td>
      <td>${c.user_count||0} users / ${c.job_count||0} jobs</td>
      <td class="action-col"><a href="/admin/companies/${c.id}/edit" class="tbl-btn">Edit</a></td>
    </tr>`).join('');

  return adminPage('🏢 Companies', `
    <div class="list-header">
      <h2>Companies (${companies.length})</h2>
      <a href="/admin/companies/new" class="btn-admin-primary">+ New Company</a>
    </div>
    <table class="admin-table">
      <thead><tr><th>Company</th><th>Slug</th><th>Status</th><th>Credits</th><th>Activity</th><th>Actions</th></tr></thead>
      <tbody>${rows || noItems(6, 'No companies yet')}</tbody>
    </table>
  `, user);
}

function renderCompanyForm(user, company) {
  const isEdit = !!company;
  return adminPage(isEdit ? `Edit: ${company.name}` : '+ New Company', `
    <div class="editor-header">
      <a href="/admin/companies" class="back-link">← Back to Companies</a>
      <h2>${isEdit ? `Edit: ${escapeHtml(company.name)}` : 'New Company'}</h2>
    </div>
    <div class="form-card">
      <form method="POST">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Company Name *</label>
            <input type="text" name="name" class="form-input" required value="${escapeHtml(company?.name||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Slug * (no spaces — used in R2 path)</label>
            <input type="text" name="slug" class="form-input" required value="${escapeHtml(company?.slug||'')}"
                   placeholder="acme-corp" ${isEdit ? 'readonly style="background:#f5f5f5"' : ''}>
            ${!isEdit ? '<small style="color:#888;font-size:.76rem">Jobs stored at: jobs/active/{slug}/filename.md</small>' : ''}
          </div>
          <div class="form-group">
            <label class="form-label">Contact Email *</label>
            <input type="email" name="contact_email" class="form-input" required value="${escapeHtml(company?.contact_email||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input type="text" name="phone" class="form-input" value="${escapeHtml(company?.phone||'')}" placeholder="(641) 555-1234">
          </div>
          <div class="form-group">
            <label class="form-label">Website</label>
            <input type="url" name="website" class="form-input" value="${escapeHtml(company?.website||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Job Posting Credits</label>
            <input type="number" name="jobs_remaining" class="form-input" min="0" value="${company?.jobs_remaining||0}">
            <small style="color:#888;font-size:.76rem">1 credit = 1 job post. Add credits when payment received.</small>
          </div>
          <div class="form-group">
            <label class="form-label">Plan</label>
            <select name="plan" class="form-select">
              <option value="basic"    ${company?.plan==='basic'    ? 'selected':''}>Basic ($49/listing)</option>
              <option value="featured" ${company?.plan==='featured' ? 'selected':''}>Featured ($89/listing)</option>
              <option value="premium"  ${company?.plan==='premium'  ? 'selected':''}>Premium ($149/listing)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select name="active" class="form-select">
              <option value="1" ${company?.active!==0 ? 'selected':''}>Active</option>
              <option value="0" ${company?.active===0 ? 'selected':''}>Suspended</option>
            </select>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">Internal Notes</label>
            <textarea name="notes" class="form-textarea" rows="2">${escapeHtml(company?.notes||'')}</textarea>
          </div>
        </div>
        <button type="submit" class="btn-admin-primary">${isEdit ? '💾 Save Changes' : '🏢 Create Company'}</button>
      </form>
    </div>
  `, user);
}

// ── Account ────────────────────────────────────────────────────
async function handleAccount(request, env, url, user) {
  const isFirst = url.searchParams.get('first_login') === '1';
  let message = '', error = '';

  if (request.method === 'POST') {
    const fd      = await request.formData();
    const current = fd.get('current_password') || '';
    const newPw   = fd.get('new_password') || '';
    const confirm = fd.get('confirm_password') || '';

    if (newPw !== confirm)  error = 'New passwords do not match.';
    else if (newPw.length < 8) error = 'Password must be at least 8 characters.';
    else {
      const dbUser      = await getUserByEmail(env.DB, user.email);
      const placeholder = dbUser?.password_hash === 'PLACEHOLDER_CHANGE_ON_FIRST_LOGIN';
      const valid       = placeholder ? current === 'changeme' : await verifyPassword(current, dbUser?.password_hash || '');
      if (!valid) error = 'Current password is incorrect.';
      else {
        await updateUserPassword(env.DB, user.uid, await hashPassword(newPw));
        message = 'Password updated successfully!';
      }
    }
  }

  return adminPage('⚙️ My Account', `
    <div class="editor-header">
      <a href="/admin" class="back-link">← Dashboard</a>
      <h2>My Account</h2>
    </div>
    ${isFirst  ? `<div class="alert-box alert-warn">⚠️ <strong>First login:</strong> Please set a secure password before continuing.</div>` : ''}
    ${message  ? `<div class="alert-box alert-ok">✅ ${escapeHtml(message)}</div>` : ''}
    ${error    ? `<div class="alert-box alert-err">❌ ${escapeHtml(error)}</div>` : ''}
    <div class="form-card" style="max-width:460px;">
      <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #eee;">
        <div class="form-label">Email</div><div style="font-size:1rem;margin-top:4px;">${escapeHtml(user.email)}</div>
      </div>
      <div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #eee;">
        <div class="form-label">Role</div>
        <span class="role-badge role-${user.role}" style="margin-top:6px;display:inline-block;">${user.role}</span>
      </div>
      <form method="POST">
        <div class="form-group">
          <label class="form-label">Current Password *</label>
          <input type="password" name="current_password" class="form-input" required placeholder="${isFirst ? 'changeme' : 'Your current password'}">
        </div>
        <div class="form-group">
          <label class="form-label">New Password * (min 8 characters)</label>
          <input type="password" name="new_password" class="form-input" required minlength="8">
        </div>
        <div class="form-group">
          <label class="form-label">Confirm New Password *</label>
          <input type="password" name="confirm_password" class="form-input" required>
        </div>
        <button type="submit" class="btn-admin-primary">💾 Update Password</button>
      </form>
    </div>
  `, user);
}

// ── Content CRUD ───────────────────────────────────────────────
async function routeContent(request, env, url, path, user) {
  const parts  = path.replace('/admin/', '').split('/');
  const type   = parts[0];
  const sub    = parts[1];
  const action = parts[2];

  if (!['jobs','food','news','attractions'].includes(type)) return new Response('Not found', { status: 404 });
  if (user.role === 'company_admin' && type !== 'jobs')     return new Response('Forbidden', { status: 403 });

  if (!sub)              return renderContentList(env, type, user);
  if (sub === 'new')     return renderEditor(env, type, null, user);
  if (action === 'edit') return renderEditor(env, type, sub, user);

  return new Response('Not found', { status: 404 });
}

async function renderContentList(env, type, user) {
  const sup         = user.role === 'superadmin';
  const companySlug = user.company_slug || '';

  const prefixes = type === 'jobs'
    ? (sup ? ['jobs/active/', 'jobs/expired/'] : [`jobs/active/${companySlug}/`, `jobs/expired/${companySlug}/`])
    : [`${type}/`];

  let allItems = [];
  for (const prefix of prefixes) {
    const listed = await env.BUCKET.list({ prefix });
    for (const obj of listed.objects.filter(o => o.key.endsWith('.md'))) {
      const file = await env.BUCKET.get(obj.key);
      if (!file) continue;
      const raw  = await file.text();
      const meta = parseSimpleFm(raw);
      // Extract company slug from R2 key path
      // jobs/active/company-slug/job.md → company-slug
      // jobs/active/job.md             → (none)
      const keyParts    = obj.key.split('/');
      const companyFromKey = type === 'jobs' && keyParts.length >= 4
        ? keyParts[2]   // jobs / active / company-slug / job.md
        : '';

      allItems.push({
        slug:        obj.key.split('/').pop().replace('.md',''),
        key:         obj.key,
        meta,
        isExpired:   obj.key.includes('/expired/'),
        modified:    obj.uploaded,
        companyFromKey,
      });
    }
  }

  const icons = { jobs:'💼', food:'🍽️', news:'📰', attractions:'🎈' };
  const rows  = allItems.map(item => `
    <tr class="${item.isExpired ? 'expired-row' : ''}">
      <td>
        <strong>${escapeHtml(item.meta.title || item.meta.name || item.slug)}</strong>
        ${item.isExpired ? '<span class="badge-expired">expired</span>' : ''}
      </td>
      ${type === 'jobs' && sup ? `<td>
        ${item.companyFromKey
          ? `<span class="tag tag-navy" style="font-size:.72rem;">${escapeHtml(item.companyFromKey)}</span>`
          : `<span style="color:#bbb;font-size:.78rem;">legacy</span>`}
        ${item.meta.company ? `<br><small style="color:#888;font-size:.72rem;">${escapeHtml(item.meta.company)}</small>` : ''}
      </td>` : ''}
      <td>${escapeHtml(item.meta.category || item.meta.type || '—')}</td>
      <td>${escapeHtml(item.meta.posted || item.meta.date || (item.modified ? new Date(item.modified).toLocaleDateString() : '—'))}</td>
      <td class="action-col">
        <a href="/admin/${type}/${item.slug}/edit" class="tbl-btn">Edit</a>
        ${type === 'jobs' && !item.isExpired ? `<button class="tbl-btn tbl-btn-warn" onclick="expireJob('${escapeHtml(item.slug)}','${escapeHtml(item.key)}')">Expire</button>` : ''}
        ${type === 'jobs' &&  item.isExpired ? `<button class="tbl-btn tbl-btn-ok"   onclick="restoreJob('${escapeHtml(item.slug)}','${escapeHtml(item.key)}')">Restore</button>` : ''}
        <button class="tbl-btn tbl-btn-danger" onclick="delItem('${type}','${escapeHtml(item.slug)}','${escapeHtml(item.key)}')">Delete</button>
        <a href="/${type==='jobs'?'jobs':type}/${item.slug}" target="_blank" class="tbl-btn tbl-btn-view">View</a>
      </td>
    </tr>`).join('');

  return adminPage(`${icons[type]} ${cap(type)}`, `
    <div class="list-header">
      <h2>${cap(type)} (${allItems.length})</h2>
      <a href="/admin/${type}/new" class="btn-admin-primary">+ Add New</a>
    </div>
    <table class="admin-table">
      <thead><tr>
        <th>Title / Name</th>
        ${type === 'jobs' && sup ? '<th>Company</th>' : ''}
        <th>Category</th>
        <th>Date</th>
        <th>Actions</th>
      </tr></thead>
      <tbody>${rows || noItems(type === 'jobs' && sup ? 5 : 4, `No ${type} yet`)}</tbody>
    </table>
    <script>
      const TOKEN = sessionStorage.getItem('admin_token') || '';
      const H = { 'Content-Type':'application/json', Authorization:'Bearer '+TOKEN };
      async function expireJob(slug,key) {
        if(!confirm('Move to expired?')) return;
        const r = await fetch('/api/jobs/'+encodeURIComponent(slug)+'/expire',{method:'POST',headers:H,body:JSON.stringify({key})});
        if(r.ok) location.reload(); else alert('Failed: '+await r.text());
      }
      async function restoreJob(slug,key) {
        if(!confirm('Restore to active?')) return;
        const r = await fetch('/api/jobs/'+encodeURIComponent(slug)+'/restore',{method:'POST',headers:H,body:JSON.stringify({key})});
        if(r.ok) location.reload(); else alert('Failed: '+await r.text());
      }
      async function delItem(type,slug,key) {
        if(!confirm('Permanently delete? Cannot be undone.')) return;
        const r = await fetch('/api/content/'+type+'/'+encodeURIComponent(slug),{method:'DELETE',headers:H,body:JSON.stringify({key})});
        if(r.ok) location.reload(); else alert('Failed: '+await r.text());
      }
    </script>
  `, user);
}

async function renderEditor(env, type, slug, user) {
  const sup         = user.role === 'superadmin';
  const companySlug = user.company_slug || 'default';
  let existingContent = '', existingKey = '';

  if (slug) {
    const paths = type === 'jobs'
      ? [`jobs/active/${companySlug}/${slug}.md`, `jobs/active/${slug}.md`]
      : [`${type}/${slug}.md`];
    for (const p of paths) {
      const f = await env.BUCKET.get(p);
      if (f) { existingContent = await f.text(); existingKey = p; break; }
    }
  }

  const tpls  = { jobs: jobTpl(), food: foodTpl(), news: newsTpl(), attractions: attrTpl() };
  const tpl   = slug ? existingContent : tpls[type];
  const isEdit = !!slug;
  const icons  = { jobs:'💼', food:'🍽️', news:'📰', attractions:'🎈' };
  const noCredits = !sup && !isEdit && (user.jobs_remaining || 0) < 1;

  return adminPage(isEdit ? `Edit: ${slug}` : `New ${cap(type).slice(0,-1)}`, `
    ${noCredits ? `<div class="alert-box alert-err">❌ No posting credits. <a href="mailto:jobs@creston-iowa.com">Contact us →</a></div>` : ''}
    <div class="editor-header">
      <a href="/admin/${type}" class="back-link">← Back to ${cap(type)}</a>
      <h2>${icons[type]} ${isEdit ? `Edit: ${escapeHtml(slug)}` : `New ${cap(type).slice(0,-1)}`}</h2>
    </div>
    <div class="editor-layout">
      <div class="editor-main">
        <div class="form-row">
          <label class="form-label">Slug (URL-friendly, no spaces)</label>
          <input type="text" id="slug-input" class="form-input"
                 value="${escapeHtml(slug||'')}" placeholder="e.g. rn-greater-regional"
                 ${isEdit ? 'readonly style="background:#f5f5f5;color:#888"' : ''}>
          ${!isEdit ? `<small style="color:#888;font-family:sans-serif;font-size:.76rem;margin-top:4px;display:block;">
            URL: /${type}/<span id="slug-preview">${escapeHtml(slug)||'your-slug'}</span>
            ${type==='jobs'&&!sup ? ` · R2: jobs/active/${escapeHtml(companySlug)}/{slug}.md` : ''}
          </small>` : ''}
        </div>
        <div class="editor-toolbar">
          <button type="button" onclick="ins('**','**')"><strong>B</strong></button>
          <button type="button" onclick="ins('*','*')"><em>I</em></button>
          <button type="button" onclick="ins('## ','')">H2</button>
          <button type="button" onclick="ins('### ','')">H3</button>
          <button type="button" onclick="ins('- ','')">• List</button>
          <button type="button" onclick="ins('[text](',')')">🔗</button>
          <button type="button" onclick="ins('&#96;','&#96;')">Code</button>
          <span class="toolbar-sep"></span>
          <button type="button" onclick="resetTpl()" style="color:#c9933a;">↺ Template</button>
        </div>
        <textarea id="md-editor" class="md-editor" spellcheck="true">${escapeHtml(tpl)}</textarea>
        <div class="editor-actions">
          <button onclick="save()" class="btn-admin-primary btn-save" ${noCredits ? 'disabled style="opacity:.5"' : ''}>
            ${isEdit ? '💾 Save Changes' : '🚀 Publish'}
          </button>
          ${isEdit ? `<a href="/${type==='jobs'?'jobs':type}/${escapeHtml(slug)}" target="_blank" class="btn-admin-secondary">🔗 View Live</a>` : ''}
        </div>
        <div id="status" style="margin-top:12px;font-family:sans-serif;font-size:.9rem;min-height:1.4em;"></div>
      </div>
      <div class="editor-sidebar">
        <div class="preview-panel">
          <div class="preview-header">Preview</div>
          <div id="preview" class="preview-body markdown-body"></div>
        </div>
      </div>
    </div>
    <script>
      const TYPE='${type}',IS_EDIT=${isEdit},ORIG='${escapeHtml(slug||'')}',OKEY='${escapeHtml(existingKey)}';
      const CSLUG='${escapeHtml(companySlug)}',SUP=${sup};
      const TOKEN=sessionStorage.getItem('admin_token')||'';
      const TPL=${JSON.stringify(tpls[type])};
      const ed=document.getElementById('md-editor'),prev=document.getElementById('preview');
      const si=document.getElementById('slug-input'),sp=document.getElementById('slug-preview');
      const st=document.getElementById('status');
      ed.addEventListener('input',render); render();
      if(si&&sp) si.addEventListener('input',()=>{ sp.textContent=si.value.toLowerCase().replace(/[^a-z0-9-]/g,'-')||'your-slug'; });
      function render(){
        let h=ed.value
          .replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>')
          .replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>').replace(/\\*(.+?)\\*/g,'<em>$1</em>')
          .replace(/^---[\\s\\S]*?---\\n?/,'<div class="frontmatter-notice">📋 Frontmatter</div>\\n')
          .replace(/^- (.+)$/gm,'<li>$1</li>')
          .split('\\n\\n').map(b=>{b=b.trim();if(!b)return '';if(/^<(h[1-6]|ul|li|div)/.test(b))return b;return '<p>'+b.replace(/\\n/g,'<br>')+'</p>';}).join('\\n');
        prev.innerHTML=h;
      }
      function ins(a,b){
        const s=ed.selectionStart,e=ed.selectionEnd,sel=ed.value.slice(s,e);
        ed.value=ed.value.slice(0,s)+a+sel+b+ed.value.slice(e);
        ed.selectionStart=s+a.length; ed.selectionEnd=e+a.length; ed.focus(); render();
      }
      function resetTpl(){ if(confirm('Reset to template?')){ed.value=TPL;render();} }
      async function save(){
        const slug=si?si.value.trim():ORIG, content=ed.value.trim();
        if(!slug){alert('Enter a slug.');return;} if(!content){alert('Content empty.');return;}
        if(!TOKEN){alert('Session expired — log out and back in.');return;}
        st.textContent='⏳ Saving...'; st.style.color='#888';
        const method=IS_EDIT?'PUT':'POST';
        const url=IS_EDIT?'/api/content/'+TYPE+'/'+ORIG:'/api/content/'+TYPE;
        const body=IS_EDIT?{content,key:OKEY}:{slug,content,company_slug:SUP?null:CSLUG};
        try{
          const r=await fetch(url,{method,headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},body:JSON.stringify(body)});
          if(r.ok){
            st.textContent=IS_EDIT?'✅ Saved!':'🚀 Published!'; st.style.color='#2d5a3d';
            if(!IS_EDIT) setTimeout(()=>{location.href='/admin/'+TYPE;},1400);
          } else {
            let m=r.status; try{const j=await r.json();m=j.error||m;}catch{}
            st.textContent='❌ Error: '+m; st.style.color='#b84040';
          }
        }catch(e){st.textContent='❌ '+e.message;st.style.color='#b84040';}
      }
      ed.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();save();}});
    </script>
  `, user);
}

// ── Templates ──────────────────────────────────────────────────
function jobTpl() {
  const t=new Date().toISOString().split('T')[0];
  const x=new Date(Date.now()+30*86400000).toISOString().split('T')[0];
  return `---\ntitle: Job Title\ncompany: Company Name\nlocation: Creston, IA\ntype: Full-Time\ncategory: Healthcare\npay: "$18-24/hr"\nposted: ${t}\nexpires: ${x}\nfeatured: false\napply_url: https://yourcompany.com/apply\napply_email: hiring@yourcompany.com\nsummary: One sentence description for the job board.\n---\n\n## About the Role\n\nDescribe the position.\n\n## Responsibilities\n\n- Item one\n- Item two\n\n## Requirements\n\n- Requirement one\n\n## How to Apply\n\nEmail hiring@yourcompany.com\n`;
}
function foodTpl() {
  return `---\nname: Restaurant Name\ncategory: american\nemoji: 🍔\naddress: 123 Main St, Creston, IA 50801\nphone: "(641) 555-1234"\nwebsite: https://yourrestaurant.com\nhours: "Mon-Sat 11am-9pm"\nprice: "$$"\ntags: [Dine-In, Takeout]\nfeatured: false\nsummary: One sentence description.\n---\n\n## About\n\nDescribe the restaurant.\n\n## Menu Highlights\n\n- Dish one\n- Dish two\n`;
}
function newsTpl() {
  return `---\ntitle: Article Headline\ncategory: Community\ndate: ${new Date().toISOString().split('T')[0]}\nauthor: Staff Reporter\nsummary: One sentence summary.\n---\n\n## Opening Paragraph\n\nWho, what, when, where, why.\n\n## Body\n\nExpand on the story.\n`;
}
function attrTpl() {
  return `---\nname: Attraction Name\ncategory: Recreation\nemoji: 🎈\ntagline: Short tagline\nseason: Year-round\nlocation: Creston, IA\ncost: Free\nfeatured: false\nsummary: One sentence description.\n---\n\n## Overview\n\nDescribe this attraction.\n\n## Visitor Information\n\nHours, location, cost.\n`;
}

// ── Shell ──────────────────────────────────────────────────────
function adminPage(title, body, user) {
  const sup = user?.role === 'superadmin';
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Creston Admin</title>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/admin.css">
</head>
<body class="admin-body">
  <header class="admin-header">
    <a href="/admin" class="admin-logo">🌾 Creston Admin</a>
    <nav class="admin-nav">
      <a href="/admin/jobs">💼 Jobs</a>
      ${sup ? `<a href="/admin/food">🍽️ Food</a>
      <a href="/admin/news">📰 News</a>
      <a href="/admin/attractions">🎈 Attractions</a>
      <a href="/admin/companies">🏢 Companies</a>
      <a href="/admin/users">👥 Users</a>
      <a href="/admin/settings">⚙️ Settings</a>` : ''}
    </nav>
    <div class="admin-header-right">
      <a href="/admin/account" class="admin-view-site">⚙️ ${escapeHtml(user?.name||'Account')}</a>
      <a href="/" target="_blank" class="admin-view-site">View Site →</a>
      <a href="/admin/logout" class="admin-logout">Logout</a>
    </div>
  </header>
  <main class="admin-main">${body}</main>
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function loginPage(error='', info='') {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Login — Creston</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#1a3a2a;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif}.card{background:#fff;border-radius:16px;padding:48px 40px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center}.logo{font-size:3rem;margin-bottom:8px}h1{font-family:Georgia,serif;color:#1a3a2a;font-size:1.6rem;margin-bottom:4px}.sub{color:#888;font-size:.85rem;margin-bottom:24px}.alert{border-radius:8px;padding:10px 16px;margin-bottom:16px;font-size:.88rem}.err{background:#fde8e8;color:#b84040}.info{background:#e8f2eb;color:#2d5a3d}label{display:block;text-align:left;font-size:.76rem;font-weight:700;color:#444;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}.g{margin-bottom:16px}input{width:100%;padding:12px 16px;border:1.5px solid #ddd;border-radius:8px;font-size:1rem}input:focus{outline:none;border-color:#2d5a3d;box-shadow:0 0 0 3px rgba(45,90,61,.12)}button{width:100%;padding:13px;background:#2d5a3d;color:#fff;border:none;border-radius:8px;font-size:.95rem;font-weight:600;cursor:pointer;margin-top:4px}button:hover{background:#1a3a2a}.back{display:block;margin-top:16px;color:#888;font-size:.82rem;text-decoration:none}.back:hover{color:#2d5a3d}</style>
  </head><body><div class="card"><div class="logo">🌾</div><h1>Creston Admin</h1><p class="sub">creston-iowa.com content manager</p>
  ${error ? `<div class="alert err">⚠️ ${escapeHtml(error)}</div>` : ''}
  ${info  ? `<div class="alert info">ℹ️ ${escapeHtml(info)}</div>`  : ''}
  <form method="POST" action="/admin/login">
    <div class="g"><label>Email</label><input type="email" name="email" required autofocus autocomplete="email" placeholder="admin@creston-iowa.com"></div>
    <div class="g"><label>Password</label><input type="password" name="password" required autocomplete="current-password"></div>
    <button type="submit">Sign In</button>
  </form>
  <a href="/" class="back">← Back to site</a>
  </div></body></html>`;
}

function invitePage(token, invite, error='') {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Create Account — Creston</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#1a3a2a;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif}.card{background:#fff;border-radius:16px;padding:48px 40px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.3)}.logo{font-size:2rem;margin-bottom:8px;text-align:center}h1{font-family:Georgia,serif;color:#1a3a2a;font-size:1.4rem;text-align:center;margin-bottom:4px}.sub{color:#888;font-size:.85rem;margin-bottom:24px;text-align:center}.err{background:#fde8e8;color:#b84040;border-radius:8px;padding:10px 16px;margin-bottom:16px;font-size:.88rem}label{display:block;font-size:.76rem;font-weight:700;color:#444;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}.g{margin-bottom:16px}input{width:100%;padding:12px 16px;border:1.5px solid #ddd;border-radius:8px;font-size:1rem}input:focus{outline:none;border-color:#2d5a3d}button{width:100%;padding:13px;background:#2d5a3d;color:#fff;border:none;border-radius:8px;font-size:.95rem;font-weight:600;cursor:pointer;margin-top:4px}</style>
  </head><body><div class="card"><div class="logo">🌾</div><h1>Create Your Account</h1>
  <p class="sub">You've been invited to manage ${invite?.company_name ? escapeHtml(invite.company_name)+' on ' : ''}creston-iowa.com</p>
  ${error ? `<div class="err">⚠️ ${escapeHtml(error)}</div>` : ''}
  <form method="POST">
    <div class="g"><label>Email</label><input type="email" value="${escapeHtml(invite?.email||'')}" readonly style="background:#f5f5f5;color:#888"></div>
    <div class="g"><label>Your Name *</label><input type="text" name="name" required placeholder="First Last"></div>
    <div class="g"><label>Password * (min 8 chars)</label><input type="password" name="password" required minlength="8"></div>
    <div class="g"><label>Confirm Password *</label><input type="password" name="confirm" required></div>
    <button type="submit">Create Account &amp; Sign In</button>
  </form></div></body></html>`;
}

// ── Helpers ────────────────────────────────────────────────────
function cap(s)      { return s.charAt(0).toUpperCase()+s.slice(1); }
function countMd(r)  { return r.objects.filter(o=>o.key.endsWith('.md')).length; }
function noItems(cols, msg) { return `<tr><td colspan="${cols}" style="text-align:center;color:#888;padding:32px;">${msg}</td></tr>`; }
function html(body, status=200) { return new Response(body, { status, headers: {'Content-Type':'text/html;charset=utf-8'} }); }
function sanitizeSlug(s) { return s.toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,''); }
function parseSimpleFm(raw) {
  const meta={}, m=raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if(!m) return meta;
  for(const line of m[1].split('\n')){
    const i=line.indexOf(':'); if(i===-1) continue;
    meta[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^["']|["']$/g,'');
  }
  return meta;
}

function statGrid(items) {
  return `<div class="admin-stats">${items.map(i=>`
    <a href="${i.href}" class="stat-card">
      <div class="stat-icon">${i.icon}</div>
      <div class="stat-num">${i.num}</div>
      <div class="stat-label">${i.label}</div>
      ${i.sub ? `<div class="stat-sub">${i.sub}</div>` : ''}
    </a>`).join('')}</div>`;
}
