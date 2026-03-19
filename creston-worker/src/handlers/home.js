/**
 * src/handlers/home.js
 * Dynamic homepage — reads original index.html and injects live data.
 *
 * Strategy: keep all the beautiful static HTML as-is.
 * Only replace three things dynamically:
 *   1. Alert banner (from cfg)
 *   2. News cards section (latest 3 from R2)
 *   3. Mini-jobs board (live jobs + real count)
 */

import { getSiteConfig } from '../db/site.js';
import { escHtml }       from '../shell.js';
import { parseMarkdown } from '../markdown.js';

export async function handleHome(request, env, url) {
  const cfg    = await getSiteConfig(env);
  const origin = new URL(request.url).origin;

  // Fetch the beautifully crafted static index.html as our template
  const templateRes = await fetch(`${origin}/index.html`, {
    cf: { cacheEverything: false },
  });

  if (!templateRes.ok) {
    return new Response('Homepage unavailable', { status: 502 });
  }

  let html = await templateRes.text();

  // Load live data in parallel
  const [newsItems, jobItems, jobCount] = await Promise.all([
    loadLatest(env, 'news/',        3),
    loadLatest(env, 'jobs/active/', 4),
    countItems(env, 'jobs/active/'),
  ]);

  // ── 1. Alert banner ────────────────────────────────────────
  const alert = cfg.alert;
  if (alert && (alert.active === true || alert.active === 'true') && alert.title) {
    const icon = { emergency:'🚨', warning:'⚠️', info:'ℹ️' }[alert.level] || '⚠️';
    const dismissBtn = alert.dismissible !== false
      ? `<button onclick="dismissAlert()" style="background:rgba(255,255,255,.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:1rem;flex-shrink:0;" aria-label="Dismiss">✕</button>` : '';

    const banner = `<div class="emergency-alert alert-${escHtml(alert.level||'warning')}" id="emergency-alert" style="display:flex;justify-content:space-between;align-items:center;padding:10px 20px;gap:12px;position:sticky;top:0;z-index:999;font-family:sans-serif;font-size:.88rem;">
<style>.alert-emergency{background:#b84040;color:white}.alert-warning{background:#c9933a;color:white}.alert-info{background:#2d5a3d;color:white}</style>
<div style="display:flex;align-items:center;gap:10px;flex:1;"><span>${icon}</span><div><strong>${escHtml(alert.title)}</strong>${alert.message?` <span>${escHtml(alert.message)}</span>`:''}</div></div>
${dismissBtn}</div>
<script>function dismissAlert(){var e=document.getElementById('emergency-alert');if(e){e.style.display='none';sessionStorage.setItem('alert_dismissed','1');}}if(sessionStorage.getItem('alert_dismissed')==='1'){var e=document.getElementById('emergency-alert');if(e)e.style.display='none';}</script>`;

    html = html.replace('<body>', '<body>\n' + banner);
  }

  // ── 2. Live news cards ─────────────────────────────────────
  if (newsItems.length > 0) {
    const featured = newsItems[0];
    const rest     = newsItems.slice(1);

    // Replace featured article
    const fStart = html.indexOf('<!-- Featured article -->');
    const fEnd   = html.indexOf('</article>', fStart) + '</article>'.length;
    if (fStart > -1 && fEnd > fStart) {
      html = html.slice(0, fStart) + `
        <!-- Featured article — live from R2 -->
        <article class="news-featured">
          <div class="news-featured-img">
            <span class="news-cat">${escHtml(featured.meta.category || 'News')}</span>
            <div class="news-img-placeholder">${getCatEmoji(featured.meta.category)}</div>
          </div>
          <div class="news-featured-body">
            <div class="eyebrow">${escHtml(featured.meta.category || 'Latest')}</div>
            <h3><a href="/news/${escHtml(featured.slug)}">${escHtml(featured.meta.title || featured.slug)}</a></h3>
            <p class="lead">${escHtml((featured.meta.summary || '').slice(0, 200))}</p>
            <div class="flex gap-2 mt-2">
              <span class="tag tag-green">${escHtml(featured.meta.category || 'News')}</span>
              ${featured.meta.date ? `<span class="card-meta">📅 ${escHtml(featured.meta.date)}</span>` : ''}
            </div>
          </div>
        </article>` + html.slice(fEnd);
    }

    // Replace news-grid with live articles
    if (rest.length > 0) {
      const gStart = html.indexOf('<div class="news-grid mt-3">');
      if (gStart > -1) {
        // Find the matching closing div
        let depth = 0, pos = gStart;
        while (pos < html.length) {
          if (html.slice(pos, pos + 4) === '<div') depth++;
          else if (html.slice(pos, pos + 6) === '</div>') { depth--; if (depth === 0) break; }
          pos++;
        }
        const gEnd = pos + 6;
        const restHtml = rest.map(a => `
          <article class="news-card">
            <div class="news-card-icon">${getCatEmoji(a.meta.category)}</div>
            <div class="news-card-body">
              <span class="card-tag">${escHtml(a.meta.category || 'News')}</span>
              <h4><a href="/news/${escHtml(a.slug)}">${escHtml(a.meta.title || a.slug)}</a></h4>
              <p>${escHtml((a.meta.summary || '').slice(0, 100))}${(a.meta.summary||'').length>100?'…':''}</p>
              ${a.meta.date ? `<span class="card-meta">📅 ${escHtml(a.meta.date)}</span>` : ''}
            </div>
          </article>`).join('');
        html = html.slice(0, gStart) + `<div class="news-grid mt-3">${restHtml}\n        </div>` + html.slice(gEnd);
      }
    }
  }

  // ── 3. Live jobs mini-board ────────────────────────────────
  if (jobItems.length > 0 || jobCount > 0) {
    const miniRows = jobItems.map(j => `
            <div class="mini-job">
              <div>
                <strong>${escHtml(j.meta.title || j.slug)}</strong>
                <span>${escHtml(j.meta.company || '')}</span>
              </div>
              ${j.meta.type ? `<span class="tag tag-green">${escHtml(j.meta.type)}</span>`
                : j.meta.pay ? `<span class="tag tag-gold">${escHtml(j.meta.pay)}</span>` : ''}
            </div>`).join('');

    const countLabel = jobCount > 0
      ? `View All ${jobCount} Open Position${jobCount !== 1 ? 's' : ''} →`
      : 'Browse Open Positions →';

    const mjStart = html.indexOf('<div class="mini-jobs">');
    if (mjStart > -1) {
      let depth = 0, pos = mjStart;
      while (pos < html.length) {
        if (html.slice(pos, pos + 4) === '<div') depth++;
        else if (html.slice(pos, pos + 6) === '</div>') { depth--; if (depth === 0) break; }
        pos++;
      }
      const mjEnd = pos + 6;
      html = html.slice(0, mjStart)
        + `<div class="mini-jobs">${miniRows}\n          <a href="/jobs" class="view-all-jobs">${countLabel}</a>\n        </div>`
        + html.slice(mjEnd);
    }
  }

  return new Response(html, {
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    }
  });
}

