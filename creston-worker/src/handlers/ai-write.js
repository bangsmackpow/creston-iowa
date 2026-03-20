/**
 * src/handlers/ai-write.js
 * AI writing assistant — Workers AI powered content tools.
 *
 * POST /api/ai/write
 * Body: { action, text, context, type }
 *   action:  rewrite | summarize | meta | title | grammar |
 *            formal | friendly | expand
 *   text:    selected text or full content body
 *   context: optional surrounding content for better results
 *   type:    content type hint (news|food|jobs|events etc.)
 *
 * Returns: { ok: true, result: "..." }
 *
 * Requires Workers AI binding: env.AI
 * Falls back gracefully if AI not bound.
 */

import { getAuthUser } from '../db/auth-d1.js';
import { getSiteConfig } from '../db/site.js';

const MODEL = '@cf/meta/llama-3.1-8b-instruct';

export async function handleAIWrite(request, env) {
  // Auth required — editors and above can use AI tools
  const user = await getAuthUser(request, env);
  if (!user) return jsonRes({ error: 'Unauthorized' }, 401);

  if (!env.AI) {
    return jsonRes({
      error: 'Workers AI not configured. Add an AI binding named "AI" in Cloudflare Pages → Settings → Functions → Workers AI bindings.',
      fallback: true,
    }, 503);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonRes({ error: 'Invalid JSON' }, 400); }

  const { action, text, context, type } = body;
  if (!action) return jsonRes({ error: 'action required' }, 400);
  if (!text?.trim()) return jsonRes({ error: 'text required' }, 400);

  const cfg      = await getSiteConfig(env);
  const siteName = cfg?.name || 'our community';

  try {
    const prompt   = buildPrompt(action, text, context, type, siteName);
    const response = await env.AI.run(MODEL, {
      prompt,
      max_tokens: 800,
    });

    const raw    = response?.response || '';
    const result = cleanResult(action, raw, text);

    return jsonRes({ ok: true, result, action });
  } catch (err) {
    console.error('AI write error:', err.message);
    return jsonRes({ error: 'AI request failed: ' + err.message }, 500);
  }
}

// ── Prompt builder ─────────────────────────────────────────────
function buildPrompt(action, text, context, type, siteName) {
  const contentType = type || 'content';
  const ctx = context ? `\n\nContext (surrounding content):\n${context.slice(0, 500)}` : '';

  const prompts = {
    rewrite: `You are a skilled editor for ${siteName}'s community website. Rewrite the following ${contentType} to be clearer, more engaging, and better structured. Keep the same meaning and facts. Return ONLY the rewritten text, no explanation.

Text to rewrite:
${text}${ctx}`,

    summarize: `You are a content editor for ${siteName}'s community website. Write a concise 1-2 sentence summary of the following ${contentType}. The summary will appear in listing cards and search results. Return ONLY the summary, no explanation or preamble.

Content to summarize:
${text}`,

    meta: `You are an SEO expert for ${siteName}'s community website. Write a compelling meta description (under 160 characters) for the following ${contentType}. It should be descriptive, include location (${siteName}) when relevant, and encourage clicks. Return ONLY the meta description text, no explanation.

Content:
${text}`,

    title: `You are a headline writer for ${siteName}'s community website. Suggest 3 compelling, specific titles for the following ${contentType}. Each title should be under 70 characters and accurately reflect the content. Return ONLY the 3 titles, one per line, numbered 1. 2. 3. No explanation.

Content:
${text}`,

    grammar: `You are a proofreader. Fix all grammar, spelling, and punctuation errors in the following text. Do not change the meaning, style, or structure. Return ONLY the corrected text, no explanation.

Text to proofread:
${text}`,

    formal: `You are an editor. Rewrite the following text in a more formal, professional tone suitable for an official community website. Maintain all facts and meaning. Return ONLY the rewritten text, no explanation.

Text to make more formal:
${text}`,

    friendly: `You are an editor. Rewrite the following text in a warmer, more friendly and conversational tone that feels welcoming to community members. Maintain all facts and meaning. Return ONLY the rewritten text, no explanation.

Text to make more friendly:
${text}`,

    expand: `You are a writer for ${siteName}'s community website. Expand the following bullet points or brief notes into well-written, engaging paragraphs suitable for a ${contentType}. Add helpful detail while staying factually accurate to the source material. Return ONLY the expanded content in markdown format, no explanation.

Content to expand:
${text}`,
  };

  return prompts[action] || prompts.rewrite;
}

// ── Clean up AI output ─────────────────────────────────────────
function cleanResult(action, raw, originalText) {
  let result = raw.trim();

  // Remove common AI preambles
  const preambles = [
    /^(here'?s?( is)?( the)?( a)?( rewritten| revised| improved| corrected| expanded| formal| friendly| summarized)?( version| text| content)?[:\-]?\s*\n?)/i,
    /^(sure[,!]?\s*(here'?s?( is)?)?[:\-]?\s*\n?)/i,
    /^(of course[,!]?\s*[:\-]?\s*\n?)/i,
    /^(certainly[,!]?\s*[:\-]?\s*\n?)/i,
    /^(i['']ve (rewritten|revised|improved|corrected|expanded)[^.]*\.\s*\n?)/i,
  ];
  for (const p of preambles) result = result.replace(p, '');

  // For title suggestions, ensure clean numbered list
  if (action === 'title') {
    const lines = result.split('\n')
      .map(l => l.trim())
      .filter(l => l && /^[1-3]\./.test(l))
      .slice(0, 3);
    if (lines.length > 0) return lines.join('\n');
  }

  // For meta description, ensure under 160 chars
  if (action === 'meta' && result.length > 160) {
    result = result.slice(0, 157) + '...';
  }

  return result.trim() || originalText;
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
