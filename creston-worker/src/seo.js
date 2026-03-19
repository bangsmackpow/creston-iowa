/**
 * src/seo.js
 * SEO helpers — JSON-LD structured data, meta tags, OG tags.
 * Injected into every content page for rich Google results.
 *
 * Schema types used:
 *   Restaurant     → /food/:slug
 *   JobPosting     → /jobs/:slug
 *   Event          → /events/:slug
 *   LocalBusiness  → /directory/:slug
 *   Article        → /news/:slug
 *   TouristAttraction → /attractions/:slug
 *   GovernmentService → /meetings/:slug
 *   WebSite        → homepage + sitelinks search
 */

import { escHtml } from './shell.js';

// ── Build full <head> SEO block ────────────────────────────────
export function buildSEO({ type, meta, slug, cfg, pageUrl, html }) {
  const site     = cfg?.name     || 'Community Hub';
  const siteUrl  = cfg?.url      || '';
  const fullUrl  = pageUrl || `${siteUrl}/${type}/${slug}`;
  const imgUrl   = meta?.image ? `${siteUrl}${meta.image}` : (cfg?.seo_default_image ? `${siteUrl}${cfg.seo_default_image}` : '');

  const title       = buildTitle(type, meta, slug, cfg);
  const description = buildDescription(type, meta, slug, cfg);
  const schema      = buildSchema(type, meta, slug, cfg, fullUrl, html);

  return { title, description, schema, imgUrl, fullUrl };
}

// ── Title builder ──────────────────────────────────────────────
export function buildTitle(type, meta, slug, cfg) {
  const city = cfg?.name || 'Creston, Iowa';
  const tpl  = cfg?.seo_title_template || '{page} — {site}';

  let page = '';
  switch(type) {
    case 'food':
      page = meta?.name
        ? `${meta.name} — ${city} ${capitalize(meta.category || 'Restaurant')}`
        : `Restaurants in ${city}`;
      break;
    case 'jobs':
      page = meta?.title
        ? `${meta.title}${meta.company ? ' at ' + meta.company : ''} — ${city} Jobs`
        : `Jobs in ${city}`;
      break;
    case 'news':
      page = meta?.title || `News from ${city}`;
      break;
    case 'events':
      page = meta?.title
        ? `${meta.title} — ${city} Events`
        : `Events in ${city}`;
      break;
    case 'attractions':
      page = meta?.name
        ? `${meta.name} — ${city}`
        : `Attractions in ${city}`;
      break;
    case 'directory':
      page = meta?.name
        ? `${meta.name} — ${city} Business Directory`
        : `${city} Business Directory`;
      break;
    case 'meetings':
      page = meta?.title
        ? `${meta.title} — ${city} Government`
        : `${city} Meeting Minutes`;
      break;
    default:
      page = meta?.title || meta?.name || slug || city;
  }

  return tpl.replace('{page}', page).replace('{site}', cfg?.name || city);
}

// ── Description builder ────────────────────────────────────────
export function buildDescription(type, meta, slug, cfg) {
  const city    = cfg?.name || 'Creston, Iowa';
  const county  = 'Union County, Iowa';
  const summary = meta?.summary || meta?.description || '';

  if (summary && summary.length > 50) {
    return summary.slice(0, 160);
  }

  switch(type) {
    case 'food':
      return [
        meta?.name,
        meta?.category ? `${capitalize(meta.category)} restaurant` : 'restaurant',
        `in ${city}.`,
        meta?.address ? `Located at ${meta.address}.` : '',
        meta?.hours   ? `Hours: ${meta.hours}.` : '',
        meta?.phone   ? `Call ${meta.phone}.` : '',
      ].filter(Boolean).join(' ').slice(0, 160);

    case 'jobs':
      return [
        meta?.title,
        meta?.company ? `at ${meta.company}` : '',
        `in ${city}.`,
        meta?.type     ? `${meta.type} position.` : '',
        meta?.pay      ? `Pay: ${meta.pay}.` : '',
        meta?.category ? `${capitalize(meta.category)} industry.` : '',
      ].filter(Boolean).join(' ').slice(0, 160);

    case 'news':
      return `${meta?.title || 'Latest news'} — ${city} community news and local updates from ${county}.`;

    case 'events':
      return [
        meta?.title,
        meta?.date ? `on ${formatDate(meta.date)}` : '',
        meta?.location ? `at ${meta.location}` : `in ${city}.`,
        meta?.cost  ? `${meta.cost}.` : '',
      ].filter(Boolean).join(' ').slice(0, 160);

    case 'attractions':
      return `${meta?.name || 'Attraction'} in ${city}. ${meta?.tagline || ''} Visit ${city} in ${county}.`;

    case 'directory':
      return [
        meta?.name,
        meta?.tagline || '',
        meta?.address ? `Located at ${meta.address}.` : `in ${city}.`,
        meta?.phone   ? `Call ${meta.phone}.` : '',
        meta?.hours   ? meta.hours : '',
      ].filter(Boolean).join(' ').slice(0, 160);

    default:
      return `${meta?.title || meta?.name || city} — ${cfg?.description || `Community hub for ${city}.`}`.slice(0, 160);
  }
}

