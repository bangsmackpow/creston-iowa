/**
 * src/shell.js
 * Renders the full HTML page shell — nav, footer, CSS.
 * Reads site configuration from R2 (config/site.json) dynamically.
 */

import { getSiteConfig, getActiveNav, buildThemeCSS } from './db/site.js';

export async function renderShell({
  title,
  description = '',
  eyebrow     = '',
  heading     = '',
  subheading  = '',
  content     = '',
  activeNav   = '',
  env         = null,
  config      = null,
  schema      = '',    // JSON-LD structured data
  canonical   = '',    // canonical URL
  ogImage     = '',    // page-specific OG image
}) {
  const cfg      = config || (env ? await getSiteConfig(env) : defaultConfig());
  const themeCSS = buildThemeCSS(cfg);
  const navItems = getActiveNav(cfg);
  const siteName = cfg.name || 'Community Hub';

  const pageTitle = title
    ? (cfg.seo_title_template || '{page} — {site}')
        .replace('{page}', title)
        .replace('{site}', siteName)
    : siteName;

  const hFont = encodeURIComponent(cfg.font_heading || 'Playfair Display');
  const bFont = encodeURIComponent(cfg.font_body    || 'Source Serif 4');
  const uFont = encodeURIComponent(cfg.font_ui      || 'DM Sans');
  const fonts = `https://fonts.googleapis.com/css2?family=${hFont}:ital,wght@0,400;0,700;0,900;1,400;1,700&family=${bFont}:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;1,8..60,300&family=${uFont}:wght@300;400;500;600&display=swap`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escHtml(description || cfg.description)}">
  <meta property="og:title"       content="${escHtml(pageTitle)}">
  <meta property="og:description" content="${escHtml(description || cfg.description)}">
  <meta property="og:type"        content="website">
  <meta property="og:url"         content="${escHtml(cfg.url || '')}">
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${escHtml(pageTitle)}">
  <meta name="twitter:description" content="${escHtml(description || cfg.description)}">
  ${ogImage || cfg.seo_default_image ? `<meta name="twitter:image" content="${escHtml(ogImage || (cfg.url + cfg.seo_default_image))}">` : ''}
  ${ogImage ? `<meta property="og:image" content="${escHtml(ogImage)}">` : cfg.seo_default_image ? `<meta property="og:image" content="${escHtml(cfg.url + cfg.seo_default_image)}">` : ''}
  ${canonical ? `<link rel="canonical" href="${escHtml(canonical)}">` : ''}
  ${cfg.google_search_console ? `<meta name="google-site-verification" content="${escHtml(cfg.google_search_console)}">` : ''}
  <title>${escHtml(pageTitle)}</title>
  ${cfg.favicon ? `<link rel="icon" href="/media/${escHtml(cfg.favicon)}" type="image/png">
  <link rel="shortcut icon" href="/media/${escHtml(cfg.favicon)}">` : '<link rel="icon" href="/favicon.ico">'}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${fonts}" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/pages.css">
  <link rel="stylesheet" href="/css/dynamic.css">
  <link rel="stylesheet" href="/css/theme.css">
  <link rel="stylesheet" href="/css/print.css" media="print">
  <style>
    :root {
      --green-deep:   ${cssVar(themeCSS, '--primary',      '#1a3a2a')};
      --green-mid:    ${cssVar(themeCSS, '--secondary',    '#2d5a3d')};
      --gold:         ${cssVar(themeCSS, '--accent',       '#c9933a')};
      --gold-light:   ${cssVar(themeCSS, '--accent-light', '#f0c878')};
      --cream:        ${cssVar(themeCSS, '--bg',           '#faf8f3')};
      --font-display: '${escHtml(cfg.font_heading || 'Playfair Display')}', Georgia, serif;
      --font-body:    '${escHtml(cfg.font_body    || 'Source Serif 4')}', Georgia, serif;
      --font-ui:      '${escHtml(cfg.font_ui      || 'DM Sans')}', system-ui, sans-serif;
    }
  </style>
  ${cfg.google_analytics_id ? gaScript(cfg.google_analytics_id) : ''}
  ${schema || ''}
