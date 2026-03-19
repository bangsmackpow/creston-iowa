/**
 * r2.js
 * Helper functions for reading from the R2 bucket.
 */

import { parseMarkdown, slugFromKey, isExpired } from './markdown.js';

/**
 * List all .md files under a prefix and parse them.
 * Returns array of { slug, meta, body, html, key }
 * Sorted by: featured first, then by posted date descending.
 */
export async function listContent(env, prefix) {
  const listed = await env.BUCKET.list({ prefix });
  const results = [];

  for (const obj of listed.objects) {
    if (!obj.key.endsWith('.md')) continue;

    try {
      const file = await env.BUCKET.get(obj.key);
      if (!file) continue;

      const raw     = await file.text();
      const parsed  = parseMarkdown(raw);
      const slug    = slugFromKey(obj.key);

      results.push({
        slug,
        key:      obj.key,
        meta:     parsed.meta,
        body:     parsed.body,
        html:     parsed.html,
        modified: obj.uploaded,
      });
    } catch (err) {
      console.error(`Failed to parse ${obj.key}:`, err);
    }
  }

  // Sort: featured first, then newest first
  results.sort((a, b) => {
    if (a.meta.featured && !b.meta.featured) return -1;
    if (!a.meta.featured && b.meta.featured) return 1;
    const dateA = a.meta.posted || (a.modified ? new Date(a.modified).toISOString() : '') || '';
    const dateB = b.meta.posted || (b.modified ? new Date(b.modified).toISOString() : '') || '';
    return String(dateB).localeCompare(String(dateA));
  });

  return results;
}

/**
 * Get a single file by key. Returns parsed content or null.
 */
export async function getContent(env, key) {
  const file = await env.BUCKET.get(key);
  if (!file) return null;

  const raw    = await file.text();
  const parsed = parseMarkdown(raw);
  const slug   = slugFromKey(key);

  return { slug, key, meta: parsed.meta, body: parsed.body, html: parsed.html };
}

/**
 * Find a single item by slug across a prefix.
 * e.g. findBySlug(env, 'jobs/active', 'rn-greater-regional')
 */
export async function findBySlug(env, prefix, slug) {
  // Try direct path first (legacy flat structure)
  const directKey = `${prefix}/${slug}.md`;
  const direct    = await getContent(env, directKey);
  if (direct) return direct;

  // Search in subdirectories (company-scoped jobs: jobs/active/company/slug.md)
  const listed = await env.BUCKET.list({ prefix: `${prefix}/` });
  for (const obj of listed.objects) {
    if (!obj.key.endsWith('.md')) continue;
    const filename = obj.key.split('/').pop().replace('.md', '');
    if (filename === slug) {
      const item = await getContent(env, obj.key);
      if (item) return item;
    }
  }
  return null;
}

/**
 * Write a markdown file to R2.
 */
export async function putContent(env, key, content) {
  await env.BUCKET.put(key, content, {
    httpMetadata: { contentType: 'text/markdown; charset=utf-8' }
  });
}

/**
 * Delete a file from R2.
 */
export async function deleteContent(env, key) {
  await env.BUCKET.delete(key);
}

/**
 * Move a file (copy + delete) — used to expire/restore jobs.
 */
export async function moveContent(env, fromKey, toKey) {
  const file = await env.BUCKET.get(fromKey);
  if (!file) throw new Error(`Source not found: ${fromKey}`);
  const content = await file.text();
  await env.BUCKET.put(toKey, content, {
    httpMetadata: { contentType: 'text/markdown; charset=utf-8' }
  });
  await env.BUCKET.delete(fromKey);
}
