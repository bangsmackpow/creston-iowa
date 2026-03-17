/**
 * src/handlers/media.js
 * Serves media files from R2 and handles uploads.
 *
 * Routes:
 *   GET  /media/*           → serve file from R2
 *   POST /api/media/upload  → upload file to R2 (auth required)
 *   GET  /api/media/list    → list media files (auth required)
 *   DELETE /api/media/:key  → delete file (auth required)
 *
 * R2 structure:
 *   media/images/photo.jpg
 *   media/images/logo.png
 *   media/docs/file.pdf
 */

import { getAuthUser } from '../db/auth-d1.js';

// ── Serve media from R2 ────────────────────────────────────────
export async function handleMedia(request, env, url) {
  const key = url.pathname.slice(1); // strip leading /  → media/images/photo.jpg

  if (!key || key === 'media/' || key === 'media') {
    return new Response('Not found', { status: 404 });
  }

  try {
    const object = await env.BUCKET.get(key);

    if (!object) {
      return new Response('Media not found', { status: 404 });
    }

    const contentType = object.httpMetadata?.contentType || guessContentType(key);
    const headers     = new Headers();

    headers.set('Content-Type',  contentType);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('ETag',          object.etag || '');

    // Support conditional requests
    const ifNoneMatch = request.headers.get('If-None-Match');
    if (ifNoneMatch && ifNoneMatch === object.etag) {
      return new Response(null, { status: 304, headers });
    }

    return new Response(object.body, { headers });

  } catch (err) {
    console.error('Media serve error:', err);
    return new Response('Error serving media', { status: 500 });
  }
}

// ── Upload handler ─────────────────────────────────────────────
export async function handleMediaUpload(request, env) {
  const user = await getAuthUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  try {
    const formData    = await request.formData();
    const file        = formData.get('file');
    const folder      = formData.get('folder') || 'images';
    const customName  = formData.get('name') || '';

    if (!file || typeof file === 'string') {
      return jsonResponse({ error: 'No file provided' }, 400);
    }

    // Validate file type
    const allowed = ['image/jpeg','image/png','image/gif','image/webp','image/svg+xml','application/pdf'];
    if (!allowed.includes(file.type)) {
      return jsonResponse({ error: `File type not allowed: ${file.type}` }, 400);
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return jsonResponse({ error: 'File too large. Maximum size is 10MB.' }, 400);
    }

    // Build filename
    const ext      = getExtension(file.name || 'file', file.type);
    const baseName = customName
      ? sanitizeFilename(customName) + ext
      : sanitizeFilename(file.name || 'upload') ;
    const key      = `media/${folder}/${baseName}`;

    // Check if file already exists — append timestamp if so
    const existing = await env.BUCKET.head(key);
    const finalKey = existing
      ? `media/${folder}/${Date.now()}-${baseName}`
      : key;

    // Upload to R2
    const arrayBuffer = await file.arrayBuffer();
    await env.BUCKET.put(finalKey, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        originalName:  file.name || '',
        uploadedBy:    String(user.uid || user.id || ''),
        uploadedAt:    new Date().toISOString(),
      }
    });

    return jsonResponse({
      ok:           true,
      key:          finalKey,
      url:          `/${finalKey}`,
      name:         file.name,
      size:         file.size,
      contentType:  file.type,
    });

  } catch (err) {
    console.error('Upload error:', err);
    return jsonResponse({ error: err.message }, 500);
  }
}

// ── List media ─────────────────────────────────────────────────
export async function handleMediaList(request, env, url) {
  const user = await getAuthUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const folder = url.searchParams.get('folder') || 'images';
  const prefix = `media/${folder}/`;

  try {
    const listed = await env.BUCKET.list({ prefix });
    const files  = await Promise.all(
      listed.objects
        .filter(o => !o.key.endsWith('/'))
        .map(async obj => {
          const head = await env.BUCKET.head(obj.key);
          return {
            key:          obj.key,
            url:          `/${obj.key}`,
            name:         obj.key.split('/').pop(),
            size:         obj.size,
            contentType:  head?.httpMetadata?.contentType || guessContentType(obj.key),
            uploadedAt:   head?.customMetadata?.uploadedAt || '',
            uploadedBy:   head?.customMetadata?.uploadedBy || '',
            modified:     obj.uploaded,
          };
        })
    );

    // Sort newest first
    files.sort((a, b) => new Date(b.modified) - new Date(a.modified));

    return jsonResponse({ ok: true, files, folder });

  } catch (err) {
    console.error('Media list error:', err);
    return jsonResponse({ error: err.message }, 500);
  }
}

// ── Delete media ───────────────────────────────────────────────
export async function handleMediaDelete(request, env, url) {
  const user = await getAuthUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (user.role !== 'superadmin' && user.role !== 'editor') {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  try {
    const body = await request.json();
    const key  = body.key || '';

    if (!key.startsWith('media/')) {
      return jsonResponse({ error: 'Invalid media key' }, 400);
    }

    await env.BUCKET.delete(key);
    return jsonResponse({ ok: true });

  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ── Helpers ────────────────────────────────────────────────────
function guessContentType(key) {
  const ext = key.split('.').pop()?.toLowerCase();
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png',  gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml',
    pdf: 'application/pdf',
    ico: 'image/x-icon',
  };
  return map[ext] || 'application/octet-stream';
}

function getExtension(filename, mimeType) {
  const fromFile = '.' + filename.split('.').pop()?.toLowerCase();
  if (fromFile && fromFile.length > 1 && fromFile.length < 6) return fromFile;
  const mimeMap = {
    'image/jpeg': '.jpg', 'image/png': '.png',
    'image/gif': '.gif',  'image/webp': '.webp',
    'image/svg+xml': '.svg', 'application/pdf': '.pdf',
  };
  return mimeMap[mimeType] || '.bin';
}

function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
