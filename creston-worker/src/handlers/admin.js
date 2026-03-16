/**
 * handlers/admin.js
 * Password-protected admin UI for managing all R2 content.
 * Routes:
 *   GET  /admin          → dashboard (redirect to login if not authed)
 *   GET  /admin/login    → login page
 *   POST /admin/login    → process login
 *   GET  /admin/logout   → clear session
 *   GET  /admin/:type    → list content of type
 *   GET  /admin/:type/new       → new content editor
 *   GET  /admin/:type/:slug/edit → edit existing content
 */

import { isAuthenticated, validatePassword, buildSessionCookie, clearSessionCookie, unauthorizedResponse } from '../auth.js';

export async function handleAdmin(request, env, url) {
  const path = url.pathname;

  // Login / logout — no auth required
  if (path === '/admin/login')  return handleLogin(request, env);
  if (path === '/admin/logout') return handleLogout();

  // Everything else needs auth
  if (!isAuthenticated(request, env)) return unauthorizedResponse();

  if (path === '/admin' || path === '/admin/')     return renderDashboard(env);
  if (path.startsWith('/admin/'))                  return routeAdminSection(request, env, url, path);

  return new Response('Not found', { status: 404 });
}

// ── Login ─────────────────────────────────────────────────────
async function handleLogin(request, env) {
  if (request.method === 'POST') {
    const body     = await request.formData();
    const password = body.get('password') || '';

    if (validatePassword(password, env)) {
      return new Response(null, {
        status: 302,
        headers: {
          Location:   '/admin',
          'Set-Cookie': buildSessionCookie(env),
        }
      });
    }

    return new Response(loginPage('Invalid password. Try again.'), {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  return new Response(loginPage(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function handleLogout() {
  return new Response(null, {
    status: 302,
    headers: {
      Location:     '/admin/login',
      'Set-Cookie': clearSessionCookie(),
    }
  });
}

// ── Dashboard ─────────────────────────────────────────────────
async function renderDashboard(env) {
  // Count items in each category
  const counts = await Promise.all([
    env.BUCKET.list({ prefix: 'jobs/active/' }),
    env.BUCKET.list({ prefix: 'jobs/expired/' }),
    env.BUCKET.list({ prefix: 'food/' }),
    env.BUCKET.list({ prefix: 'news/' }),
    env.BUCKET.list({ prefix: 'attractions/' }),
  ]);

  const [activeJobs, expiredJobs, food, news, attractions] = counts.map(r =>
    r.objects.filter(o => o.key.endsWith('.md')).length
  );

  return adminPage('Dashboard', `
    <div class="admin-stats">
      <a href="/admin/jobs" class="stat-card">
        <div class="stat-icon">💼</div>
        <div class="stat-num">${activeJobs}</div>
        <div class="stat-label">Active Jobs</div>
        <div class="stat-sub">${expiredJobs} expired</div>
      </a>
      <a href="/admin/food" class="stat-card">
        <div class="stat-icon">🍽️</div>
        <div class="stat-num">${food}</div>
        <div class="stat-label">Restaurants</div>
      </a>
      <a href="/admin/news" class="stat-card">
        <div class="stat-icon">📰</div>
        <div class="stat-num">${news}</div>
        <div class="stat-label">News Articles</div>
      </a>
      <a href="/admin/attractions" class="stat-card">
        <div class="stat-icon">🎈</div>
        <div class="stat-num">${attractions}</div>
        <div class="stat-label">Attractions</div>
      </a>
    </div>

    <div class="admin-quick-actions">
      <h2>Quick Actions</h2>
      <div class="action-grid">
        <a href="/admin/jobs/new"        class="action-btn btn-jobs">+ New Job Listing</a>
        <a href="/admin/food/new"        class="action-btn btn-food">+ Add Restaurant</a>
        <a href="/admin/news/new"        class="action-btn btn-news">+ Write News Article</a>
        <a href="/admin/attractions/new" class="action-btn btn-attr">+ Add Attraction</a>
      </div>
    </div>

    <div class="admin-links">
      <h2>View Live Site</h2>
      <div class="link-row">
        <a href="/jobs" target="_blank">🔗 /jobs</a>
        <a href="/food" target="_blank">🔗 /food</a>
        <a href="/news" target="_blank">🔗 /news</a>
        <a href="/attractions" target="_blank">🔗 /attractions</a>
      </div>
    </div>
  `);
}

// ── Section routing ───────────────────────────────────────────
async function routeAdminSection(request, env, url, path) {
  const parts = path.replace('/admin/', '').split('/');
  const type  = parts[0]; // jobs, food, news, attractions
  const sub   = parts[1]; // 'new' or a slug
  const action = parts[2]; // 'edit'

  const VALID_TYPES = ['jobs', 'food', 'news', 'attractions'];
  if (!VALID_TYPES.includes(type)) return new Response('Not found', { status: 404 });

  // List view: /admin/jobs
  if (!sub) return renderContentList(env, type);

  // New form: /admin/jobs/new
  if (sub === 'new') return renderEditor(env, type, null);

  // Edit form: /admin/jobs/rn-nurse/edit
  if (action === 'edit') return renderEditor(env, type, sub);

  return new Response('Not found', { status: 404 });
}

// ── Content List ──────────────────────────────────────────────
async function renderContentList(env, type) {
  const prefixMap = {
    jobs:        ['jobs/active', 'jobs/expired'],
    food:        ['food'],
    news:        ['news'],
    attractions: ['attractions'],
  };

  const prefixes = prefixMap[type];
  let allItems = [];

  for (const prefix of prefixes) {
    const listed = await env.BUCKET.list({ prefix });
    for (const obj of listed.objects.filter(o => o.key.endsWith('.md'))) {
      const file = await env.BUCKET.get(obj.key);
      if (!file) continue;
      const raw  = await file.text();
      const meta = parseSimpleFrontmatter(raw);
      const slug = obj.key.split('/').pop().replace('.md', '');
      const isExpired = obj.key.includes('/expired/');
      allItems.push({ slug, key: obj.key, meta, isExpired, modified: obj.uploaded });
    }
  }

  const icons = { jobs: '💼', food: '🍽️', news: '📰', attractions: '🎈' };
  const rows  = allItems.map(item => `
    <tr class="${item.isExpired ? 'expired-row' : ''}">
      <td>
        <strong>${item.meta.title || item.meta.name || item.slug}</strong>
        ${item.isExpired ? '<span class="badge-expired">expired</span>' : ''}
      </td>
      <td>${item.meta.category || item.meta.type || '—'}</td>
      <td>${item.meta.posted || item.meta.date || (item.modified ? new Date(item.modified).toLocaleDateString() : '—')}</td>
      <td class="action-col">
        <a href="/admin/${type}/${item.slug}/edit" class="tbl-btn">Edit</a>
        ${type === 'jobs' && !item.isExpired
          ? `<button class="tbl-btn tbl-btn-warn" onclick="expireJob('${item.slug}')">Expire</button>`
          : ''}
        ${type === 'jobs' && item.isExpired
          ? `<button class="tbl-btn tbl-btn-ok" onclick="restoreJob('${item.slug}')">Restore</button>`
          : ''}
        <button class="tbl-btn tbl-btn-danger" onclick="deleteItem('${type}', '${item.slug}', '${item.isExpired}')">Delete</button>
        <a href="/${type === 'jobs' ? 'jobs' : type}/${item.slug}" target="_blank" class="tbl-btn tbl-btn-view">View</a>
      </td>
    </tr>`).join('');

  return adminPage(`${icons[type]} ${capitalize(type)}`, `
    <div class="list-header">
      <h2>${capitalize(type)} (${allItems.length})</h2>
      <a href="/admin/${type}/new" class="btn-admin-primary">+ Add New</a>
    </div>

    <table class="admin-table">
      <thead>
        <tr>
          <th>Title / Name</th>
          <th>Category / Type</th>
          <th>Date</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#888;padding:32px;">No items yet</td></tr>'}</tbody>
    </table>

    <script>
      const TOKEN = document.cookie.match(/admin_token=([^;]+)/)?.[1] || '';
      const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN };

      async function expireJob(slug) {
        if (!confirm('Move this job to expired?')) return;
        const r = await fetch('/api/jobs/' + slug + '/expire', { method: 'POST', headers });
        if (r.ok) location.reload();
        else alert('Failed: ' + (await r.text()));
      }
      async function restoreJob(slug) {
        const r = await fetch('/api/jobs/' + slug + '/restore', { method: 'POST', headers });
        if (r.ok) location.reload();
        else alert('Failed: ' + (await r.text()));
      }
      async function deleteItem(type, slug, isExpired) {
        if (!confirm('Permanently delete this item?')) return;
        const prefix = type === 'jobs' ? (isExpired === 'true' ? 'jobs-expired' : 'jobs') : type;
        const r = await fetch('/api/content/' + prefix + '/' + slug, { method: 'DELETE', headers });
        if (r.ok) location.reload();
        else alert('Failed: ' + (await r.text()));
      }
    </script>
  `);
}

// ── Editor ────────────────────────────────────────────────────
async function renderEditor(env, type, slug) {
  let existingContent = '';
  let existingSlug    = slug || '';

  if (slug) {
    const prefixMap = { jobs: 'jobs/active', food: 'food', news: 'news', attractions: 'attractions' };
    const file = await env.BUCKET.get(`${prefixMap[type]}/${slug}.md`);
    if (file) existingContent = await file.text();
  }

  const templates = {
    jobs: getJobTemplate(),
    food: getFoodTemplate(),
    news: getNewsTemplate(),
    attractions: getAttractionTemplate(),
  };

  const template = slug ? existingContent : templates[type];
  const isEdit   = !!slug;
  const title    = isEdit ? `Edit: ${slug}` : `New ${capitalize(type).slice(0, -1)}`;
  const icons    = { jobs: '💼', food: '🍽️', news: '📰', attractions: '🎈' };

  return adminPage(title, `
    <div class="editor-header">
      <a href="/admin/${type}" class="back-link">← Back to ${capitalize(type)}</a>
      <h2>${icons[type]} ${title}</h2>
    </div>

    <div class="editor-layout">
      <div class="editor-main">
        <div class="form-row">
          <label class="form-label">Slug (URL-friendly filename, no spaces)</label>
          <input type="text" id="slug-input" class="form-input"
                 value="${existingSlug}"
                 placeholder="e.g. rn-greater-regional"
                 ${isEdit ? 'readonly style="background:#f5f5f5;color:#888;"' : ''}>
          ${!isEdit ? `<small style="color:#888;font-family:sans-serif;font-size:.78rem;">Will be accessible at /${type}/<span id="slug-preview">${existingSlug || 'your-slug'}</span></small>` : ''}
        </div>

        <div class="editor-toolbar">
          <button type="button" onclick="insertMd('**', '**')" title="Bold">B</button>
          <button type="button" onclick="insertMd('*', '*')" title="Italic" style="font-style:italic;">I</button>
          <button type="button" onclick="insertMd('## ', '')" title="Heading">H2</button>
          <button type="button" onclick="insertMd('### ', '')" title="Sub-heading">H3</button>
          <button type="button" onclick="insertMd('- ', '')" title="List item">• List</button>
          <button type="button" onclick="insertMd('[text](', ')')" title="Link">🔗 Link</button>
          <button type="button" onclick="insertMd('`', '`')" title="Code">Code</button>
          <span class="toolbar-sep"></span>
          <button type="button" onclick="loadTemplate()" title="Load template" style="color:#c9933a;">↺ Template</button>
        </div>

        <textarea id="md-editor" class="md-editor" spellcheck="true">${escapeHtml(template)}</textarea>

        <div class="editor-actions">
          <button onclick="saveContent()" class="btn-admin-primary btn-save">
            ${isEdit ? '💾 Save Changes' : '🚀 Publish'}
          </button>
          <button onclick="previewContent()" class="btn-admin-secondary">
            👁 Preview
          </button>
          ${isEdit ? `<a href="/${type}/${slug}" target="_blank" class="btn-admin-secondary">🔗 View Live</a>` : ''}
        </div>
        <div id="save-status" style="margin-top:10px;font-family:sans-serif;font-size:.88rem;"></div>
      </div>

      <div class="editor-sidebar">
        <div class="preview-panel">
          <div class="preview-header">Preview</div>
          <div id="md-preview" class="preview-body markdown-body"></div>
        </div>
      </div>
    </div>

    <script>
      const TYPE     = '${type}';
      const IS_EDIT  = ${isEdit};
      const ORIG_SLUG = '${slug || ''}';
      const TOKEN    = document.cookie.match(/admin_token=([^;]+)/)?.[1] || '';
      const TEMPLATE = ${JSON.stringify(templates[type])};

      const editor     = document.getElementById('md-editor');
      const preview    = document.getElementById('md-preview');
      const slugInput  = document.getElementById('slug-input');
      const slugPrev   = document.getElementById('slug-preview');
      const saveStatus = document.getElementById('save-status');

      // Live preview
      editor.addEventListener('input', updatePreview);
      updatePreview();

      if (slugInput && slugPrev) {
        slugInput.addEventListener('input', () => {
          const safe = slugInput.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          slugPrev.textContent = safe || 'your-slug';
        });
      }

      function updatePreview() {
        // Simple client-side preview (basic markdown)
        let html = editor.value
          .replace(/^### (.+)$/gm, '<h3>$1</h3>')
          .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
          .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
          .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
          .replace(/\\*(.+?)\\*/g,   '<em>$1</em>')
          .replace(/^---[\\s\\S]*?---\\n?/, '<div class="frontmatter-notice">📋 Frontmatter (metadata)</div>\\n')
          .replace(/^- (.+)$/gm,  '<li>$1</li>')
          .split('\\n\\n').map(b => {
            b = b.trim();
            if (!b) return '';
            if (/^<(h[1-6]|ul|li|div)/.test(b)) return b;
            return '<p>' + b + '</p>';
          }).join('\\n');
        preview.innerHTML = html;
      }

      function insertMd(before, after) {
        const start = editor.selectionStart;
        const end   = editor.selectionEnd;
        const sel   = editor.value.slice(start, end);
        const newVal = editor.value.slice(0, start) + before + sel + after + editor.value.slice(end);
        editor.value = newVal;
        editor.selectionStart = start + before.length;
        editor.selectionEnd   = end + before.length;
        editor.focus();
        updatePreview();
      }

      function loadTemplate() {
        if (confirm('Replace current content with template?')) {
          editor.value = TEMPLATE;
          updatePreview();
        }
      }

      async function saveContent() {
        const slug    = slugInput ? slugInput.value.trim() : ORIG_SLUG;
        const content = editor.value;

        if (!slug) { alert('Please enter a slug'); return; }
        if (!content.trim()) { alert('Content is empty'); return; }

        saveStatus.textContent = 'Saving...';
        saveStatus.style.color = '#888';

        const method = IS_EDIT ? 'PUT' : 'POST';
        const url    = IS_EDIT
          ? '/api/content/' + TYPE + '/' + ORIG_SLUG
          : '/api/content/' + TYPE;

        const body = IS_EDIT ? { content } : { slug, content };

        try {
          const r = await fetch(url, {
            method,
            headers: {
              'Content-Type':  'application/json',
              'Authorization': 'Bearer ' + TOKEN,
            },
            body: JSON.stringify(body),
          });

          if (r.ok) {
            saveStatus.textContent = IS_EDIT ? '✅ Saved!' : '🚀 Published!';
            saveStatus.style.color = 'var(--green-mid, #2d5a3d)';
            if (!IS_EDIT) {
              setTimeout(() => {
                window.location.href = '/admin/' + TYPE;
              }, 1200);
            }
          } else {
            const err = await r.json();
            saveStatus.textContent = '❌ Error: ' + (err.error || r.status);
            saveStatus.style.color = '#b84040';
          }
        } catch (err) {
          saveStatus.textContent = '❌ Network error: ' + err.message;
          saveStatus.style.color = '#b84040';
        }
      }

      function previewContent() {
        const slug = (slugInput ? slugInput.value : ORIG_SLUG) || 'preview';
        // Open in same tab as a live preview
        window.open('/' + (TYPE === 'jobs' ? 'jobs' : TYPE) + '/' + slug, '_blank');
      }

      // Keyboard shortcut: Cmd/Ctrl+S to save
      editor.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault();
          saveContent();
        }
      });
    </script>
  `);
}

// ── Templates ─────────────────────────────────────────────────
function getJobTemplate() {
  const today   = new Date().toISOString().split('T')[0];
  const expires = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  return `---
title: Job Title Here
company: Company Name
location: Creston, IA
type: Full-Time
category: Healthcare
pay: "$18-24/hr"
posted: ${today}
expires: ${expires}
featured: false
apply_url: https://yourcompany.com/apply
apply_email: hiring@yourcompany.com
summary: One sentence description shown on the job board listing.
---

## About the Role

Describe the position here. What will this person do day-to-day?

## Responsibilities

- Responsibility one
- Responsibility two
- Responsibility three

## Requirements

- Requirement one
- Requirement two

## Benefits

- Health insurance
- 401k
- Paid time off

## How to Apply

Applications accepted via [our website](https://yourcompany.com/apply) or email hiring@yourcompany.com.
`;
}

function getFoodTemplate() {
  return `---
name: Restaurant Name
category: american
emoji: 🍔
address: 123 Main St, Creston, IA 50801
phone: "(641) 555-1234"
website: https://yourrestaurant.com
hours: "Mon-Sat 11am-9pm, Sun 11am-8pm"
price: "$$"
tags: [Dine-In, Takeout, Family Friendly]
featured: false
summary: One sentence description shown on the restaurant grid.
---

## About

Write a description of the restaurant here. What makes it special? What kind of food do they serve?

## Menu Highlights

- Signature dish one
- Signature dish two
- Popular appetizer

## The Experience

Describe the atmosphere, service, and what diners can expect.
`;
}

function getNewsTemplate() {
  const today = new Date().toISOString().split('T')[0];
  return `---
title: Article Headline Here
category: Community
date: ${today}
author: Staff Reporter
summary: One sentence summary shown on the news list page.
---

## Intro Paragraph

Lead with the most important information — who, what, when, where, why.

## Body

Expand on the story here. Add context, quotes, and details.

## More Details

Continue the article...

*For more information, contact [name] at [email or phone].*
`;
}

function getAttractionTemplate() {
  return `---
name: Attraction Name
category: Recreation
emoji: 🎈
tagline: Short tagline shown on the attractions grid
season: Year-round
location: Creston, IA
phone: "(641) 555-1234"
website: https://example.com
cost: Free admission
featured: false
summary: One sentence description.
---

## Overview

Describe this attraction. What is it? Why should people visit?

## Details

Add specifics about the attraction — history, activities, what to expect.

## Visitor Information

Directions, parking, accessibility info, best time to visit.
`;
}

// ── Page shells ────────────────────────────────────────────────
function adminPage(title, body) {
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
      <a href="/admin/food">🍽️ Food</a>
      <a href="/admin/news">📰 News</a>
      <a href="/admin/attractions">🎈 Attractions</a>
    </nav>
    <div class="admin-header-right">
      <a href="/" target="_blank" class="admin-view-site">View Site →</a>
      <a href="/admin/logout" class="admin-logout">Logout</a>
    </div>
  </header>
  <main class="admin-main">
    ${body}
  </main>
</body>
</html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function loginPage(error = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Login — Creston, Iowa</title>
  <link rel="stylesheet" href="/css/style.css">
  <style>
    body { background: var(--green-deep, #1a3a2a); min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: sans-serif; }
    .login-card { background: white; border-radius: 16px; padding: 48px 40px; width: 100%; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center; }
    .login-logo { font-size: 3rem; margin-bottom: 8px; }
    h1 { font-family: Georgia, serif; color: #1a3a2a; font-size: 1.6rem; margin-bottom: 4px; }
    .login-sub { color: #888; font-size: .85rem; margin-bottom: 28px; }
    .login-error { background: #fde8e8; color: #b84040; border-radius: 8px; padding: 10px 16px; margin-bottom: 20px; font-size: .88rem; }
    input[type=password] { width: 100%; padding: 12px 16px; border: 1.5px solid #ddd; border-radius: 8px; font-size: 1rem; margin-bottom: 16px; box-sizing: border-box; }
    input[type=password]:focus { outline: none; border-color: #2d5a3d; box-shadow: 0 0 0 3px rgba(45,90,61,.12); }
    button { width: 100%; padding: 13px; background: #2d5a3d; color: white; border: none; border-radius: 8px; font-size: .95rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #1a3a2a; }
    .back-link { display: block; margin-top: 16px; color: #888; font-size: .82rem; text-decoration: none; }
    .back-link:hover { color: #2d5a3d; }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="login-logo">🌾</div>
    <h1>Creston Admin</h1>
    <p class="login-sub">creston-iowa.com content manager</p>
    ${error ? `<div class="login-error">⚠️ ${escapeHtml(error)}</div>` : ''}
    <form method="POST" action="/admin/login">
      <input type="password" name="password" placeholder="Admin password" autofocus autocomplete="current-password">
      <button type="submit">Sign In</button>
    </form>
    <a href="/" class="back-link">← Back to site</a>
  </div>
</body>
</html>`;
}

// ── Utilities ─────────────────────────────────────────────────
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function parseSimpleFrontmatter(raw) {
  const meta = {};
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return meta;
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val   = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    meta[key] = val;
  }
  return meta;
}
