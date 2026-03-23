/**
 * src/handlers/notices.js
 * Public Notices — legal notices, bids, zoning hearings, public hearings.
 *
 * R2 structure:
 *   notices/slug.md
 *
 * Frontmatter:
 *   title:        "Notice of Public Hearing — Zoning Amendment"
 *   category:     legal | bid | zoning | hearing | election | other
 *   publish_date: 2025-03-15
 *   expiry_date:  2025-04-15
 *   department:   "City Clerk"
 *   file:         /media/docs/notice-zoning-2025.pdf
 *   summary:      One sentence description
 *
 * Routes:
 *   GET /notices          → active notices board
 *   GET /notices/:slug    → notice detail
 */

import { renderShell, escHtml, adSlot } from '../shell.js';
import { parseMarkdown }                from '../markdown.js';
import { getSiteConfig }                from '../db/site.js';

const PREFIX = 'notices/';

const CATEGORIES = {
  legal:    { label: 'Legal Notice',       emoji: '⚖️' },
  bid:      { label: 'Bid / RFP',          emoji: '🏗️' },
  zoning:   { label: 'Zoning Notice',      emoji: '🗺️' },
  hearing:  { label: 'Public Hearing',     emoji: '🎤' },
  election: { label: 'Election Notice',    emoji: '🗳️' },
  other:    { label: 'Public Notice',      emoji: '📢' },
};

export async function handleNotices(request, env, url) {
  const slug = url.pathname.replace('/notices','').replace(/^\/|\/$/g,'');
  if (slug) return renderNoticeDetail(env, slug);
  return renderNoticeList(env, url);
}

