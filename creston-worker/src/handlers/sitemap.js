/**
 * src/handlers/sitemap.js
 * Auto-generates sitemap.xml from live R2 content.
 * Replaces the static sitemap.xml file.
 * Cached at edge for 1 hour.
 */

import { getSiteConfig } from '../db/site.js';

export async function handleSitemap(request, env) {
  try {
    const cfg     = await getSiteConfig(env);
    const baseUrl = (cfg.url || 'https://example.com').replace(/\/$/, '');
    const today   = new Date().toISOString().split('T')[0];

    const urls = [];

    // ── Static core pages ─────────────────────────────────────
    urls.push({ loc: '/',            priority: '1.0', changefreq: 'daily'   });
    urls.push({ loc: '/food',        priority: '0.9', changefreq: 'weekly'  });
    urls.push({ loc: '/attractions', priority: '0.9', changefreq: 'weekly'  });
    urls.push({ loc: '/news',        priority: '0.9', changefreq: 'daily'   });
    urls.push({ loc: '/jobs',        priority: '0.9', changefreq: 'daily'   });
    urls.push({ loc: '/events',      priority: '0.9', changefreq: 'daily'   });
    urls.push({ loc: '/meetings',    priority: '0.8', changefreq: 'weekly'  });
    urls.push({ loc: '/directory',   priority: '0.8', changefreq: 'weekly'  });
    urls.push({ loc: '/contact',     priority: '0.5', changefreq: 'monthly' });
    urls.push({ loc: '/about',       priority: '0.6', changefreq: 'monthly' });
    urls.push({ loc: '/government',  priority: '0.6', changefreq: 'monthly' });

    // ── Dynamic pages from R2 ─────────────────────────────────
    const prefixes = [
      { prefix: 'pages/',        base: '',              priority: '0.8', changefreq: 'monthly' },
      { prefix: 'food/',         base: '/food/',        priority: '0.7', changefreq: 'monthly' },
      { prefix: 'news/',         base: '/news/',        priority: '0.8', changefreq: 'weekly'  },
      { prefix: 'attractions/',  base: '/attractions/', priority: '0.7', changefreq: 'monthly' },
      { prefix: 'jobs/active/',  base: '/jobs/',        priority: '0.8', changefreq: 'weekly'  },
      { prefix: 'events/',       base: '/events/',      priority: '0.8', changefreq: 'weekly'  },
      { prefix: 'meetings/',     base: '/meetings/',    priority: '0.7', changefreq: 'monthly' },
      { prefix: 'directory/',    base: '/directory/',   priority: '0.7', changefreq: 'monthly' },
    ];

    for (const { prefix, base, priority, changefreq } of prefixes) {
      try {
        const listed = await env.BUCKET.list({ prefix });
        for (const obj of listed.objects) {
          if (!obj.key.endsWith('.md')) continue;

          // Skip expired jobs
          if (prefix === 'jobs/active/') {
            // Get just the filename slug — handle company-scoped paths
            const parts = obj.key.replace(prefix, '').split('/');
            const slug  = parts[parts.length - 1].replace('.md', '');
            const lastMod = obj.uploaded
              ? new Date(obj.uploaded).toISOString().split('T')[0]
              : today;
            urls.push({ loc: `/jobs/${slug}`, priority, changefreq, lastmod: lastMod });
            continue;
          }

          if (prefix === 'pages/') {
            const slug    = obj.key.replace('pages/', '').replace('.md', '');
            const lastMod = obj.uploaded
              ? new Date(obj.uploaded).toISOString().split('T')[0]
              : today;
            urls.push({ loc: `/${slug}`, priority, changefreq, lastmod: lastMod });
            continue;
          }

          const slug    = obj.key.replace(prefix, '').replace('.md', '');
          const lastMod = obj.uploaded
            ? new Date(obj.uploaded).toISOString().split('T')[0]
            : today;
          urls.push({ loc: `${base}${slug}`, priority, changefreq, lastmod: lastMod });
        }
      } catch (err) {
        console.error(`Sitemap error for prefix ${prefix}:`, err);
      }
    }

    // ── Build XML ─────────────────────────────────────────────
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urls.map(u => `  <url>
    <loc>${escXml(baseUrl + u.loc)}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : `<lastmod>${today}</lastmod>`}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    return new Response(xml, {
      headers: {
        'Content-Type':  'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=600',
        'X-Robots-Tag':  'noindex',
      }
    });

  } catch (err) {
    console.error('Sitemap generation error:', err);
    return new Response('Error generating sitemap', { status: 500 });
  }
}

function escXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
