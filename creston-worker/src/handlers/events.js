/**
 * src/handlers/events.js
 * Event calendar — public page + admin management + iCal feed.
 *
 * R2 structure:
 *   events/YYYY-MM-DD-slug.md
 *
 * Frontmatter:
 *   title:       "Balloon Days Festival"
 *   date:        "2025-09-12"
 *   end_date:    "2025-09-14"   (optional multi-day)
 *   time:        "9:00 AM"
 *   end_time:    "5:00 PM"
 *   location:    "McKinley Park"
 *   address:     "123 Park Dr, Creston IA"
 *   category:    festival | community | government | sports | arts | other
 *   cost:        "Free" or "$5/person"
 *   url:         https://external-event-page.com
 *   featured:    true/false
 *   image:       /media/images/balloon-days.jpg
 *   summary:     Short description for list view
 *   recurring:   none | weekly | monthly | yearly
 *
 * Routes:
 *   GET /events              → calendar list (upcoming + past tabs)
 *   GET /events/:slug        → event detail
 *   GET /events/feed.ical    → iCal feed
 */

import { renderShell, escHtml, adSlot } from '../shell.js';
import { parseMarkdown }                from '../markdown.js';
import { getSiteConfig }                from '../db/site.js';
import { shareBar }                     from './meetings.js';

const PREFIX = 'events/';

export async function handleEvents(request, env, url) {
  const path = url.pathname;

  if (path === '/events/feed.ical') return renderIcal(env);

  const slug = path.replace('/events/', '').replace('/events', '').replace(/^\/|\/$/g, '');
  if (slug && slug !== '') return renderEventDetail(request, env, slug);
  return renderEventList(request, env, url);
}

