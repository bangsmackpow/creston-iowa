/**
 * src/handlers/documents.js
 * Public Document Library — ordinances, budgets, meeting minutes, reports.
 *
 * R2 structure:
 *   documents/{category}/{year}/{slug}.md   ← metadata + description
 *   media/docs/{filename}.pdf               ← actual file
 *
 * Frontmatter:
 *   title:      "2025 City Budget"
 *   category:   ordinance | resolution | budget | minutes | report | policy | other
 *   year:       2025
 *   date:       2025-01-15
 *   file:       /media/docs/budget-2025.pdf
 *   file_size:  "2.4 MB"
 *   department: "Finance"
 *   summary:    Short description
 *   tags:       [finance, annual]
 *
 * Routes:
 *   GET /documents             → searchable document library
 *   GET /documents/:slug       → document detail
 */

import { renderShell, escHtml, adSlot } from '../shell.js';
import { parseMarkdown }                from '../markdown.js';
import { getSiteConfig }                from '../db/site.js';

const PREFIX = 'documents/';

const CATEGORIES = {
  ordinance:  { label: 'Ordinances',         emoji: '📜' },
  resolution: { label: 'Resolutions',         emoji: '📋' },
  budget:     { label: 'Budgets & Finance',   emoji: '💰' },
  minutes:    { label: 'Meeting Minutes',      emoji: '🗒️' },
  report:     { label: 'Reports & Studies',    emoji: '📊' },
  policy:     { label: 'Policies & Manuals',  emoji: '📂' },
  bid:        { label: 'Bids & RFPs',         emoji: '🏗️' },
  other:      { label: 'Other Documents',      emoji: '📎' },
};

export async function handleDocuments(request, env, url) {
  const slug = url.pathname.replace('/documents', '').replace(/^\/|\/$/g, '');
  if (slug) return renderDocumentDetail(env, url, slug);
  return renderDocumentLibrary(env, url);
}

