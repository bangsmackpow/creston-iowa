/**
 * src/handlers/bulletin.js
 * Community Bulletin Board.
 *
 * R2 structure:
 *   bulletin/pending/timestamp-slug.json   ← submitted, awaiting approval
 *   bulletin/approved/slug.md              ← live posts
 *   bulletin/rejected/timestamp-slug.json  ← rejected
 *
 * Post schema:
 *   title, category, body, name, email, phone (optional), created_at
 *
 * Categories: announcement | for-sale | wanted | lost-found | services | event | other
 *
 * Public routes:
 *   GET  /bulletin           → list of approved posts
 *   GET  /bulletin/:slug     → single approved post
 *   POST /bulletin/submit    → submit a new post (goes to pending)
 *
 * Admin routes:
 *   GET  /admin/bulletin               → pending queue + approved list
 *   POST /admin/bulletin/approve       → approve a pending post
 *   POST /admin/bulletin/reject        → reject a pending post
 *   POST /admin/bulletin/:slug/delete  → delete an approved post
 */

import { renderShell, escHtml, adSlot } from '../shell.js';
import { parseMarkdown }                from '../markdown.js';
import { getSiteConfig }                from '../db/site.js';
import { shareBar }                     from './meetings.js';
import { adminPage }                    from './admin.js';

const PENDING_PREFIX  = 'bulletin/pending/';
const APPROVED_PREFIX = 'bulletin/approved/';
const REJECTED_PREFIX = 'bulletin/rejected/';

// ── Public routes ──────────────────────────────────────────────
export async function handleBulletin(request, env, url) {
  const path = url.pathname;

  if (path === '/bulletin/submit' && request.method === 'POST') {
    return handleSubmit(request, env);
  }

  const slug = path.replace('/bulletin', '').replace(/^\/|\/$/g, '');
  if (slug && slug !== 'submit') return renderPostDetail(request, env, slug);
  return renderBulletinList(request, env, url);
}