// ── JSON-LD Schema builder ─────────────────────────────────────
export function buildSchema(type, meta, slug, cfg, pageUrl, bodyHtml) {
  const siteUrl = cfg?.url || '';
  const city    = cfg?.name || 'Creston';
  const schemas = [];

  switch(type) {
    case 'food':
      schemas.push({
        '@context':   'https://schema.org',
        '@type':      'Restaurant',
        'name':       meta?.name || '',
        'description': meta?.summary || '',
        'url':        pageUrl,
        'address': meta?.address ? {
          '@type':           'PostalAddress',
          'streetAddress':   meta.address.split(',')[0]?.trim() || '',
          'addressLocality': city,
          'addressRegion':   'IA',
          'addressCountry':  'US',
        } : undefined,
        'telephone':  meta?.phone   || undefined,
        'openingHours': meta?.hours || undefined,
        'servesCuisine': meta?.category || undefined,
        'priceRange': meta?.price   || undefined,
        'image':      meta?.image ? `${siteUrl}${meta.image}` : undefined,
        'sameAs':     meta?.website ? [meta.website] : undefined,
      });
      break;

    case 'jobs':
      const posted  = meta?.posted  || new Date().toISOString().split('T')[0];
      const expires = meta?.expires || undefined;
      schemas.push({
        '@context':         'https://schema.org',
        '@type':            'JobPosting',
        'title':            meta?.title       || '',
        'description':      bodyHtml ? stripHtml(bodyHtml).slice(0, 500) : (meta?.summary || ''),
        'datePosted':       posted,
        'validThrough':     expires,
        'employmentType':   mapJobType(meta?.type),
        'jobLocation': {
          '@type':   'Place',
          'address': {
            '@type':           'PostalAddress',
            'addressLocality': meta?.location?.split(',')[0]?.trim() || city,
            'addressRegion':   'IA',
            'addressCountry':  'US',
          }
        },
        'hiringOrganization': meta?.company ? {
          '@type': 'Organization',
          'name':  meta.company,
          'sameAs': meta?.apply_url || undefined,
        } : undefined,
        'baseSalary': meta?.pay ? {
          '@type':    'MonetaryAmount',
          'currency': 'USD',
          'value': {
            '@type': 'QuantitativeValue',
            'description': meta.pay,
          }
        } : undefined,
        'url': pageUrl,
        'directApply': !!(meta?.apply_url || meta?.apply_email),
      });
      break;

    case 'events':
      schemas.push({
        '@context':   'https://schema.org',
        '@type':      'Event',
        'name':       meta?.title    || '',
        'description': meta?.summary || '',
        'startDate':  meta?.date && meta?.time ? `${meta.date}T${meta.time}` : meta?.date,
        'endDate':    meta?.end_date ? `${meta.end_date}${meta.end_time ? 'T' + meta.end_time : ''}` : undefined,
        'location': {
          '@type': 'Place',
          'name':  meta?.location || city,
          'address': meta?.address ? {
            '@type':           'PostalAddress',
            'streetAddress':   meta.address,
            'addressLocality': city,
            'addressRegion':   'IA',
            'addressCountry':  'US',
          } : { '@type': 'PostalAddress', 'addressLocality': city, 'addressRegion': 'IA' },
        },
        'offers': meta?.cost && meta.cost.toLowerCase() !== 'free' ? {
          '@type':    'Offer',
          'price':    meta.cost,
          'priceCurrency': 'USD',
        } : {
          '@type': 'Offer',
          'price': '0',
          'priceCurrency': 'USD',
        },
        'organizer': {
          '@type': 'Organization',
          'name':  cfg?.name || city,
          'url':   cfg?.url  || '',
        },
        'url':   meta?.url || pageUrl,
        'image': meta?.image ? `${siteUrl}${meta.image}` : undefined,
      });
      break;

    case 'attractions':
      schemas.push({
        '@context':   'https://schema.org',
        '@type':      'TouristAttraction',
        'name':       meta?.name    || '',
        'description': meta?.summary || meta?.tagline || '',
        'url':        pageUrl,
        'address': {
          '@type':           'PostalAddress',
          'addressLocality': city,
          'addressRegion':   'IA',
          'addressCountry':  'US',
        },
        'touristType': meta?.category || undefined,
        'image':       meta?.image ? `${siteUrl}${meta.image}` : undefined,
      });
      break;

    case 'directory':
      schemas.push({
        '@context':   'https://schema.org',
        '@type':      'LocalBusiness',
        'name':       meta?.name    || '',
        'description': meta?.summary || meta?.tagline || '',
        'url':        meta?.website || pageUrl,
        'telephone':  meta?.phone   || undefined,
        'email':      meta?.email   || undefined,
        'address': meta?.address ? {
          '@type':           'PostalAddress',
          'streetAddress':   meta.address.split(',')[0]?.trim() || '',
          'addressLocality': city,
          'addressRegion':   'IA',
          'addressCountry':  'US',
        } : undefined,
        'openingHours': meta?.hours  || undefined,
        'image':        meta?.image  ? `${siteUrl}${meta.image}` : undefined,
        'logo':         meta?.logo   ? `${siteUrl}${meta.logo}`  : undefined,
        'sameAs':       meta?.social_facebook || meta?.website
          ? [meta.website, meta.social_facebook].filter(Boolean)
          : undefined,
      });
      break;

    case 'news':
      schemas.push({
        '@context':        'https://schema.org',
        '@type':           'NewsArticle',
        'headline':        meta?.title   || '',
        'description':     meta?.summary || '',
        'datePublished':   meta?.date    || new Date().toISOString().split('T')[0],
        'dateModified':    meta?.date    || new Date().toISOString().split('T')[0],
        'author': {
          '@type': 'Person',
          'name':  meta?.author || (cfg?.name + ' Staff') || 'Staff Reporter',
        },
        'publisher': {
          '@type': 'Organization',
          'name':  cfg?.name || city,
          'url':   cfg?.url  || '',
        },
        'url':   pageUrl,
        'image': meta?.image ? `${siteUrl}${meta.image}` : undefined,
        'articleSection': meta?.category || 'Community',
      });
      break;
  }

  // Add BreadcrumbList for all content pages
  schemas.push({
    '@context': 'https://schema.org',
    '@type':    'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': cfg?.name || city, 'item': siteUrl || '/' },
      { '@type': 'ListItem', 'position': 2, 'name': capitalize(type),  'item': `${siteUrl}/${type}` },
      { '@type': 'ListItem', 'position': 3, 'name': meta?.name || meta?.title || slug, 'item': pageUrl },
    ]
  });

  // Render as <script> tags
  return schemas
    .map(s => `<script type="application/ld+json">\n${JSON.stringify(cleanSchema(s), null, 2)}\n</script>`)
    .join('\n');
}