// ── Event list ─────────────────────────────────────────────────
async function renderEventList(request, env, url) {
  const cfg   = await getSiteConfig(env);
  const tab   = url.searchParams.get('tab') || 'upcoming';
  const cat   = url.searchParams.get('cat') || '';
  const today = new Date().toISOString().split('T')[0];

  const all = await loadAllEvents(env);

  const upcoming = all.filter(e => (e.meta.end_date || e.meta.date || '') >= today)
                      .sort((a,b) => (a.meta.date||'').localeCompare(b.meta.date||''));
  const past     = all.filter(e => (e.meta.end_date || e.meta.date || '') < today)
                      .sort((a,b) => (b.meta.date||'').localeCompare(a.meta.date||''));

  const items    = (tab === 'upcoming' ? upcoming : past)
                      .filter(e => !cat || e.meta.category === cat);

  const categories = [...new Set(all.map(e => e.meta.category).filter(Boolean))].sort();
  const catFilter  = categories.map(c => `
    <a href="/events?tab=${tab}&cat=${c}" class="cat-pill ${cat===c?'active':''}">
      ${getCatEmoji(c)} ${escHtml(c)}
    </a>`).join('');

  const featured = upcoming.filter(e => e.meta.featured === true || e.meta.featured === 'true').slice(0,3);

  const featuredHtml = featured.length ? `
    <div class="featured-events">
      ${featured.map(e => renderFeaturedCard(e)).join('')}
    </div>` : '';

  const cards = items.length === 0
    ? `<div class="empty-state">
        <div style="font-size:3rem;margin-bottom:16px;">🎈</div>
        <h3>${tab==='upcoming' ? 'No upcoming events' : 'No past events found'}</h3>
       </div>`
    : `<div class="event-list">${items.map(e => renderEventCard(e)).join('')}</div>`;

  const content = `
    <section class="section">
      <div class="container">
        ${tab === 'upcoming' && featured.length ? featuredHtml : ''}

        <div class="tab-bar">
          <a href="/events?tab=upcoming" class="tab-btn ${tab==='upcoming'?'active':''}">
            📅 Upcoming (${upcoming.length})
          </a>
          <a href="/events?tab=past" class="tab-btn ${tab==='past'?'active':''}">
            📋 Past Events (${past.length})
          </a>
          <a href="/events/feed.ical" class="tab-btn tab-ical" style="margin-left:auto;">
            📆 Subscribe (iCal)
          </a>
        </div>

        ${catFilter ? `<div class="cat-filters">
          <a href="/events?tab=${tab}" class="cat-pill ${!cat?'active':''}">All</a>
          ${catFilter}
        </div>` : ''}

        <div class="events-layout">
          <div class="events-main">${cards}</div>
          <aside class="events-sidebar">
            <div class="sidebar-widget">
              <div class="widget-header">📆 Add to Calendar</div>
              <div class="widget-body">
                <p style="font-size:.83rem;color:#666;margin-bottom:12px;">
                  Subscribe to get all events in your calendar app.
                </p>
                <a href="/events/feed.ical" class="btn btn-outline" style="width:100%;justify-content:center;font-size:.82rem;">
                  📥 Download iCal Feed
                </a>
                <p style="font-size:.76rem;color:#999;margin-top:8px;text-align:center;">
                  Works with Google Calendar, Apple Calendar, Outlook
                </p>
              </div>
            </div>
            <div class="sidebar-widget" style="margin-top:16px;">
              <div class="widget-header">📝 Submit an Event</div>
              <div class="widget-body">
                <p style="font-size:.83rem;color:#666;margin-bottom:12px;">
                  Have a community event to share?
                </p>
                <a href="/contact?type=Event+Submission" class="btn btn-primary" style="width:100%;justify-content:center;">
                  Submit Event →
                </a>
              </div>
            </div>
            ${adSlot('square', cfg)}
          </aside>
        </div>
      </div>
    </section>

    <style>
      .featured-events { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; margin-bottom:28px; }
      .featured-card { background:white; border:2px solid var(--gold); border-radius:12px; overflow:hidden; text-decoration:none; display:block; transition:transform .15s, box-shadow .15s; }
      .featured-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.1); }
      .featured-img { height:140px; object-fit:cover; width:100%; background:var(--green-pale); display:flex; align-items:center; justify-content:center; font-size:3rem; }
      .featured-body { padding:16px; }
      .featured-badge { display:inline-block; background:var(--gold); color:white; padding:2px 8px; border-radius:100px; font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; }
      .featured-title { font-family:var(--font-display); font-size:1.05rem; font-weight:700; color:var(--green-deep); margin-bottom:4px; }
      .featured-meta { font-family:var(--font-ui); font-size:.78rem; color:#888; }
      .tab-ical { background:rgba(45,90,61,.06); border-radius:8px; }
      .cat-filters { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:20px; }
      .cat-pill { padding:5px 12px; border-radius:100px; font-family:var(--font-ui); font-size:.78rem; font-weight:600; text-decoration:none; border:1.5px solid var(--border,#ddd); color:#666; transition:all .15s; }
      .cat-pill:hover, .cat-pill.active { background:var(--green-deep); color:white; border-color:var(--green-deep); }
      .events-layout { display:grid; grid-template-columns:1fr 280px; gap:28px; align-items:start; }
      .event-list { display:flex; flex-direction:column; gap:12px; }
      .event-card { background:white; border:1.5px solid #e0e0e0; border-radius:12px; padding:20px; display:grid; grid-template-columns:72px 1fr; gap:16px; text-decoration:none; transition:border-color .15s, box-shadow .15s; }
      .event-card:hover { border-color:var(--green-mid); box-shadow:0 4px 16px rgba(0,0,0,.07); }
      .event-date-box { background:var(--green-deep); color:white; border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:8px; }
      .event-date-month { font-family:var(--font-ui); font-size:.65rem; font-weight:700; text-transform:uppercase; letter-spacing:.08em; opacity:.8; }
      .event-date-day { font-family:var(--font-display); font-size:1.6rem; font-weight:900; line-height:1; }
      .event-date-year { font-family:var(--font-ui); font-size:.65rem; opacity:.7; }
      .event-title { font-family:var(--font-display); font-size:1rem; font-weight:700; color:var(--green-deep); margin-bottom:4px; }
      .event-meta { display:flex; gap:12px; flex-wrap:wrap; font-family:var(--font-ui); font-size:.78rem; color:#888; }
      .event-summary { font-size:.88rem; color:#555; margin-top:6px; line-height:1.5; }
      @media(max-width:768px) { .events-layout { grid-template-columns:1fr; } .featured-events { grid-template-columns:1fr; } }
    </style>`;

  return new Response(await renderShell({
    title:      'Events Calendar',
    description: 'Upcoming community events, festivals, and activities in Creston, Iowa.',
    eyebrow:    '📅 Community Events',
    heading:    'Events & Activities',
    subheading: 'Festivals, meetings, sports, arts, and community events in Creston.',
    activeNav:  'Events',
    config: cfg,
    content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' } });
}

// ── Event detail ───────────────────────────────────────────────
async function renderEventDetail(request, env, slug) {
  const cfg  = await getSiteConfig(env);
  const file = await env.BUCKET.get(`${PREFIX}${slug}.md`);
  if (!file) return null;

  const raw    = await file.text();
  const parsed = parseMarkdown(raw);
  const m      = parsed.meta;
  const pageUrl = `${cfg.url || ''}/events/${escHtml(slug)}`;

  const gcUrl = buildGoogleCalUrl(m);
  const icalUrl = `/events/feed.ical`;

  const content = `
    <section class="section">
      <div class="container">
        <div class="event-detail-layout">
          <div>
            <div class="event-detail-header">
              ${m.image ? `<img src="${escHtml(m.image)}" alt="${escHtml(m.title||'')}" class="event-hero-img">` : ''}
              <div class="event-detail-meta-row">
                <span class="event-cat-badge">${getCatEmoji(m.category)} ${escHtml(m.category||'Event')}</span>
                ${m.featured === 'true' || m.featured === true ? '<span class="featured-badge">⭐ Featured</span>' : ''}
              </div>
            </div>

            ${parsed.html ? `<div class="markdown-body event-body">${parsed.html}</div>` : ''}

            <div class="event-add-cal">
              <strong style="font-family:var(--font-ui);font-size:.88rem;">Add to your calendar:</strong>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                <a href="${escHtml(gcUrl)}" target="_blank" rel="noopener" class="doc-btn doc-btn-agenda">📅 Google Calendar</a>
                <a href="${icalUrl}" class="doc-btn doc-btn-minutes">📥 Download iCal</a>
                ${m.url ? `<a href="${escHtml(m.url)}" target="_blank" rel="noopener" class="doc-btn doc-btn-detail">🔗 Event Website</a>` : ''}
              </div>
            </div>

            ${shareBar(pageUrl, m.title || 'Event', m.summary || '')}
          </div>
          <aside>
            <div class="sidebar-widget">
              <div class="widget-header">📅 Event Details</div>
              <div class="widget-body">
                ${infoRow('Date',     formatEventDate(m.date, m.end_date))}
                ${infoRow('Time',     m.time ? m.time + (m.end_time ? ' – ' + m.end_time : '') : '')}
                ${infoRow('Location', m.location)}
                ${infoRow('Address',  m.address)}
                ${infoRow('Cost',     m.cost)}
                ${infoRow('Category', m.category)}
              </div>
            </div>
            <div style="margin-top:16px;">
              <a href="/events" class="btn btn-outline" style="width:100%;justify-content:center;">← All Events</a>
            </div>
            ${adSlot('square', cfg)}
          </aside>
        </div>
      </div>
    </section>
    <style>
      .event-detail-layout { display:grid; grid-template-columns:1fr 280px; gap:28px; align-items:start; }
      .event-hero-img { width:100%; max-height:360px; object-fit:cover; border-radius:12px; margin-bottom:16px; }
      .event-detail-header { margin-bottom:16px; }
      .event-detail-meta-row { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
      .event-cat-badge { display:inline-block; padding:4px 12px; background:var(--green-pale,#e8f2eb); color:var(--green-mid); border-radius:100px; font-family:var(--font-ui); font-size:.78rem; font-weight:700; }
      .event-body { margin-top:16px; }
      .event-add-cal { background:#f9f9f9; border:1.5px solid #e0e0e0; border-radius:10px; padding:16px 20px; margin-top:24px; }
      @media(max-width:768px) { .event-detail-layout { grid-template-columns:1fr; } }
    </style>`;

  return new Response(await renderShell({
    title:       m.title || 'Event',
    description: m.summary || `${m.title} on ${formatEventDate(m.date, m.end_date)} in Creston, Iowa.`,
    eyebrow:     `${getCatEmoji(m.category)} ${escHtml(m.category || 'Event')}`,
    heading:     m.title || 'Event',
    subheading:  formatEventDate(m.date, m.end_date) + (m.time ? ` at ${m.time}` : ''),
    activeNav:   'Events',
    config: cfg,
    content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' } });
}

// ── iCal feed ──────────────────────────────────────────────────
async function renderIcal(env) {
  const cfg   = await getSiteConfig(env);
  const site  = cfg.name || 'Community Events';
  const url   = cfg.url  || 'https://example.com';
  const today = new Date().toISOString().split('T')[0];

  const all      = await loadAllEvents(env);
  const upcoming = all.filter(e => (e.meta.end_date || e.meta.date || '') >= today);

  const events = upcoming.map(e => {
    const m    = e.meta;
    const dtStart = toIcalDate(m.date, m.time);
    const dtEnd   = toIcalDate(m.end_date || m.date, m.end_time || m.time);
    const uid     = `${e.slug}@${new URL(url).hostname}`;
    return [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${icalEsc(m.title || e.slug)}`,
      m.location ? `LOCATION:${icalEsc(m.location + (m.address ? ', ' + m.address : ''))}` : '',
      m.summary  ? `DESCRIPTION:${icalEsc(m.summary)}` : '',
      `URL:${url}/events/${e.slug}`,
      'END:VEVENT',
    ].filter(Boolean).join('\r\n');
  }).join('\r\n');

  const ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${site}//EN`,
    `X-WR-CALNAME:${site} Events`,
    `X-WR-CALDESC:Community events from ${url}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    events,
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  return new Response(ical, {
    headers: {
      'Content-Type':        'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${(cfg.name||'events').toLowerCase().replace(/\s+/g,'-')}.ical"`,
      'Cache-Control':       'public, max-age=3600',
    }
  });
}

// ── Card renderers ─────────────────────────────────────────────
function renderFeaturedCard(e) {
  const m = e.meta;
  return `
    <a href="/events/${escHtml(e.slug)}" class="featured-card">
      ${m.image
        ? `<img src="${escHtml(m.image)}" alt="${escHtml(m.title||'')}" class="featured-img" style="display:block;">`
        : `<div class="featured-img">${getCatEmoji(m.category)}</div>`}
      <div class="featured-body">
        <span class="featured-badge">⭐ Featured</span>
        <div class="featured-title">${escHtml(m.title || e.slug)}</div>
        <div class="featured-meta">
          📅 ${formatEventDate(m.date, m.end_date)}
          ${m.time     ? ` · 🕐 ${escHtml(m.time)}` : ''}
          ${m.location ? ` · 📍 ${escHtml(m.location)}` : ''}
        </div>
      </div>
    </a>`;
}

function renderEventCard(e) {
  const m   = e.meta;
  const d   = m.date ? new Date(m.date + 'T12:00:00') : null;
  const mon = d ? d.toLocaleString('en-US', { month:'short' }).toUpperCase() : '???';
  const day = d ? d.getDate() : '?';
  const yr  = d ? d.getFullYear() : '';

  return `
    <a href="/events/${escHtml(e.slug)}" class="event-card">
      <div class="event-date-box">
        <div class="event-date-month">${mon}</div>
        <div class="event-date-day">${day}</div>
        <div class="event-date-year">${yr}</div>
      </div>
      <div>
        <div class="event-title">${escHtml(m.title || e.slug)}</div>
        <div class="event-meta">
          ${m.time     ? `<span>🕐 ${escHtml(m.time)}</span>` : ''}
          ${m.location ? `<span>📍 ${escHtml(m.location)}</span>` : ''}
          ${m.cost     ? `<span>💵 ${escHtml(m.cost)}</span>` : ''}
          ${m.category ? `<span>${getCatEmoji(m.category)} ${escHtml(m.category)}</span>` : ''}
        </div>
        ${m.summary ? `<div class="event-summary">${escHtml(m.summary)}</div>` : ''}
      </div>
    </a>`;
}

// ── Helpers ────────────────────────────────────────────────────
async function loadAllEvents(env) {
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
  return all;
}

function getCatEmoji(cat) {
  const map = { festival:'🎈', community:'🤝', government:'🏛️', sports:'⚽', arts:'🎨', other:'📌' };
  return map[cat] || '📌';
}

function formatEventDate(date, endDate) {
  if (!date) return 'TBD';
  try {
    const d = new Date(date + 'T12:00:00');
    const fmt = { month:'long', day:'numeric', year:'numeric' };
    if (endDate && endDate !== date) {
      const e = new Date(endDate + 'T12:00:00');
      if (d.getMonth() === e.getMonth() && d.getFullYear() === e.getFullYear()) {
        return `${d.toLocaleDateString('en-US',{month:'long',day:'numeric'})}–${e.getDate()}, ${d.getFullYear()}`;
      }
      return `${d.toLocaleDateString('en-US',fmt)} – ${e.toLocaleDateString('en-US',fmt)}`;
    }
    return d.toLocaleDateString('en-US', fmt);
  } catch { return date; }
}

function buildGoogleCalUrl(m) {
  const enc   = encodeURIComponent;
  const start = (m.date || '').replace(/-/g,'');
  const end   = ((m.end_date || m.date) || '').replace(/-/g,'');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${enc(m.title||'Event')}&dates=${start}/${end}&details=${enc(m.summary||'')}&location=${enc(m.location||'')}`;
}

function toIcalDate(dateStr, timeStr) {
  if (!dateStr) return new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
  if (!timeStr) return dateStr.replace(/-/g,'');
  try {
    const dt = new Date(`${dateStr}T${timeStr}`);
    return dt.toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
  } catch { return dateStr.replace(/-/g,''); }
}

function icalEsc(str) {
  return (str || '').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
}

function infoRow(label, value) {
  if (!value) return '';
  return `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f0f0f0;font-family:var(--font-ui);font-size:.83rem;">
    <span style="color:#888;">${label}</span>
    <span style="font-weight:600;color:#333;text-align:right;max-width:170px;">${escHtml(value)}</span>
  </div>`;
}