</head>
<body data-print-date="${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}">
${cfg.alert && (cfg.alert.active === true || cfg.alert.active === 'true' || cfg.alert.active === 1) && cfg.alert.title ? `
<div class="emergency-alert alert-${escHtml(cfg.alert.level||'warning')}" id="emergency-alert"
     style="display:${cfg.alert.dismissible?'flex':'flex'}">
  <div class="alert-content">
    <span class="alert-icon">${cfg.alert.level==='emergency'?'🚨':cfg.alert.level==='warning'?'⚠️':'ℹ️'}</span>
    <div>
      <strong>${escHtml(cfg.alert.title||'')}</strong>
      ${cfg.alert.message ? `<span style="margin-left:8px;">${escHtml(cfg.alert.message)}</span>` : ''}
      ${cfg.alert.link    ? `<a href="${escHtml(cfg.alert.link)}" style="margin-left:8px;color:inherit;font-weight:700;">Learn more →</a>` : ''}
    </div>
  </div>
  ${cfg.alert.dismissible ? `<button onclick="dismissAlert()" class="alert-dismiss" aria-label="Dismiss">✕</button>` : ''}
</div>
<style>
  .emergency-alert { display:flex; justify-content:space-between; align-items:center; padding:10px 20px; gap:12px; position:sticky; top:0; z-index:999; font-family:var(--font-ui); font-size:.88rem; }
  .alert-emergency { background:#b84040; color:white; }
  .alert-warning   { background:#c9933a; color:white; }
  .alert-info      { background:#2d5a3d; color:white; }
  .alert-content   { display:flex; align-items:center; gap:10px; flex:1; }
  .alert-icon      { font-size:1.1rem; flex-shrink:0; }
  .alert-dismiss   { background:rgba(255,255,255,.2); border:none; color:white; width:28px; height:28px; border-radius:50%; cursor:pointer; font-size:1rem; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .alert-dismiss:hover { background:rgba(255,255,255,.35); }
</style>
<script>
  function dismissAlert() {
    const el = document.getElementById('emergency-alert');
    if (el) { el.style.display='none'; sessionStorage.setItem('alert_dismissed','1'); }
  }
  if (sessionStorage.getItem('alert_dismissed')==='1') {
    const el = document.getElementById('emergency-alert');
    if (el) el.style.display='none';
  }
</script>` : ''}
<a href="#main-content" class="skip-nav">Skip to main content</a>
${buildNav(navItems, cfg, activeNav)}
<section class="page-hero">
  <div class="container">
    ${eyebrow   ? `<div class="eyebrow">${escHtml(eyebrow)}</div>` : ''}
    <h1>${escHtml(heading)}</h1>
    ${subheading ? `<p class="lead">${escHtml(subheading)}</p>` : ''}
  </div>
</section>
<main>${content}</main>
${buildFooter(cfg)}
<script>
  async function subscribeNewsletter(e) {
    e.preventDefault();
    const email = document.getElementById('footer-email').value;
    const msg   = document.getElementById('footer-subscribe-msg');
    msg.textContent = '⏳ Subscribing...';
    try {
      const r = await fetch('/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        msg.textContent = '✅ Subscribed! Thank you.';
        document.getElementById('footer-email').value = '';
      } else {
        msg.textContent = '❌ ' + (d.error || 'Error. Please try again.');
      }
    } catch(e) { msg.textContent = '❌ Network error. Please try again.'; }
  }

  const nav=document.getElementById('site-nav');
  if(nav) window.addEventListener('scroll',()=>nav.classList.toggle('scrolled',window.scrollY>20));
  const tog=document.getElementById('nav-toggle'),mob=document.getElementById('mobile-menu');
  if(tog&&mob) tog.addEventListener('click',()=>mob.classList.toggle('open'));
  document.querySelectorAll('.nav-links a,.mobile-menu a').forEach(a=>{
    if(a.href===window.location.href) a.classList.add('active');
  });
</script>
</body>
</html>`;
}

// ── Nav ────────────────────────────────────────────────────────
function buildNav(navItems, cfg, activeNav) {
  const logo = cfg.logo_image
    ? `<img src="/media/${escHtml(cfg.logo_image)}" alt="${escHtml(cfg.name)}" style="height:36px;width:auto;object-fit:contain;">`
    : `<div class="logo-icon">${escHtml(cfg.logo_text || '🌾')}</div>`;

  const desktop = navItems.map(n => {
    const cls = [n.highlight ? 'nav-jobs' : '', activeNav === n.label ? 'active' : ''].filter(Boolean).join(' ');
    return `<a href="${escHtml(n.href)}"${cls ? ` class="${cls}"` : ''}>${escHtml(n.label)}</a>`;
  }).join('\n        ');

  const mobile = navItems.map(n =>
    `<a href="${escHtml(n.href)}"${n.highlight ? ' class="nav-jobs"' : ''}>${escHtml(n.label)}</a>`
  ).join('\n    ');

  return `<nav class="site-nav" id="site-nav">
  <div class="container nav-inner">
    <a href="/" class="nav-logo">
      ${logo}
      <span>${escHtml(cfg.name || 'My Town')}<small class="logo-sub">${escHtml(cfg.tagline || '')}</small></span>
    </a>
    <div class="nav-links" id="nav-links">${desktop}</div>
    <button class="nav-toggle" id="nav-toggle" aria-label="Toggle menu"><span></span><span></span><span></span></button>
  </div>