// ── Website schema for homepage ────────────────────────────────
export function buildWebsiteSchema(cfg) {
  return `<script type="application/ld+json">
${JSON.stringify({
  '@context':      'https://schema.org',
  '@type':         'WebSite',
  'name':          cfg?.name || 'Community Hub',
  'url':           cfg?.url  || '',
  'description':   cfg?.description || '',
  'potentialAction': {
    '@type':       'SearchAction',
    'target':      `${cfg?.url || ''}/directory?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
}, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type':    'LocalBusiness',
  'name':     cfg?.name || 'Community Hub',
  'url':      cfg?.url  || '',
  'description': cfg?.description || '',
  'address': {
    '@type':           'PostalAddress',
    'addressLocality': cfg?.name?.replace(', Iowa','') || 'Creston',
    'addressRegion':   'IA',
    'addressCountry':  'US',
  },
  'email':     cfg?.email_general   || undefined,
  'sameAs':    [cfg?.social_facebook, cfg?.social_twitter, cfg?.social_instagram].filter(Boolean),
}, null, 2)}
</script>`;
}

// ── Utilities ──────────────────────────────────────────────────
function capitalize(s) { return (s||'').charAt(0).toUpperCase() + (s||'').slice(1); }

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
  } catch { return dateStr; }
}

function mapJobType(type) {
  const map = {
    'full-time': 'FULL_TIME', 'full time': 'FULL_TIME', 'fulltime': 'FULL_TIME',
    'part-time': 'PART_TIME', 'part time': 'PART_TIME', 'parttime': 'PART_TIME',
    'contract':  'CONTRACTOR', 'temp': 'TEMPORARY', 'temporary': 'TEMPORARY',
    'internship': 'INTERN',
  };
  return map[(type || '').toLowerCase()] || 'FULL_TIME';
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Remove undefined values from schema object recursively
function cleanSchema(obj) {
  if (Array.isArray(obj)) return obj.map(cleanSchema).filter(v => v !== undefined && v !== null);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      const cleaned = cleanSchema(v);
      if (cleaned !== undefined && cleaned !== null) out[k] = cleaned;
    }
    return out;
  }
  return obj;
}
