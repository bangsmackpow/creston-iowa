/**
 * src/revisions.js
 * Content revision history — saved to R2 before every edit.
 *
 * R2 structure:
 *   revisions/{type}/{slug}/{ISO-timestamp}.md
 *   e.g. revisions/news/balloon-days/2025-03-15T14:22:00Z.md
 *
 * Max 10 revisions per item — oldest auto-pruned on save.
 *
 * Usage:
 *   // Before saving new content:
 *   await saveRevision(env, 'news', 'balloon-days', existingContent);
 *
 *   // List revisions for an item:
 *   const revs = await listRevisions(env, 'news', 'balloon-days');
 *
 *   // Restore a revision:
 *   const content = await getRevision(env, 'news', 'balloon-days', timestamp);
 */

const MAX_REVISIONS = 10;

// ── Save a revision before overwriting ────────────────────────
export async function saveRevision(env, type, slug, content) {
  if (!content || !content.trim()) return;

  try {
    const ts  = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `revisions/${type}/${slug}/${ts}.md`;

    await env.BUCKET.put(key, content, {
      httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
      customMetadata: { savedAt: new Date().toISOString() }
    });

    // Prune old revisions — keep only MAX_REVISIONS
    await pruneRevisions(env, type, slug);

  } catch (err) {
    // Never let revision saving break the main save operation
    console.error('saveRevision error:', err.message);
  }
}

// ── List revisions for an item ─────────────────────────────────
export async function listRevisions(env, type, slug) {
  try {
    const prefix = `revisions/${type}/${slug}/`;
    const listed = await env.BUCKET.list({ prefix });

    const revisions = listed.objects
      .filter(o => o.key.endsWith('.md'))
      .map(o => ({
        key:       o.key,
        timestamp: o.key.replace(prefix, '').replace('.md', '').replace(/-/g, (m, i) => i < 19 ? '-' : ':'),
        size:      o.size,
        modified:  o.uploaded,
      }))
      .sort((a, b) => b.key.localeCompare(a.key)); // newest first

    return revisions;
  } catch (err) {
    console.error('listRevisions error:', err.message);
    return [];
  }
}

// ── Get a specific revision's content ─────────────────────────
export async function getRevision(env, revisionKey) {
  try {
    const file = await env.BUCKET.get(revisionKey);
    if (!file) return null;
    return await file.text();
  } catch (err) {
    console.error('getRevision error:', err.message);
    return null;
  }
}

// ── Prune oldest revisions if over limit ──────────────────────
async function pruneRevisions(env, type, slug) {
  try {
    const prefix  = `revisions/${type}/${slug}/`;
    const listed  = await env.BUCKET.list({ prefix });
    const keys    = listed.objects
      .filter(o => o.key.endsWith('.md'))
      .map(o => o.key)
      .sort(); // oldest first (ISO timestamps sort lexicographically)

    if (keys.length > MAX_REVISIONS) {
      const toDelete = keys.slice(0, keys.length - MAX_REVISIONS);
      await Promise.all(toDelete.map(k => env.BUCKET.delete(k)));
    }
  } catch (err) {
    console.error('pruneRevisions error:', err.message);
  }
}

// ── Render revision history UI (for editor sidebar) ───────────
export function renderRevisionSidebar(revisions, type, slug) {
  if (!revisions.length) {
    return `<div class="preview-panel" style="margin-top:16px;">
      <div class="preview-header">📋 Revision History</div>
      <div class="preview-body" style="padding:12px;font-family:sans-serif;font-size:.82rem;color:#888;">
        No revisions yet. Revisions are saved automatically each time you save content.
      </div>
    </div>`;
  }

  const rows = revisions.slice(0, 10).map((rev, i) => {
    const d    = new Date(rev.modified || rev.timestamp);
    const date = isNaN(d) ? rev.key.split('/').pop().replace('.md','') : d.toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    return `<div class="rev-row" onclick="previewRevision('${rev.key}', '${date}')">
      <div class="rev-date">${date}</div>
      <div class="rev-size" style="font-size:.72rem;color:#aaa;">${formatBytes(rev.size)}</div>
      ${i === 0 ? '<span class="rev-badge">latest</span>' : ''}
    </div>`;
  }).join('');

  return `<div class="preview-panel" style="margin-top:16px;">
    <div class="preview-header" style="display:flex;justify-content:space-between;align-items:center;">
      <span>📋 Revision History</span>
      <span style="font-size:.72rem;color:#aaa;">${revisions.length} saved</span>
    </div>
    <div class="rev-list">${rows}</div>
    <div id="rev-preview-panel" style="display:none;border-top:1px solid #eee;padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong id="rev-preview-date" style="font-family:sans-serif;font-size:.82rem;"></strong>
        <button onclick="restoreRevision()" class="tbl-btn tbl-btn-warn" style="font-size:.72rem;">↩ Restore This</button>
      </div>
      <div id="rev-preview-content" class="preview-body markdown-body" style="max-height:200px;overflow-y:auto;font-size:.8rem;"></div>
    </div>
  </div>
  <style>
    .rev-list { max-height:200px; overflow-y:auto; }
    .rev-row { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid #f5f5f5; cursor:pointer; font-family:sans-serif; font-size:.8rem; transition:background .12s; }
    .rev-row:hover { background:#f9f9f9; }
    .rev-date { color:#444; }
    .rev-badge { background:#c9933a; color:white; padding:1px 6px; border-radius:100px; font-size:.65rem; font-weight:700; }
  </style>`;
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + 'B';
  return (bytes / 1024).toFixed(1) + 'KB';
}
