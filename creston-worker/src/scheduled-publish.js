/**
 * src/scheduled-publish.js
 * Scheduled publishing — drafts system for all content types.
 *
 * Draft storage:
 *   drafts/{type}/{slug}.md  ← hidden from public, pending publish
 *
 * Frontmatter fields added to every content type:
 *   status:     draft | published   (default: published for backward compat)
 *   publish_at: YYYY-MM-DD          (optional — auto-publishes on this date)
 *
 * How it works:
 *   - When saving, if status=draft → write to drafts/{type}/{slug}.md
 *   - If status=published → write to {type}/{slug}.md (existing behavior)
 *   - Daily scan: any draft with publish_at <= today gets moved to live prefix
 *   - Admin sees draft count in dashboard, can preview/edit/publish manually
 *
 * Called from:
 *   - suggestions.js processSuggestions() (already runs daily)
 *   - /api/drafts/publish  (manual publish button in admin)
 */

import { getSiteConfig } from './db/site.js';

const DRAFT_PREFIX = 'drafts/';

// Content type → live prefix mapping
const TYPE_PREFIXES = {
  news:        'news',
  food:        'food',
  attractions: 'attractions',
  jobs:        'jobs/active',
  events:      'events',
  meetings:    'meetings',
  pages:       'pages',
  directory:   'directory',
};

// ── Daily scheduled publish check ─────────────────────────────
export async function processScheduledPublish(env) {
  const today = new Date().toISOString().split('T')[0];
  console.log(`Scheduled publish check for ${today}...`);

  const published = [];

  for (const [type, livePrefix] of Object.entries(TYPE_PREFIXES)) {
    try {
      const draftPrefix = `${DRAFT_PREFIX}${type}/`;
      const listed      = await env.BUCKET.list({ prefix: draftPrefix });
      const drafts      = listed.objects.filter(o => o.key.endsWith('.md'));

      for (const obj of drafts) {
        const file = await env.BUCKET.get(obj.key);
        if (!file) continue;
        const content  = await file.text();
        const meta     = parseFrontmatter(content);
        const publishAt = meta.publish_at || '';

        // Publish if: publish_at date has arrived
        if (publishAt && publishAt <= today) {
          const slug    = obj.key.replace(draftPrefix, '').replace('.md', '');
          const liveKey = `${livePrefix}/${slug}.md`;

          // Remove publish_at and set status to published in the content
          const updatedContent = updateFrontmatter(content, {
            status:     'published',
            publish_at: null,
          });

          await env.BUCKET.put(liveKey, updatedContent, {
            httpMetadata: { contentType: 'text/markdown; charset=utf-8' }
          });
          await env.BUCKET.delete(obj.key);

          published.push({ type, slug, liveKey });
          console.log(`Auto-published: ${type}/${slug}`);
        }
      }
    } catch (err) {
      console.error(`Scheduled publish error for ${type}:`, err.message);
    }
  }

  // Notify admin if anything was published
  if (published.length > 0 && env.RESEND_API_KEY && env.CONTACT_EMAIL) {
    const cfg = await getSiteConfig(env);
    await notifyPublished(env, published, cfg);
  }

  console.log(`Scheduled publish complete. ${published.length} items published.`);
  return published;
}

// ── List drafts ────────────────────────────────────────────────
export async function listDrafts(env, type) {
  const prefix = type
    ? `${DRAFT_PREFIX}${type}/`
    : DRAFT_PREFIX;

  const listed = await env.BUCKET.list({ prefix });
  const drafts = [];

  for (const obj of listed.objects.filter(o => o.key.endsWith('.md'))) {
    const file = await env.BUCKET.get(obj.key);
    if (!file) continue;
    const content  = await file.text();
    const meta     = parseFrontmatter(content);
    const parts    = obj.key.replace(DRAFT_PREFIX, '').split('/');
    const draftType = parts[0];
    const slug      = parts.slice(1).join('/').replace('.md', '');

    drafts.push({
      key:        obj.key,
      type:       draftType,
      slug,
      meta,
      modified:   obj.uploaded,
    });
  }

  return drafts.sort((a, b) => {
    const da = a.meta.publish_at || '';
    const db = b.meta.publish_at || '';
    return da.localeCompare(db);
  });
}

// ── Manually publish a draft ───────────────────────────────────
export async function publishDraft(env, type, slug) {
  const livePrefix = TYPE_PREFIXES[type];
  if (!livePrefix) throw new Error(`Unknown type: ${type}`);

  const draftKey = `${DRAFT_PREFIX}${type}/${slug}.md`;
  const file     = await env.BUCKET.get(draftKey);
  if (!file) throw new Error('Draft not found');

  const content        = await file.text();
  const updatedContent = updateFrontmatter(content, {
    status:     'published',
    publish_at: null,
  });

  const liveKey = `${livePrefix}/${slug}.md`;
  await env.BUCKET.put(liveKey, updatedContent, {
    httpMetadata: { contentType: 'text/markdown; charset=utf-8' }
  });
  await env.BUCKET.delete(draftKey);

  return { ok: true, liveKey };
}

// ── Save as draft ──────────────────────────────────────────────
export async function saveDraft(env, type, slug, content) {
  const key = `${DRAFT_PREFIX}${type}/${slug}.md`;
  await env.BUCKET.put(key, content, {
    httpMetadata: { contentType: 'text/markdown; charset=utf-8' }
  });
  return { ok: true, key };
}

// ── Frontmatter helpers ────────────────────────────────────────
function parseFrontmatter(content) {
  const meta  = {};
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return meta;
  for (const line of match[1].split('\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    meta[key] = val;
  }
  return meta;
}

function updateFrontmatter(content, updates) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\n?/);
  if (!match) return content;

  const lines    = match[1].split('\n');
  const newLines = [];
  const seen     = new Set();

  for (const line of lines) {
    const i = line.indexOf(':');
    if (i === -1) { newLines.push(line); continue; }
    const key = line.slice(0, i).trim();
    if (key in updates) {
      seen.add(key);
      if (updates[key] !== null) {
        newLines.push(`${key}: ${updates[key]}`);
      }
    } else {
      newLines.push(line);
    }
  }

  // Add any new keys not already in frontmatter
  for (const [key, val] of Object.entries(updates)) {
    if (!seen.has(key) && val !== null) {
      newLines.push(`${key}: ${val}`);
    }
  }

  const newFm = `---\n${newLines.join('\n')}\n---\n`;
  return newFm + content.slice(match[0].length);
}

// ── Email notification ─────────────────────────────────────────
async function notifyPublished(env, published, cfg) {
  const siteName = cfg?.name || 'Your Site';
  const adminUrl = `${cfg?.url || ''}/admin`;

  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    env.CONTACT_FROM || `noreply@creston-iowa.com`,
      to:      [env.CONTACT_EMAIL],
      subject: `[${siteName}] ${published.length} item${published.length > 1 ? 's' : ''} auto-published`,
      html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a3a2a;">📅 Scheduled Publish Complete</h2>
        <p>${published.length} item${published.length > 1 ? 's were' : ' was'} automatically published:</p>
        <ul>${published.map(p => `<li><strong>${p.type}</strong>: ${p.slug}</li>`).join('')}</ul>
        <a href="${adminUrl}" style="display:inline-block;background:#2d5a3d;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:12px;">View in Admin →</a>
      </div>`,
    }),
  }).catch(err => console.error('Notify error:', err.message));
}