async function renderDocumentLibrary(env, url) {
  const cfg  = await getSiteConfig(env);
  const cat  = url.searchParams.get('cat')  || '';
  const year = url.searchParams.get('year') || '';
  const q    = url.searchParams.get('q')    || '';

  const all  = await loadAllDocs(env);
  const years = [...new Set(all.map(d => d.meta.year).filter(Boolean))].sort((a,b) => b-a);

  let filtered = all;
  if (cat)  filtered = filtered.filter(d => d.meta.category === cat);
  if (year) filtered = filtered.filter(d => String(d.meta.year) === year);
  if (q)    filtered = filtered.filter(d =>
    (d.meta.title||'').toLowerCase().includes(q.toLowerCase()) ||
    (d.meta.summary||'').toLowerCase().includes(q.toLowerCase()) ||
    (d.meta.tags||'').toLowerCase().includes(q.toLowerCase())
  );

  filtered.sort((a,b) => (b.meta.date||'').localeCompare(a.meta.date||''));

  const catNav = Object.entries(CATEGORIES).map(([k,v]) => {
    const count = all.filter(d => d.meta.category === k).length;
    if (!count) return '';
    return `<a href="/documents?cat=${k}" class="cat-pill ${cat===k?'active':''}">${v.emoji} ${v.label} (${count})</a>`;
  }).filter(Boolean).join('');

  const cards = filtered.length === 0
    ? `<div class="empty-state"><div style="font-size:3rem;margin-bottom:12px;">📂</div><h3>No documents found</h3></div>`
    : filtered.map(d => {
        const c = CATEGORIES[d.meta.category] || CATEGORIES.other;
        return `
          <div class="doc-card">
            <div class="doc-card-icon">${c.emoji}</div>
            <div class="doc-card-body">
              <div class="doc-card-cat">${escHtml(c.label)}</div>
              <h3 class="doc-card-title"><a href="/documents/${escHtml(d.slug)}">${escHtml(d.meta.title||d.slug)}</a></h3>
              ${d.meta.summary ? `<p class="doc-card-summary">${escHtml(d.meta.summary)}</p>` : ''}
              <div class="doc-card-meta">
                ${d.meta.date ? `<span>📅 ${escHtml(d.meta.date)}</span>` : ''}
                ${d.meta.department ? `<span>🏛️ ${escHtml(d.meta.department)}</span>` : ''}
                ${d.meta.file_size  ? `<span>📄 ${escHtml(d.meta.file_size)}</span>` : ''}
              </div>
            </div>
            ${d.meta.file ? `
            <div class="doc-card-actions">
              <a href="${escHtml(d.meta.file)}" target="_blank" rel="noopener" class="doc-btn doc-btn-minutes">
                ⬇ Download
              </a>
            </div>` : ''}
          </div>`;
      }).join('');

  const content = `
    <section class="section">
      <div class="container">
        <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;">
          <form method="GET" action="/documents" style="display:flex;gap:8px;flex:1;min-width:280px;">
            <input type="text" name="q" value="${escHtml(q)}" placeholder="Search documents..." class="form-input" style="flex:1;">
            ${cat  ? `<input type="hidden" name="cat"  value="${escHtml(cat)}">` : ''}
            ${year ? `<input type="hidden" name="year" value="${escHtml(year)}">` : ''}
            <button type="submit" class="btn btn-primary">Search</button>
            ${q||cat||year ? `<a href="/documents" class="btn btn-outline">Clear</a>` : ''}
          </form>
          <select onchange="location.href='/documents?year='+this.value+(${JSON.stringify(cat)}?'&cat='+${JSON.stringify(cat)}:'')"
                  class="form-select" style="width:120px;">
            <option value="">All Years</option>
            ${years.map(y => `<option value="${y}" ${String(year)===String(y)?'selected':''}>${y}</option>`).join('')}
          </select>
        </div>

        <div class="cat-filters" style="margin-bottom:24px;">
          <a href="/documents${year?'?year='+year:''}" class="cat-pill ${!cat?'active':''}">All (${all.length})</a>
          ${catNav}
        </div>

        <div class="doc-layout">
          <div class="doc-main">
            ${filtered.length !== all.length
              ? `<p style="font-family:var(--font-ui);font-size:.83rem;color:#888;margin-bottom:16px;">Showing ${filtered.length} of ${all.length} documents</p>` : ''}
            <div class="doc-list">${cards}</div>
          </div>
          <aside class="doc-sidebar">
            <div class="sidebar-widget">
              <div class="widget-header">📋 Browse by Year</div>
              <div class="widget-body">
                <a href="/documents" class="dir-cat-link ${!year?'active':''}">All Years <span class="dir-count">${all.length}</span></a>
                ${years.map(y => `
                <a href="/documents?year=${y}${cat?'&cat='+cat:''}" class="dir-cat-link ${String(year)===String(y)?'active':''}">
                  ${y} <span class="dir-count">${all.filter(d=>String(d.meta.year)===String(y)).length}</span>
                </a>`).join('')}
              </div>
            </div>
            <div class="sidebar-widget" style="margin-top:16px;">
              <div class="widget-header">🔍 Can't find it?</div>
              <div class="widget-body">
                <p style="font-family:var(--font-ui);font-size:.83rem;color:#666;margin-bottom:12px;">
                  Submit a public records request for any document not found here.
                </p>
                <a href="/foia" class="btn btn-outline" style="width:100%;justify-content:center;">Submit FOIA Request →</a>
              </div>
            </div>
            ${adSlot('square', cfg)}
          </aside>
        </div>
      </div>
    </section>

    <style>
      .doc-layout { display:grid; grid-template-columns:1fr 260px; gap:28px; align-items:start; }
      .doc-list { display:flex; flex-direction:column; gap:12px; }
      .doc-card { background:white; border:1.5px solid #e0e0e0; border-radius:12px; padding:18px 20px; display:grid; grid-template-columns:48px 1fr auto; gap:14px; align-items:start; transition:border-color .15s; }
      .doc-card:hover { border-color:var(--green-mid); }
      .doc-card-icon { font-size:1.8rem; text-align:center; margin-top:2px; }
      .doc-card-cat { font-family:var(--font-ui); font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--gold); margin-bottom:3px; }
      .doc-card-title { font-family:var(--font-display); font-size:.95rem; font-weight:700; margin:0 0 4px; }
      .doc-card-title a { color:var(--green-deep); text-decoration:none; }
      .doc-card-title a:hover { text-decoration:underline; }
      .doc-card-summary { font-family:var(--font-body); font-size:.83rem; color:#666; line-height:1.5; margin-bottom:6px; }
      .doc-card-meta { display:flex; gap:12px; font-family:var(--font-ui); font-size:.75rem; color:#888; flex-wrap:wrap; }
      .doc-card-actions { flex-shrink:0; }
      @media(max-width:768px) { .doc-layout { grid-template-columns:1fr; } .doc-card { grid-template-columns:40px 1fr; } .doc-card-actions { grid-column:1/-1; } }
    </style>`;

  return new Response(await renderShell({
    title:      'Document Library',
    description: `Public documents, ordinances, budgets, and records from ${cfg.name||'Creston, Iowa'}.`,
    eyebrow:    '📂 Public Records',
    heading:    'Document Library',
    subheading: 'Ordinances, resolutions, budgets, meeting minutes, and public records.',
    config: cfg,
    content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function renderDocumentDetail(env, url, slug) {
  const cfg  = await getSiteConfig(env);
  // Try to find by slug in any subdirectory
  const listed = await env.BUCKET.list({ prefix: PREFIX });
  let file = null;
  for (const obj of listed.objects.filter(o => o.key.endsWith('.md'))) {
    if (obj.key.endsWith(`/${slug}.md`) || obj.key === `${PREFIX}${slug}.md`) {
      file = await env.BUCKET.get(obj.key);
      break;
    }
  }
  if (!file) return new Response('Document not found', { status: 404 });

  const parsed = parseMarkdown(await file.text());
  const m      = parsed.meta;
  const c      = CATEGORIES[m.category] || CATEGORIES.other;

  const content = `
    <section class="section">
      <div class="container" style="max-width:760px;">
        <div style="margin-bottom:20px;">
          <span class="cat-pill">${c.emoji} ${escHtml(c.label)}</span>
        </div>
        <div style="background:white;border:1.5px solid #e0e0e0;border-radius:12px;padding:28px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
            <div>
              <div style="font-family:var(--font-ui);font-size:.78rem;color:#888;margin-bottom:6px;">
                ${m.date ? `📅 ${escHtml(m.date)}` : ''}
                ${m.department ? ` · 🏛️ ${escHtml(m.department)}` : ''}
                ${m.file_size  ? ` · 📄 ${escHtml(m.file_size)}` : ''}
              </div>
            </div>
            ${m.file ? `
            <a href="${escHtml(m.file)}" target="_blank" rel="noopener" class="doc-btn doc-btn-minutes" style="flex-shrink:0;">
              ⬇ Download PDF
            </a>` : ''}
          </div>
          ${parsed.html ? `<div class="markdown-body">${parsed.html}</div>` : ''}
        </div>
        <div style="margin-top:16px;display:flex;gap:10px;">
          <a href="/documents" class="btn btn-outline">← Document Library</a>
          ${m.file ? `<a href="${escHtml(m.file)}" target="_blank" rel="noopener" class="btn btn-primary">⬇ Download</a>` : ''}
        </div>
      </div>
    </section>`;

  return new Response(await renderShell({
    title:      m.title || 'Document',
    description: m.summary || `${m.title} — public document from ${cfg.name||'Creston, Iowa'}.`,
    eyebrow:    `${c.emoji} ${c.label}`,
    heading:    m.title || 'Document',
    subheading: m.date ? `${escHtml(m.date)}${m.department?' · '+m.department:''}` : '',
    config: cfg,
    content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function loadAllDocs(env) {
  const listed = await env.BUCKET.list({ prefix: PREFIX });
  const docs   = [];
  for (const obj of listed.objects.filter(o => o.key.endsWith('.md'))) {
    const file = await env.BUCKET.get(obj.key);
    if (!file) continue;
    const parsed = parseMarkdown(await file.text());
    const parts  = obj.key.replace(PREFIX,'').split('/');
    const slug   = parts[parts.length-1].replace('.md','');
    docs.push({ slug, key: obj.key, meta: parsed.meta, modified: obj.uploaded });
  }
  return docs;
}
