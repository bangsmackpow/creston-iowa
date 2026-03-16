import { handleJobs }        from '../creston-worker/src/handlers/jobs.js';
import { handleFood }        from '../creston-worker/src/handlers/food.js';
import { handleNews }        from '../creston-worker/src/handlers/news.js';
import { handleAttractions } from '../creston-worker/src/handlers/attractions.js';
import { handleAdmin }       from '../creston-worker/src/handlers/admin.js';
import { handleApi }         from '../creston-worker/src/handlers/api.js';

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
    if (path.startsWith('/jobs'))        return await handleJobs(request, env, url);
    if (path.startsWith('/food'))        return await handleFood(request, env, url);
    if (path.startsWith('/news'))        return await handleNews(request, env, url);
    if (path.startsWith('/attractions')) return await handleAttractions(request, env, url);

    return context.next();
  } catch (err) {
    console.error('Function error:', err);
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}