// ── Helpers ────────────────────────────────────────────────────
async function loadLatest(env, prefix, limit) {
  try {
    const listed = await env.BUCKET.list({ prefix });
    const items  = [];
    for (const obj of listed.objects.filter(o => o.key.endsWith('.md')).slice(0, limit * 3)) {
      const file = await env.BUCKET.get(obj.key);
      if (!file) continue;
      const { meta } = parseMarkdown(await file.text());
      const slug = obj.key.split('/').pop().replace('.md', '');
      items.push({ slug, meta, modified: obj.uploaded });
    }
    items.sort((a, b) => {
      const da = String(a.meta.date || a.meta.posted || (a.modified ? new Date(a.modified).toISOString() : ''));
      const db = String(b.meta.date || b.meta.posted || (b.modified ? new Date(b.modified).toISOString() : ''));
      return db.localeCompare(da);
    });
    return items.slice(0, limit);
  } catch (e) { console.error('loadLatest:', e.message); return []; }
}

async function countItems(env, prefix) {
  try {
    const l = await env.BUCKET.list({ prefix });
    return l.objects.filter(o => o.key.endsWith('.md')).length;
  } catch { return 0; }
}

function getCatEmoji(cat) {
  const m = { community:'🤝', news:'📰', sports:'🏈', arts:'🎨', dining:'🍽️', business:'💼', government:'🏛️', events:'🎈' };
  return m[(cat||'').toLowerCase()] || '📰';
}