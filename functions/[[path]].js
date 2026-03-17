/**
 * functions/[[path]].js — Cloudflare Pages Function
 * Sprint 2: Media, Pages CMS, dynamic sitemap
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
    if (path === '/sitemap.xml')                      return await handleSitemap(request, env);
    if (path.startsWith('/media/'))                   return await handleMedia(request, env, url);
    if (path === '/api/media/upload')                 return await handleMediaUpload(request, env);
    if (path === '/api/media/list')                   return await handleMediaList(request, env, url);
    if (path === '/api/media/delete')                 return await handleMediaDelete(request, env, url);
    if (path.startsWith('/api/'))                     return await handleApi(request, env, url);

    if (path.startsWith('/admin/settings')) {
      const user = await getAuthUser(request, env);
      if (!user) return new Response(null, { status: 302, headers: { Location: '/admin/login' } });
      return await handleSettings(request, env, url, user);
    }

    if (path.startsWith('/admin'))                    return await handleAdmin(request, env, url);
    if (path.startsWith('/contact'))                  return await handleContact(request, env, url);
    if (path.startsWith('/jobs'))                     return await handleJobs(request, env, url);
    if (path.startsWith('/food'))                     return await handleFood(request, env, url);
    if (path.startsWith('/news'))                     return await handleNews(request, env, url);
    if (path.startsWith('/attractions'))              return await handleAttractions(request, env, url);

    // Dynamic CMS pages
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
