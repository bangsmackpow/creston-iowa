/**
 * src/handlers/site-builder.js
 * Content Scout — AI-powered local data discovery & bulk import.
 *
 * Discovers businesses, restaurants, jobs, events, and attractions
 * from free public APIs within a configurable radius, normalizes
 * them into our markdown frontmatter format, and presents them
 * for admin review before importing.
 *
 * Sources:
 *   OpenStreetMap/Overpass — businesses, restaurants, amenities (free, no key)
 *   Wikipedia/Wikidata     — attractions, city history, landmarks (free, no key)
 *   USA Jobs API           — federal jobs near location (free, no key)
 *   Iowa Workforce Dev     — state jobs RSS (free, no key)
 *   Workers AI             — enriches raw OSM data with better descriptions
 *   Google Places API      — optional upgrade (requires GOOGLE_PLACES_KEY secret)
 *
 * Admin routes:
 *   GET  /admin/site-builder           → discovery UI
 *   POST /admin/site-builder/discover  → run discovery for a location
 *   POST /admin/site-builder/import    → bulk import selected items to R2 drafts
 *   GET  /admin/site-builder/status    → check import queue
 */

import { adminPage }     from './admin-page.js';
import { getSiteConfig } from '../db/site.js';
import { escapeHtml }    from '../shell.js';

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

// OSM amenity/leisure/shop tags → our content types
const OSM_CATEGORY_MAP = {
  // Food & Drink (type: 'food')
  restaurant:   { type: 'food',       cat: 'American',      emoji: '🍽️' },
  fast_food:    { type: 'food',       cat: 'Fast-food',     emoji: '🍔' },
  cafe:         { type: 'food',       cat: 'Cafe',          emoji: '☕' },
  bar:          { type: 'food',       cat: 'Bar',           emoji: '🍺' },
  pub:          { type: 'food',       cat: 'Bar',           emoji: '🍺' },
  ice_cream:    { type: 'food',       cat: 'Dessert',       emoji: '🍦' },
  bakery:       { type: 'food',       cat: 'Bakery',        emoji: '🥐' },
  pizza:        { type: 'food',       cat: 'Pizza',         emoji: '🍕' },
  
  // Attractions & Places (type: 'attractions')
  museum:       { type: 'attractions', cat: 'History',      emoji: '🏛️' },
  park:         { type: 'attractions', cat: 'Recreation',   emoji: '🌳' },
  library:      { type: 'attractions', cat: 'Education',    emoji: '📚' },
  cinema:       { type: 'attractions', cat: 'Entertainment', emoji: '🎬' },
  theatre:      { type: 'attractions', cat: 'Arts',         emoji: '🎭' },
  arts_centre:  { type: 'attractions', cat: 'Arts',         emoji: '🎨' },
  community_centre: { type: 'attractions', cat: 'Community', emoji: '🤝' },
  place_of_worship: { type: 'attractions', cat: 'Community', emoji: '⛪' },
  townhall:     { type: 'attractions', cat: 'History',      emoji: '🏛️' },
  viewpoint:    { type: 'attractions', cat: 'Recreation',   emoji: '🔭' },
  
  // Business/Directory (type: 'directory')
  bank:         { type: 'directory', cat: 'Professional',   emoji: '🏦' },
  atm:          { type: 'directory', cat: 'Services',       emoji: '🏧' },
  pharmacy:     { type: 'directory', cat: 'Healthcare',     emoji: '💊' },
  hospital:     { type: 'directory', cat: 'Healthcare',     emoji: '🏥' },
  clinic:       { type: 'directory', cat: 'Healthcare',     emoji: '🏥' },
  dentist:      { type: 'directory', cat: 'Healthcare',     emoji: '🦷' },
  doctor:       { type: 'directory', cat: 'Healthcare',     emoji: '👨‍⚕️' },
  veterinary:   { type: 'directory', cat: 'Healthcare',     emoji: '🐾' },
  car_repair:   { type: 'directory', cat: 'Services',       emoji: '🔧' },
  car_wash:     { type: 'directory', cat: 'Services',       emoji: '🧼' },
  fuel:         { type: 'directory', cat: 'Services',       emoji: '⛽' },
  supermarket:  { type: 'directory', cat: 'Retail',         emoji: '🛒' },
  convenience:  { type: 'directory', cat: 'Retail',         emoji: '🏪' },
  hardware:     { type: 'directory', cat: 'Retail',         emoji: '🔨' },
  clothes:      { type: 'directory', cat: 'Retail',         emoji: '👕' },
  gift:         { type: 'directory', cat: 'Retail',         emoji: '🎁' },
  hairdresser:  { type: 'directory', cat: 'Services',       emoji: '💇' },
  beauty:       { type: 'directory', cat: 'Services',       emoji: '💄' },
  laundry:      { type: 'directory', cat: 'Services',       emoji: '👕' },
  post_office:  { type: 'directory', cat: 'Services',       emoji: '📯' },
  hotel:        { type: 'directory', cat: 'Services',       emoji: '🏨' },
  motel:        { type: 'directory', cat: 'Services',       emoji: '🏨' },
  gym:          { type: 'directory', cat: 'Healthcare',     emoji: '💪' },
  real_estate:  { type: 'directory', cat: 'Professional',   emoji: '🏠' },
  lawyer:       { type: 'directory', cat: 'Professional',   emoji: '⚖️' },
  insurance:    { type: 'directory', cat: 'Professional',   emoji: '🛡️' },
  school:       { type: 'directory', cat: 'Nonprofit',      emoji: '🏫' },
  kindergarten: { type: 'directory', cat: 'Nonprofit',      emoji: '🧒' },
};

