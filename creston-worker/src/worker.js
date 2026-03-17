/**
 * creston-iowa.com — Cloudflare Worker / CMS Engine
 * Sprint 2: Media library, Pages CMS, dynamic sitemap
 */

import { handleJobs }        from './handlers/jobs.js';
import { handleFood }        from './handlers/food.js';
import { handleNews }        from './handlers/news.js';
import { handleAttractions } from './handlers/attractions.js';
import { handleAdmin }       from './handlers/admin.js';
import { handleApi }         from './handlers/api.js';
import { handleContact }     from './handlers/contact.js';
import { handleSettings }    from './handlers/settings.js';
import { handleMedia, handleMediaUpload, handleMediaList, handleMediaDelete } from './handlers/media.js';
import { handlePage }        from './handlers/pages.js';
import { handleSitemap }     from './handlers/sitemap.js';
import { getAuthUser }       from './db/auth-d1.js';

export default {
  async fetch(request, env, ctx) {
    const url  = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin':  '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }

    try {
      // ── Sitemap ──────────────────────────────────────────
      if (path === '/sitemap.xml') return await handleSitemap(request, env);

      // ── Media serving ─────────────────────────────────────
      if (path.startsWith('/media/')) return await handleMedia(request, env, url);

      // ── API routes ────────────────────────────────────────
      if (path === '/api/media/upload')               return await handleMediaUpload(request, env);
      if (path === '/api/media/list')                 return await handleMediaList(request, env, url);
      if (path === '/api/media/delete')               return await handleMediaDelete(request, env, url);
      if (path.startsWith('/api/'))                   return await handleApi(request, env, url);

      // ── Settings ──────────────────────────────────────────
      if (path.startsWith('/admin/settings')) {
        const user = await getAuthUser(request, env);
        if (!user) return new Response(null, { status: 302, headers: { Location: '/admin/login' } });
        return await handleSettings(request, env, url, user);
      }

      // ── Admin ─────────────────────────────────────────────
      if (path.startsWith('/admin')) return await handleAdmin(request, env, url);

      // ── Contact ───────────────────────────────────────────
      if (path.startsWith('/contact')) return await handleContact(request, env, url);

      // ── Core content types ────────────────────────────────
      if (path.startsWith('/jobs'))        return await handleJobs(request, env, url);
      if (path.startsWith('/food'))        return await handleFood(request, env, url);
      if (path.startsWith('/news'))        return await handleNews(request, env, url);
      if (path.startsWith('/attractions')) return await handleAttractions(request, env, url);

      // ── Dynamic pages (CMS pages) ─────────────────────────
      // Try to match any slug to a pages/*.md file
      const slug = path.replace(/^\//, '').replace(/\/$/, '');
      if (slug && !slug.includes('.') && !slug.includes('/')) {
        const page = await handlePage(request, env, slug);
        if (page) return page;
      }

      return new Response('Not found', { status: 404 });

    } catch (err) {
      console.error('Worker error:', err);
      return new Response(`Internal error: ${err.message}`, { status: 500 });
    }
  }
};
