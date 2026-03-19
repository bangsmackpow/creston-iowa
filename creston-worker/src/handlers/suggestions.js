/**
 * src/handlers/suggestions.js
 * AI-powered content suggestions from RSS feeds.
 *
 * Flow:
 *   1. Cron Trigger calls processSuggestions() daily
 *   2. Fetch each configured RSS feed
 *   3. Send new items to Workers AI for relevance scoring
 *   4. Store pending suggestions in R2: suggestions/pending/
 *   5. Email admin notification via Resend
 *   6. Admin reviews at /admin/suggestions
 *   7. Approve → writes to appropriate content prefix in R2
 *   8. Reject  → moves to suggestions/rejected/
 *
 * R2 structure:
 *   suggestions/pending/timestamp-slug.json
 *   suggestions/rejected/timestamp-slug.json
 *   config/rss-feeds.json   ← admin-managed list of RSS feeds
 *
 * Required:
 *   Workers AI binding: AI (add to wrangler.toml)
 *   RESEND_API_KEY secret
 */

import { getSiteConfig } from '../db/site.js';
import { adminPage }    from './admin.js';
import { escHtml }       from '../shell.js';
import { parseMarkdown } from '../markdown.js';

const PENDING_PREFIX  = 'suggestions/pending/';
const REJECTED_PREFIX = 'suggestions/rejected/';
const FEEDS_KEY       = 'config/rss-feeds.json';
const SEEN_KEY        = 'config/rss-seen.json';

// ── Cron entry point ───────────────────────────────────────────
export async function processSuggestions(env) {
  console.log('AI suggestions cron running...');

  const cfg   = await getSiteConfig(env);
  const feeds = await loadFeeds(env);

  if (!feeds.length) {
    console.log('No RSS feeds configured. Add them at /admin/suggestions/feeds');
    return;
  }

  // Load seen item IDs to avoid duplicates
  const seenFile = await env.BUCKET.get(SEEN_KEY);
  const seen     = seenFile ? new Set(JSON.parse(await seenFile.text())) : new Set();
  const newSeen  = new Set(seen);
  const pending  = [];

  for (const feed of feeds.filter(f => f.active)) {
    try {
      const items = await fetchRssFeed(feed.url);
      console.log(`Feed ${feed.name}: ${items.length} items`);

      for (const item of items.slice(0, 10)) {
        const id = item.link || item.guid || item.title;
        if (seen.has(id)) continue;
        newSeen.add(id);

        // Run through AI
        const suggestion = await evaluateWithAI(env, item, feed, cfg);
        if (!suggestion) continue;

        if (suggestion.relevant && suggestion.confidence >= 0.65) {
          const ts  = Date.now();
          const key = `${PENDING_PREFIX}${ts}-${slugify(item.title || 'item')}.json`;
          await env.BUCKET.put(key, JSON.stringify({
            ...suggestion,
            feed_name: feed.name,
            feed_url:  feed.url,
            original:  item,
            created_at: new Date().toISOString(),
            key,
          }), { httpMetadata: { contentType: 'application/json' } });
          pending.push(suggestion);
          console.log(`Suggestion created: ${item.title}`);
        }
      }
    } catch (err) {
      console.error(`Feed error (${feed.name}):`, err.message);
    }
  }

  // Save updated seen list
  await env.BUCKET.put(SEEN_KEY, JSON.stringify([...newSeen].slice(-2000)));

  // Email admin if new suggestions
  if (pending.length > 0 && env.RESEND_API_KEY && env.CONTACT_EMAIL) {
    await notifyAdmin(env, pending, cfg);
  }

  console.log(`Done. ${pending.length} new suggestions created.`);
}