// ── Main page ─────────────────────────────────────────────────
export async function handleSiteBuilder(request, env, url, user) {
  if (request.method === 'POST') {
    const path = url.pathname;
    if (path === '/admin/site-builder/discover') return handleDiscover(request, env);
    if (path === '/admin/site-builder/import')   return handleImport(request, env);
  }

  const cfg = await getSiteConfig(env);

  // Load existing import queue from R2
  const queue = await loadImportQueue(env);
  const queueByType = {};
  for (const item of queue) {
    if (!queueByType[item.type]) queueByType[item.type] = [];
    queueByType[item.type].push(item);
  }

  const queueHTML = queue.length > 0 ? `
    <div style="margin-bottom:28px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="font-family:sans-serif;font-size:.95rem;margin:0;">
          📥 Import Queue (${queue.length} items ready)
        </h3>
        <div style="display:flex;gap:8px;">
          <button onclick="importAll()" class="btn-admin-primary">✅ Import All as Drafts</button>
          <button onclick="clearQueue()" class="btn-admin-secondary">🗑️ Clear Queue</button>
        </div>
      </div>
      ${Object.entries(queueByType).map(([type, items]) => `
      <details open>
        <summary style="font-family:sans-serif;font-size:.85rem;font-weight:600;cursor:pointer;padding:8px 0;color:var(--green-deep,#1a3a2a);">
          ${typeEmoji(type)} ${capitalize(type)} — ${items.length} items
        </summary>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin-top:10px;margin-bottom:12px;">
          ${items.map(item => `
          <div class="import-card" id="card-${escapeHtml(item.id)}">
            <div class="import-card-header">
              <span style="font-size:1.2rem;">${escapeHtml(item.emoji||'📌')}</span>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:.85rem;color:var(--green-deep,#1a3a2a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.name||item.title||'Untitled')}</div>
                ${item.address ? `<div style="font-size:.72rem;color:#888;">${escapeHtml(item.address.slice(0,50))}</div>` : ''}
              </div>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;flex-shrink:0;">
                <input type="checkbox" checked data-id="${escapeHtml(item.id)}" style="width:16px;height:16px;">
              </label>
            </div>
            ${item.summary ? `<div style="font-size:.75rem;color:#555;margin-top:6px;line-height:1.5;">${escapeHtml(item.summary.slice(0,100))}${item.summary.length>100?'…':''}</div>` : ''}
            <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
              <span style="font-size:.68rem;background:#f0f0f0;padding:2px 7px;border-radius:4px;color:#555;">${escapeHtml(item.source||'OSM')}</span>
              ${item.category ? `<span style="font-size:.68rem;background:#e8f2eb;padding:2px 7px;border-radius:4px;color:#2d5a3d;">${escapeHtml(item.category)}</span>` : ''}
              ${item.phone ? `<span style="font-size:.68rem;color:#888;">📞 ${escapeHtml(item.phone)}</span>` : ''}
            </div>
          </div>`).join('')}
        </div>
      </details>`).join('')}
      <div id="import-status" style="font-family:sans-serif;font-size:.88rem;min-height:1em;margin-top:8px;"></div>
    </div>` : '';

  const hasGoogle = !!(env.GOOGLE_PLACES_KEY);

  const body = `
    <div class="page-description">
      🔍 <strong>Content Scout</strong> — Automatically discover local businesses, restaurants, attractions,
      and jobs within any radius of a city center. Results are normalized into our markdown format and
      placed in a review queue. Select what you want and click Import — everything lands in Drafts for
      final review before going live. Powered by OpenStreetMap, Wikipedia, USA Jobs, and optionally Google Places.
    </div>

    <div class="settings-header">
      <h2>🔍 Content Scout</h2>
    </div>

    <div style="background:white;border:1.5px solid #e0e0e0;border-radius:12px;padding:24px;margin-bottom:28px;">
      <h3 style="font-family:sans-serif;font-size:.95rem;margin:0 0 16px;">Discovery Settings</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr 120px;gap:12px;margin-bottom:14px;align-items:end;">
        <div>
          <label class="form-label">City / Town *</label>
          <input type="text" id="city-input" class="form-input" value="${escapeHtml(cfg.name||'Creston, Iowa')}"
                 placeholder="Creston, Iowa">
        </div>
        <div>
          <label class="form-label">Radius</label>
          <select id="radius-input" class="form-select">
            <option value="5000">5 miles</option>
            <option value="8000" selected>10 miles</option>
            <option value="16000">10 miles</option>
            <option value="24000">15 miles</option>
            <option value="40000">25 miles</option>
          </select>
        </div>
        <div>
          <label class="form-label">AI Enrich</label>
          <select id="ai-enrich" class="form-select">
            <option value="0">Off</option>
            <option value="1" ${env.AI?'selected':''}>On${env.AI?'':' (no AI)'}</option>
          </select>
        </div>
      </div>

      <div style="margin-bottom:16px;">
        <label class="form-label">What to discover</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${[
            ['food',        '🍽️', 'Restaurants & Food'],
            ['attractions', '🎈', 'Attractions & Parks'],
            ['directory',   '🏪', 'Businesses & Services'],
            ['jobs',        '💼', 'Jobs'],
            ['news',        '📰', 'Local News'],
            ['events',      '📅', 'Chamber Events'],
            ['wikipedia',   '📖', 'Attractions (Wikipedia)'],
          ].map(([val, emoji, label]) => `
          <label style="display:flex;align-items:center;gap:6px;padding:7px 12px;background:#f5f5f5;border:1.5px solid #e0e0e0;border-radius:8px;cursor:pointer;font-family:sans-serif;font-size:.82rem;font-weight:500;">
            <input type="checkbox" value="${val}" class="discover-type" checked style="width:15px;height:15px;">
            ${emoji} ${label}
          </label>`).join('')}
        </div>
      </div>

      ${hasGoogle ? `
      <div style="background:#e8f2eb;border:1.5px solid #4a8c5c;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-family:sans-serif;font-size:.82rem;color:#1a3a2a;">
        ✅ Google Places API connected — higher quality business data available
        <label style="margin-left:12px;display:inline-flex;align-items:center;gap:5px;">
          <input type="checkbox" id="use-google" checked style="width:14px;height:14px;"> Use Google Places
        </label>
      </div>` : `
      <div style="background:#f9f9f9;border:1px solid #e0e0e0;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-family:sans-serif;font-size:.82rem;color:#888;">
        💡 Add <code>GOOGLE_PLACES_KEY</code> secret for higher-quality business data.
        Using OpenStreetMap (free, no key needed).
      </div>`}

      <button onclick="runDiscovery()" class="btn-admin-primary btn-lg" id="discover-btn">
        🔍 Discover Local Data
      </button>
      <div id="discover-status" style="font-family:sans-serif;font-size:.88rem;margin-top:12px;min-height:1.4em;"></div>
    </div>

    ${queueHTML}

    <div id="results-area"></div>

    <style>
      .import-card { background:#fafafa; border:1.5px solid #e0e0e0; border-radius:10px; padding:12px 14px; transition:border-color .12s; }
      .import-card:hover { border-color:#2d5a3d; }
      .import-card-header { display:flex; align-items:flex-start; gap:8px; }
      details summary::-webkit-details-marker { display:none; }
      details summary::before { content:'▶ '; font-size:.7rem; opacity:.5; }
      details[open] summary::before { content:'▼ '; }
    </style>

    <script>
      const TOKEN = sessionStorage.getItem('admin_token')||'';
      const H = {'Content-Type':'application/json','Authorization':'Bearer '+TOKEN};
      const st = document.getElementById('discover-status');
      const ra = document.getElementById('results-area');

      async function runDiscovery() {
        const city    = document.getElementById('city-input').value.trim();
        const radius  = document.getElementById('radius-input').value;
        const enrich  = document.getElementById('ai-enrich').value;
        const useGoogle = document.getElementById('use-google')?.checked || false;
        const types   = [...document.querySelectorAll('.discover-type:checked')].map(el=>el.value);
        if (!city) { st.textContent='⚠️ Enter a city name.'; return; }
        if (!types.length) { st.textContent='⚠️ Select at least one data type.'; return; }

        const btn = document.getElementById('discover-btn');
        btn.disabled = true;
        btn.textContent = '⏳ Discovering...';
        st.textContent = 'Geocoding city location...';
        ra.innerHTML = '';

        try {
          const r = await fetch('/admin/site-builder/discover', {
            method:'POST', headers:H,
            body: JSON.stringify({ city, radius: parseInt(radius), types, enrich: enrich==='1', useGoogle })
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error||'Discovery failed');

          st.textContent = '✅ Found ' + d.total + ' items across ' + Object.keys(d.results).length + ' categories. Review below and click "Add to Import Queue".';
          renderResults(d.results);
        } catch(e) {
          st.textContent = '❌ ' + e.message;
        } finally {
          btn.disabled = false;
          btn.textContent = '🔍 Discover Local Data';
        }
      }

      function renderResults(results) {
        if (!results || !Object.keys(results).length) {
          ra.innerHTML = '<p style="font-family:sans-serif;color:#888;text-align:center;padding:24px;">No results found. Try a larger radius or different city name.</p>';
          return;
        }
        let html = '<div style="margin-bottom:28px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
        html += '<h3 style="font-family:sans-serif;font-size:.95rem;margin:0;">Discovery Results</h3>';
        html += '<div style="display:flex;gap:8px;">';
        html += '<button onclick="selectAll()" class="btn-admin-secondary" style="font-size:.78rem;">Select All</button>';
        html += '<button onclick="addToQueue()" class="btn-admin-primary">📥 Add Selected to Import Queue</button>';
        html += '</div></div>';

        for (const [type, items] of Object.entries(results)) {
          html += '<details open><summary style="font-family:sans-serif;font-size:.85rem;font-weight:600;cursor:pointer;padding:8px 0;color:#1a3a2a;">';
          html += typeEmoji(type) + ' ' + capitalize(type) + ' — ' + items.length + ' found</summary>';
          html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin-top:10px;margin-bottom:12px;">';
          for (const item of items) {
            html += '<div class="import-card">';
            html += '<div class="import-card-header">';
            html += '<span style="font-size:1.2rem;">' + (item.emoji||'📌') + '</span>';
            html += '<div style="flex:1;min-width:0;">';
            html += '<div style="font-weight:600;font-size:.85rem;color:#1a3a2a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(item.name||item.title||'Untitled') + '</div>';
            if (item.address) html += '<div style="font-size:.72rem;color:#888;">' + esc(item.address.slice(0,50)) + '</div>';
            html += '</div>';
            html += '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;flex-shrink:0;">';
            html += '<input type="checkbox" checked class="result-check" data-item=\\'' + JSON.stringify(item).replace(/'/g,"&#39;") + '\\' style="width:16px;height:16px;">';
            html += '</label></div>';
            if (item.summary) html += '<div style="font-size:.75rem;color:#555;margin-top:6px;line-height:1.5;">' + esc(item.summary.slice(0,100)) + (item.summary.length>100?'…':'') + '</div>';
            html += '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">';
            html += '<span style="font-size:.68rem;background:#f0f0f0;padding:2px 7px;border-radius:4px;color:#555;">' + esc(item.source||'OSM') + '</span>';
            if (item.category) html += '<span style="font-size:.68rem;background:#e8f2eb;padding:2px 7px;border-radius:4px;color:#2d5a3d;">' + esc(item.category) + '</span>';
            if (item.phone) html += '<span style="font-size:.68rem;color:#888;">📞 ' + esc(item.phone) + '</span>';
            if (item.website) html += '<a href="' + esc(item.website) + '" target="_blank" style="font-size:.68rem;color:#2d5a3d;">🔗 Website</a>';
            html += '</div></div>';
          }
          html += '</div></details>';
        }
        html += '<div id="queue-status" style="font-family:sans-serif;font-size:.88rem;min-height:1em;margin-top:8px;"></div>';
        html += '</div>';
        ra.innerHTML = html;
      }

      function selectAll() {
        document.querySelectorAll('.result-check').forEach(cb => cb.checked = true);
      }

      async function addToQueue() {
        const selected = [...document.querySelectorAll('.result-check:checked')].map(cb => {
          try { return JSON.parse(cb.dataset.item); } catch { return null; }
        }).filter(Boolean);
        if (!selected.length) { alert('Select at least one item.'); return; }

        const qs = document.getElementById('queue-status');
        if (qs) { qs.textContent = '⏳ Adding to queue...'; qs.style.color='#888'; }
        const r = await fetch('/admin/site-builder/import', {
          method:'POST', headers:H,
          body: JSON.stringify({ items: selected, destination: 'drafts' })
        });
        const d = await r.json();
        if (d.ok) {
          if (qs) { qs.textContent = '✅ ' + d.imported + ' items added to import queue. Refresh to see them.'; qs.style.color='#2d5a3d'; }
          setTimeout(() => location.reload(), 1500);
        } else {
          if (qs) { qs.textContent = '❌ ' + (d.error||'Failed'); qs.style.color='#b84040'; }
        }
      }

      async function importAll() {
        const checked = [...document.querySelectorAll('[data-id]:checked')].map(cb => cb.dataset.id);
        const is = document.getElementById('import-status');
        if (!confirm('Import ' + (checked.length || 'all') + ' items to Drafts?')) return;
        is.textContent = '⏳ Importing...'; is.style.color='#888';
        const r = await fetch('/admin/site-builder/import', {
          method:'POST', headers:H,
          body: JSON.stringify({ queueIds: checked.length ? checked : 'all', destination: 'drafts', fromQueue: true })
        });
        const d = await r.json();
        if (d.ok) { is.textContent = '✅ Imported ' + d.imported + ' items to Drafts!'; is.style.color='#2d5a3d'; setTimeout(()=>location.reload(), 1500); }
        else { is.textContent = '❌ ' + (d.error||'Failed'); is.style.color='#b84040'; }
      }

      async function clearQueue() {
        if (!confirm('Clear the entire import queue?')) return;
        const r = await fetch('/admin/site-builder/import', {
          method:'POST', headers:H,
          body: JSON.stringify({ action: 'clear' })
        });
        const d = await r.json();
        if (d.ok) location.reload();
      }

      function typeEmoji(t) { return {food:'🍽️',attractions:'🎈',directory:'🏪',jobs:'💼',wikipedia:'📖',news:'📰'}[t]||'📌'; }
      function capitalize(s) { return s.charAt(0).toUpperCase()+s.slice(1); }
      function esc(s) { const d=document.createElement('div'); d.textContent=String(s||''); return d.innerHTML; }
    </script>`;

  return adminPage('🔍 Content Scout', body, user);
}

