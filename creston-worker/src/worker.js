/**
 * creston-iowa.com — Cloudflare Worker / CMS Engine
 * Phase 1: AI Suggestions, Event Calendar, Emergency Alerts
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
import { handleEvents }      from './handlers/events.js';
import { handleDirectory }    from './handlers/directory.js';
import { handleServiceRequests, handleSRAdmin } from './handlers/service-requests.js';
import { handleFOIA, handleFOIAAdmin } from './handlers/foia.js';
import { handleDocuments } from './handlers/documents.js';
import { handleNotices } from './handlers/notices.js';
import { handleAnalyticsBeacon, handleAnalyticsAdmin } from './handlers/analytics.js';
import { handleJobsPost, handleStripeCheckout, handleStripeWebhook } from './handlers/stripe.js';
import { handleAIWrite }    from './handlers/ai-write.js';
import { handleHome }         from './handlers/home.js';
import { handleBulletin, handleBulletinAdmin } from './handlers/bulletin.js';
import { handleNewsletterAdmin, handleSubscribe } from './handlers/newsletter.js';
import { handleSuggestionsAdmin, processSuggestions } from './handlers/suggestions.js';
import { getAuthUser }       from './db/auth-d1.js';

export default {
  // ── HTTP requests ────────────────────────────────────────────
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
      // Favicon
      if (path === '/favicon.ico' || path === '/favicon.png') {
        const file = await env.BUCKET.get('config/favicon.png') ||
                     await env.BUCKET.get('config/favicon.ico');
        if (file) return new Response(file.body, {
          headers: { 'Content-Type': file.httpMetadata?.contentType || 'image/x-icon', 'Cache-Control': 'public, max-age=86400' }
        });
        return new Response(null, { status: 404 });
      }

      // Theme CSS
      if (path === '/css/theme.css') {
        const file = await env.BUCKET.get('config/theme.css');
        return file
          ? new Response(file.body, { headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' } })
          : new Response('/* theme not generated yet */', { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
      }

      // Sitemap
      if (path === '/sitemap.xml') return await handleSitemap(request, env);

      // Media
      if (path.startsWith('/media/'))      return await handleMedia(request, env, url);
      if (path === '/api/media/upload')    return await handleMediaUpload(request, env);
      if (path === '/api/media/list')      return await handleMediaList(request, env, url);
      if (path === '/api/media/delete')    return await handleMediaDelete(request, env, url);

      // Subscribe
      if (path === '/subscribe')           return await handleSubscribe(request, env);

      // API

      if (path === '/api/analytics/beacon')       return await handleAnalyticsBeacon(request, env);
      if (path.startsWith('/311'))                 return await handleServiceRequests(request, env, url);
      if (path.startsWith('/foia'))                return await handleFOIA(request, env, url);
      if (path.startsWith('/documents'))           return await handleDocuments(request, env, url);
      if (path.startsWith('/notices'))             return await handleNotices(request, env, url);
      if (path === '/api/stripe/webhook')  return await handleStripeWebhook(request, env);
      if (path === '/jobs/post')           return await handleJobsPost(request, env, url);
      if (path === '/api/stripe/checkout') return await handleStripeCheckout(request, env);

      if (path === '/api/ai/write' && request.method === 'POST') return await handleAIWrite(request, env);

      if (path.startsWith('/api/'))        return await handleApi(request, env, url);

      // Auth-required admin routes
      const authRoutes = ['/admin/settings', '/admin/newsletter', '/admin/suggestions'];
      if (authRoutes.some(r => path.startsWith(r))) {
        const user = await getAuthUser(request, env);
        if (!user) return new Response(null, { status: 302, headers: { Location: '/admin/login' } });
        if (path.startsWith('/admin/settings'))   return await handleSettings(request, env, url, user);
        if (path.startsWith('/admin/newsletter'))  return await handleNewsletterAdmin(request, env, url, user);
        if (path.startsWith('/admin/suggestions')) return await handleSuggestionsAdmin(request, env, url, user);
        if (path.startsWith('/admin/bulletin'))   return await handleBulletinAdmin(request, env, url, user);
      }

      // Admin
      if (path.startsWith('/admin'))       return await handleAdmin(request, env, url);

      // Content
      if (path.startsWith('/contact'))     return await handleContact(request, env, url);
      if (path.startsWith('/jobs'))        return await handleJobs(request, env, url);
      if (path.startsWith('/food'))        return await handleFood(request, env, url);
      if (path.startsWith('/news'))        return await handleNews(request, env, url);
      if (path.startsWith('/attractions')) return await handleAttractions(request, env, url);
      if (path.startsWith('/meetings'))    return await handleMeetings(request, env, url);
      if (path.startsWith('/events'))      return await handleEvents(request, env, url);
      if (path.startsWith('/directory'))  return await handleDirectory(request, env, url);

      if (path.startsWith('/bulletin'))  return await handleBulletin(request, env, url);

      // Dynamic homepage
      if (path === '/')                    return await handleHome(request, env, url);

      // Dynamic CMS pages
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
  },

  // ── Cron Trigger — runs daily at 6am ────────────────────────
  async scheduled(event, env, ctx) {
    ctx.waitUntil(processSuggestions(env));
  }
};
