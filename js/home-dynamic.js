/**
 * js/home-dynamic.js
 * Client-side homepage dynamic injection.
 *
 * Runs after DOMContentLoaded. Fetches live data from the API
 * and updates the static placeholders in index.html in place.
 * Static content shows instantly — live data replaces it ~200ms later.
 *
 * Targets:
 *   #featured-article   → latest news article (featured)
 *   #news-grid          → next 2-3 news articles
 *   #mini-jobs          → live job listings
 *   #jobs-count-link    → "View All X Open Positions →"
 */

(function() {
  'use strict';

  const CATEGORY_EMOJI = {
    community: '🤝', news: '📰', sports: '🏈', arts: '🎨',
    dining: '🍽️', business: '💼', government: '🏛️', events: '🎈',
    health: '🏥', education: '🎓', crime: '🚔', weather: '⛅',
  };

  function getCatEmoji(cat) {
    return CATEGORY_EMOJI[(cat || '').toLowerCase()] || '📰';
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  // ── Inject live news ───────────────────────────────────────
  async function injectNews() {
    const featured = document.getElementById('featured-article');
    const grid     = document.getElementById('news-grid');
    if (!featured && !grid) return;

    let items;
    try {
      const r = await fetch('/api/content/news', {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!r.ok) return;
      items = await r.json();
    } catch (e) {
      return; // fail silently — static content stays
    }

    if (!Array.isArray(items) || items.length === 0) return;

    // Sort by date descending
    items.sort((a, b) => {
      const da = a.meta?.date || a.meta?.posted || '';
      const db = b.meta?.date || b.meta?.posted || '';
      return db.localeCompare(da);
    });

    const top  = items[0];
    const rest = items.slice(1, 4);

    // Replace featured article
    if (featured && top) {
      const cat     = top.meta?.category || 'News';
      const title   = top.meta?.title    || top.slug;
      const summary = (top.meta?.summary || '').slice(0, 220);
      const date    = top.meta?.date     || '';

      featured.innerHTML = `
        <div class="news-featured-img">
          <span class="news-cat">${esc(cat)}</span>
          <div class="news-img-placeholder">${getCatEmoji(cat)}</div>
        </div>
        <div class="news-featured-body">
          <div class="eyebrow">${esc(cat)}</div>
          <h3><a href="/news/${esc(top.slug)}">${esc(title)}</a></h3>
          <p class="lead">${esc(summary)}</p>
          <div class="flex gap-2 mt-2">
            <span class="tag tag-green">${esc(cat)}</span>
            ${date ? `<span class="card-meta">📅 ${esc(date)}</span>` : ''}
          </div>
        </div>`;
    }

    // Replace news grid articles
    if (grid && rest.length > 0) {
      grid.innerHTML = rest.map(a => {
        const cat     = a.meta?.category || 'News';
        const title   = a.meta?.title    || a.slug;
        const summary = (a.meta?.summary || '').slice(0, 100);
        const date    = a.meta?.date     || '';
        return `
          <article class="news-card">
            <div class="news-card-icon">${getCatEmoji(cat)}</div>
            <div class="news-card-body">
              <span class="card-tag">${esc(cat)}</span>
              <h4><a href="/news/${esc(a.slug)}">${esc(title)}</a></h4>
              <p>${esc(summary)}${summary.length >= 100 ? '…' : ''}</p>
              ${date ? `<span class="card-meta">📅 ${esc(date)}</span>` : ''}
            </div>
          </article>`;
      }).join('');
    }
  }

  // ── Inject live jobs ───────────────────────────────────────
  async function injectJobs() {
    const miniJobs  = document.getElementById('mini-jobs');
    const countLink = document.getElementById('jobs-count-link');
    if (!miniJobs && !countLink) return;

    let items;
    try {
      const r = await fetch('/api/content/jobs', {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!r.ok) return;
      items = await r.json();
    } catch (e) {
      return;
    }

    if (!Array.isArray(items)) return;

    const count    = items.length;
    const featured = items.filter(j => j.meta?.featured === true || j.meta?.featured === 'true');
    const regular  = items.filter(j => j.meta?.featured !== true && j.meta?.featured !== 'true');
    const display  = [...featured, ...regular].slice(0, 4);

    // Update job count link text
    if (countLink && count > 0) {
      countLink.textContent = `View All ${count} Open Position${count !== 1 ? 's' : ''} →`;
    }

    // Replace mini-job rows (keep the count link at the bottom)
    if (miniJobs && display.length > 0) {
      const rows = display.map(j => {
        const title   = j.meta?.title   || j.slug;
        const company = j.meta?.company || '';
        const typeTag = j.meta?.type
          ? `<span class="tag tag-green">${esc(j.meta.type)}</span>`
          : j.meta?.pay
            ? `<span class="tag tag-gold">${esc(j.meta.pay)}</span>`
            : j.meta?.featured === true || j.meta?.featured === 'true'
              ? `<span class="tag tag-gold">⭐ Featured</span>`
              : '';
        return `
          <div class="mini-job">
            <div>
              <strong>${esc(title)}</strong>
              <span>${esc(company)}</span>
            </div>
            ${typeTag}
          </div>`;
      }).join('');

      // Preserve the "view all" link at the bottom
      const link = miniJobs.querySelector('.view-all-jobs');
      miniJobs.innerHTML = rows;
      if (link) miniJobs.appendChild(link);
    }
  }

  // ── Run after DOM ready ────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  function run() {
    // Small delay so static content renders first (better perceived perf)
    setTimeout(() => {
      injectNews().catch(() => {});
      injectJobs().catch(() => {});
    }, 50);
  }

})();
