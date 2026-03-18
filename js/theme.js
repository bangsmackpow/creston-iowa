/**
 * theme.js
 * Fetches site config from /api/config and applies CSS variables.
 * Runs on every page including static ones (homepage).
 * Uses localStorage to cache theme for instant application on repeat visits.
 */
(function() {
  const CACHE_KEY = 'creston_theme';
  const CACHE_TTL = 60 * 1000; // 1 minute

  function applyTheme(data) {
    if (!data || !data.themeCSS) return;

    const vars = {};
    data.themeCSS.split(';').forEach(pair => {
      const [k, v] = pair.split(':');
      if (k && v) vars[k.trim()] = v.trim();
    });

    const root = document.documentElement;

    if (vars['--primary'])      root.style.setProperty('--green-deep',  vars['--primary']);
    if (vars['--secondary'])    root.style.setProperty('--green-mid',   vars['--secondary']);
    if (vars['--accent'])       root.style.setProperty('--gold',        vars['--accent']);
    if (vars['--accent-light']) root.style.setProperty('--gold-light',  vars['--accent-light']);
    if (vars['--bg'])           root.style.setProperty('--cream',       vars['--bg']);

    // Also update nav background which is hardcoded in style.css
    if (vars['--primary']) {
      const style = document.getElementById('dynamic-theme') || document.createElement('style');
      style.id = 'dynamic-theme';
      style.textContent = `
        :root {
          --green-deep: ${vars['--primary']} !important;
          --green-mid:  ${vars['--secondary'] || vars['--primary']} !important;
          --gold:       ${vars['--accent'] || '#c9933a'} !important;
          --gold-light: ${vars['--accent-light'] || '#f0c878'} !important;
          --cream:      ${vars['--bg'] || '#faf8f3'} !important;
          --navy:       ${vars['--primary']} !important;
        }
        .site-nav { background: rgba(${hexToRgb(vars['--primary'])}, 0.97) !important; }
        .site-nav.scrolled { background: rgba(${hexToRgb(vars['--primary'])}, 0.99) !important; }
        .page-hero { background: ${vars['--primary']} !important; }
        .btn-primary { background: ${vars['--secondary'] || vars['--primary']} !important; border-color: ${vars['--secondary'] || vars['--primary']} !important; }
        .btn-gold { background: ${vars['--accent'] || '#c9933a'} !important; border-color: ${vars['--accent'] || '#c9933a'} !important; }
        .site-footer { background: ${vars['--primary']} !important; }
        h1, h2, h3, h4, h5 { color: ${vars['--primary']} !important; }
        .eyebrow { color: ${vars['--accent'] || '#c9933a'} !important; }
        a { color: ${vars['--secondary'] || vars['--primary']}; }
      `;
      if (!document.getElementById('dynamic-theme')) {
        document.head.appendChild(style);
      }
    }
  }

  function hexToRgb(hex) {
    if (!hex) return '26,58,42';
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`
      : '26,58,42';
  }

  async function loadTheme() {
    // Try cache first for instant application
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        applyTheme(data);
        // If cache is fresh enough, don't refetch
        if (Date.now() - ts < CACHE_TTL) return;
      }
    } catch(e) {}

    // Fetch fresh config
    try {
      const r    = await fetch('/api/config');
      const data = await r.json();
      applyTheme(data);

      // Cache it
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
    } catch(e) {
      // Network error — cached version already applied above, no action needed
    }
  }

  // Apply immediately if cached, then refresh
  loadTheme();
})();