// ── Discovery engine ───────────────────────────────────────────
async function handleDiscover(request, env) {
  const body = await request.json().catch(() => ({}));
  const { city, radius = 8000, types = [], enrich = false, useGoogle = false } = body;

  if (!city) return jsonRes({ error: 'City required' }, 400);

  // Step 1: Geocode city
  const coords = await geocodeCity(city);
  if (!coords) return jsonRes({ error: `Could not find coordinates for "${city}". Try "City, State" format.` }, 400);

  const { lat, lon, displayName } = coords;
  const radiusMeters = Math.min(radius, 50000); // cap at 50km

  const results = {};
  let total = 0;

  // Step 2: Run discovery in parallel across requested types
  const tasks = [];

  if (types.includes('food') || types.includes('directory') || types.includes('attractions')) {
    tasks.push(
      fetchOSMData(lat, lon, radiusMeters, types).then(items => {
        for (const [type, arr] of Object.entries(items)) {
          if (!results[type]) results[type] = [];
          results[type].push(...arr);
          total += arr.length;
        }
      }).catch(err => console.error('OSM error:', err.message))
    );
  }

  if (types.includes('jobs')) {
    tasks.push(
      fetchUSAJobs(lat, lon, city).then(jobs => {
        results.jobs = (results.jobs || []).concat(jobs);
        total += jobs.length;
      }).catch(err => console.error('USA Jobs error:', err.message))
    );
    tasks.push(
      fetchIowaWorkforce().then(jobs => {
        results.jobs = (results.jobs || []).concat(jobs);
        total += jobs.length;
      }).catch(err => console.error('Iowa Workforce error:', err.message))
    );
  }

  if (types.includes('wikipedia')) {
    tasks.push(
      fetchWikipediaAttractions(lat, lon, radiusMeters).then(items => {
        results.attractions = (results.attractions || []).concat(items);
        total += items.length;
      }).catch(err => console.error('Wikipedia error:', err.message))
    );
  }

  // Google Places if key available
  if (useGoogle && env.GOOGLE_PLACES_KEY && (types.includes('food') || types.includes('directory'))) {
    tasks.push(
      fetchGooglePlaces(lat, lon, radiusMeters, env.GOOGLE_PLACES_KEY).then(items => {
        for (const [type, arr] of Object.entries(items)) {
          if (!results[type]) results[type] = [];
          results[type].push(...arr);
          total += arr.length;
        }
      }).catch(err => console.error('Google Places error:', err.message))
    );
  }

  if (types.includes('news')) {
    tasks.push(
      fetchNewsFeeds().then(news => {
        results.news = (results.news || []).concat(news);
        total += news.length;
      }).catch(err => console.error('News error:', err.message))
    );
  }

  if (types.includes('events')) {
    tasks.push(
      fetchChamberEvents().then(events => {
        results.events = (results.events || []).concat(events);
        total += events.length;
      }).catch(err => console.error('Events error:', err.message))
    );
  }

  await Promise.allSettled(tasks);

  // Step 3: Deduplicate by name within each type
  for (const type of Object.keys(results)) {
    const seen = new Set();
    results[type] = results[type].filter(item => {
      const key = (item.name || item.title || '').toLowerCase().trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 50); // cap at 50 per type
    if (!results[type].length) delete results[type];
  }

  // Step 4: AI enrichment for items missing descriptions & taglines
  if (enrich && env.AI && total > 0) {
    await enrichWithAI(env, results);
  }

  return jsonRes({ ok: true, total, coords: { lat, lon, display: displayName }, results });
}

// ── Import handler ─────────────────────────────────────────────
async function handleImport(request, env) {
  const body = await request.json().catch(() => ({}));

  // Clear queue
  if (body.action === 'clear') {
    const listed = await env.BUCKET.list({ prefix: 'site-builder/queue/' });
    await Promise.all(listed.objects.map(o => env.BUCKET.delete(o.key)));
    return jsonRes({ ok: true });
  }

  // Add to queue (from discovery results)
  if (body.items && !body.fromQueue) {
    const items = body.items;
    for (const item of items) {
      const key = `site-builder/queue/${item.type||'other'}/${Date.now()}-${slugify(item.name||item.title||'item')}.json`;
      await env.BUCKET.put(key, JSON.stringify({ ...item, queued_at: new Date().toISOString(), key }),
        { httpMetadata: { contentType: 'application/json' } });
    }
    return jsonRes({ ok: true, imported: items.length });
  }

  // Import from queue to drafts
  if (body.fromQueue) {
    const queue = await loadImportQueue(env);
    const toImport = body.queueIds === 'all'
      ? queue
      : queue.filter(item => body.queueIds.includes(item.id));

    let imported = 0;
    for (const item of toImport) {
      const md = itemToMarkdown(item);
      if (!md) continue;
      const slug = slugify(item.name || item.title || 'item') + '-' + Date.now().toString(36);
      const draftKey = `drafts/${item.type}/${slug}.md`;
      await env.BUCKET.put(draftKey, md, { httpMetadata: { contentType: 'text/markdown; charset=utf-8' } });
      // Remove from queue
      if (item._queueKey) await env.BUCKET.delete(item._queueKey);
      imported++;
    }

    return jsonRes({ ok: true, imported });
  }

  return jsonRes({ error: 'Unknown action' }, 400);
}

// ── Load import queue ─────────────────────────────────────────
async function loadImportQueue(env) {
  try {
    const listed = await env.BUCKET.list({ prefix: 'site-builder/queue/' });
    const items = [];
    for (const obj of listed.objects.filter(o => o.key.endsWith('.json')).slice(0, 200)) {
      const file = await env.BUCKET.get(obj.key);
      if (!file) continue;
      const data = JSON.parse(await file.text());
      data._queueKey = obj.key;
      data.id = data.id || obj.key;
      items.push(data);
    }
    return items;
  } catch { return []; }
}

// ── OpenStreetMap / Overpass fetch ────────────────────────────
async function fetchOSMData(lat, lon, radiusMeters, types) {
  const amenityTypes = Object.keys(OSM_CATEGORY_MAP);
  const leisureTypes = ['park', 'swimming_pool', 'sports_centre', 'golf_course', 'bowling_alley', 'playground'];
  const shopTypes    = ['supermarket', 'convenience', 'bakery', 'hairdresser', 'laundry'];

  // Build Overpass query
  const r = radiusMeters;
  const around = `(around:${r},${lat},${lon})`;

  const query = `[out:json][timeout:30];
(
  node["amenity"~"${amenityTypes.join('|')}"]${around};
  way["amenity"~"${amenityTypes.join('|')}"]${around};
  node["leisure"~"${leisureTypes.join('|')}"]${around};
  node["shop"~"${shopTypes.join('|')}"]${around};
);
out center 200;`;

  const res = await fetch(OVERPASS_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) throw new Error(`Overpass API ${res.status}`);
  const data = await res.json();

  const byType = {};

  for (const el of (data.elements || [])) {
    const tags    = el.tags || {};
    const name    = tags.name;
    if (!name) continue; // skip unnamed features

    const amenity = tags.amenity || tags.leisure || tags.shop;
    const mapped  = OSM_CATEGORY_MAP[amenity];
    if (!mapped) continue;

    // Filter by requested types
    if (!types.includes(mapped.type) && !types.includes('directory')) continue;

    const item = {
      id:       `osm-${el.type}-${el.id}`,
      type:     mapped.type,
      source:   'OpenStreetMap',
      emoji:    mapped.emoji,
      name,
      category: mapped.cat,
      address:  buildAddress(tags),
      phone:    tags.phone || tags['contact:phone'] || '',
      website:  tags.website || tags['contact:website'] || '',
      hours:    tags.opening_hours || '',
      lat:      el.lat || el.center?.lat,
      lon:      el.lon || el.center?.lon,
      summary:  tags.description || '',
    };

    if (!byType[mapped.type]) byType[mapped.type] = [];
    byType[mapped.type].push(item);
  }

  return byType;
}

// ── USA Jobs API ──────────────────────────────────────────────
async function fetchUSAJobs(lat, lon, city) {
  try {
    // USA Jobs public search - no key needed for basic queries
    const state = extractState(city) || 'IA';
    const res = await fetch(
      `https://data.usajobs.gov/api/search?LocationName=${encodeURIComponent(state)}&ResultsPerPage=25&SortField=DatePosted&SortDirection=Desc`,
      { headers: { 'User-Agent': 'CrestonCMS/1.0 (community website job aggregator)' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const jobs = (data?.SearchResult?.SearchResultItems || []).slice(0, 20);

    return jobs.map(j => {
      const pos = j.MatchedObjectDescriptor || {};
      return {
        id:       `usajobs-${pos.PositionID || Math.random()}`,
        type:     'jobs',
        source:   'USA Jobs',
        emoji:    '🏛️',
        title:    pos.PositionTitle || 'Federal Position',
        name:     pos.PositionTitle || 'Federal Position',
        company:  pos.OrganizationName || 'Federal Government',
        location: (pos.PositionLocationDisplay || city),
        pay:      pos.PositionRemuneration?.[0]?.MinimumRange
                    ? `$${Number(pos.PositionRemuneration[0].MinimumRange).toLocaleString()}/yr`
                    : '',
        type_label: pos.PositionSchedule?.[0]?.Name || 'Full-Time',
        apply_url:  pos.ApplyURI?.[0] || pos.PositionURI || '',
        summary:    (pos.UserArea?.Details?.JobSummary || '').slice(0, 300),
        posted:     pos.PublicationStartDate?.split('T')[0] || new Date().toISOString().split('T')[0],
        expires:    pos.ApplicationCloseDate?.split('T')[0] || '',
        category:   'Government',
      };
    });
  } catch (err) {
    console.error('USA Jobs error:', err.message);
    return [];
  }
}

// ── Wikipedia nearby attractions ─────────────────────────────
async function fetchWikipediaAttractions(lat, lon, radiusMeters) {
  try {
    const radiusKm = Math.min(Math.round(radiusMeters / 1000), 200);
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lon}&gsradius=${radiusKm * 1000}&gslimit=20&format=json&origin=*`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data?.query?.geosearch || [];

    const items = [];
    for (const page of pages.slice(0, 15)) {
      // Fetch extract for each page
      const detail = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&pageids=${page.pageid}&prop=extracts|pageimages&exintro=1&exsentences=3&explaintext=1&pithumbsize=200&format=json&origin=*`
      ).then(r => r.json()).catch(() => null);

      const pageData = detail?.query?.pages?.[page.pageid];
      const extract  = pageData?.extract || '';
      if (!extract || extract.length < 30) continue;

      items.push({
        id:       `wiki-${page.pageid}`,
        type:     'attractions',
        source:   'Wikipedia',
        emoji:    '📖',
        name:     page.title,
        category: 'History',
        summary:  extract.slice(0, 400),
        location: `${page.lat}, ${page.lon}`,
        website:  `https://en.wikipedia.org/?curid=${page.pageid}`,
        lat:      page.lat,
        lon:      page.lon,
      });
    }
    return items;
  } catch (err) {
    console.error('Wikipedia error:', err.message);
    return [];
  }
}

// ── Google Places (optional) ───────────────────────────────────
async function fetchGooglePlaces(lat, lon, radiusMeters, apiKey) {
  // Uses Places API (New) - Nearby Search
  // https://developers.google.com/maps/documentation/places/web-service/nearby-search
  // Each call uses "Nearby Search" SKU: 10,000 free requests/month (Essentials tier)
  // We make 2 calls per discovery run (food + directory) = negligible quota usage

  const PLACES_NEW = 'https://places.googleapis.com/v1/places:searchNearby';
  const byType = {};

  // Food & drink
  const foodTypes = ['restaurant', 'cafe', 'bar', 'bakery', 'ice_cream_shop'];
  // Business directory
  const bizTypes  = ['hotel', 'pharmacy', 'hospital', 'gym', 'car_repair', 'supermarket',
                     'beauty_salon', 'laundry', 'bank', 'dentist', 'veterinary_care'];

  const batches = [
    { includedTypes: foodTypes,  mapped: { type: 'food',      emoji: '🍽️' } },
    { includedTypes: bizTypes,   mapped: { type: 'directory', emoji: '🏪' } },
  ];

  for (const batch of batches) {
    try {
      const res = await fetch(PLACES_NEW, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'X-Goog-Api-Key': apiKey,
          // FieldMask: only request fields we need — controls cost tier
          // Using Essentials fields only (cheapest tier)
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.types,places.regularOpeningHours.weekdayDescriptions,places.location',
        },
        body: JSON.stringify({
          includedTypes:      batch.includedTypes,
          maxResultCount:     20,
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lon },
              radius: Math.min(radiusMeters, 50000),
            },
          },
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('Google Places error:', res.status, err.slice(0, 200));
        continue;
      }

      const data = await res.json();
      if (!data.places?.length) continue;

      if (!byType[batch.mapped.type]) byType[batch.mapped.type] = [];

      for (const place of data.places) {
        // Map Google place types to our categories
        const types  = place.types || [];
        const cat    = mapGoogleType(types);
        const hours  = place.regularOpeningHours?.weekdayDescriptions?.join('; ') || '';
        const rating = place.rating
          ? `${place.rating}/5 (${place.userRatingCount || 0} reviews)`
          : '';

        byType[batch.mapped.type].push({
          id:       `google-${place.id}`,
          type:     batch.mapped.type,
          source:   'Google Places',
          emoji:    batch.mapped.emoji,
          name:     place.displayName?.text || 'Unknown',
          category: cat,
          address:  place.formattedAddress || '',
          phone:    place.nationalPhoneNumber || '',
          website:  place.websiteUri || '',
          hours,
          rating,
          lat:      place.location?.latitude,
          lon:      place.location?.longitude,
          summary:  rating ? `Rated ${rating}.${hours ? ' ' + hours.split(';')[0] : ''}` : '',
        });
      }
    } catch (e) {
      console.error('Google Places batch error:', e.message);
      continue;
    }
  }

  return byType;
}

