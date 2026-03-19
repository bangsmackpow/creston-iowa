/**
 * theme.js
 * Applies dynamic CSS variables from site config.
 * Loaded in <head> of every page for instant theme application.
 * Fetches /api/config and caches in localStorage for 60 seconds.
 */
(function() {
  const CACHE_KEY = 'creston_theme_v2';
  const CACHE_TTL = 60 * 1000; // 60 seconds

  function applyTheme(data) {
    if (!data || !data.themeCSS) return;

    // Parse the CSS variable string
    const vars = {};
    data.themeCSS.split(';').forEach(pair => {
      const idx = pair.indexOf(':');
      if (idx === -1) return;
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      if (k && v) vars[k] = v;
    });

    if (!vars['--primary']) return;

    // Inject or update a <style> block with !important overrides
    let style = document.getElementById('creston-dynamic-theme');
    if (!style) {
      style = document.createElement('style');
      style.id = 'creston-dynamic-theme';
      document.head.appendChild(style);
    }

    const primary      = vars['--primary']       || '#1a3a2a';
    const secondary    = vars['--secondary']     || '#2d5a3d';
    const accent       = vars['--accent']        || '#c9933a';
    const accentLight  = vars['--accent-light']  || '#f0c878';
    const bg           = vars['--bg']            || '#faf8f3';
    const rgb          = hexToRgb(primary);

    style.textContent = `
      :root {
        --green-deep:  ${primary}     !important;
        --green-mid:   ${secondary}   !important;
        --gold:        ${accent}      !important;
        --gold-light:  ${accentLight} !important;
        --cream:       ${bg}          !important;
        --navy:        ${primary}     !important;
        --navy-mid:    ${secondary}   !important;
      }
      .site-nav {
        background: rgba(${rgb}, 0.97) !important;
      }
      .site-nav.scrolled {
        background: rgba(${rgb}, 0.99) !important;
      }
      .page-hero {
        background: ${primary} !important;
      }
      .hero {
        background: linear-gradient(135deg, rgba(${rgb},0.96) 0%, rgba(${rgb},0.88) 100%) !important;
      }
      .site-footer {
        background: ${primary} !important;
      }
      .bg-green-deep {
        background: ${primary} !important;
      }
      .btn-primary, .btn-primary:visited {
        background: ${secondary} !important;
        border-color: ${secondary} !important;
      }
      .btn-primary:hover {
        background: ${primary} !important;
        border-color: ${primary} !important;
      }
      .btn-gold {
        background: ${accent} !important;
        border-color: ${accent} !important;
      }
      .eyebrow {
        color: ${accent} !important;
      }
      .nav-jobs {
        background: ${accent} !important;
      }
      h1, h2, h3, h4, h5 {
        color: ${primary} !important;
      }
      .page-hero h1,
      .hero-title,
      .about-strip h2,
      .jobs-promo h2 {
        color: white !important;
      }
      a {
        color: ${secondary};
      }
      a:hover {
        color: ${accent};
      }
      .quick-link:hover,
      .attract-card:hover {
        border-color: ${secondary} !important;
        color: ${primary} !important;
      }
      .widget-header,
      .admin-header {
        background: ${primary} !important;
      }
      .filter-btn.active {
        background: ${secondary} !important;
        border-color: ${secondary} !important;
      }
      .tag-green {
        background: color-mix(in srgb, ${primary} 10%, white) !important;
        color: ${secondary} !important;
      }
    `;
  }

  function hexToRgb(hex) {
    if (!hex) return '26,58,42';
    const clean  = hex.replace('#', '');
    const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(clean);
    return result
      ? `${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)}`
      : '26,58,42';
  }

  // Clear old cache key
  try { localStorage.removeItem('creston_theme'); } catch(e) {}

  // 1. Apply from localStorage immediately (synchronous — no flash)
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data } = JSON.parse(cached);
      applyTheme(data);
    }
  } catch(e) {}

  // 2. Fetch fresh config asynchronously
  fetch('/api/config')
    .then(r => r.json())
    .then(data => {
      applyTheme(data);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
      } catch(e) {}
    })
    .catch(() => {});

})();
