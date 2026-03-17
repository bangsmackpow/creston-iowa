/**
 * functions/[[path]].js
 * Cloudflare Pages Function — routes dynamic paths to Worker handlers.
 *
 * Required bindings in Pages → Settings → Bindings:
 *   R2  → BUCKET → crestoniowa
 *   D1  → DB     → creston-auth
 *
 * Required environment variables in Pages → Settings → Environment Variables:
 *   ADMIN_TOKEN    → random string (same as Worker secret)
 *   RESEND_API_KEY → from resend.com
 *   CONTACT_EMAIL  → hello@creston-iowa.com
 *   CONTACT_FROM   → contact@creston-iowa.com
 */

import { handleJobs }        from '../creston-worker/src/handlers/jobs.js';
import { handleFood }        from '../creston-worker/src/handlers/food.js';
import { handleNews }        from '../creston-worker/src/handlers/news.js';
import { handleAttractions } from '../creston-worker/src/handlers/attractions.js';
import { handleAdmin }       from '../creston-worker/src/handlers/admin.js';
import { handleApi }         from '../creston-worker/src/handlers/api.js';
import { handleContact }     from '../creston-worker/src/handlers/contact.js';

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
    if (path.startsWith('/api/'))        return await handleApi(request, env, url);
    if (path.startsWith('/admin'))       return await handleAdmin(request, env, url);
    if (path.startsWith('/contact'))     return await handleContact(request, env, url);
    if (path.startsWith('/jobs'))        return await handleJobs(request, env, url);
    if (path.startsWith('/food'))        return await handleFood(request, env, url);
    if (path.startsWith('/news'))        return await handleNews(request, env, url);
    if (path.startsWith('/attractions')) return await handleAttractions(request, env, url);

    return context.next();
  } catch (err) {
    console.error('Pages Function error:', err);
    return new Response(`Server error: ${err.message}`, { status: 500 });
  }
}