// ── AI evaluation ──────────────────────────────────────────────
async function evaluateWithAI(env, item, feed, cfg) {
  if (!env.AI) {
    // Workers AI not bound — create suggestion anyway for review
    return createBasicSuggestion(item, feed, cfg);
  }

  const cityName   = cfg.name || 'the community';
  const prompt     = `You are a content editor for ${cityName}'s official community website.

Analyze this RSS feed item and determine if it is relevant to ${cityName} and its residents.

Feed source: ${feed.name}
Feed type: ${feed.type || 'news'}

Title: ${item.title}
Description: ${item.description || ''}
Link: ${item.link || ''}
Published: ${item.pubDate || ''}

Respond with ONLY valid JSON, no other text:
{
  "relevant": true or false,
  "confidence": 0.0 to 1.0,
  "content_type": "news" or "jobs" or "events" or "attractions",
  "reason": "one sentence explaining relevance or irrelevance",
  "suggested_title": "improved title for the website",
  "suggested_summary": "2-3 sentence summary for the listing",
  "markdown": "full markdown content including frontmatter for this content type"
}

The markdown field should be complete and ready to publish. Use appropriate frontmatter for the content_type.
For news: include title, category, date, author, summary fields.
For events: include title, date, time, location, category, cost, summary fields.
For jobs: include title, company, location, type, category, summary fields.`;

  try {
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt,
      max_tokens: 1000,
    });

    const text   = response.response || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return createBasicSuggestion(item, feed, cfg);

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      ...parsed,
      original_title: item.title,
      original_link:  item.link,
      original_description: item.description || '',
    };
  } catch (err) {
    console.error('AI evaluation error:', err.message);
    return createBasicSuggestion(item, feed, cfg);
  }
}

function createBasicSuggestion(item, feed, cfg) {
  const today = new Date().toISOString().split('T')[0];
  const type  = feed.type || 'news';

  const frontmatter = type === 'news'
    ? `---\ntitle: ${item.title || 'Untitled'}\ncategory: Community\ndate: ${today}\nauthor: ${feed.name}\nsummary: ${(item.description||'').slice(0,120)}\n---\n\n`
    : type === 'events'
    ? `---\ntitle: ${item.title || 'Untitled'}\ndate: ${today}\nlocation: Creston, IA\ncategory: community\ncost: Free\nsummary: ${(item.description||'').slice(0,120)}\n---\n\n`
    : `---\ntitle: ${item.title || 'Untitled'}\ncompany: ${feed.name}\nlocation: Creston, IA\ntype: Full-Time\ncategory: General\nsummary: ${(item.description||'').slice(0,120)}\n---\n\n`;

  return {
    relevant:          true,
    confidence:        0.5,
    content_type:      type,
    reason:            'Auto-suggested from configured RSS feed — please review.',
    suggested_title:   item.title || 'Untitled',
    suggested_summary: (item.description || '').slice(0, 200),
    markdown:          frontmatter + (item.description || '').replace(/<[^>]*>/g, '') + `\n\n[Read more](${item.link || ''})`,
    original_title:    item.title,
    original_link:     item.link,
  };
}

// ── RSS parser ─────────────────────────────────────────────────
async function fetchRssFeed(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'CrestonCMS/1.0 RSS Reader' },
    cf: { cacheTtl: 3600 },
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const xml = await resp.text();

  // Parse RSS/Atom items
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] || match[2];
    items.push({
      title:       extractTag(block, 'title'),
      link:        extractTag(block, 'link') || extractAttr(block, 'link', 'href'),
      description: stripHtml(extractTag(block, 'description') || extractTag(block, 'summary') || extractTag(block, 'content')),
      pubDate:     extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'updated'),
      guid:        extractTag(block, 'guid') || extractTag(block, 'id'),
    });
  }

  return items.slice(0, 20);
}

function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
}

function extractAttr(xml, tag, attr) {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i'));
  return m ? m[1] : '';
}