async function renderNoticeList(env, url) {
  const cfg   = await getSiteConfig(env);
  const today = new Date().toISOString().split('T')[0];
  const tab   = url.searchParams.get('tab') || 'active';

  const listed = await env.BUCKET.list({ prefix: PREFIX });
  const all    = [];
  for (const obj of listed.objects.filter(o => o.key.endsWith('.md'))) {
    const file = await env.BUCKET.get(obj.key);
    if (!file) continue;
    const parsed = parseMarkdown(await file.text());
    all.push({ slug: obj.key.replace(PREFIX,'').replace('.md',''), meta: parsed.meta });
  }
  all.sort((a,b) => (b.meta.publish_date||'').localeCompare(a.meta.publish_date||''));

  const active   = all.filter(n => !n.meta.expiry_date || n.meta.expiry_date >= today);
  const archived = all.filter(n =>  n.meta.expiry_date && n.meta.expiry_date <  today);
  const items    = tab === 'active' ? active : archived;

  const cards = items.length === 0
    ? `<div class="empty-state"><div style="font-size:3rem;margin-bottom:12px;">📢</div><h3>No active notices</h3></div>`
    : items.map(n => {
        const c = CATEGORIES[n.meta.category] || CATEGORIES.other;
        const expiry = n.meta.expiry_date;
        const daysLeft = expiry ? Math.ceil((new Date(expiry) - new Date()) / 86400000) : null;
        return `
        <a href="/notices/${escHtml(n.slug)}" style="text-decoration:none;">
          <div class="notice-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
              <div>
                <div class="notice-cat">${c.emoji} ${escHtml(c.label)}</div>
                <div class="notice-title">${escHtml(n.meta.title||n.slug)}</div>
                ${n.meta.summary ? `<p class="notice-summary">${escHtml(n.meta.summary)}</p>` : ''}
                <div class="notice-meta">
                  ${n.meta.publish_date ? `<span>📅 Published ${escHtml(n.meta.publish_date)}</span>` : ''}
                  ${n.meta.department   ? `<span>🏛️ ${escHtml(n.meta.department)}</span>` : ''}
                </div>
              </div>
              <div style="flex-shrink:0;text-align:right;">
                ${expiry && tab==='active'
                  ? `<div style="font-family:var(--font-ui);font-size:.75rem;color:${daysLeft<=7?'#b84040':'#888'};">
                      ${daysLeft<=0?'Expires today':daysLeft===1?'Expires tomorrow':`Expires in ${daysLeft} days`}
                     </div>
                     <div style="font-family:monospace;font-size:.72rem;color:#aaa;">${expiry}</div>`
                  : ''}
                ${n.meta.file ? `<a href="${escHtml(n.meta.file)}" target="_blank" rel="noopener"
                    class="doc-btn doc-btn-minutes" style="margin-top:8px;display:inline-block;"
                    onclick="event.stopPropagation()">⬇ PDF</a>` : ''}
              </div>
            </div>
          </div>
        </a>`;
      }).join('');

  const content = `
    <section class="section">
      <div class="container">
        <div class="tab-bar">
          <a href="/notices?tab=active"   class="tab-btn ${tab==='active'?'active':''}">📢 Active Notices (${active.length})</a>
          <a href="/notices?tab=archived" class="tab-btn ${tab==='archived'?'active':''}">📁 Archived (${archived.length})</a>
        </div>
        <div style="display:grid;grid-template-columns:1fr 280px;gap:28px;align-items:start;">
          <div class="notice-list">${cards}</div>
          <aside>
            <div class="sidebar-widget">
              <div class="widget-header">⚖️ About Public Notices</div>
              <div class="widget-body" style="font-family:var(--font-ui);font-size:.83rem;color:#555;line-height:1.8;">
                <p>Public notices are official government announcements required by Iowa law.</p>
                <p style="margin-top:8px;">For records not listed here, submit a <a href="/foia">FOIA request</a>.</p>
              </div>
            </div>
            ${adSlot('square', cfg)}
          </aside>
        </div>
      </div>
    </section>
    <style>
      .notice-list { display:flex; flex-direction:column; gap:10px; }
      .notice-card { background:white; border:1.5px solid #e0e0e0; border-radius:10px; padding:18px 20px; transition:border-color .15s; }
      .notice-card:hover { border-color:var(--green-mid); }
      .notice-cat { font-family:var(--font-ui); font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--gold); margin-bottom:4px; }
      .notice-title { font-family:var(--font-display); font-size:1rem; font-weight:700; color:var(--green-deep); margin-bottom:4px; }
      .notice-summary { font-family:var(--font-body); font-size:.85rem; color:#555; margin:4px 0 8px; }
      .notice-meta { display:flex; gap:12px; font-family:var(--font-ui); font-size:.75rem; color:#888; }
    </style>`;

  return new Response(await renderShell({
    title: 'Public Notices', description: `Official public notices, legal notices, and government announcements from ${cfg.name||'Creston, Iowa'}.`,
    eyebrow: '📢 Official Notices', heading: 'Public Notices',
    subheading: 'Legal notices, bids, zoning hearings, and public announcements.',
    config: cfg, content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function renderNoticeDetail(env, slug) {
  const cfg  = await getSiteConfig(env);
  const file = await env.BUCKET.get(`${PREFIX}${slug}.md`);
  if (!file) return new Response('Notice not found', { status: 404 });

  const parsed = parseMarkdown(await file.text());
  const m      = parsed.meta;
  const c      = CATEGORIES[m.category] || CATEGORIES.other;

  const content = `
    <section class="section"><div class="container" style="max-width:760px;">
      <span class="cat-pill" style="margin-bottom:16px;display:inline-block;">${c.emoji} ${escHtml(c.label)}</span>
      <div style="background:white;border:1.5px solid #e0e0e0;border-radius:12px;padding:28px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
          <div style="font-family:var(--font-ui);font-size:.82rem;color:#888;line-height:2;">
            ${m.publish_date ? `<div>📅 Published: ${escHtml(m.publish_date)}</div>` : ''}
            ${m.expiry_date  ? `<div>⏰ Expires: ${escHtml(m.expiry_date)}</div>`    : ''}
            ${m.department   ? `<div>🏛️ ${escHtml(m.department)}</div>`              : ''}
          </div>
          ${m.file ? `<a href="${escHtml(m.file)}" target="_blank" rel="noopener" class="doc-btn doc-btn-minutes">⬇ Download PDF</a>` : ''}
        </div>
        ${parsed.html ? `<div class="markdown-body">${parsed.html}</div>` : ''}
      </div>
      <div style="margin-top:16px;"><a href="/notices" class="btn btn-outline">← All Notices</a></div>
    </div></section>`;

  return new Response(await renderShell({
    title: m.title || 'Public Notice',
    description: m.summary || `${m.title} — public notice from ${cfg.name||'Creston, Iowa'}.`,
    eyebrow: `${c.emoji} ${c.label}`, heading: m.title || 'Public Notice',
    subheading: m.publish_date || '', config: cfg, content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
