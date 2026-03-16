/**
 * creston-iowa.com — Cloudflare Worker
 * Routes requests to the correct handler.
 * R2 bucket: crestoniowa/
 *   jobs/active/*.md
 *   jobs/expired/*.md
 *   food/*.md
 *   news/*.md
 *   attractions/*.md
 */

import { handleJobs }        from './handlers/jobs.js';
import { handleFood }        from './handlers/food.js';
import { handleNews }        from './handlers/news.js';
import { handleAttractions } from './handlers/attractions.js';
import { handleAdmin }       from './handlers/admin.js';
import { handleApi }         from './handlers/api.js';

export default {
  async fetch(request, env, ctx) {
    const url  = new URL(request.url);
    const path = url.pathname;

    // ── CORS preflight ──────────────────────────────────
    if (request.method === 'OPTIONS') {
      return corsResponse();
    }

    try {
      // ── API routes (used by admin UI) ─────────────────
      if (path.startsWith('/api/')) {
        return await handleApi(request, env, url);
      }

      // ── Admin UI ──────────────────────────────────────
      if (path.startsWith('/admin')) {
        return await handleAdmin(request, env, url);
      }

      // ── Public content routes ─────────────────────────
      if (path.startsWith('/jobs'))        return await handleJobs(request, env, url);
      if (path.startsWith('/food'))        return await handleFood(request, env, url);
      if (path.startsWith('/news'))        return await handleNews(request, env, url);
      if (path.startsWith('/attractions')) return await handleAttractions(request, env, url);

      // ── Fallthrough to Cloudflare Pages ──────────────
      return new Response('Not found', { status: 404 });

    } catch (err) {
      console.error('Worker error:', err);
      return new Response(`Internal error: ${err.message}`, { status: 500 });
    }
  }
};

function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}