// ── Public list ────────────────────────────────────────────────
async function renderBulletinList(request, env, url) {
  const cfg = await getSiteConfig(env);
  const cat = url.searchParams.get('cat') || '';

  const all = await loadApproved(env);
  const filtered = cat ? all.filter(p => p.meta.category === cat) : all;
  const cats = [...new Set(all.map(p => p.meta.category).filter(Boolean))].sort();

  const catTabs = cats.map(c => `
    <a href="/bulletin?cat=${c}" class="cat-pill ${cat===c?'active':''}">
      ${getCatEmoji(c)} ${escHtml(capitalize(c))}
    </a>`).join('');

  const cards = filtered.length === 0
    ? `<div class="empty-state">
        <div style="font-size:3rem;margin-bottom:16px;">📋</div>
        <h3>No posts yet</h3>
        <p>Be the first to post a community announcement.</p>
       </div>`
    : filtered.map(p => renderPostCard(p)).join('');

  const content = `
    <section class="section">
      <div class="container">
        <div class="bulletin-layout">
          <div class="bulletin-main">
            ${catTabs ? `<div class="cat-filters" style="margin-bottom:20px;">
              <a href="/bulletin" class="cat-pill ${!cat?'active':''}">All (${all.length})</a>
              ${catTabs}
            </div>` : ''}
            <div class="bulletin-list">${cards}</div>
          </div>
          <aside class="bulletin-sidebar">
            <div class="sidebar-widget">
              <div class="widget-header">📝 Post an Announcement</div>
              <div class="widget-body">
                <p style="font-family:var(--font-ui);font-size:.83rem;color:#666;margin-bottom:12px;">
                  Share news, items for sale, lost pets, or community announcements.
                  Posts are reviewed before going live.
                </p>
                <a href="#submit-form" class="btn btn-primary" style="width:100%;justify-content:center;">
                  Submit a Post →
                </a>
              </div>
            </div>
            <div class="sidebar-widget" style="margin-top:16px;">
              <div class="widget-header">📋 Categories</div>
              <div class="widget-body">
                ${cats.map(c => `
                <a href="/bulletin?cat=${c}" class="dir-cat-link ${cat===c?'active':''}">
                  ${getCatEmoji(c)} ${escHtml(capitalize(c))}
                  <span class="dir-count">${all.filter(p=>p.meta.category===c).length}</span>
                </a>`).join('')}
              </div>
            </div>
            ${adSlot('square', cfg)}
          </aside>
        </div>

        <!-- Submit form -->
        <div id="submit-form" class="submit-form-section">
          <h2>📝 Submit a Community Post</h2>
          <p style="font-family:var(--font-ui);font-size:.88rem;color:#666;margin-bottom:20px;">
            Posts are reviewed by our team before going live — typically within 24 hours.
            Keep it civil and relevant to our community.
          </p>
          <div id="submit-status" style="margin-bottom:16px;min-height:1em;font-family:sans-serif;font-size:.9rem;"></div>
          <div class="submit-form">
            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Title *</label>
                <input type="text" id="post-title" class="form-input" placeholder="Brief, descriptive title" maxlength="100">
              </div>
              <div class="form-group">
                <label class="form-label">Category *</label>
                <select id="post-category" class="form-select">
                  <option value="">Choose a category...</option>
                  <option value="announcement">📢 Announcement</option>
                  <option value="for-sale">🏷️ For Sale</option>
                  <option value="wanted">🔍 Wanted</option>
                  <option value="lost-found">🐾 Lost &amp; Found</option>
                  <option value="services">🔧 Services</option>
                  <option value="event">🎈 Event</option>
                  <option value="other">📌 Other</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Post Content *</label>
              <textarea id="post-body" class="form-input" rows="6"
                placeholder="Provide all relevant details — location, price, contact info, dates, etc."
                maxlength="2000"></textarea>
              <small id="body-count" style="font-family:sans-serif;font-size:.75rem;color:#aaa;">0/2000 characters</small>
            </div>
            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Your Name *</label>
                <input type="text" id="post-name" class="form-input" placeholder="First and last name">
              </div>
              <div class="form-group">
                <label class="form-label">Email (not published)</label>
                <input type="email" id="post-email" class="form-input" placeholder="for admin contact only">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Phone (optional, not published)</label>
              <input type="tel" id="post-phone" class="form-input" placeholder="(641) 782-XXXX" style="max-width:240px;">
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:flex-start;gap:10px;font-family:var(--font-ui);font-size:.83rem;color:#555;cursor:pointer;">
                <input type="checkbox" id="post-agree" style="margin-top:2px;">
                <span>I confirm this post is accurate, relevant to the ${escHtml(cfg.name||'Creston')} community, and does not contain spam or offensive content.</span>
              </label>
            </div>
            <button onclick="submitPost()" class="btn btn-primary btn-lg">
              Submit for Review →
            </button>
          </div>
        </div>
      </div>
    </section>

    <style>
      .bulletin-layout { display:grid; grid-template-columns:1fr 260px; gap:28px; align-items:start; margin-bottom:48px; }
      .bulletin-list { display:flex; flex-direction:column; gap:12px; }
      .bulletin-card { background:white; border:1.5px solid #e0e0e0; border-radius:12px; padding:20px 24px; transition:border-color .15s; }
      .bulletin-card:hover { border-color:var(--green-mid); }
      .bulletin-card-header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:8px; }
      .bulletin-title { font-family:var(--font-display); font-size:1.05rem; font-weight:700; color:var(--green-deep); text-decoration:none; }
      .bulletin-title:hover { text-decoration:underline; }
      .bulletin-meta { font-family:var(--font-ui); font-size:.78rem; color:#888; display:flex; gap:12px; flex-wrap:wrap; margin-top:4px; }
      .bulletin-body { font-size:.9rem; color:#555; line-height:1.6; margin-top:8px; }
      .submit-form-section { border-top:2px solid #e0e0e0; padding-top:40px; margin-top:16px; }
      .submit-form-section h2 { font-family:var(--font-display); font-size:1.5rem; color:var(--green-deep); margin-bottom:8px; }
      .submit-form { background:white; border:1.5px solid #e0e0e0; border-radius:12px; padding:28px; max-width:680px; }
      .form-row-2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
      @media(max-width:768px) { .bulletin-layout { grid-template-columns:1fr; } .form-row-2 { grid-template-columns:1fr; } }
    </style>

    <script>
      // Character counter
      const bodyEl = document.getElementById('post-body');
      const cntEl  = document.getElementById('body-count');
      if (bodyEl && cntEl) bodyEl.addEventListener('input', () => { cntEl.textContent = bodyEl.value.length + '/2000'; });

      async function submitPost() {
        const title    = document.getElementById('post-title').value.trim();
        const category = document.getElementById('post-category').value;
        const body     = document.getElementById('post-body').value.trim();
        const name     = document.getElementById('post-name').value.trim();
        const email    = document.getElementById('post-email').value.trim();
        const phone    = document.getElementById('post-phone').value.trim();
        const agree    = document.getElementById('post-agree').checked;
        const st       = document.getElementById('submit-status');

        if (!title)    { st.textContent = '⚠️ Please enter a title.'; st.style.color='#c9933a'; return; }
        if (!category) { st.textContent = '⚠️ Please choose a category.'; st.style.color='#c9933a'; return; }
        if (!body)     { st.textContent = '⚠️ Please write some content.'; st.style.color='#c9933a'; return; }
        if (!name)     { st.textContent = '⚠️ Please enter your name.'; st.style.color='#c9933a'; return; }
        if (!agree)    { st.textContent = '⚠️ Please confirm your post meets community guidelines.'; st.style.color='#c9933a'; return; }

        st.textContent = '⏳ Submitting...'; st.style.color = '#888';

        try {
          const r = await fetch('/bulletin/submit', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ title, category, body, name, email, phone }),
          });
          const d = await r.json();
          if (r.ok && d.ok) {
            st.textContent = '✅ Submitted! Your post is under review and will go live within 24 hours. Thank you!';
            st.style.color = '#2d5a3d';
            ['post-title','post-category','post-body','post-name','post-email','post-phone'].forEach(id => {
              const el = document.getElementById(id);
              if (el) el.value = '';
            });
            document.getElementById('post-agree').checked = false;
          } else {
            st.textContent = '❌ ' + (d.error || 'Submission failed. Please try again.');
            st.style.color = '#b84040';
          }
        } catch(e) {
          st.textContent = '❌ Network error. Please try again.';
          st.style.color = '#b84040';
        }
      }
    </script>`;

  return new Response(await renderShell({
    title:      'Community Bulletin Board',
    description: `Community announcements, items for sale, lost & found, and local posts from ${cfg.name || 'Creston, Iowa'} residents.`,
    eyebrow:    '📋 Community Board',
    heading:    'Bulletin Board',
    subheading: 'Community announcements, for sale, lost & found, and local posts.',
    activeNav:  'Bulletin',
    config: cfg,
    content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' } });
}

// ── Post detail ────────────────────────────────────────────────
async function renderPostDetail(request, env, slug) {
  const cfg  = await getSiteConfig(env);
  const file = await env.BUCKET.get(`${APPROVED_PREFIX}${slug}.md`);
  if (!file) return null;

  const raw    = await file.text();
  const parsed = parseMarkdown(raw);
  const m      = parsed.meta;
  const pageUrl = `${cfg.url || ''}/bulletin/${escHtml(slug)}`;

  const content = `
    <section class="section">
      <div class="container" style="max-width:760px;">
        <div class="bulletin-detail-header">
          <span class="cat-pill" style="margin-bottom:12px;display:inline-block;">
            ${getCatEmoji(m.category)} ${escHtml(capitalize(m.category||'Post'))}
          </span>
          <div class="bulletin-meta">
            <span>👤 ${escHtml(m.name||'Community Member')}</span>
            ${m.date ? `<span>📅 ${escHtml(m.date)}</span>` : ''}
          </div>
        </div>
        <div class="markdown-body bulletin-body" style="margin-top:20px;">
          ${parsed.html || `<p>${escHtml(m.body||'')}</p>`}
        </div>
        ${shareBar(pageUrl, m.title || 'Community Post', m.summary || '')}
        <div style="margin-top:24px;">
          <a href="/bulletin" class="btn btn-outline">← Back to Bulletin Board</a>
        </div>
      </div>
    </section>`;

  return new Response(await renderShell({
    title:      m.title || 'Community Post',
    description: (m.body || m.summary || '').slice(0, 160),
    eyebrow:    `${getCatEmoji(m.category)} ${escHtml(capitalize(m.category||'Post'))}`,
    heading:    m.title || 'Community Post',
    subheading: `Posted by ${escHtml(m.name||'Community Member')}${m.date ? ' · ' + m.date : ''}`,
    activeNav:  'Bulletin',
    config: cfg,
    content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' } });
}

// ── Public submit ──────────────────────────────────────────────
async function handleSubmit(request, env) {
  try {
    const body = await request.json();
    const { title, category, body: postBody, name, email, phone } = body;

    if (!title || !category || !postBody || !name) {
      return jsonRes({ error: 'title, category, body, and name are required' }, 400);
    }

    // Basic spam checks
    const spamWords = ['casino', 'viagra', 'click here', 'free money', 'bitcoin'];
    const combined  = (title + ' ' + postBody).toLowerCase();
    if (spamWords.some(w => combined.includes(w))) {
      return jsonRes({ error: 'Your post was flagged as potential spam. Please contact us directly.' }, 400);
    }

    if (postBody.length > 2000) {
      return jsonRes({ error: 'Post body must be under 2000 characters.' }, 400);
    }

    const ts   = Date.now();
    const slug = slugify(title);
    const key  = `${PENDING_PREFIX}${ts}-${slug}.json`;

    const post = {
      title,
      category,
      body:       postBody,
      name,
      email:      email || '',
      phone:      phone || '',
      created_at: new Date().toISOString(),
      slug:       `${ts}-${slug}`,
      key,
    };

    await env.BUCKET.put(key, JSON.stringify(post), {
      httpMetadata: { contentType: 'application/json' }
    });

    return jsonRes({ ok: true });
  } catch (err) {
    return jsonRes({ error: err.message }, 500);
  }
}

// ── Admin routes ───────────────────────────────────────────────
export async function handleBulletinAdmin(request, env, url, user) {
  if (user.role === 'company_admin') return new Response('Forbidden', { status: 403 });

  const path = url.pathname;

  if (path === '/admin/bulletin/approve' && request.method === 'POST') return approvePending(request, env);
  if (path === '/admin/bulletin/reject'  && request.method === 'POST') return rejectPending(request, env);

  const slugMatch = path.match(/\/admin\/bulletin\/([^/]+)\/delete/);
  if (slugMatch && request.method === 'POST') {
    await env.BUCKET.delete(`${APPROVED_PREFIX}${slugMatch[1]}.md`);
    return new Response(null, { status: 302, headers: { Location: '/admin/bulletin' } });
  }

  return renderBulletinAdmin(env, user);
}

async function renderBulletinAdmin(env, user) {
  const [pendingListed, approvedListed] = await Promise.all([
    env.BUCKET.list({ prefix: PENDING_PREFIX }),
    env.BUCKET.list({ prefix: APPROVED_PREFIX }),
  ]);

  const pending  = [];
  const approved = [];

  for (const obj of pendingListed.objects.filter(o => o.key.endsWith('.json'))) {
    const file = await env.BUCKET.get(obj.key);
    if (!file) continue;
    try { pending.push({ ...JSON.parse(await file.text()), _key: obj.key }); } catch {}
  }
  pending.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  for (const obj of approvedListed.objects.filter(o => o.key.endsWith('.md'))) {
    const file = await env.BUCKET.get(obj.key);
    if (!file) continue;
    const raw  = await file.text();
    const meta = {}; // parse frontmatter
    const lines = raw.split('\n');
    let inFm = false;
    for (const line of lines) {
      if (line === '---') { inFm = !inFm; continue; }
      if (inFm) {
        const [k, ...v] = line.split(':');
        if (k && v.length) meta[k.trim()] = v.join(':').trim().replace(/^["']|["']$/g, '');
      }
    }
    approved.push({ slug: obj.key.replace(APPROVED_PREFIX, '').replace('.md', ''), meta });
  }

  const pendingCards = pending.length === 0
    ? '<p style="font-family:sans-serif;font-size:.88rem;color:#888;padding:20px;">No pending submissions.</p>'
    : pending.map(p => `
      <div class="suggestion-card" style="margin-bottom:16px;" data-key="${escHtml(p._key)}">
        <div class="suggestion-header">
          <div>
            <div class="suggestion-type-badge type-news">${getCatEmoji(p.category)} ${escHtml(capitalize(p.category||'post'))}</div>
            <h3 class="suggestion-title">${escHtml(p.title||'Untitled')}</h3>
            <div class="suggestion-meta">
              <span>👤 ${escHtml(p.name||'Unknown')}</span>
              ${p.email ? `<span>✉️ ${escHtml(p.email)}</span>` : ''}
              ${p.phone ? `<span>📞 ${escHtml(p.phone)}</span>` : ''}
              <span>📅 ${p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</span>
            </div>
            <p style="font-family:var(--font-body);font-size:.88rem;color:#555;margin-top:8px;line-height:1.6;">${escHtml((p.body||'').slice(0,300))}${(p.body||'').length>300?'…':''}</p>
          </div>
          <div class="suggestion-actions">
            <button onclick="approvePost('${escHtml(p._key)}')" class="btn-admin-primary">✅ Approve</button>
            <button onclick="rejectPost('${escHtml(p._key)}')"  class="tbl-btn tbl-btn-danger">✕ Reject</button>
          </div>
        </div>
      </div>`).join('');

  const approvedRows = approved.map(p => `
    <tr>
      <td><a href="/bulletin/${p.slug}" target="_blank"><strong>${escHtml(p.meta.title||p.slug)}</strong></a></td>
      <td>${escHtml(p.meta.category||'—')}</td>
      <td>${escHtml(p.meta.name||'—')}</td>
      <td>${escHtml(p.meta.date||'—')}</td>
      <td class="action-col">
        <a href="/bulletin/${p.slug}" target="_blank" class="tbl-btn tbl-btn-view">View</a>
        <form method="POST" action="/admin/bulletin/${p.slug}/delete" style="display:inline;"
              onsubmit="return confirm('Remove this post?')">
          <button type="submit" class="tbl-btn tbl-btn-danger">Remove</button>
        </form>
      </td>
    </tr>`).join('');

  const body = `
    <div class="settings-header">
      <div>
        <h2>📋 Bulletin Board</h2>
        <p style="color:#888;font-family:sans-serif;font-size:.88rem;margin:4px 0 0;">
          ${pending.length} pending review · ${approved.length} live posts
        </p>
      </div>
      <a href="/bulletin" target="_blank" class="btn-admin-secondary">View Public Board →</a>
    </div>

    ${pending.length > 0 ? `
    <h3 style="font-family:sans-serif;font-size:1rem;margin:0 0 12px;color:#b84040;">
      🔴 Pending Review (${pending.length})
    </h3>
    <div id="pending-list">${pendingCards}</div>
    <div id="action-status" style="font-family:sans-serif;font-size:.88rem;margin-bottom:20px;min-height:1em;"></div>
    <hr style="margin:28px 0;border:none;border-top:1.5px solid #e0e0e0;">` : ''}

    <h3 style="font-family:sans-serif;font-size:1rem;margin:0 0 12px;">Live Posts (${approved.length})</h3>
    <table class="admin-table">
      <thead><tr><th>Title</th><th>Category</th><th>Posted By</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>${approvedRows || '<tr><td colspan="5" style="text-align:center;color:#888;padding:24px;">No approved posts yet.</td></tr>'}</tbody>
    </table>

    <script>
      const TOKEN = sessionStorage.getItem('admin_token') || '';
      const H = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN };
      const st = document.getElementById('action-status');

      async function approvePost(key) {
        if (!confirm('Approve and publish this post?')) return;
        if (st) { st.textContent = '⏳ Approving...'; st.style.color='#888'; }
        const r = await fetch('/admin/bulletin/approve', { method:'POST', headers:H, body:JSON.stringify({key}) });
        const d = await r.json();
        if (d.ok) {
          if (st) { st.textContent = '✅ Post approved and published!'; st.style.color='#2d5a3d'; }
          document.querySelector('[data-key="'+key+'"]')?.remove();
          setTimeout(() => location.reload(), 1500);
        } else {
          if (st) { st.textContent = '❌ ' + (d.error||'Error'); st.style.color='#b84040'; }
        }
      }

      async function rejectPost(key) {
        if (!confirm('Reject and remove this submission?')) return;
        const r = await fetch('/admin/bulletin/reject', { method:'POST', headers:H, body:JSON.stringify({key}) });
        const d = await r.json();
        if (d.ok) {
          document.querySelector('[data-key="'+key+'"]')?.remove();
        }
      }
    </script>`;

  return adminPage('📋 Bulletin Board', body, user);
}

// ── Approve / Reject ───────────────────────────────────────────
async function approvePending(request, env) {
  const { key } = await request.json();
  if (!key) return jsonRes({ error: 'key required' }, 400);

  const file = await env.BUCKET.get(key);
  if (!file) return jsonRes({ error: 'Post not found' }, 404);

  const post = JSON.parse(await file.text());
  const slug = `${Date.now()}-${slugify(post.title || 'post')}`;
  const date = new Date().toISOString().split('T')[0];

  const markdown = `---
title: ${post.title || 'Community Post'}
category: ${post.category || 'other'}
name: ${post.name || 'Community Member'}
date: ${date}
slug: ${slug}
summary: ${(post.body || '').slice(0, 120)}
---

${post.body || ''}`;

  await env.BUCKET.put(`${APPROVED_PREFIX}${slug}.md`, markdown, {
    httpMetadata: { contentType: 'text/markdown; charset=utf-8' }
  });
  await env.BUCKET.delete(key);

  return jsonRes({ ok: true, slug });
}

async function rejectPending(request, env) {
  const { key } = await request.json();
  if (!key) return jsonRes({ error: 'key required' }, 400);

  const file = await env.BUCKET.get(key);
  if (file) {
    const newKey = key.replace(PENDING_PREFIX, REJECTED_PREFIX);
    await env.BUCKET.put(newKey, await file.text(), { httpMetadata: { contentType: 'application/json' } });
    await env.BUCKET.delete(key);
  }

  return jsonRes({ ok: true });
}

// ── Helpers ────────────────────────────────────────────────────
async function loadApproved(env) {
  const listed = await env.BUCKET.list({ prefix: APPROVED_PREFIX });
  const posts  = [];
  for (const obj of listed.objects.filter(o => o.key.endsWith('.md'))) {
    const file = await env.BUCKET.get(obj.key);
    if (!file) continue;
    const raw    = await file.text();
    const parsed = parseMarkdown(raw);
    posts.push({
      slug:     obj.key.replace(APPROVED_PREFIX, '').replace('.md', ''),
      meta:     parsed.meta,
      html:     parsed.html,
      modified: obj.uploaded,
    });
  }
  posts.sort((a, b) => (b.meta.date || '').localeCompare(a.meta.date || ''));
  return posts;
}

function renderPostCard(p) {
  const m = p.meta;
  return `
    <div class="bulletin-card">
      <div class="bulletin-card-header">
        <div>
          <a href="/bulletin/${escHtml(p.slug)}" class="bulletin-title">${escHtml(m.title||p.slug)}</a>
          <div class="bulletin-meta">
            <span>${getCatEmoji(m.category)} ${escHtml(capitalize(m.category||'Post'))}</span>
            <span>👤 ${escHtml(m.name||'Community Member')}</span>
            ${m.date ? `<span>📅 ${escHtml(m.date)}</span>` : ''}
          </div>
        </div>
      </div>
      ${m.summary ? `<div class="bulletin-body">${escHtml(m.summary.slice(0,200))}${m.summary.length>200?'…':''}</div>` : ''}
      <div style="margin-top:10px;">
        <a href="/bulletin/${escHtml(p.slug)}" class="btn btn-outline" style="font-size:.78rem;padding:5px 12px;">Read More →</a>
      </div>
    </div>`;
}

function getCatEmoji(cat) {
  const map = {
    announcement: '📢', 'for-sale': '🏷️', wanted: '🔍',
    'lost-found': '🐾', services: '🔧', event: '🎈', other: '📌',
  };
  return map[cat] || '📌';
}

function capitalize(s) { return (s||'').charAt(0).toUpperCase() + (s||'').slice(1); }
function slugify(str)   { return (str||'post').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60); }
function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
