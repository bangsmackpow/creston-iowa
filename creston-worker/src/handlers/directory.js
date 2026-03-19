/**
 * src/handlers/directory.js
 * Business directory — public listing + detail pages.
 *
 * R2 structure:
 *   directory/slug.md
 *
 * Frontmatter:
 *   name:        "Creston Hardware"
 *   category:    retail | healthcare | professional | dining | services | nonprofit | other
 *   tagline:     "Your local hardware store since 1952"
 *   phone:       "(641) 782-1234"
 *   email:       "info@crestonhardware.com"
 *   website:     "https://crestonhardware.com"
 *   address:     "123 Main St, Creston, IA 50801"
 *   hours:       "Mon-Fri 8am-6pm, Sat 9am-4pm"
 *   featured:    true/false
 *   image:       /media/images/creston-hardware.jpg
 *   logo:        /media/images/ch-logo.png
 *   social_facebook:  https://facebook.com/...
 *   social_twitter:   https://twitter.com/...
 *   summary:     One sentence shown in the listing card.
 *   tags:        [locally-owned, hardware, tools]
 *
 * Routes:
 *   GET /directory              → full directory listing
 *   GET /directory/:slug        → business detail page
 */

import { renderShell, escHtml, adSlot } from '../shell.js';
import { parseMarkdown }                from '../markdown.js';
import { getSiteConfig }                from '../db/site.js';
import { shareBar }                     from './meetings.js';

const PREFIX = 'directory/';

export async function handleDirectory(request, env, url) {
  const slug = url.pathname.replace('/directory', '').replace(/^\/|\/$/g, '');
  if (slug && slug !== '') return renderBusinessDetail(request, env, slug);
  return renderDirectoryList(request, env, url);
}

