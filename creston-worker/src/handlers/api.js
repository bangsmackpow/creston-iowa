/**
 * handlers/api.js
 * JSON API used by the Admin UI.
 * All routes require Authorization: Bearer <ADMIN_TOKEN>
 *
 * GET    /api/content/:type           → list all files
 * GET    /api/content/:type/:slug     → get one file
 * POST   /api/content/:type           → create file
 * PUT    /api/content/:type/:slug     → update file
 * DELETE /api/content/:type/:slug     → delete file
 * POST   /api/jobs/:slug/expire       → move job to expired/
 * POST   /api/jobs/:slug/restore      → move job back to active/
 */

import { isAuthenticated } from '../auth.js';
import { listContent, getContent, putContent, deleteContent, moveContent, findBySlug } from '../r2.js';
import { parseMarkdown } from '../markdown.js';

const TYPE_MAP = {
  jobs:        'jobs/active',
  'jobs-all':  'jobs',
  news:        'news',
  food:        'food',
  attractions: 'attractions',
  pages:       'pages',
};

export async function handleApi(request, env, url) {
  if (!isAuthenticated(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const parts  = url.pathname.replace(/^\/api\//, '').split('/');
  const action = parts[0];

  // Special job actions
  if (action === 'jobs' && parts[2] === 'expire') {
    return handleJobExpire(request, env, parts[1]);
  }
  if (action === 'jobs' && parts[2] === 'restore') {
    return handleJobRestore(request, env, parts[1]);
  }

  if (action !== 'content') {
    return jsonResponse({ error: 'Unknown API action' }, 404);
  }

  const type   = parts[1];
  const slug   = parts[2];
  const prefix = TYPE_MAP[type];

  if (!prefix) {
    return jsonResponse({ error: `Unknown type: ${type}` }, 400);
  }

  // LIST
  if (request.method === 'GET' && !slug) {
    const items = await listContent(env, prefix);
    return jsonResponse(items.map(i => ({ slug: i.slug, key: i.key, meta: i.meta, modified: i.modified })));
  }

  // GET ONE
  if (request.method === 'GET' && slug) {
    const item = await findBySlug(env, prefix, slug);
    if (!item) return jsonResponse({ error: 'Not found' }, 404);
    return jsonResponse(item);
  }

  // CREATE — supports company_slug for scoped job paths
  if (request.method === 'POST' && !slug) {
    const body = await request.json();
    if (!body.slug)    return jsonResponse({ error: 'slug is required' }, 400);
    if (!body.content) return jsonResponse({ error: 'content is required' }, 400);

    let key;
    if (type === 'jobs' && body.company_slug) {
      key = `jobs/active/${sanitizeSlug(body.company_slug)}/${sanitizeSlug(body.slug)}.md`;
    } else {
      key = `${prefix}/${sanitizeSlug(body.slug)}.md`;
    }
    await putContent(env, key, body.content);
    return jsonResponse({ ok: true, key });
  }

  // UPDATE — use exact key if provided
  if (request.method === 'PUT' && slug) {
    const body = await request.json();
    if (!body.content) return jsonResponse({ error: 'content is required' }, 400);
    const key = body.key || `${prefix}/${sanitizeSlug(slug)}.md`;
    await putContent(env, key, body.content);
    return jsonResponse({ ok: true, key });
  }

  // DELETE — use exact key if provided
  if (request.method === 'DELETE' && slug) {
    let body = {};
    try { body = await request.json(); } catch {}
    const key = body.key || `${prefix}/${sanitizeSlug(slug)}.md`;
    await deleteContent(env, key);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
}

// Special job actions — support explicit key in body
async function handleJobExpire(request, env, slug) {
  if (!slug) return jsonResponse({ error: 'slug required' }, 400);
  try {
    let body = {};
    try { body = await request.json(); } catch {}

    // Determine source key — use explicit key if provided, else guess
    const fromKey = body.key || `jobs/active/${slug}.md`;
    // Determine destination — mirror the folder structure
    const toKey   = fromKey.replace('jobs/active/', 'jobs/expired/');

    await moveContent(env, fromKey, toKey);
    return jsonResponse({ ok: true, moved: toKey });
  } catch (err) {
    return jsonResponse({ error: err.message }, 404);
  }
}

async function handleJobRestore(request, env, slug) {
  if (!slug) return jsonResponse({ error: 'slug required' }, 400);
  try {
    let body = {};
    try { body = await request.json(); } catch {}

    const fromKey = body.key || `jobs/expired/${slug}.md`;
    const toKey   = fromKey.replace('jobs/expired/', 'jobs/active/');

    await moveContent(env, fromKey, toKey);
    return jsonResponse({ ok: true, moved: toKey });
  } catch (err) {
    return jsonResponse({ error: err.message }, 404);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}

function sanitizeSlug(slug) {
  return slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
