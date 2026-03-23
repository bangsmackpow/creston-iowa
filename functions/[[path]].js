/**
 * functions/[[path]].js — Cloudflare Pages Function
 * Single source of truth for all routing.
 * All imports listed once. All routes listed once.
 * DO NOT use replace() scripts to modify this file — edit directly.
 */

import { handleAdmin }                                              from '../creston-worker/src/handlers/admin.js';
import { handleApi }                                               from '../creston-worker/src/handlers/api.js';
import { handleContact }                                           from '../creston-worker/src/handlers/contact.js';
import { handleSettings }                                          from '../creston-worker/src/handlers/settings.js';
import { handleMedia, handleMediaUpload, handleMediaList, handleMediaDelete } from '../creston-worker/src/handlers/media.js';
import { handlePage }                                              from '../creston-worker/src/handlers/pages.js';
import { handleSitemap }                                           from '../creston-worker/src/handlers/sitemap.js';
import { handleJobs }                                              from '../creston-worker/src/handlers/jobs.js';
import { handleFood }                                              from '../creston-worker/src/handlers/food.js';
import { handleNews }                                              from '../creston-worker/src/handlers/news.js';
import { handleAttractions }                                       from '../creston-worker/src/handlers/attractions.js';
import { handleMeetings }                                          from '../creston-worker/src/handlers/meetings.js';
import { handleEvents }                                            from '../creston-worker/src/handlers/events.js';
import { handleDirectory }                                         from '../creston-worker/src/handlers/directory.js';
import { handleBulletin }                                          from '../creston-worker/src/handlers/bulletin.js';
import { handleNewsletterAdmin, handleSubscribe }                  from '../creston-worker/src/handlers/newsletter.js';
import { handleSuggestionsAdmin }                                  from '../creston-worker/src/handlers/suggestions.js';
import { handleServiceRequests }                                   from '../creston-worker/src/handlers/service-requests.js';
import { handleFOIA }                                              from '../creston-worker/src/handlers/foia.js';
import { handleDocuments }                                         from '../creston-worker/src/handlers/documents.js';
import { handleNotices }                                           from '../creston-worker/src/handlers/notices.js';
import { handleAnalyticsBeacon }                                   from '../creston-worker/src/handlers/analytics.js';
import { handleJobsPost, handleStripeCheckout, handleStripeWebhook } from '../creston-worker/src/handlers/stripe.js';
import { handleAIWrite }                                           from '../creston-worker/src/handlers/ai-write.js';
import { handleHome }                                              from '../creston-worker/src/handlers/home.js';
import { handleResidents }                                         from '../creston-worker/src/handlers/residents.js';
import { handlePermits }                                           from '../creston-worker/src/handlers/permits.js';
import { handleSMSSubscribe, handleSMSUnsubscribe, handleSMSWebhook } from '../creston-worker/src/handlers/sms.js';
import { handleSearch } from '../creston-worker/src/handlers/search.js';

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

    // ── Static asset overrides ──────────────────────────────────
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

    // ── Media ───────────────────────────────────────────────────
    if (path.startsWith('/media/'))        return await handleMedia(request, env, url);
    if (path === '/api/media/upload')      return await handleMediaUpload(request, env);
    if (path === '/api/media/list')        return await handleMediaList(request, env, url);
    if (path === '/api/media/delete')      return await handleMediaDelete(request, env, url);

    // ── Sitemap ─────────────────────────────────────────────────
    if (path === '/sitemap.xml')           return await handleSitemap(request, env);

    // ── SMS public endpoints ────────────────────────────────────
    if (path === '/api/sms/subscribe')     return await handleSMSSubscribe(request, env);
    if (path === '/api/sms/unsubscribe')   return await handleSMSUnsubscribe(request, env);
    if (path === '/api/sms/webhook')       return await handleSMSWebhook(request, env);

    // ── Analytics beacon ────────────────────────────────────────
    if (path === '/api/analytics/beacon')  return await handleAnalyticsBeacon(request, env);

    // ── Stripe ──────────────────────────────────────────────────
    if (path === '/api/stripe/webhook')    return await handleStripeWebhook(request, env);
    if (path === '/api/stripe/checkout')   return await handleStripeCheckout(request, env);
    if (path === '/jobs/post')             return await handleJobsPost(request, env, url);

    // ── AI write ────────────────────────────────────────────────
    if (path === '/api/ai/write' && request.method === 'POST')
                                           return await handleAIWrite(request, env);

    // ── API ─────────────────────────────────────────────────────
    if (path.startsWith('/api/'))          return await handleApi(request, env, url);

    // ── Subscribe ───────────────────────────────────────────────
    if (path === '/subscribe')             return await handleSubscribe(request, env);

    // ── Admin ───────────────────────────────────────────────────
    if (path.startsWith('/admin'))         return await handleAdmin(request, env, url);

    // ── Contact ─────────────────────────────────────────────────
    if (path.startsWith('/contact'))       return await handleContact(request, env, url);

    // ── Content ─────────────────────────────────────────────────
    if (path.startsWith('/jobs'))          return await handleJobs(request, env, url);
    if (path.startsWith('/food'))          return await handleFood(request, env, url);
    if (path.startsWith('/news'))          return await handleNews(request, env, url);
    if (path.startsWith('/attractions'))   return await handleAttractions(request, env, url);
    if (path.startsWith('/meetings'))      return await handleMeetings(request, env, url);
    if (path.startsWith('/events'))        return await handleEvents(request, env, url);
    if (path.startsWith('/directory'))     return await handleDirectory(request, env, url);
    if (path.startsWith('/bulletin'))      return await handleBulletin(request, env, url);

    // ── Citizen services ────────────────────────────────────────
    if (path.startsWith('/311'))           return await handleServiceRequests(request, env, url);
    if (path.startsWith('/foia'))          return await handleFOIA(request, env, url);
    if (path.startsWith('/documents'))     return await handleDocuments(request, env, url);
    if (path.startsWith('/notices'))       return await handleNotices(request, env, url);
    if (path.startsWith('/permits'))       return await handlePermits(request, env, url);
    if (path.startsWith('/my-account'))    return await handleResidents(request, env, url);

    // ── Static CMS pages ────────────────────────────────────────
    if (path === '/about' || path === '/government' || path === '/chamber' || path === '/advertise') {
      const page = await handlePage(request, env, path.replace(/^\//, ''));
      if (page) return page;
    }

    // ── Homepage ────────────────────────────────────────────────
    if (path.startsWith('/search'))        return await handleSearch(request, env, url);

    if (path === '/')                      return await handleHome(request, env, url);

    // ── CMS slug catch-all ───────────────────────────────────────
    const slug = path.replace(/^\//, '').replace(/\/$/, '');
    if (slug && !slug.includes('.') && !slug.includes('/')) {
      const page = await handlePage(request, env, slug);
      if (page) return page;
    }

    return context.next();

  } catch (err) {
    console.error('Pages Function error:', err.message, err.stack);
    return new Response(`Server error: ${err.message}`, { status: 500 });
  }
}
