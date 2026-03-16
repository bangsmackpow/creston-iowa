/**
 * markdown.js
 * Lightweight frontmatter parser + markdown-to-HTML converter.
 * No npm deps — runs entirely in the Worker runtime.
 */

/**
 * Parse a markdown file with YAML-style frontmatter.
 * Returns { meta: {}, body: '', html: '' }
 */
export function parseMarkdown(raw) {
  const meta = {};
  let body = raw;

  // Extract frontmatter between --- delimiters
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (fmMatch) {
    const fmRaw = fmMatch[1];
    body = fmMatch[2].trim();

    // Parse each frontmatter line
    for (const line of fmRaw.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key   = line.slice(0, colonIdx).trim();
      let   value = line.slice(colonIdx + 1).trim();

      // Handle quoted strings
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Handle arrays: [item1, item2]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value
          .slice(1, -1)
          .split(',')
          .map(v => v.trim().replace(/^["']|["']$/g, ''));
      }

      // Handle booleans
      if (value === 'true')  value = true;
      if (value === 'false') value = false;

      meta[key] = value;
    }
  }

  const html = markdownToHtml(body);
  return { meta, body, html };
}

/**
 * Convert markdown body to HTML.
 * Handles: headings, bold, italic, links, lists, blockquotes, paragraphs.
 */
export function markdownToHtml(md) {
  if (!md) return '';

  let html = md
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')

    // Bold & italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,         '<em>$1</em>')

    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')

    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')

    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')

    // Horizontal rule
    .replace(/^---+$/gm, '<hr>')

    // Unordered lists (wrap consecutive li items)
    .replace(/^\- (.+)$/gm, '<li>$1</li>')

    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>[\s\S]+?<\/li>)(\n(?!<li>)|$)/g, (match) => {
    return `<ul>${match}</ul>`;
  });

  // Paragraphs — wrap lines not already in block tags
  html = html
    .split('\n\n')
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (/^<(h[1-6]|ul|ol|li|blockquote|hr|pre|div)/.test(block)) return block;
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
}

/**
 * Format a date string nicely: "2025-01-15" → "January 15, 2025"
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', {
      year: 'month', month: 'long', day: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

/**
 * Check if a job listing is expired based on its expires field
 */
export function isExpired(meta) {
  if (!meta.expires) return false;
  return new Date(meta.expires) < new Date();
}

/**
 * Generate a slug from a filename: "my-job-post.md" → "my-job-post"
 */
export function slugFromKey(key) {
  return key.split('/').pop().replace(/\.md$/, '');
}
