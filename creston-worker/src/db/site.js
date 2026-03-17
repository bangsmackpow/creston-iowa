/**
 * src/db/site.js
 * Site configuration — stored in R2 as config/site.json
 * This is the single source of truth for everything about the site.
 * Read on every request (cached by Cloudflare edge).
 * Written only from /admin/settings.
 */

// ── Default config (used if site.json doesn't exist yet) ──────
export const DEFAULT_SITE_CONFIG = {
  // General
  name:        'My Town',
  tagline:     'Your Community Hub',
  description: 'Local news, dining, events, and more.',
  url:         'https://example.com',
  logo_text:   '🌾',          // emoji or leave blank if using logo image
  logo_image:  '',            // R2 key to uploaded logo image
  favicon:     '',            // R2 key to favicon

  // Contact
  email_general:   'hello@example.com',
  email_news:      'news@example.com',
  email_jobs:      'jobs@example.com',
  email_advertise: 'advertise@example.com',
  phone:           '',
  address:         '',

  // Social
  social_facebook:  '',
  social_twitter:   '',
  social_instagram: '',
  social_youtube:   '',

  // Design / Theme
  theme: 'green',             // green | blue | red | purple | dark | custom
  custom_colors: {
    primary:    '#1a3a2a',
    secondary:  '#2d5a3d',
    accent:     '#c9933a',
    background: '#faf8f3',
  },
  font_heading: 'Playfair Display',   // Google Font name
  font_body:    'Source Serif 4',
  font_ui:      'DM Sans',

  // Navigation — ordered list of nav items
  navigation: [
    { label: 'Home',         href: '/',            show: true },
    { label: 'About',        href: '/about',        show: true },
    { label: 'Dining',       href: '/food',         show: true },
    { label: 'Attractions',  href: '/attractions',  show: true },
    { label: 'News',         href: '/news',         show: true },
    { label: 'Government',   href: '/government',   show: false },
    { label: 'Chamber',      href: '/chamber',      show: false },
    { label: 'Jobs',         href: '/jobs',         show: true,  highlight: true },
    { label: 'Contact',      href: '/contact',      show: true },
  ],

  // Homepage sections — toggle and reorder
  homepage_sections: [
    { id: 'hero',        show: true,  order: 1 },
    { id: 'quicklinks',  show: true,  order: 2 },
    { id: 'news',        show: true,  order: 3 },
    { id: 'about',       show: true,  order: 4 },
    { id: 'dining',      show: true,  order: 5 },
    { id: 'attractions', show: true,  order: 6 },
    { id: 'jobs',        show: true,  order: 7 },
    { id: 'chamber',     show: false, order: 8 },
  ],

  // Hero section
  hero_headline:    'Welcome to My Town',
  hero_subheadline: 'Your community hub for local news, dining, events, and more.',
  hero_badge:       '',
  hero_cta_primary_label: 'Explore',
  hero_cta_primary_href:  '/attractions',
  hero_cta_secondary_label: 'Find Restaurants',
  hero_cta_secondary_href:  '/food',
  hero_stats: [
    { value: '', label: 'Founded' },
    { value: '', label: 'Population' },
    { value: '', label: 'Events/Year' },
  ],

  // Footer
  footer_tagline: 'Your community hub.',
  footer_copyright: '',       // blank = auto-generate with site name + year
  footer_disclaimer: 'Independent community site. Not affiliated with city government.',

  // SEO
  seo_title_template: '{page} — {site}',   // {page} and {site} are replaced
  seo_default_image: '',                   // R2 key for default OG image
  google_analytics_id: '',
  google_search_console: '',

  // Features — toggle on/off
  features: {
    job_board:    true,
    dining:       true,
    news:         true,
    attractions:  true,
    contact_form: true,
    advertising:  true,
    chamber:      false,
    government:   false,
  },

  // Integrations
  resend_from_name:  '',      // "City Name Contact"
  maps_embed_url:    '',      // Google Maps embed URL for contact page

  // Meta
  version:    1,
  updated_at: '',
};

// ── R2 key for the config file ─────────────────────────────────
const CONFIG_KEY = 'config/site.json';

/**
 * Read site config from R2. Returns merged config with defaults.
 * Fast — R2 reads are cached at the edge.
 */
export async function getSiteConfig(env) {
  try {
    const file = await env.BUCKET.get(CONFIG_KEY);
    if (!file) return { ...DEFAULT_SITE_CONFIG };

    const raw    = await file.text();
    const stored = JSON.parse(raw);

    // Deep merge stored over defaults so new fields always have values
    return deepMerge(DEFAULT_SITE_CONFIG, stored);
  } catch (err) {
    console.error('getSiteConfig error:', err);
    return { ...DEFAULT_SITE_CONFIG };
  }
}

/**
 * Write site config to R2.
 */
export async function saveSiteConfig(env, config) {
  config.updated_at = new Date().toISOString();
  config.version    = (config.version || 1);

  await env.BUCKET.put(CONFIG_KEY, JSON.stringify(config, null, 2), {
    httpMetadata: { contentType: 'application/json' }
  });
  return config;
}

/**
 * Get just the nav items that are enabled, in order.
 */
export function getActiveNav(config) {
  return (config.navigation || [])
    .filter(n => n.show !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Build CSS custom properties string from config theme.
 */
export function buildThemeCSS(config) {
  const themes = {
    green: {
      '--primary':    '#1a3a2a',
      '--secondary':  '#2d5a3d',
      '--accent':     '#c9933a',
      '--accent-light': '#f0c878',
      '--bg':         '#faf8f3',
    },
    blue: {
      '--primary':    '#1a2a4a',
      '--secondary':  '#2d4a7a',
      '--accent':     '#e8a020',
      '--accent-light': '#f5cc70',
      '--bg':         '#f8f9fc',
    },
    red: {
      '--primary':    '#3a1a1a',
      '--secondary':  '#6a2020',
      '--accent':     '#c9933a',
      '--accent-light': '#f0c878',
      '--bg':         '#fdf8f8',
    },
    purple: {
      '--primary':    '#2a1a4a',
      '--secondary':  '#4a2a7a',
      '--accent':     '#c9933a',
      '--accent-light': '#f0c878',
      '--bg':         '#faf8fc',
    },
    dark: {
      '--primary':    '#0a0a0a',
      '--secondary':  '#1a1a2e',
      '--accent':     '#e0a030',
      '--accent-light': '#f5cc70',
      '--bg':         '#f5f5f5',
    },
    custom: null, // uses custom_colors
  };

  let colors = themes[config.theme] || themes.green;

  if (config.theme === 'custom' && config.custom_colors) {
    colors = {
      '--primary':    config.custom_colors.primary    || '#1a3a2a',
      '--secondary':  config.custom_colors.secondary  || '#2d5a3d',
      '--accent':     config.custom_colors.accent     || '#c9933a',
      '--accent-light': '#f0c878',
      '--bg':         config.custom_colors.background || '#faf8f3',
    };
  }

  return Object.entries(colors)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

// ── Deep merge utility ─────────────────────────────────────────
function deepMerge(defaults, overrides) {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (
      overrides[key] !== null &&
      typeof overrides[key] === 'object' &&
      !Array.isArray(overrides[key]) &&
      typeof defaults[key] === 'object' &&
      !Array.isArray(defaults[key])
    ) {
      result[key] = deepMerge(defaults[key] || {}, overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}