function mapGoogleType(types) {
  if (types.includes('restaurant'))     return 'Restaurant';
  if (types.includes('cafe'))           return 'Cafe';
  if (types.includes('bar'))            return 'Bar & Grill';
  if (types.includes('bakery'))         return 'Bakery';
  if (types.includes('hotel'))          return 'Lodging';
  if (types.includes('pharmacy'))       return 'Health';
  if (types.includes('hospital'))       return 'Health';
  if (types.includes('gym'))            return 'Fitness';
  if (types.includes('supermarket'))    return 'Grocery';
  if (types.includes('beauty_salon'))   return 'Beauty';
  if (types.includes('bank'))           return 'Finance';
  if (types.includes('dentist'))        return 'Dental';
  if (types.includes('car_repair'))     return 'Automotive';
  return 'Services';
}

// ── AI enrichment ─────────────────────────────────────────────
async function enrichWithAI(env, results) {
  for (const [type, items] of Object.entries(results)) {
    for (const item of items.slice(0, 15)) { // limit AI calls per batch
      if (item.summary && item.summary.length > 50 && item.tagline) continue;

      try {
        const prompt = `You are a local community website editor. Write a tagline and description for this business.
Name: ${item.name}
Type: ${type} / ${item.category || ''}
Address: ${item.address || 'local area'}

Return ONLY a JSON object with keys "tagline" (5-10 words maximum) and "summary" (1-2 sentences). 
No other text, no preamble. Just the JSON.`;

        const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          prompt, max_tokens: 150, stream: false
        });
        
        let response = result?.response || '';
        // Try to find JSON block if AI hallucinated preamble
        const jsonMatch = response.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          if (data.tagline) item.tagline = data.tagline.replace(/^["']|["']$/g, '');
          if (data.summary) item.summary = data.summary.replace(/^["']|["']$/g, '');
        } else if (response.length > 10 && !response.includes('{')) {
          // Fallback if it just returned text
          item.summary = response.trim().replace(/^["']|["']$/g, '');
          item.tagline = item.tagline || (item.summary.split('.')[0] + ' in Creston');
        }
      } catch (err) { 
        console.error('AI enrichment failed for', item.name, err.message);
      }
    }
  }
}

// ── Convert queued item to markdown ───────────────────────────
function itemToMarkdown(item) {
  const today = new Date().toISOString().split('T')[0];
  const slug  = slugify(item.name || item.title || 'item');

  switch (item.type) {
    case 'food': return `---
name: ${item.name || 'Restaurant'}
category: ${(item.category || 'American').toLowerCase()}
emoji: ${item.emoji || '🍽️'}
address: ${item.address || ''}
phone: "${item.phone || ''}"
website: ${item.website || ''}
hours: "${item.hours || ''}"
price: "$$"
tags: [Dine-In]
featured: false
summary: ${item.summary || `${item.name} in ${item.address || 'the local area'}.`}
source: ${item.source || 'Content Scout'}
---

## About

${item.summary || `${item.name} is a local dining establishment serving the Creston community.`}

${item.hours ? `## Hours\n\n${item.hours}` : ''}
${item.address ? `## Location\n\n${item.address}` : ''}
`;

    case 'attractions': return `---
name: ${item.name || 'Attraction'}
category: ${item.category || 'Recreation'}
emoji: ${item.emoji || '🎈'}
tagline: ${item.tagline || item.summary?.split('.')[0] || 'Local attraction'}
season: Year-round
location: ${item.address || item.location || ''}
cost: Free
featured: false
summary: ${item.summary?.slice(0, 200) || `${item.name} is a local attraction.`}
source: ${item.source || 'Content Scout'}
${item.website ? `website: ${item.website}` : ''}
---

## Overview

${item.summary || `${item.name} is a notable local landmark and attraction in the Creston area.`}

## Visitor Information

${item.address || item.location || 'Located in the local area.'}
`;

    case 'directory': return `---
name: ${item.name || 'Business'}
category: ${(item.category || 'Services').toLowerCase()}
tagline: ${item.tagline || 'Local community business'}
address: ${item.address || ''}
phone: "${item.phone || ''}"
email: ""
website: ${item.website || ''}
hours: "${item.hours || ''}"
featured: false
image: 
logo: 
social_facebook: 
social_instagram: 
tags: [locally-owned]
summary: ${item.summary || `${item.name} is a local business.`}
source: ${item.source || 'Content Scout'}
---

## About

${item.summary || `${item.name} is a local business serving the community.`}

${item.address ? `## Find Us\n\n${item.address}` : ''}
`;

    case 'jobs':
      return `---
title: ${item.title || item.name || 'Job Opening'}
company: ${item.company || 'Local Employer'}
location: ${item.location || ''}
type: ${item.type_label || 'Full-Time'}
category: ${item.category || 'Government'}
pay: "${item.pay || ''}"
posted: ${item.posted || today}
expires: ${item.expires || ''}
featured: false
apply_url: ${item.apply_url || ''}
apply_email: ""
summary: ${item.summary?.slice(0, 200) || (item.title ? `${item.title} at ${item.company}` : 'Job opening')}
source: ${item.source || 'USA Jobs'}
---

## About the Role

${item.summary || 'See the application link for full details.'}

## How to Apply

${item.apply_url ? `[Apply online](${item.apply_url})` : 'Contact the employer for application details.'}
`;

    case 'news':
      return `---
title: ${item.name || item.title || 'Local News'}
category: ${item.category || 'Community'}
date: ${item.date || today}
author: ${item.author || 'Staff Reporter'}
summary: ${item.summary || (item.name + ' in Creston, Iowa.')}
source: ${item.source || 'Content Scout'}
---

## ${item.name || item.title}

${item.summary || 'Full details are available at the source link.'}

${item.website ? `[Read full article online](${item.website})` : ''}
`;

    case 'events':
      return `---
name: ${item.name || 'Community Event'}
category: ${item.category || 'Events'}
emoji: 📅
tagline: ${item.tagline || 'Happening in Creston'}
season: ${item.date || 'Soon'}
location: ${item.location || 'Creston, IA'}
cost: ${item.cost || 'Free'}
featured: false
summary: ${item.summary || (item.name + ' in Creston.')}
source: ${item.source || 'Content Scout'}
---

## ${item.name}

**When:** ${item.date || 'TBD'}
**Where:** ${item.location || 'TBD'}

${item.summary || 'See the event listing for more information.'}

${item.website ? `[Event Website](${item.website})` : ''}
`;

    default:
      return null;
  }
}

// ── News Feeds ────────────────────────────────────────────────
async function fetchNewsFeeds() {
  const feeds = [
    { url: 'https://www.crestonnews.com/arcio/rss/', name: 'Creston News Advertiser' },
    { url: 'https://unioncountyiowa.gov/feed/',      name: 'Union County Gov' }
  ];
  const allNews = [];
  for (const f of feeds) {
    try {
      const res = await fetch(f.url, { headers: { 'User-Agent': 'CrestonCMS/1.0' } });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRss(xml, 'news', f.name);
      allNews.push(...items);
    } catch (e) { console.error('Feed error:', f.name, e.message); }
  }
  return allNews;
}

// ── Chamber Events (iCal) ─────────────────────────────────────
async function fetchChamberEvents() {
  try {
    const res = await fetch('https://calendar.google.com/calendar/ical/chamber@crestoniowachamber.com/public/basic.ics');
    if (!res.ok) return [];
    const ical = await res.text();
    const events = [];
    const veventMatch = ical.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi);
    
    for (const match of veventMatch) {
      const block = match[1];
      const summary = (block.match(/SUMMARY:([\s\S]*?)(?:\r?\n[^\s]|UID:)/i)?.[1] || 'Community Event').replace(/\r?\n\s/g, '').trim();
      const desc    = (block.match(/DESCRIPTION:([\s\S]*?)(?:\r?\n[^\s]|DTSTART:|LOCATION:)/i)?.[1] || '').replace(/\r?\n\s/g, '').trim();
      const loc     = (block.match(/LOCATION:([\s\S]*?)(?:\r?\n[^\s]|SEQUENCE:|DTSTART:)/i)?.[1] || 'Creston, IA').replace(/\r?\n\s/g, '').trim();
      const dt      = block.match(/DTSTART[:;](?:VALUE=DATE:)?(\d{8})/i)?.[1];
      
      const eventDate = dt ? `${dt.slice(0,4)}-${dt.slice(4,6)}-${dt.slice(6,8)}` : new Date().toISOString().split('T')[0];
      
      events.push({
        id:        `event-${encodeURIComponent(summary).slice(0,30)}-${eventDate}`,
        type:      'events',
        source:    'Chamber Calendar',
        emoji:     '📅',
        name:      summary,
        category:  'Community',
        location:  loc,
        date:      eventDate,
        summary:   desc.slice(0, 300) || `${summary} in Creston on ${eventDate}.`,
        website:   'https://www.crestoniowachamber.com',
      });
      if (events.length >= 10) break;
    }
    return events;
  } catch (err) {
    console.error('iCal error:', err.message);
    return [];
  }
}

function parseRss(xml, type, source) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
    const block = match[1];
    const title = extractXmlTag(block, 'title');
    const link  = extractXmlTag(block, 'link');
    const desc  = extractXmlTag(block, 'description').replace(/<[^>]+>/g,'').replace(/&[^;]+;/g, '').trim();
    const date  = extractXmlTag(block, 'pubDate');
    
    items.push({
      id:      `rss-${encodeURIComponent(title || 'item').slice(0,30)}-${Date.now()}`,
      type,
      source,
      emoji:   '📰',
      title,
      name:    title,
      category: 'Community',
      summary:  desc.slice(0, 300),
      website:  link || '',
      date:     date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    });
  }
  return items;
}

// ── Iowa Workforce Development RSS ────────────────────────────
async function fetchIowaWorkforce() {
  try {
    // Iowa Workforce Development job listings - category 6 = all Iowa
    const res = await fetch(
      'https://www.iowaworkforcedevelopment.gov/jobs/rss/6',
      { headers: { 'User-Agent': 'CrestonCMS/1.0 community job aggregator' } }
    );
    if (!res.ok) return [];
    const xml = await res.text();

    // Parse RSS items
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
      const block    = match[1];
      const title    = extractXmlTag(block, 'title');
      const link     = extractXmlTag(block, 'link');
      const desc     = extractXmlTag(block, 'description').replace(/<[^>]+>/g,'').trim();
      const pubDate  = extractXmlTag(block, 'pubDate');
      if (!title) continue;

      // Try to extract employer from description
      const employerParts = desc.split('Employer:');
      const employer = employerParts.length > 1 ? employerParts[1].split(/[\n|]/)[0].trim() : 'Iowa Employer';

      const locParts = desc.split('Location:');
      const cityParts = desc.split('City:');
      const location = locParts.length > 1 ? locParts[1].split(/[\n|]/)[0].trim() : cityParts.length > 1 ? cityParts[1].split(/[\n|]/)[0].trim() : 'Iowa';

      items.push({
        id:        `iowa-${encodeURIComponent(title).slice(0,30)}-${Date.now()}`,
        type:      'jobs',
        source:    'Iowa Workforce Development',
        emoji:     '🌽',
        title,
        name:      title,
        company:   employer,
        location,
        pay:       '',
        type_label: 'Full-Time',
        apply_url:  link || '',
        summary:   desc.slice(0, 250),
        posted:    pubDate ? new Date(pubDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        expires:   '',
        category:  'State',
      });
    }
    return items;
  } catch (err) {
    console.error('Iowa Workforce:', err.message);
    return [];
  }
}

function extractXmlTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
}


// ── Geocoding (Nominatim, free, no key) ───────────────────────
async function geocodeCity(city) {
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&addressdetails=1`,
      { headers: { 'User-Agent': 'CrestonCMS/1.0 (community content scout)' } }
    );
    const data = await res.json();
    if (!data?.[0]) return null;
    return {
      lat:         parseFloat(data[0].lat),
      lon:         parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  } catch { return null; }
}

// ── Helpers ────────────────────────────────────────────────────
function buildAddress(tags) {
  const parts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:city'],
    tags['addr:state'],
  ].filter(Boolean);
  return parts.join(' ') || tags['addr:full'] || '';
}

function extractState(city) {
  const m = city.match(/,\s*([A-Z]{2})$/);
  return m ? m[1] : null;
}

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function typeEmoji(t) {
  return { food:'🍽️', attractions:'🎈', directory:'🏪', jobs:'💼', wikipedia:'📖' }[t] || '📌';
}

function capitalize(s) {
  return (s||'').charAt(0).toUpperCase() + (s||'').slice(1);
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}