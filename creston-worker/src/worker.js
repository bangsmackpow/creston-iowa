/**
 * creston-iowa.com — Cloudflare Worker / CMS Engine
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
import { handleMeetings }    from './handlers/meetings.js';
import { handleNewsletterAdmin, handleSubscribe } from './handlers/newsletter.js';
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
      // ── Favicon ───────────────────────────────────────────
      if (path === '/favicon.ico' || path === '/favicon.png') {
        const file = await env.BUCKET.get('config/favicon.png') ||
                     await env.BUCKET.get('config/favicon.ico');
        if (file) {
          const ext = file.httpMetadata?.contentType?.includes('png') ? 'image/png' : 'image/x-icon';
          return new Response(file.body, {
            headers: { 'Content-Type': ext, 'Cache-Control': 'public, max-age=86400' }
          });
        }
        return new Response(null, { status: 404 });
      }

      // ── Theme CSS ─────────────────────────────────────────
      if (path === '/css/theme.css') {
        const file = await env.BUCKET.get('config/theme.css');
        if (file) return new Response(file.body, {
          headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' }
        });
        return new Response('/* theme not generated yet */', { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
      }

      // ── Sitemap ───────────────────────────────────────────
      if (path === '/sitemap.xml') return await handleSitemap(request, env);

      // ── Media ─────────────────────────────────────────────
      if (path.startsWith('/media/'))      return await handleMedia(request, env, url);
      if (path === '/api/media/upload')    return await handleMediaUpload(request, env);
      if (path === '/api/media/list')      return await handleMediaList(request, env, url);
      if (path === '/api/media/delete')    return await handleMediaDelete(request, env, url);

      // ── Subscribe ─────────────────────────────────────────
      if (path === '/subscribe')           return await handleSubscribe(request, env);

      // ── API ───────────────────────────────────────────────
      if (path.startsWith('/api/'))        return await handleApi(request, env, url);

      // ── Settings ──────────────────────────────────────────
      if (path.startsWith('/admin/settings')) {
        const user = await getAuthUser(request, env);
        if (!user) return new Response(null, { status: 302, headers: { Location: '/admin/login' } });
        return await handleSettings(request, env, url, user);
      }

      // ── Newsletter ────────────────────────────────────────
      if (path.startsWith('/admin/newsletter')) {
        const user = await getAuthUser(request, env);
        if (!user) return new Response(null, { status: 302, headers: { Location: '/admin/login' } });
        return await handleNewsletterAdmin(request, env, url, user);
      }

      // ── Admin ─────────────────────────────────────────────
      if (path.startsWith('/admin'))       return await handleAdmin(request, env, url);

      // ── Content routes ────────────────────────────────────
      if (path.startsWith('/contact'))     return await handleContact(request, env, url);
      if (path.startsWith('/jobs'))        return await handleJobs(request, env, url);
      if (path.startsWith('/food'))        return await handleFood(request, env, url);
      if (path.startsWith('/news'))        return await handleNews(request, env, url);
      if (path.startsWith('/attractions')) return await handleAttractions(request, env, url);
      if (path.startsWith('/meetings'))    return await handleMeetings(request, env, url);

      // ── Dynamic CMS pages ─────────────────────────────────
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
