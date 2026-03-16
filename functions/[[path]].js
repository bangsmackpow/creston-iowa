export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // Only proxy these paths to the Worker
  const workerPaths = ['/jobs', '/food', '/news', '/attractions', '/admin', '/api'];
  const shouldProxy = workerPaths.some(p => path === p || path.startsWith(p + '/'));

  if (!shouldProxy) {
    // Let Pages serve the static file
    return context.next();
  }

  // Forward to your Worker
  const workerUrl = 'https://creston-iowa-worker.curtislamasters.workers.dev' + url.pathname + url.search;

  return fetch(workerUrl, {
    method:  context.request.method,
    headers: context.request.headers,
    body:    context.request.method !== 'GET' && context.request.method !== 'HEAD'
               ? context.request.body
               : undefined,
  });
}