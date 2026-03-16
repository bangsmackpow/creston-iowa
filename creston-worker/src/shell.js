/**
 * shell.js
 * Renders the full HTML page shell — nav, footer, CSS imports.
 * Keeps everything consistent with the Cloudflare Pages static site.
 */

export function renderShell({ title, description = '', eyebrow = '', heading = '', subheading = '', content = '', activeNav = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escHtml(description)}">
  <title>${escHtml(title)} — Creston, Iowa</title>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/pages.css">
  <link rel="stylesheet" href="/css/dynamic.css">
</head>
<body>

${renderNav(activeNav)}

<section class="page-hero">
  <div class="container">
    ${eyebrow ? `<div class="eyebrow">${escHtml(eyebrow)}</div>` : ''}
    <h1>${escHtml(heading)}</h1>
    ${subheading ? `<p class="lead">${escHtml(subheading)}</p>` : ''}
  </div>
</section>

<main>
  ${content}
</main>

${renderFooter()}

<script src="/js/nav.js"></script>
</body>
</html>`;
}

function renderNav(active) {
  const links = [
    { href: '/index.html',         label: 'Home' },
    { href: '/pages/about.html',   label: 'About' },
    { href: '/food',               label: 'Dining' },
    { href: '/attractions',        label: 'Attractions' },
    { href: '/news',               label: 'News' },
    { href: '/pages/government.html', label: 'Government' },
    { href: '/pages/chamber.html', label: 'Chamber' },
  ];

  const navLinks = links.map(l =>
    `<a href="${l.href}"${active === l.label ? ' class="active"' : ''}>${l.label}</a>`
  ).join('\n        ');

  return `<nav class="site-nav" id="site-nav">
  <div class="container nav-inner">
    <a href="/index.html" class="nav-logo">
      <div class="logo-icon">🌾</div>
      <span>
        Creston, Iowa
        <small class="logo-sub">The Crest of Iowa</small>
      </span>
    </a>
    <div class="nav-links" id="nav-links">
      ${navLinks}
      <a href="/jobs" class="nav-jobs${active === 'Jobs' ? ' active' : ''}">🧳 Job Board</a>
    </div>
    <button class="nav-toggle" id="nav-toggle" aria-label="Toggle menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>
<div class="mobile-menu" id="mobile-menu">
  <a href="/index.html">🏠 Home</a>
  <a href="/pages/about.html">📖 About Creston</a>
  <a href="/food">🍽️ Dining</a>
  <a href="/attractions">🎈 Attractions</a>
  <a href="/news">📰 News</a>
  <a href="/pages/government.html">🏛️ Government</a>
  <a href="/pages/chamber.html">🤝 Chamber</a>
  <a href="/jobs" class="nav-jobs">🧳 Job Board</a>
</div>`;
}

function renderFooter() {
  const year = new Date().getFullYear();
  return `<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <h3>Creston, Iowa</h3>
        <p>The Crest of Iowa — your community hub for news, dining, attractions, jobs, and everything Union County.</p>
        <div class="social-links">
          <a href="https://www.facebook.com/groups/crestoniowa" class="social-link" target="_blank" rel="noopener" aria-label="Facebook">f</a>
        </div>
      </div>
      <div class="footer-col">
        <h4>Explore</h4>
        <ul>
          <li><a href="/food">Restaurants & Dining</a></li>
          <li><a href="/attractions">Attractions</a></li>
          <li><a href="/news">Local News</a></li>
          <li><a href="/pages/chamber.html">Chamber</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Community</h4>
        <ul>
          <li><a href="/pages/government.html">City Government</a></li>
          <li><a href="/pages/government.html#police">Police Department</a></li>
          <li><a href="/jobs">Job Board</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Site</h4>
        <ul>
          <li><a href="/pages/advertise.html">Advertise</a></li>
          <li><a href="/pages/contact.html">Contact</a></li>
          <li><a href="/admin">Admin</a></li>
        </ul>
      </div>
    </div>
  </div>
  <div class="container">
    <div class="footer-bottom">
      <span>© ${year} creston-iowa.com — Independent community site.</span>
      <a href="/pages/advertise.html">Advertise</a>
    </div>
  </div>
</footer>`;
}

export function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render an ad slot placeholder
 */
export function adSlot(size = 'banner', label = 'Advertisement') {
  return `<div class="ad-slot ad-${size}" role="complementary" aria-label="${label}">
  <div class="ad-label">Advertisement</div>
  <strong>Your Business Here</strong>
  <a href="/pages/advertise.html" class="btn btn-gold" style="font-size:.78rem;padding:6px 14px;margin-top:8px;">Advertise</a>
</div>`;
}