// ── Directory list ─────────────────────────────────────────────
async function renderDirectoryList(request, env, url) {
  const cfg = await getSiteConfig(env);
  const cat = url.searchParams.get('cat') || '';
  const q   = url.searchParams.get('q')   || '';

  const all = await loadAllBusinesses(env);

  const categories = [...new Set(all.map(b => b.meta.category).filter(Boolean))].sort();

  let filtered = all;
  if (cat) filtered = filtered.filter(b => b.meta.category === cat);
  if (q)   filtered = filtered.filter(b =>
    (b.meta.name || '').toLowerCase().includes(q.toLowerCase()) ||
    (b.meta.summary || '').toLowerCase().includes(q.toLowerCase()) ||
    (b.meta.tags || '').toLowerCase().includes(q.toLowerCase())
  );

  const featured = all.filter(b => b.meta.featured === true || b.meta.featured === 'true');

  const catTabs = categories.map(c => `
    <a href="/directory?cat=${encodeURIComponent(c)}" class="cat-pill ${cat===c?'active':''}">
      ${getCatEmoji(c)} ${escHtml(capitalize(c))}
    </a>`).join('');

  const featuredHtml = !cat && !q && featured.length ? `
    <div class="dir-featured">
      <h2 class="section-label">⭐ Featured Businesses</h2>
      <div class="dir-featured-grid">
        ${featured.map(b => renderFeaturedCard(b)).join('')}
      </div>
    </div>` : '';

  const cards = filtered.length === 0
    ? `<div class="empty-state">
        <div style="font-size:3rem;margin-bottom:16px;">🏪</div>
        <h3>No businesses found</h3>
        <p>${cat || q ? 'Try a different filter or search.' : 'No listings yet.'}</p>
       </div>`
    : `<div class="dir-grid">${filtered.map(b => renderBusinessCard(b)).join('')}</div>`;

  const content = `
    <section class="section">
      <div class="container">
        <div class="dir-search-bar">
          <form method="GET" action="/directory" style="display:flex;gap:8px;flex:1;">
            <input type="text" name="q" value="${escHtml(q)}" placeholder="Search businesses..."
                   class="form-input" style="flex:1;">
            ${cat ? `<input type="hidden" name="cat" value="${escHtml(cat)}">` : ''}
            <button type="submit" class="btn btn-primary">Search</button>
            ${q || cat ? `<a href="/directory" class="btn btn-outline">Clear</a>` : ''}
          </form>
        </div>

        ${catTabs ? `<div class="cat-filters" style="margin-bottom:24px;">
          <a href="/directory" class="cat-pill ${!cat?'active':''}">All (${all.length})</a>
          ${catTabs}
        </div>` : ''}

        ${featuredHtml}

        <div class="dir-layout">
          <div class="dir-main">
            ${filtered.length !== all.length
              ? `<p style="font-family:var(--font-ui);font-size:.85rem;color:#888;margin-bottom:16px;">
                  Showing ${filtered.length} of ${all.length} businesses
                  ${cat ? `in <strong>${capitalize(cat)}</strong>` : ''}
                  ${q ? `matching "<strong>${escHtml(q)}</strong>"` : ''}
                 </p>` : ''}
            ${cards}
          </div>
          <aside class="dir-sidebar">
            <div class="sidebar-widget">
              <div class="widget-header">🏪 Categories</div>
              <div class="widget-body">
                <a href="/directory" class="dir-cat-link ${!cat?'active':''}">
                  All Businesses <span class="dir-count">${all.length}</span>
                </a>
                ${categories.map(c => `
                <a href="/directory?cat=${encodeURIComponent(c)}" class="dir-cat-link ${cat===c?'active':''}">
                  ${getCatEmoji(c)} ${escHtml(capitalize(c))}
                  <span class="dir-count">${all.filter(b=>b.meta.category===c).length}</span>
                </a>`).join('')}
              </div>
            </div>
            <div class="sidebar-widget" style="margin-top:16px;">
              <div class="widget-header">➕ List Your Business</div>
              <div class="widget-body">
                <p style="font-family:var(--font-ui);font-size:.83rem;color:#666;margin-bottom:12px;">
                  Is your business missing from the directory?
                </p>
                <a href="/contact?type=List+a+Business" class="btn btn-primary" style="width:100%;justify-content:center;">
                  Contact Us →
                </a>
              </div>
            </div>
            ${adSlot('square', cfg)}
          </aside>
        </div>
      </div>
    </section>

    <style>
      .dir-search-bar { display:flex; gap:12px; align-items:center; margin-bottom:20px; }
      .dir-layout { display:grid; grid-template-columns:1fr 260px; gap:28px; align-items:start; }
      .dir-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; }
      .dir-featured { margin-bottom:32px; }
      .dir-featured-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:16px; margin-top:12px; }
      .section-label { font-family:var(--font-ui); font-size:.78rem; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--gold); margin:0 0 4px; }

      .biz-card { background:white; border:1.5px solid #e0e0e0; border-radius:12px; overflow:hidden; text-decoration:none; display:block; transition:border-color .15s, box-shadow .15s; }
      .biz-card:hover { border-color:var(--green-mid); box-shadow:0 4px 16px rgba(0,0,0,.08); }
      .biz-card-img { height:120px; object-fit:cover; width:100%; background:var(--cream); display:flex; align-items:center; justify-content:center; font-size:2.5rem; }
      .biz-card-body { padding:16px; }
      .biz-cat { font-family:var(--font-ui); font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--gold); margin-bottom:4px; }
      .biz-name { font-family:var(--font-display); font-size:1rem; font-weight:700; color:var(--green-deep); margin-bottom:4px; }
      .biz-tagline { font-family:var(--font-body); font-size:.83rem; color:#666; line-height:1.4; margin-bottom:8px; }
      .biz-meta { display:flex; flex-direction:column; gap:2px; font-family:var(--font-ui); font-size:.76rem; color:#888; }

      .biz-featured-card { background:white; border:2px solid var(--gold); border-radius:12px; overflow:hidden; text-decoration:none; display:grid; grid-template-columns:120px 1fr; transition:transform .15s, box-shadow .15s; }
      .biz-featured-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.1); }
      .biz-featured-img { background:var(--cream); display:flex; align-items:center; justify-content:center; font-size:2.5rem; }
      .biz-featured-body { padding:16px; }
      .biz-featured-badge { display:inline-block; background:var(--gold); color:white; padding:2px 8px; border-radius:100px; font-size:.65rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; }

      .dir-cat-link { display:flex; justify-content:space-between; align-items:center; padding:8px 0; font-family:var(--font-ui); font-size:.85rem; color:#555; text-decoration:none; border-bottom:1px solid #f0f0f0; transition:color .12s; }
      .dir-cat-link:last-child { border:none; }
      .dir-cat-link:hover, .dir-cat-link.active { color:var(--green-deep); font-weight:600; }
      .dir-count { background:#f0f0f0; color:#888; padding:1px 7px; border-radius:100px; font-size:.72rem; }
      .dir-cat-link.active .dir-count { background:var(--green-deep); color:white; }

      @media(max-width:768px) { .dir-layout { grid-template-columns:1fr; } .dir-grid { grid-template-columns:1fr; } .biz-featured-card { grid-template-columns:80px 1fr; } }
    </style>`;

  return new Response(await renderShell({
    title:      'Business Directory',
    description: `Local business directory for ${cfg.name || 'Creston, Iowa'}. Find local shops, services, healthcare, and more.`,
    eyebrow:    '🏪 Local Businesses',
    heading:    'Business Directory',
    subheading: `Supporting local — find businesses, services, and organizations in ${cfg.name || 'Creston'}.`,
    activeNav:  'Directory',
    config: cfg,
    content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' } });
}

// ── Business detail ────────────────────────────────────────────
async function renderBusinessDetail(request, env, slug) {
  const cfg  = await getSiteConfig(env);
  const file = await env.BUCKET.get(`${PREFIX}${slug}.md`);
  if (!file) return null;

  const raw    = await file.text();
  const parsed = parseMarkdown(raw);
  const m      = parsed.meta;
  const pageUrl = `${cfg.url || ''}/directory/${escHtml(slug)}`;

  const socials = [
    [m.social_facebook, 'Facebook'],
    [m.social_twitter,  'Twitter/X'],
    [m.social_instagram,'Instagram'],
    [m.social_youtube,  'YouTube'],
  ].filter(([url]) => url).map(([url, label]) =>
    `<a href="${escHtml(url)}" target="_blank" rel="noopener" class="biz-social-btn">${label}</a>`
  ).join('');

  const content = `
    <section class="section">
      <div class="container">
        <div class="biz-detail-layout">
          <div>
            ${m.image ? `<img src="${escHtml(m.image)}" alt="${escHtml(m.name||'')}" class="biz-hero-img">` : ''}

            <div class="biz-detail-header">
              ${m.logo ? `<img src="${escHtml(m.logo)}" alt="${escHtml(m.name||'')} logo" class="biz-logo">` : ''}
              <div>
                <div class="biz-cat" style="font-size:.8rem;">${getCatEmoji(m.category)} ${escHtml(capitalize(m.category||'Business'))}</div>
                ${m.featured==='true'||m.featured===true ? '<span class="biz-featured-badge" style="display:inline-block;margin-bottom:6px;">⭐ Featured</span>' : ''}
              </div>
            </div>

            ${parsed.html ? `<div class="markdown-body biz-body">${parsed.html}</div>` : ''}

            ${socials ? `<div class="biz-socials"><strong style="font-family:var(--font-ui);font-size:.83rem;">Follow:</strong> ${socials}</div>` : ''}

            ${shareBar(pageUrl, m.name || 'Business', m.summary || m.tagline || '')}
          </div>

          <aside>
            <div class="sidebar-widget biz-info-card">
              <div class="widget-header">📋 Business Info</div>
              <div class="widget-body">
                ${m.phone   ? `<div class="biz-info-row"><span>📞</span><a href="tel:${escHtml(m.phone.replace(/\D/g,''))}">${escHtml(m.phone)}</a></div>` : ''}
                ${m.email   ? `<div class="biz-info-row"><span>✉️</span><a href="mailto:${escHtml(m.email)}">${escHtml(m.email)}</a></div>` : ''}
                ${m.website ? `<div class="biz-info-row"><span>🌐</span><a href="${escHtml(m.website)}" target="_blank" rel="noopener">${escHtml(m.website.replace(/^https?:\/\//,''))}</a></div>` : ''}
                ${m.address ? `<div class="biz-info-row"><span>📍</span><span>${escHtml(m.address)}</span></div>` : ''}
                ${m.hours   ? `<div class="biz-info-row"><span>🕐</span><span>${escHtml(m.hours)}</span></div>` : ''}
              </div>
            </div>
            ${m.website ? `
            <a href="${escHtml(m.website)}" target="_blank" rel="noopener"
               class="btn btn-primary" style="width:100%;justify-content:center;margin-top:12px;">
              Visit Website →
            </a>` : ''}
            ${m.phone ? `
            <a href="tel:${escHtml(m.phone.replace(/\D/g,''))}"
               class="btn btn-outline" style="width:100%;justify-content:center;margin-top:8px;">
              📞 Call Now
            </a>` : ''}
            <div style="margin-top:12px;">
              <a href="/directory" class="btn btn-outline" style="width:100%;justify-content:center;">
                ← Back to Directory
              </a>
            </div>
            ${adSlot('square', cfg)}
          </aside>
        </div>
      </div>
    </section>
    <style>
      .biz-detail-layout { display:grid; grid-template-columns:1fr 280px; gap:28px; align-items:start; }
      .biz-hero-img { width:100%; max-height:320px; object-fit:cover; border-radius:12px; margin-bottom:20px; }
      .biz-detail-header { display:flex; align-items:flex-start; gap:16px; margin-bottom:20px; }
      .biz-logo { width:72px; height:72px; object-fit:contain; border:1.5px solid #e0e0e0; border-radius:8px; padding:6px; background:white; flex-shrink:0; }
      .biz-body { margin-top:8px; }
      .biz-socials { display:flex; align-items:center; gap:8px; margin-top:20px; flex-wrap:wrap; }
      .biz-social-btn { padding:6px 14px; background:#f0f0f0; border-radius:6px; font-family:var(--font-ui); font-size:.78rem; font-weight:600; color:#444; text-decoration:none; transition:background .12s; }
      .biz-social-btn:hover { background:#e0e0e0; }
      .biz-info-card .widget-body { padding:0; }
      .biz-info-row { display:flex; align-items:flex-start; gap:10px; padding:10px 16px; border-bottom:1px solid #f0f0f0; font-family:var(--font-ui); font-size:.85rem; }
      .biz-info-row:last-child { border:none; }
      .biz-info-row span:first-child { flex-shrink:0; width:20px; }
      .biz-info-row a { color:var(--green-mid); text-decoration:none; word-break:break-all; }
      .biz-info-row a:hover { text-decoration:underline; }
      @media(max-width:768px) { .biz-detail-layout { grid-template-columns:1fr; } }
    </style>`;

  return new Response(await renderShell({
    title:       m.name || 'Business',
    description: m.summary || m.tagline || `${m.name} — local business in ${cfg.name || 'Creston, Iowa'}.`,
    eyebrow:     `${getCatEmoji(m.category)} ${escHtml(capitalize(m.category || 'Business'))}`,
    heading:     m.name || 'Business',
    subheading:  m.tagline || '',
    activeNav:   'Directory',
    config: cfg,
    content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' } });
}

// ── Card renderers ─────────────────────────────────────────────
function renderBusinessCard(b) {
  const m = b.meta;
  return `
    <a href="/directory/${escHtml(b.slug)}" class="biz-card">
      ${m.image
        ? `<img src="${escHtml(m.image)}" alt="${escHtml(m.name||'')}" class="biz-card-img" style="display:block;">`
        : `<div class="biz-card-img">${getCatEmoji(m.category)}</div>`}
      <div class="biz-card-body">
        <div class="biz-cat">${getCatEmoji(m.category)} ${escHtml(capitalize(m.category||''))}</div>
        <div class="biz-name">${escHtml(m.name || b.slug)}</div>
        ${m.tagline ? `<div class="biz-tagline">${escHtml(m.tagline)}</div>` : ''}
        <div class="biz-meta">
          ${m.phone   ? `<span>📞 ${escHtml(m.phone)}</span>` : ''}
          ${m.address ? `<span>📍 ${escHtml(m.address.split(',')[0])}</span>` : ''}
          ${m.hours   ? `<span>🕐 ${escHtml(m.hours.split(',')[0])}</span>` : ''}
        </div>
      </div>
    </a>`;
}

function renderFeaturedCard(b) {
  const m = b.meta;
  return `
    <a href="/directory/${escHtml(b.slug)}" class="biz-featured-card">
      ${m.logo || m.image
        ? `<img src="${escHtml(m.logo || m.image)}" alt="${escHtml(m.name||'')}" class="biz-featured-img" style="display:block;width:100%;height:100%;object-fit:contain;padding:12px;">`
        : `<div class="biz-featured-img">${getCatEmoji(m.category)}</div>`}
      <div class="biz-featured-body">
        <span class="biz-featured-badge">⭐ Featured</span>
        <div class="biz-name" style="font-size:.95rem;">${escHtml(m.name || b.slug)}</div>
        ${m.tagline ? `<div class="biz-tagline">${escHtml(m.tagline)}</div>` : ''}
        ${m.phone ? `<div style="font-family:var(--font-ui);font-size:.75rem;color:#888;margin-top:6px;">📞 ${escHtml(m.phone)}</div>` : ''}
      </div>
    </a>`;
}

// ── Helpers ────────────────────────────────────────────────────
async function loadAllBusinesses(env) {
  const listed = await env.BUCKET.list({ prefix: PREFIX });
  const all    = [];
  for (const obj of listed.objects.filter(o => o.key.endsWith('.md'))) {
    const file = await env.BUCKET.get(obj.key);
    if (!file) continue;
    const raw    = await file.text();
    const parsed = parseMarkdown(raw);
    all.push({
      slug:     obj.key.replace(PREFIX, '').replace('.md', ''),
      key:      obj.key,
      meta:     parsed.meta,
      html:     parsed.html,
      modified: obj.uploaded,
    });
  }
  all.sort((a, b) => {
    const fa = a.meta.featured === true || a.meta.featured === 'true';
    const fb = b.meta.featured === true || b.meta.featured === 'true';
    if (fa && !fb) return -1;
    if (!fa && fb) return 1;
    return (a.meta.name || '').localeCompare(b.meta.name || '');
  });
  return all;
}

function getCatEmoji(cat) {
  const map = {
    retail: '🛍️', healthcare: '🏥', professional: '💼',
    dining: '🍽️', services: '🔧', nonprofit: '🤝', other: '🏪',
  };
  return map[cat] || '🏪';
}

function capitalize(s) {
  return (s || '').charAt(0).toUpperCase() + (s || '').slice(1);
}
