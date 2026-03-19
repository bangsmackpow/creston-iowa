/**
 * functions/[[path]].js — Cloudflare Pages Function
 * Phase 1: Events, AI Suggestions, Alert Banner
 */

import { handleJobs }        from '../creston-worker/src/handlers/jobs.js';
import { handleFood }        from '../creston-worker/src/handlers/food.js';
import { handleNews }        from '../creston-worker/src/handlers/news.js';
import { handleAttractions } from '../creston-worker/src/handlers/attractions.js';
import { handleAdmin }       from '../creston-worker/src/handlers/admin.js';
import { handleApi }         from '../creston-worker/src/handlers/api.js';
import { handleContact }     from '../creston-worker/src/handlers/contact.js';
import { handleSettings }    from '../creston-worker/src/handlers/settings.js';
import { handleMedia, handleMediaUpload, handleMediaList, handleMediaDelete } from '../creston-worker/src/handlers/media.js';
import { handlePage }        from '../creston-worker/src/handlers/pages.js';
import { handleSitemap }     from '../creston-worker/src/handlers/sitemap.js';
import { handleMeetings }    from '../creston-worker/src/handlers/meetings.js';
import { handleEvents }      from '../creston-worker/src/handlers/events.js';
import { handleDirectory }    from '../creston-worker/src/handlers/directory.js';
import { handleHome }         from '../creston-worker/src/handlers/home.js';
import { handleBulletin, handleBulletinAdmin } from '../creston-worker/src/handlers/bulletin.js';
import { handleNewsletterAdmin, handleSubscribe } from '../creston-worker/src/handlers/newsletter.js';
import { handleSuggestionsAdmin } from '../creston-worker/src/handlers/suggestions.js';
import { getAuthUser }       from '../creston-worker/src/db/auth-d1.js';

export async function onRequest(context) {
  const { request, env } = context;
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
    if (path === '/favicon.ico' || path === '/favicon.png') {
      const file = await env.BUCKET.get('config/favicon.png') ||
                   await env.BUCKET.get('config/favicon.ico');
      return file
        ? new Response(file.body, { headers: { 'Content-Type': file.httpMetadata?.contentType || 'image/x-icon', 'Cache-Control': 'public, max-age=86400' } })
        : context.next();
    }

    if (path === '/css/theme.css') {
      const file = await env.BUCKET.get('config/theme.css');
      return file
        ? new Response(file.body, { headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' } })
        : new Response('/* theme not generated yet */', { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
    }

    if (path === '/sitemap.xml')                      return await handleSitemap(request, env);
    if (path.startsWith('/media/'))                   return await handleMedia(request, env, url);
    if (path === '/api/media/upload')                 return await handleMediaUpload(request, env);
    if (path === '/api/media/list')                   return await handleMediaList(request, env, url);
    if (path === '/api/media/delete')                 return await handleMediaDelete(request, env, url);
    if (path === '/subscribe')                        return await handleSubscribe(request, env);
    if (path.startsWith('/api/'))                     return await handleApi(request, env, url);

    const authRoutes = ['/admin/settings', '/admin/newsletter', '/admin/suggestions'];
    if (authRoutes.some(r => path.startsWith(r))) {
      const user = await getAuthUser(request, env);
      if (!user) return new Response(null, { status: 302, headers: { Location: '/admin/login' } });
      if (path.startsWith('/admin/settings'))   return await handleSettings(request, env, url, user);
      if (path.startsWith('/admin/newsletter'))  return await handleNewsletterAdmin(request, env, url, user);
      if (path.startsWith('/admin/suggestions')) return await handleSuggestionsAdmin(request, env, url, user);
      if (path.startsWith('/admin/bulletin'))   return await handleBulletinAdmin(request, env, url, user);
    }

    if (path.startsWith('/admin'))                    return await handleAdmin(request, env, url);
    if (path.startsWith('/contact'))                  return await handleContact(request, env, url);
    if (path.startsWith('/jobs'))                     return await handleJobs(request, env, url);
    if (path.startsWith('/food'))                     return await handleFood(request, env, url);
    if (path.startsWith('/news'))                     return await handleNews(request, env, url);
    if (path.startsWith('/attractions'))              return await handleAttractions(request, env, url);
    if (path.startsWith('/meetings'))                 return await handleMeetings(request, env, url);
    if (path.startsWith('/events'))                   return await handleEvents(request, env, url);
    if (path.startsWith('/directory'))                return await handleDirectory(request, env, url);

    if (path.startsWith('/bulletin'))               return await handleBulletin(request, env, url);

    // Dynamic homepage
    if (path === '/')                                 return await handleHome(request, env, url);

    const slug = path.replace(/^\//, '').replace(/\/$/, '');
    if (slug && !slug.includes('.') && !slug.includes('/')) {
      const page = await handlePage(request, env, slug);
      if (page) return page;
    }

    return context.next();
  } catch (err) {
    console.error('Pages Function error:', err);
    return new Response(`Server error: ${err.message}`, { status: 500 });
  }
}