</nav>
<div class="mobile-menu" id="mobile-menu">${mobile}</div>`;
}

// ── Footer ─────────────────────────────────────────────────────
function buildFooter(cfg) {
  const year      = new Date().getFullYear();
  const copyright = cfg.footer_copyright || `© ${year} ${cfg.name || 'Community Site'}`;
  const navItems  = getActiveNav(cfg);
  const mid       = Math.ceil(navItems.length / 2);
  const col1      = navItems.slice(0, mid);
  const col2      = navItems.slice(mid);
  const links     = items => items.map(i => `<li><a href="${escHtml(i.href)}">${escHtml(i.label)}</a></li>`).join('');

  const socials = [
    ['social_facebook', 'f'], ['social_twitter', '𝕏'],
    ['social_instagram', '📷'], ['social_youtube', '▶'],
  ].filter(([k]) => cfg[k])
   .map(([k, icon]) => `<a href="${escHtml(cfg[k])}" class="social-link" target="_blank" rel="noopener">${icon}</a>`)
   .join('');

  return `<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <h3>${escHtml(cfg.name || 'My Town')}</h3>
        <p>${escHtml(cfg.footer_tagline || cfg.description || '')}</p>
        ${socials ? `<div class="social-links">${socials}</div>` : ''}
        <div class="footer-subscribe">
          <p style="font-size:.82rem;opacity:.8;margin:12px 0 8px;">Get community updates:</p>
          <form onsubmit="subscribeNewsletter(event)" style="display:flex;gap:6px;">
            <input type="email" placeholder="your@email.com" id="footer-email"
                   style="flex:1;padding:8px 12px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:white;border-radius:6px;font-size:.82rem;"
                   required>
            <button type="submit"
                    style="padding:8px 14px;background:var(--gold);color:white;border:none;border-radius:6px;font-size:.82rem;font-weight:600;cursor:pointer;flex-shrink:0;">
              Subscribe
            </button>
          </form>
          <div id="footer-subscribe-msg" style="font-size:.75rem;margin-top:6px;min-height:1em;opacity:.8;"></div>
        </div>
      </div>
      <div class="footer-col"><h4>Explore</h4><ul>${links(col1)}</ul></div>
      <div class="footer-col"><h4>More</h4><ul>${links(col2)}</ul></div>
      <div class="footer-col">
        <h4>Contact</h4>
        <ul>
          ${cfg.email_general   ? `<li><a href="mailto:${escHtml(cfg.email_general)}">${escHtml(cfg.email_general)}</a></li>` : ''}
          ${cfg.email_news      ? `<li><a href="mailto:${escHtml(cfg.email_news)}">News Tips</a></li>` : ''}
          ${cfg.email_jobs      ? `<li><a href="mailto:${escHtml(cfg.email_jobs)}">Job Board</a></li>` : ''}
          ${cfg.email_advertise ? `<li><a href="mailto:${escHtml(cfg.email_advertise)}">Advertise</a></li>` : ''}
        </ul>
      </div>
    </div>
  </div>
  <div class="container">
    <div class="footer-bottom">
      <span>${escHtml(copyright)}${cfg.footer_disclaimer ? ` — ${escHtml(cfg.footer_disclaimer)}` : ''}</span>
      <a href="/admin">Admin</a>
    </div>
  </div>
</footer>`;
}

// ── Helpers ────────────────────────────────────────────────────
export function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export { escHtml as escapeHtml };

export function adSlot(size = 'banner', config = null) {
  // If config passed and advertising feature is disabled, return empty string
  if (config && config.features && config.features.advertising === false) {
    return '';
  }
  return `<div class="ad-slot ad-${size}" role="complementary">
  <div class="ad-label">Advertisement</div>
  <strong>Your Business Here</strong>
  <a href="/advertise" class="btn btn-gold" style="font-size:.78rem;padding:6px 14px;margin-top:8px;">Advertise</a>
</div>`;
}

function cssVar(css, name, fallback) {
  const m = css.match(new RegExp(name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g,'\\$&') + ':([^;]+)'));
  return m ? m[1].trim() : fallback;
}

function gaScript(id) {
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${escHtml(id)}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${escHtml(id)}');</script>`;
}

function defaultConfig() {
  return {
    name: 'Community Hub', tagline: 'Your Town', description: 'Local community hub.',
    logo_text: '🌾', theme: 'green',
    font_heading: 'Playfair Display', font_body: 'Source Serif 4', font_ui: 'DM Sans',
    seo_title_template: '{page} — {site}',
    footer_disclaimer: 'Independent community site.',
    navigation: [
      { label: 'Home',        href: '/',           show: true },
      { label: 'News',        href: '/news',        show: true },
      { label: 'Dining',      href: '/food',        show: true },
      { label: 'Attractions', href: '/attractions', show: true },
      { label: 'Jobs',        href: '/jobs',        show: true, highlight: true },
      { label: 'Contact',     href: '/contact',     show: true },
    ],
    features: { job_board: true, dining: true, news: true, attractions: true, contact_form: true },
  };
}
