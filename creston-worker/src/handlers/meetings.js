/**
 * src/handlers/meetings.js
 * Public meeting schedule and minutes.
 *
 * R2 structure:
 *   meetings/YYYY-MM-DD-slug.md    ← meeting record
 *   media/docs/filename.pdf        ← attached PDFs (served via /media/docs/)
 *
 * Frontmatter schema:
 *   title:       "City Council Regular Meeting"
 *   date:        "2025-03-15"
 *   time:        "6:00 PM"
 *   location:    "City Hall, 116 W Adams St"
 *   type:        council | planning | school | other
 *   status:      upcoming | completed | cancelled
 *   agenda_pdf:  /media/docs/agenda-2025-03-15.pdf
 *   minutes_pdf: /media/docs/minutes-2025-03-15.pdf
 *   summary:     Short description shown in list view
 *
 * Routes:
 *   GET /meetings            → list (tabs: upcoming / past)
 *   GET /meetings/:slug      → detail page
 */

import { renderShell, escHtml, adSlot } from '../shell.js';
import { parseMarkdown }                from '../markdown.js';
import { getSiteConfig }                from '../db/site.js';

const PREFIX = 'meetings/';

export async function handleMeetings(request, env, url) {
  const parts = url.pathname.replace('/meetings', '').replace(/^\//, '').split('/');
  const slug  = parts[0];

  if (slug && slug !== '') return renderMeetingDetail(request, env, slug);
  return renderMeetingList(request, env, url);
}

// ── Meeting list ───────────────────────────────────────────────
async function renderMeetingList(request, env, url) {
  const cfg     = await getSiteConfig(env);
  const tab     = url.searchParams.get('tab') || 'upcoming';
  const today   = new Date().toISOString().split('T')[0];

  const listed  = await env.BUCKET.list({ prefix: PREFIX });
  const all     = [];

  for (const obj of listed.objects.filter(o => o.key.endsWith('.md'))) {
    const file = await env.BUCKET.get(obj.key);
    if (!file) continue;
    const raw    = await file.text();
    const parsed = parseMarkdown(raw);
    const slug   = obj.key.replace(PREFIX, '').replace('.md', '');
    all.push({ slug, key: obj.key, meta: parsed.meta, body: parsed.html });
  }

  // Sort by date
  all.sort((a, b) => {
    const da = a.meta.date || '';
    const db = b.meta.date || '';
    return tab === 'upcoming' ? da.localeCompare(db) : db.localeCompare(da);
  });

  const upcoming = all.filter(m =>
    (m.meta.date || '') >= today && m.meta.status !== 'cancelled' ||
    m.meta.status === 'upcoming'
  );
  const past = all.filter(m =>
    (m.meta.date || '') < today || m.meta.status === 'completed'
  );

  const items = tab === 'upcoming' ? upcoming : past;

  const cards = items.length === 0
    ? `<div class="empty-state">
        <div style="font-size:3rem;margin-bottom:16px;">📅</div>
        <h3>${tab === 'upcoming' ? 'No upcoming meetings scheduled' : 'No past meetings yet'}</h3>
        <p>${tab === 'upcoming' ? 'Check back soon or view past meetings below.' : ''}</p>
       </div>`
    : items.map(m => renderMeetingCard(m, tab)).join('');

  const content = `
    <section class="section">
      <div class="container">
        <div class="tab-bar">
          <a href="/meetings?tab=upcoming" class="tab-btn ${tab==='upcoming'?'active':''}">
            📅 Upcoming Meetings (${upcoming.length})
          </a>
          <a href="/meetings?tab=past" class="tab-btn ${tab==='past'?'active':''}">
            📋 Past Minutes &amp; Archives (${past.length})
          </a>
        </div>

        <div class="meetings-layout">
          <div class="meetings-main">
            <div class="meeting-cards">${cards}</div>
          </div>
          <aside class="meetings-sidebar">
            <div class="sidebar-widget">
              <div class="widget-header">📋 Meeting Types</div>
              <div class="widget-body">
                ${['council','planning','school','other'].map(type => {
                  const count = all.filter(m => m.meta.type === type).length;
                  if (!count) return '';
                  return `<div class="type-row">
                    <span>${getMeetingTypeLabel(type)}</span>
                    <span class="type-count">${count}</span>
                  </div>`;
                }).join('')}
              </div>
            </div>
            <div class="sidebar-widget" style="margin-top:16px;">
              <div class="widget-header">🔔 Stay Informed</div>
              <div class="widget-body">
                <p style="font-size:.85rem;color:#666;margin-bottom:12px;">
                  Get notified when new agendas and minutes are posted.
                </p>
                <a href="/contact" class="btn btn-primary" style="width:100%;justify-content:center;">
                  Subscribe to Updates
                </a>
              </div>
            </div>
            ${adSlot('square', cfg)}
          </aside>
        </div>
      </div>
    </section>

    <style>
      .tab-bar { display:flex; gap:8px; margin-bottom:28px; border-bottom:2px solid #e0e0e0; padding-bottom:0; }
      .tab-btn { padding:10px 20px; font-family:var(--font-ui); font-size:.88rem; font-weight:600; color:#666; text-decoration:none; border-bottom:3px solid transparent; margin-bottom:-2px; transition:all .15s; }
      .tab-btn:hover { color:var(--green-deep); }
      .tab-btn.active { color:var(--green-deep); border-bottom-color:var(--green-deep); }
      .meetings-layout { display:grid; grid-template-columns:1fr 280px; gap:28px; align-items:start; }
      .meeting-card { background:white; border:1.5px solid #e0e0e0; border-radius:12px; padding:24px; margin-bottom:16px; transition:border-color .15s, box-shadow .15s; }
      .meeting-card:hover { border-color:var(--green-mid); box-shadow:0 4px 16px rgba(0,0,0,.08); }
      .meeting-date { font-family:var(--font-ui); font-size:.78rem; font-weight:700; color:var(--gold); text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; }
      .meeting-title { font-family:var(--font-display); font-size:1.15rem; font-weight:700; color:var(--green-deep); margin-bottom:6px; }
      .meeting-meta { display:flex; gap:16px; flex-wrap:wrap; font-family:var(--font-ui); font-size:.8rem; color:#888; margin-bottom:12px; }
      .meeting-summary { font-size:.9rem; color:#555; line-height:1.6; margin-bottom:14px; }
      .meeting-docs { display:flex; gap:8px; flex-wrap:wrap; }
      .doc-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 12px; border-radius:6px; font-family:var(--font-ui); font-size:.78rem; font-weight:600; text-decoration:none; transition:all .15s; }
      .doc-btn-agenda { background:#e8f2eb; color:var(--green-mid); border:1.5px solid var(--green-mid); }
      .doc-btn-minutes { background:#e8f0fa; color:#2d4a7a; border:1.5px solid #2d4a7a; }
      .doc-btn-detail { background:var(--green-deep); color:white; }
      .doc-btn:hover { opacity:.85; }
      .meeting-status-badge { display:inline-block; padding:2px 8px; border-radius:100px; font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
      .status-upcoming { background:#e8f2eb; color:var(--green-mid); }
      .status-completed { background:#e8f0fa; color:#2d4a7a; }
      .status-cancelled { background:#fde8e8; color:#b84040; }
      .type-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0; font-family:var(--font-ui); font-size:.85rem; }
      .type-row:last-child { border:none; }
      .type-count { font-weight:700; color:var(--green-deep); }
      @media(max-width:768px) { .meetings-layout { grid-template-columns:1fr; } }
    </style>`;

  return new Response(await renderShell({
    title:      'Meeting Schedule & Minutes',
    description: 'City council and government meeting schedule, agendas, and official minutes.',
    eyebrow:    '📅 Public Meetings',
    heading:    'Meetings & Minutes',
    subheading: 'Meeting schedules, agendas, and official minutes for city government.',
    activeNav:  'Government',
    config: cfg,
    content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' } });
}

// ── Meeting detail ─────────────────────────────────────────────
async function renderMeetingDetail(request, env, slug) {
  const cfg  = await getSiteConfig(env);
  const file = await env.BUCKET.get(`${PREFIX}${slug}.md`);
  if (!file) return new Response('Meeting not found', { status: 404 });

  const raw    = await file.text();
  const parsed = parseMarkdown(raw);
  const m      = parsed.meta;
  const pageUrl = `${cfg.url || ''}/meetings/${escHtml(slug)}`;

  const content = `
    <section class="section">
      <div class="container">
        <div class="meeting-detail-layout">
          <div class="meeting-detail-main">
            <div class="meeting-detail-header">
              <div class="meeting-date-large">
                ${formatDateLong(m.date)}
                ${m.time ? `<span style="color:#888;font-weight:400;"> at ${escHtml(m.time)}</span>` : ''}
              </div>
              <span class="meeting-status-badge status-${m.status||'completed'}">${m.status||'completed'}</span>
            </div>

            ${m.location ? `<div class="meeting-location">📍 ${escHtml(m.location)}</div>` : ''}

            <div class="meeting-doc-buttons">
              ${m.agenda_pdf  ? `<a href="${escHtml(m.agenda_pdf)}"  target="_blank" class="doc-btn doc-btn-agenda">📄 Download Agenda</a>`  : ''}
              ${m.minutes_pdf ? `<a href="${escHtml(m.minutes_pdf)}" target="_blank" class="doc-btn doc-btn-minutes">📋 Download Minutes</a>` : ''}
            </div>

            ${parsed.html ? `<div class="markdown-body meeting-body">${parsed.html}</div>` : ''}

            ${shareBar(pageUrl, m.title || 'Meeting', m.summary || '')}
          </div>
          <aside>
            <div class="sidebar-widget">
              <div class="widget-header">📅 Meeting Info</div>
              <div class="widget-body">
                ${infoRow('Type',     getMeetingTypeLabel(m.type))}
                ${infoRow('Date',     formatDateLong(m.date))}
                ${infoRow('Time',     m.time)}
                ${infoRow('Location', m.location)}
                ${infoRow('Status',   m.status)}
              </div>
            </div>
            <div style="margin-top:16px;">
              <a href="/meetings" class="btn btn-outline" style="width:100%;justify-content:center;">← All Meetings</a>
            </div>
            ${adSlot('square', cfg)}
          </aside>
        </div>
      </div>
    </section>
    <style>
      .meeting-detail-layout { display:grid; grid-template-columns:1fr 280px; gap:28px; align-items:start; }
      .meeting-detail-header { display:flex; align-items:center; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
      .meeting-date-large { font-family:var(--font-display); font-size:1.4rem; font-weight:700; color:var(--green-deep); }
      .meeting-location { font-family:var(--font-ui); font-size:.9rem; color:#666; margin-bottom:20px; }
      .meeting-doc-buttons { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:28px; }
      .meeting-body { margin-top:24px; }
      @media(max-width:768px) { .meeting-detail-layout { grid-template-columns:1fr; } }
    </style>`;

  return new Response(await renderShell({
    title:       m.title || 'Meeting',
    description: m.summary || `Meeting on ${formatDateLong(m.date)}`,
    eyebrow:     `📅 ${getMeetingTypeLabel(m.type)}`,
    heading:     m.title || 'Meeting',
    subheading:  m.date ? `${formatDateLong(m.date)}${m.time ? ' at ' + m.time : ''}` : '',
    activeNav:   'Government',
    config: cfg,
    content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' } });
}

// ── Card renderer ──────────────────────────────────────────────
function renderMeetingCard(m, tab) {
  const meta = m.meta;
  return `
    <div class="meeting-card">
      <div class="meeting-date">${formatDateLong(meta.date)} ${meta.time ? '· ' + escHtml(meta.time) : ''}</div>
      <div class="meeting-title">${escHtml(meta.title || 'Meeting')}</div>
      <div class="meeting-meta">
        <span>📍 ${escHtml(meta.location || 'TBD')}</span>
        <span>${getMeetingTypeLabel(meta.type)}</span>
        <span class="meeting-status-badge status-${meta.status||'upcoming'}">${meta.status||'upcoming'}</span>
      </div>
      ${meta.summary ? `<div class="meeting-summary">${escHtml(meta.summary)}</div>` : ''}
      <div class="meeting-docs">
        ${meta.agenda_pdf  ? `<a href="${escHtml(meta.agenda_pdf)}"  target="_blank" class="doc-btn doc-btn-agenda">📄 Agenda</a>`  : ''}
        ${meta.minutes_pdf ? `<a href="${escHtml(meta.minutes_pdf)}" target="_blank" class="doc-btn doc-btn-minutes">📋 Minutes</a>` : ''}
        <a href="/meetings/${escHtml(m.slug)}" class="doc-btn doc-btn-detail">View Details →</a>
      </div>
    </div>`;
}

// ── Shared: social share bar ───────────────────────────────────
export function shareBar(pageUrl, title, description) {
  const enc  = encodeURIComponent;
  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${enc(pageUrl)}`;
  const twUrl = `https://twitter.com/intent/tweet?text=${enc(title)}&url=${enc(pageUrl)}`;
  const liUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${enc(pageUrl)}`;

  return `
    <div class="share-bar">
      <span class="share-label">Share:</span>
      <a href="${fbUrl}" target="_blank" rel="noopener" class="share-btn share-fb" aria-label="Share on Facebook">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        Facebook
      </a>
      <a href="${twUrl}" target="_blank" rel="noopener" class="share-btn share-tw" aria-label="Share on Twitter">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        X
      </a>
      <a href="${liUrl}" target="_blank" rel="noopener" class="share-btn share-li" aria-label="Share on LinkedIn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
        LinkedIn
      </a>
      <button class="share-btn share-copy" onclick="copyShareLink('${escHtml(pageUrl)}')" aria-label="Copy link">
        📋 Copy Link
      </button>
    </div>
    <script>
      function copyShareLink(url) {
        navigator.clipboard.writeText(url)
          .then(() => {
            const btn = document.querySelector('.share-copy');
            if (btn) { btn.textContent = '✅ Copied!'; setTimeout(() => { btn.textContent = '📋 Copy Link'; }, 2000); }
          })
          .catch(() => prompt('Copy this link:', url));
      }
    </script>
    <style>
      .share-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:16px 0; border-top:1.5px solid #e0e0e0; margin-top:28px; }
      .share-label { font-family:var(--font-ui); font-size:.8rem; font-weight:700; color:#888; text-transform:uppercase; letter-spacing:.06em; }
      .share-btn { display:inline-flex; align-items:center; gap:5px; padding:7px 14px; border-radius:8px; font-family:var(--font-ui); font-size:.8rem; font-weight:600; text-decoration:none; cursor:pointer; border:none; transition:all .15s; }
      .share-fb { background:#1877f2; color:white; }
      .share-tw { background:#000; color:white; }
      .share-li { background:#0a66c2; color:white; }
      .share-copy { background:#f0f0f0; color:#444; border:1.5px solid #ddd; }
      .share-btn:hover { opacity:.85; transform:translateY(-1px); }
    </style>`;
}

// ── Utilities ──────────────────────────────────────────────────
function getMeetingTypeLabel(type) {
  const labels = {
    council:  '🏛️ City Council',
    planning: '📐 Planning & Zoning',
    school:   '🎓 School Board',
    other:    '📋 Public Meeting',
  };
  return labels[type] || labels.other;
}

function formatDateLong(dateStr) {
  if (!dateStr) return 'TBD';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  } catch { return dateStr; }
}

function infoRow(label, value) {
  if (!value) return '';
  return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-family:var(--font-ui);font-size:.83rem;">
    <span style="color:#888;">${label}</span>
    <span style="font-weight:600;color:#333;text-align:right;max-width:160px;">${escHtml(value)}</span>
  </div>`;
}