function stripHtml(str) {
  return (str || '').replace(/<[^>]*>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim().slice(0, 500);
}

// ── Admin notification ─────────────────────────────────────────
async function notifyAdmin(env, suggestions, cfg) {
  const siteName = cfg.name || 'Your Site';
  const adminUrl = `${cfg.url || ''}/admin/suggestions`;

  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    env.CONTACT_FROM || `noreply@creston-iowa.com`,
      to:      [env.CONTACT_EMAIL || 'hello@creston-iowa.com'],
      subject: `[${siteName}] ${suggestions.length} new content suggestion${suggestions.length>1?'s':''} ready for review`,
      html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <div style="background:#1a3a2a;color:white;padding:20px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:1.1rem;">🤖 ${suggestions.length} New AI Content Suggestion${suggestions.length>1?'s':''}</h2>
          <p style="margin:4px 0 0;opacity:.75;font-size:.85rem;">${siteName} — Content Discovery</p>
        </div>
        <div style="background:white;border:1px solid #ddd;padding:24px;border-top:none;">
          <p style="color:#444;margin-top:0;">The AI content scanner found ${suggestions.length} item${suggestions.length>1?'s':''} that may be relevant to your community:</p>
          ${suggestions.slice(0,5).map(s => `
          <div style="border-left:3px solid #c9933a;padding:8px 12px;margin-bottom:12px;background:#faf8f3;">
            <div style="font-weight:600;color:#1a3a2a;font-size:.9rem;">${escHtml(s.suggested_title || s.original_title)}</div>
            <div style="color:#888;font-size:.78rem;margin-top:2px;">${escHtml(s.content_type)} · ${Math.round((s.confidence||0)*100)}% confidence · ${escHtml(s.reason||'')}</div>
          </div>`).join('')}
          ${suggestions.length > 5 ? `<p style="color:#888;font-size:.85rem;">...and ${suggestions.length - 5} more.</p>` : ''}
          <a href="${adminUrl}" style="display:inline-block;background:#2d5a3d;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px;">
            Review Suggestions →
          </a>
        </div>
      </body></html>`,
    }),
  });
}

// ── Admin UI ───────────────────────────────────────────────────
export async function handleSuggestionsAdmin(request, env, url, user) {
  if (user.role !== 'superadmin') return new Response('Forbidden', { status: 403 });

  const path = url.pathname;

  if (path === '/admin/suggestions/feeds')              return handleFeedsUI(request, env, url, user);
  if (path === '/admin/suggestions/approve' && request.method === 'POST') return approveSuggestion(request, env);
  if (path === '/admin/suggestions/reject'  && request.method === 'POST') return rejectSuggestion(request, env);
  if (path === '/admin/suggestions/run'     && request.method === 'POST') return runManually(request, env);

  return renderSuggestionsList(env, user);
}

async function renderSuggestionsList(env, user) {
  const listed  = await env.BUCKET.list({ prefix: PENDING_PREFIX });
  const pending = [];

  for (const obj of listed.objects.filter(o => o.key.endsWith('.json'))) {
    const file = await env.BUCKET.get(obj.key);
    if (!file) continue;
    try {
      const data = JSON.parse(await file.text());
      pending.push({ ...data, _key: obj.key });
    } catch {}
  }

  pending.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  const cards = pending.length === 0
    ? `<div style="text-align:center;padding:48px;color:#888;font-family:sans-serif;">
        <div style="font-size:3rem;margin-bottom:12px;">🤖</div>
        <h3>No pending suggestions</h3>
        <p>Configure RSS feeds and run the scanner to get AI-powered content suggestions.</p>
        <div style="display:flex;gap:12px;justify-content:center;margin-top:16px;">
          <a href="/admin/suggestions/feeds" class="btn-admin-secondary">⚙️ Configure Feeds</a>
          <button onclick="runScanner()" class="btn-admin-primary">▶ Run Scanner Now</button>
        </div>
       </div>`
    : pending.map(s => `
      <div class="suggestion-card" data-key="${escHtml(s._key)}">
        <div class="suggestion-header">
          <div>
            <div class="suggestion-type-badge type-${escHtml(s.content_type||'news')}">${escHtml(s.content_type||'news')}</div>
            <h3 class="suggestion-title">${escHtml(s.suggested_title || s.original_title)}</h3>
            <div class="suggestion-meta">
              <span>📡 ${escHtml(s.feed_name||'')}</span>
              <span>🤖 ${Math.round((s.confidence||0)*100)}% confident</span>
              <span>📅 ${s.created_at ? new Date(s.created_at).toLocaleDateString() : ''}</span>
            </div>
            <p class="suggestion-reason">${escHtml(s.reason||'')}</p>
          </div>
          <div class="suggestion-actions">
            <button onclick="approveSuggestion('${escHtml(s._key)}')" class="btn-admin-primary">✅ Approve</button>
            <button onclick="editSuggestion('${escHtml(s._key)}')" class="btn-admin-secondary">✏️ Edit</button>
            <button onclick="rejectSuggestion('${escHtml(s._key)}')" class="tbl-btn tbl-btn-danger">✕ Reject</button>
          </div>
        </div>
        <div class="suggestion-preview">
          <div class="preview-tabs">
            <button class="preview-tab active" onclick="showTab(this,'summary-${escHtml(s._key)}')">Summary</button>
            <button class="preview-tab" onclick="showTab(this,'markdown-${escHtml(s._key)}')">Markdown</button>
            <a href="${escHtml(s.original_link||'#')}" target="_blank" class="preview-tab" style="color:var(--green-mid);">🔗 Source</a>
          </div>
          <div id="summary-${escHtml(s._key)}" class="preview-pane">
            <p style="font-family:var(--font-body);font-size:.9rem;line-height:1.7;color:#444;">${escHtml(s.suggested_summary||s.original_description||'')}</p>
          </div>
          <div id="markdown-${escHtml(s._key)}" class="preview-pane" style="display:none;">
            <textarea class="suggestion-md" data-key="${escHtml(s._key)}" style="width:100%;height:200px;font-family:monospace;font-size:.8rem;border:1px solid #ddd;border-radius:6px;padding:10px;resize:vertical;">${escHtml(s.markdown||'')}</textarea>
          </div>
        </div>
      </div>`).join('');

  const body = `
    <div class="settings-header">
      <div>
        <h2>🤖 AI Content Suggestions</h2>
        <p style="color:#888;font-family:sans-serif;font-size:.88rem;margin:4px 0 0;">
          ${pending.length} pending review · Powered by Workers AI
        </p>
      </div>
      <div style="display:flex;gap:10px;">
        <a href="/admin/suggestions/feeds" class="btn-admin-secondary">⚙️ Manage Feeds</a>
        <button onclick="runScanner()" class="btn-admin-primary">▶ Run Now</button>
      </div>
    </div>

    <div id="scanner-status" style="font-family:sans-serif;font-size:.88rem;margin-bottom:16px;min-height:1.4em;"></div>

    <div class="suggestions-list">${cards}</div>

    <style>
      .suggestions-list { display:flex; flex-direction:column; gap:16px; }
      .suggestion-card { background:white; border:1.5px solid #e0e0e0; border-radius:12px; overflow:hidden; }
      .suggestion-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; padding:20px 24px; }
      .suggestion-type-badge { display:inline-block; padding:2px 8px; border-radius:100px; font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; }
      .type-news { background:#e8f2eb; color:#2d5a3d; }
      .type-events { background:#e8f0fa; color:#2d4a7a; }
      .type-jobs { background:#fff0e0; color:#7a4a00; }
      .type-attractions { background:#f0e8fa; color:#4a2a7a; }
      .suggestion-title { font-family:var(--font-display); font-size:1rem; font-weight:700; color:var(--green-deep); margin:4px 0 6px; }
      .suggestion-meta { display:flex; gap:12px; font-family:var(--font-ui); font-size:.78rem; color:#888; flex-wrap:wrap; }
      .suggestion-reason { font-family:var(--font-ui); font-size:.8rem; color:#888; font-style:italic; margin:6px 0 0; }
      .suggestion-actions { display:flex; flex-direction:column; gap:6px; flex-shrink:0; }
      .suggestion-preview { border-top:1px solid #f0f0f0; }
      .preview-tabs { display:flex; gap:4px; padding:10px 24px 0; border-bottom:1px solid #f0f0f0; }
      .preview-tab { padding:6px 14px; font-family:var(--font-ui); font-size:.78rem; font-weight:600; color:#888; background:none; border:none; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; }
      .preview-tab.active { color:var(--green-deep); border-bottom-color:var(--green-deep); }
      .preview-pane { padding:16px 24px; }
    </style>

    <script>
      const TOKEN = sessionStorage.getItem('admin_token') || '';
      const H = { 'Content-Type':'application/json', 'Authorization':'Bearer '+TOKEN };

      function showTab(btn, paneId) {
        const card = btn.closest('.suggestion-card');
        card.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
        card.querySelectorAll('.preview-pane').forEach(p => p.style.display='none');
        btn.classList.add('active');
        document.getElementById(paneId).style.display='block';
      }

      async function approveSuggestion(key) {
        const card = document.querySelector('[data-key="'+key+'"]');
        const mdEl = card ? card.querySelector('.suggestion-md') : null;
        const md   = mdEl ? mdEl.value : '';
        if (!confirm('Approve and publish this content?')) return;

        const r = await fetch('/admin/suggestions/approve', {
          method:'POST', headers:H, body:JSON.stringify({ key, markdown: md })
        });
        const d = await r.json();
        if (d.ok) { card.style.opacity='.4'; card.style.pointerEvents='none'; setTimeout(()=>location.reload(),1000); }
        else alert('Error: '+(d.error||r.status));
      }

      async function rejectSuggestion(key) {
        if (!confirm('Reject and dismiss this suggestion?')) return;
        const r = await fetch('/admin/suggestions/reject', {
          method:'POST', headers:H, body:JSON.stringify({ key })
        });
        const d = await r.json();
        const card = document.querySelector('[data-key="'+key+'"]');
        if (d.ok && card) { card.style.opacity='.4'; card.style.pointerEvents='none'; setTimeout(()=>location.reload(),800); }
      }

      function editSuggestion(key) {
        const card = document.querySelector('[data-key="'+key+'"]');
        if (!card) return;
        const mdBtn = card.querySelector('.preview-tab:nth-child(2)');
        if (mdBtn) showTab(mdBtn, 'markdown-'+key);
      }

      async function runScanner() {
        const st = document.getElementById('scanner-status');
        st.textContent = '⏳ Running AI scanner... this may take 30-60 seconds.';
        st.style.color = '#888';
        try {
          const r = await fetch('/admin/suggestions/run', { method:'POST', headers:H });
          const d = await r.json();
          if (d.ok) {
            st.textContent = '✅ Scanner complete! '+( d.count||0)+' new suggestion(s) found.';
            st.style.color = '#2d5a3d';
            setTimeout(()=>location.reload(), 2000);
          } else {
            st.textContent = '❌ Error: '+(d.error||'unknown');
            st.style.color = '#b84040';
          }
        } catch(e) { st.textContent = '❌ '+e.message; st.style.color = '#b84040'; }
      }
    </script>`;

  return adminPage('🤖 AI Suggestions', body, user);
}

// ── Feeds management UI ────────────────────────────────────────
async function handleFeedsUI(request, env, url, user) {
  if (request.method === 'POST') {
    const body  = await request.json().catch(() => ({}));
    await env.BUCKET.put(FEEDS_KEY, JSON.stringify(body.feeds || []), {
      httpMetadata: { contentType: 'application/json' }
    });
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const feeds = await loadFeeds(env);

  const DEFAULT_FEEDS = [
    { name: 'Creston News Advertiser', url: 'https://www.crestonnews.com/feed/', type: 'news',   active: true  },
    { name: 'Iowa Government News',    url: 'https://governor.iowa.gov/feed',     type: 'news',   active: false },
    { name: 'Union County',            url: '',                                   type: 'news',   active: false },
    { name: 'Eventbrite Creston',      url: '',                                   type: 'events', active: false },
    { name: 'Indeed Jobs - Creston',   url: 'https://www.indeed.com/rss?q=&l=Creston%2C+IA', type: 'jobs', active: false },
  ];

  const allFeeds = feeds.length > 0 ? feeds : DEFAULT_FEEDS;

  const body = `
    <div class="editor-header">
      <a href="/admin/suggestions" class="back-link">← Back to Suggestions</a>
      <h2>⚙️ RSS Feed Configuration</h2>
    </div>
    <p style="font-family:sans-serif;font-size:.88rem;color:#888;margin-bottom:20px;">
      Configure which RSS feeds the AI scanner monitors. New items are checked daily and relevant ones become suggestions.
    </p>

    <div id="feeds-list">
      ${allFeeds.map((f, i) => renderFeedRow(f, i)).join('')}
    </div>

    <div style="display:flex;gap:12px;margin-top:16px;">
      <button onclick="addFeed()" class="btn-admin-secondary">+ Add Feed</button>
      <button onclick="saveFeeds()" class="btn-admin-primary">💾 Save Feeds</button>
      <div id="save-status" style="font-family:sans-serif;font-size:.85rem;align-self:center;"></div>
    </div>

    <div style="margin-top:28px;background:#e8f2eb;border:1.5px solid #4a8c5c;border-radius:10px;padding:16px 20px;font-family:sans-serif;font-size:.83rem;">
      <strong style="display:block;margin-bottom:8px;color:#1a3a2a;">💡 Tips for finding RSS feeds</strong>
      <ul style="margin:0;padding-left:18px;color:#444;line-height:2;">
        <li>Most news sites have <code>/feed/</code> or <code>/rss.xml</code> at the root</li>
        <li>Google: <code>site:crestonnews.com rss OR feed</code></li>
        <li>Try <a href="https://fetchrss.com" target="_blank">fetchrss.com</a> to generate feeds from sites without one</li>
        <li>Indeed jobs: <code>https://rss.indeed.com/rss?q=&l=Creston%2C+IA</code></li>
        <li>City gov: check for <code>/news/rss</code> or contact city clerk</li>
      </ul>
    </div>

    <script>
      const TOKEN = sessionStorage.getItem('admin_token') || '';
      let feedCount = ${allFeeds.length};

      function renderFeedRow(feed, i) {
        return \`<div class="feed-row" id="feed-\${i}">
          <input type="text" class="form-input feed-name" value="\${feed.name||''}" placeholder="Feed name" style="flex:1;">
          <input type="url" class="form-input feed-url"  value="\${feed.url||''}"  placeholder="https://..." style="flex:2;">
          <select class="form-select feed-type" style="width:110px;">
            <option value="news"       \${feed.type==='news'       ?'selected':''}>News</option>
            <option value="events"     \${feed.type==='events'     ?'selected':''}>Events</option>
            <option value="jobs"       \${feed.type==='jobs'       ?'selected':''}>Jobs</option>
            <option value="attractions"\${feed.type==='attractions'?'selected':''}>Attractions</option>
          </select>
          <label style="display:flex;align-items:center;gap:4px;font-family:sans-serif;font-size:.82rem;white-space:nowrap;">
            <input type="checkbox" class="feed-active" \${feed.active?'checked':''}> Active
          </label>
          <button onclick="document.getElementById('feed-\${i}').remove()" class="tbl-btn tbl-btn-danger">✕</button>
        </div>\`;
      }

      function addFeed() {
        const div = document.createElement('div');
        div.innerHTML = renderFeedRow({name:'',url:'',type:'news',active:true}, feedCount++);
        document.getElementById('feeds-list').appendChild(div.firstElementChild);
      }

      function getFeeds() {
        return Array.from(document.querySelectorAll('.feed-row')).map(row => ({
          name:   row.querySelector('.feed-name').value.trim(),
          url:    row.querySelector('.feed-url').value.trim(),
          type:   row.querySelector('.feed-type').value,
          active: row.querySelector('.feed-active').checked,
        })).filter(f => f.name || f.url);
      }

      async function saveFeeds() {
        const st = document.getElementById('save-status');
        st.textContent = '⏳ Saving...';
        const r = await fetch('/admin/suggestions/feeds', {
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
          body: JSON.stringify({ feeds: getFeeds() }),
        });
        const d = await r.json();
        st.textContent = d.ok ? '✅ Saved!' : '❌ '+(d.error||'Error');
        st.style.color = d.ok ? '#2d5a3d' : '#b84040';
      }
    </script>
    <style>
      .feed-row { display:flex; gap:10px; align-items:center; margin-bottom:10px; }
      #feeds-list { display:flex; flex-direction:column; }
    </style>`;

  return adminPage('⚙️ RSS Feeds', body, user);
}

function renderFeedRow(f, i) {
  return `<div class="feed-row" id="feed-${i}">
    <input type="text" class="form-input feed-name" value="${escHtml(f.name||'')}" placeholder="Feed name" style="flex:1;">
    <input type="url" class="form-input feed-url" value="${escHtml(f.url||'')}" placeholder="https://..." style="flex:2;">
    <select class="form-select feed-type" style="width:110px;">
      <option value="news"        ${f.type==='news'        ?'selected':''}>News</option>
      <option value="events"      ${f.type==='events'      ?'selected':''}>Events</option>
      <option value="jobs"        ${f.type==='jobs'        ?'selected':''}>Jobs</option>
      <option value="attractions" ${f.type==='attractions' ?'selected':''}>Attractions</option>
    </select>
    <label style="display:flex;align-items:center;gap:4px;font-family:sans-serif;font-size:.82rem;white-space:nowrap;">
      <input type="checkbox" class="feed-active" ${f.active?'checked':''}> Active
    </label>
    <button onclick="document.getElementById('feed-${i}').remove()" class="tbl-btn tbl-btn-danger">✕</button>
  </div>`;
}

// ── Approve / Reject ───────────────────────────────────────────
async function approveSuggestion(request, env) {
  const { key, markdown } = await request.json();
  if (!key) return jsonRes({ error: 'key required' }, 400);

  const file = await env.BUCKET.get(key);
  if (!file) return jsonRes({ error: 'Suggestion not found' }, 404);

  const suggestion = JSON.parse(await file.text());
  const type       = suggestion.content_type || 'news';
  const prefix     = { news:'news', events:'events', jobs:'jobs/active', attractions:'attractions' }[type] || 'news';
  const slug       = slugify(suggestion.suggested_title || suggestion.original_title || 'item');
  const today      = new Date().toISOString().split('T')[0];
  const contentKey = `${prefix}/${today}-${slug}.md`;

  await env.BUCKET.put(contentKey, markdown || suggestion.markdown || '', {
    httpMetadata: { contentType: 'text/markdown; charset=utf-8' }
  });
  await env.BUCKET.delete(key);

  return jsonRes({ ok: true, published_to: contentKey });
}

async function rejectSuggestion(request, env) {
  const { key } = await request.json();
  if (!key) return jsonRes({ error: 'key required' }, 400);

  const file = await env.BUCKET.get(key);
  if (file) {
    const newKey = key.replace(PENDING_PREFIX, REJECTED_PREFIX);
    const content = await file.text();
    await env.BUCKET.put(newKey, content, { httpMetadata: { contentType: 'application/json' } });
    await env.BUCKET.delete(key);
  }

  return jsonRes({ ok: true });
}

async function runManually(request, env) {
  try {
    await processSuggestions(env);
    const listed = await env.BUCKET.list({ prefix: PENDING_PREFIX });
    return jsonRes({ ok: true, count: listed.objects.length });
  } catch (err) {
    return jsonRes({ error: err.message }, 500);
  }
}

// ── Load feeds ─────────────────────────────────────────────────
async function loadFeeds(env) {
  try {
    const file = await env.BUCKET.get(FEEDS_KEY);
    if (!file) return [];
    return JSON.parse(await file.text());
  } catch { return []; }
}

// ── Utilities ──────────────────────────────────────────────────
function slugify(str) {
  return (str || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' }
  });
}