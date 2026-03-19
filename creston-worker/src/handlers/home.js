/**
 * src/handlers/home.js
 * Dynamic homepage — replaces static index.html.
 * Pulls live data from R2: latest news, live job count, upcoming events.
 * Reads site config for hero text, stats, and section visibility.
 */

import { getSiteConfig }  from '../db/site.js';
import { escHtml }        from '../shell.js';
import { parseMarkdown }  from '../markdown.js';

export async function handleHome(request, env, url) {
  const cfg   = await getSiteConfig(env);
  const alert = (cfg.alert?.active === true && cfg.alert?.title) ? cfg.alert : null;

  // Load live data in parallel
  const [newsItems, jobItems, eventItems] = await Promise.all([
    loadLatestContent(env, 'news/', 3),
    loadLatestContent(env, 'jobs/active/', 4),
    loadUpcomingEvents(env, 3),
  ]);

  const totalJobs = await countContent(env, 'jobs/active/');

  // Build sections based on config
  const sections = (cfg.homepage_sections || [])
    .filter(s => s.show !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(s => buildSection(s.id, cfg, newsItems, jobItems, eventItems, totalJobs))
    .filter(Boolean)
    .join('\n');

  const siteName = cfg.name || 'Creston, Iowa';
  const fonts    = buildFontsUrl(cfg);
  const themeCSS = buildInlineTheme(cfg);

  // Full page HTML with dynamic nav injected
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escHtml(cfg.description || '')}">
  <meta property="og:title"       content="${escHtml(siteName)}">
  <meta property="og:description" content="${escHtml(cfg.description || '')}">
  <meta property="og:type"        content="website">
  <meta property="og:url"         content="${escHtml(cfg.url || '')}">
  <meta name="twitter:card"       content="summary_large_image">
  <title>${escHtml(siteName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${fonts}" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/home.css">
  <link rel="stylesheet" href="/css/theme.css">
  <link rel="stylesheet" href="/css/print.css" media="print">
  ${cfg.favicon ? `<link rel="icon" href="/media/${escHtml(cfg.favicon)}" type="image/png">` : '<link rel="icon" href="/favicon.ico">'}
  <style>${themeCSS}
  .skip-nav { position:absolute; top:-100px; left:12px; z-index:9999; background:var(--green-deep,#1a3a2a); color:white; padding:10px 20px; border-radius:0 0 8px 8px; font-family:var(--font-ui,sans-serif); font-size:.88rem; font-weight:600; text-decoration:none; transition:top .15s; }
  .skip-nav:focus { top:0; outline:3px solid var(--gold,#c9933a); outline-offset:2px; }
</style>
  ${cfg.google_analytics_id ? gaScript(cfg.google_analytics_id) : ''}
</head>
<body data-print-date="${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}">

<a href="#main-content" class="skip-nav">Skip to main content</a>
${alert ? buildAlertBanner(alert) : ''}

${buildNav(cfg)}

<main id="main-content">
${buildHero(cfg)}

${sections}

</main>
${buildFooter(cfg)}

<script src="/js/home.js"></script>
<script src="/js/theme.js"></script>
<script>
  // Nav scroll + toggle
  const nav = document.getElementById('site-nav');
  if (nav) window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 20));
  const tog = document.getElementById('nav-toggle'), mob = document.getElementById('mobile-menu');
  if (tog && mob) tog.addEventListener('click', () => mob.classList.toggle('open'));

  // Newsletter subscribe
  async function subscribeNewsletter(e) {
    e.preventDefault();
    const email = document.getElementById('footer-email').value;
    const msg   = document.getElementById('footer-subscribe-msg');
    msg.textContent = '⏳ Subscribing...';
    try {
      const r = await fetch('/subscribe', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email}) });
      const d = await r.json();
      msg.textContent = r.ok && d.ok ? '✅ Subscribed! Thank you.' : '❌ '+(d.error||'Error. Please try again.');
      if (r.ok && d.ok) document.getElementById('footer-email').value = '';
    } catch(e) { msg.textContent = '❌ Network error.'; }
  }

  ${alert?.dismissible ? `
  function dismissAlert() {
    const el = document.getElementById('emergency-alert');
    if (el) { el.style.display='none'; sessionStorage.setItem('alert_dismissed','1'); }
  }
  if (sessionStorage.getItem('alert_dismissed')==='1') {
    const el = document.getElementById('emergency-alert');
    if (el) el.style.display='none';
  }` : ''}
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    }
  });
}

// ── Section builders ───────────────────────────────────────────
function buildSection(id, cfg, news, jobs, events, totalJobs) {
  switch(id) {
    case 'quicklinks': return buildQuickLinks(cfg);
    case 'news':       return buildNewsSection(cfg, news);
    case 'about':      return buildAboutSection(cfg);
    case 'dining':     return buildDiningSection(cfg);
    case 'attractions': return buildAttractionsSection(cfg);
    case 'jobs':       return buildJobsSection(cfg, jobs, totalJobs);
    case 'chamber':    return buildChamberSection(cfg);
    default:           return null;
  }
}

function buildQuickLinks(cfg) {
  const links = [
    { href:'/food',        emoji:'🍽️', label:'Dining'       },
    { href:'/attractions', emoji:'🎈', label:'Attractions'   },
    { href:'/news',        emoji:'📰', label:'Local News'    },
    { href:'/government',  emoji:'🏛️', label:'Government'    },
    { href:'/directory',   emoji:'🏪', label:'Directory'     },
    { href:'/meetings',    emoji:'📅', label:'Meetings'      },
    { href:'/jobs',        emoji:'💼', label:'Job Board'     },
    { href:'/about',       emoji:'📖', label:'About'         },
  ];
  return `
<section class="section section-quicklinks">
  <div class="container">
    <div class="quick-links-grid">
      ${links.map(l => `
      <a href="${l.href}" class="quick-link">
        <span class="quick-link-icon">${l.emoji}</span>
        <span>${escHtml(l.label)}</span>
      </a>`).join('')}
    </div>
  </div>
</section>`;
}

function buildNewsSection(cfg, news) {
  const featured = news[0];
  const rest     = news.slice(1);

  const featuredHtml = featured ? `
    <article class="news-featured">
      <div class="news-featured-img">
        <span class="news-cat">${escHtml(featured.meta.category || 'News')}</span>
        <div class="news-img-placeholder">📰</div>
      </div>
      <div class="news-featured-body">
        <div class="eyebrow">${escHtml(featured.meta.category || 'Latest')}</div>
        <h3><a href="/news/${escHtml(featured.slug)}">${escHtml(featured.meta.title || featured.slug)}</a></h3>
        <p class="lead">${escHtml(featured.meta.summary || '')}</p>
        <div class="flex gap-2 mt-2">
          <span class="tag tag-green">${escHtml(featured.meta.category || 'News')}</span>
          ${featured.meta.date ? `<span class="card-meta">📅 ${escHtml(featured.meta.date)}</span>` : ''}
        </div>
      </div>
    </article>` : '';

  const restHtml = rest.map(a => `
    <article class="news-card">
      <div class="news-card-icon">📰</div>
      <div class="news-card-body">
        <span class="card-tag">${escHtml(a.meta.category || 'News')}</span>
        <h4><a href="/news/${escHtml(a.slug)}">${escHtml(a.meta.title || a.slug)}</a></h4>
        <p>${escHtml((a.meta.summary || '').slice(0, 120))}${(a.meta.summary||'').length > 120 ? '…' : ''}</p>
        ${a.meta.date ? `<span class="card-meta">📅 ${escHtml(a.meta.date)}</span>` : ''}
      </div>
    </article>`).join('');

  return `
<section class="section" style="background:var(--cream);">
  <div class="container">
    <div class="layout-sidebar">
      <div>
        <div class="flex-between mb-3">
          <div>
            <div class="eyebrow">What's Happening</div>
            <h2>Latest from ${escHtml(cfg.name || 'Creston')}</h2>
          </div>
          <a href="/news" class="btn btn-outline">All News</a>
        </div>
        ${featuredHtml}
        ${rest.length ? `<div class="news-grid mt-3">${restHtml}</div>` : ''}
      </div>
      <aside>
        <div class="sidebar-widget" style="margin-bottom:20px;border-color:#b84040;">
          <div class="widget-header" style="background:#b84040;">🚨 Emergency &amp; Safety</div>
          <div class="widget-body">
            <p style="font-size:.9rem;margin-bottom:12px;">For emergencies, always call <strong>911</strong>.</p>
            <div class="info-block" style="padding:10px 0;">
              <div class="info-icon">🚔</div>
              <div><h4>Police Non-Emergency</h4><p><a href="tel:6417828402">(641) 782-8402</a></p></div>
            </div>
            <div class="info-block" style="padding:10px 0;border:none;">
              <div class="info-icon">🏛️</div>
              <div><h4>City Hall</h4><p><a href="https://www.crestoniowa.gov" target="_blank">crestoniowa.gov</a></p></div>
            </div>
          </div>
        </div>
        <div class="sidebar-widget">
          <div class="widget-header">🔗 Quick Links</div>
          <div class="widget-body">
            <ul style="list-style:none;margin:0;padding:0;">
              <li style="padding:6px 0;border-bottom:1px solid #f0f0f0;"><a href="/meetings">📅 Meeting Schedule</a></li>
              <li style="padding:6px 0;border-bottom:1px solid #f0f0f0;"><a href="/events">🎈 Upcoming Events</a></li>
              <li style="padding:6px 0;border-bottom:1px solid #f0f0f0;"><a href="/directory">🏪 Business Directory</a></li>
              <li style="padding:6px 0;"><a href="/contact">✉️ Contact Us</a></li>
            </ul>
          </div>
        </div>
      </aside>
    </div>
  </div>
</section>`;
}

function buildAboutSection(cfg) {
  const stats = (cfg.hero_stats || []).filter(s => s.value);
  return `
<section class="section about-strip" style="background:var(--green-deep);color:white;">
  <div class="container">
    <div class="about-strip-inner">
      <div class="about-strip-text">
        <div class="eyebrow" style="color:var(--gold-light);">Our Community</div>
        <h2 style="color:white;">${escHtml(cfg.hero_headline || cfg.name || 'Welcome')}</h2>
        <p style="color:rgba(255,255,255,.82);">${escHtml(cfg.hero_subheadline || cfg.description || '')}</p>
        <a href="/about" class="btn btn-gold mt-2">Read Our Full Story</a>
      </div>
      ${stats.length ? `
      <div class="about-strip-stats">
        ${stats.map(s => `
        <div class="about-stat">
          <div class="about-stat-value">${escHtml(s.value)}</div>
          <div class="about-stat-label">${escHtml(s.label)}</div>
        </div>`).join('')}
      </div>` : ''}
    </div>
  </div>
</section>`;
}

function buildDiningSection(cfg) {
  return `
<section class="section" style="background:white;">
  <div class="container">
    <div class="section-header-row">
      <div>
        <div class="eyebrow">Eat Local</div>
        <h2 class="section-title">${escHtml(cfg.name || 'Creston')} Dining</h2>
        <p class="section-intro">From hometown chophouses to Mexican cantinas — the local dining scene runs deeper than you'd expect.</p>
      </div>
      <a href="/food" class="btn btn-outline">View All Restaurants</a>
    </div>
    <div style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;">
      <a href="/food?category=american"  class="cat-pill">🍔 American</a>
      <a href="/food?category=mexican"   class="cat-pill">🌮 Mexican</a>
      <a href="/food?category=pizza"     class="cat-pill">🍕 Pizza</a>
      <a href="/food?category=bar"       class="cat-pill">🍺 Bar &amp; Grill</a>
      <a href="/food?category=cafe"      class="cat-pill">☕ Café</a>
      <a href="/food?category=chinese"   class="cat-pill">🥡 Chinese</a>
    </div>
  </div>
</section>`;
}

function buildAttractionsSection(cfg) {
  const attractions = [
    { href:'/attractions/balloon-days',    emoji:'🎈', title:'Balloon Days',       sub:'2nd largest balloon festival in Iowa' },
    { href:'/attractions/green-valley-lakes', emoji:'🎣', title:'Green Valley Lakes', sub:'2,100+ acres of lakes &amp; trails' },
    { href:'/attractions/mural-project',   emoji:'🎨', title:'Mural Project',       sub:'50+ murals in Uptown Creston' },
    { href:'/attractions/cb-q-depot',      emoji:'🚂', title:'CB&Q Depot',          sub:'Historic 1899 railroad landmark' },
    { href:'/attractions/union-county-museum', emoji:'🏛️', title:'County Museum',  sub:'Local history &amp; exhibits' },
    { href:'/attractions/prairie-rail-trail', emoji:'🚴', title:'Prairie Rail Trail', sub:'Multi-use trail system' },
  ];
  return `
<section class="section" style="background:var(--cream);">
  <div class="container">
    <div class="section-header-row">
      <div>
        <div class="eyebrow">Explore</div>
        <h2 class="section-title">Attractions &amp; Events</h2>
      </div>
      <a href="/attractions" class="btn btn-outline">All Attractions</a>
    </div>
    <div class="attract-grid mt-3">
      ${attractions.map(a => `
      <a href="${a.href}" class="attract-card">
        <div class="attract-emoji">${a.emoji}</div>
        <h4>${a.title}</h4>
        <p>${a.sub}</p>
      </a>`).join('')}
    </div>
  </div>
</section>`;
}

function buildJobsSection(cfg, jobs, totalJobs) {
  const miniJobs = jobs.map(j => `
    <div class="mini-job">
      <div>
        <strong>${escHtml(j.meta.title || j.slug)}</strong>
        <span>${escHtml(j.meta.company || '')}</span>
      </div>
      ${j.meta.type ? `<span class="tag tag-green">${escHtml(j.meta.type)}</span>` :
        j.meta.pay  ? `<span class="tag tag-gold">${escHtml(j.meta.pay)}</span>`  : ''}
    </div>`).join('');

  return `
<section class="section jobs-promo">
  <div class="container">
    <div class="jobs-promo-inner">
      <div class="jobs-promo-text">
        <div class="eyebrow" style="color:var(--gold-light);">${escHtml(cfg.name || 'Local')} Job Board</div>
        <h2 style="color:white;">Find Work. Hire Local.</h2>
        <p style="color:rgba(255,255,255,.78);">
          Connecting ${escHtml(cfg.name || 'local')}-area job seekers with local employers.
          Businesses can post open positions directly — reaching the right talent in the area.
        </p>
        <ul class="jobs-features">
          <li>✅ Flat-fee job postings for local employers</li>
          <li>✅ 30-day listing with featured placement options</li>
          <li>✅ All industries: healthcare, trades, retail, education</li>
        </ul>
        <div class="flex gap-2 mt-3" style="flex-wrap:wrap;">
          <a href="/jobs" class="btn btn-gold btn-lg">Browse Open Jobs</a>
          <a href="/contact?type=Job+Board+%E2%80%94+Post+a+Job" class="btn btn-outline-white btn-lg">Post a Job ($49)</a>
        </div>
      </div>
      <div class="jobs-promo-board">
        <div class="mini-jobs">
          ${miniJobs || '<div class="mini-job"><div><strong>Browse openings</strong><span>View the job board →</span></div></div>'}
          <a href="/jobs" class="view-all-jobs">
            View All ${totalJobs > 0 ? totalJobs : ''} Open Position${totalJobs !== 1 ? 's' : ''} →
          </a>
        </div>
      </div>
    </div>
  </div>
</section>`;
}

function buildChamberSection(cfg) {
  return `
<section class="section bg-white">
  <div class="container">
    <div class="chamber-inner">
      <div>
        <div class="eyebrow">Business Community</div>
        <h2>Chamber of Commerce</h2>
        <p>The Greater ${escHtml(cfg.name || 'Creston')} Chamber represents local businesses, organizes community events, and advocates for a thriving regional economy.</p>
        <div class="flex gap-2 mt-3" style="flex-wrap:wrap;">
          <a href="/chamber" class="btn btn-primary">Chamber Info &amp; Resources</a>
          <a href="/directory" class="btn btn-outline">🏪 Business Directory</a>
        </div>
      </div>
      <div class="chamber-links">
        <a href="/directory" class="tag tag-gold" style="text-decoration:none;">Get Listed Free</a>
        <a href="/contact?type=Advertising+Inquiry" class="tag tag-navy" style="text-decoration:none;margin-left:8px;">Advertise</a>
      </div>
    </div>
  </div>
</section>`;
}

// ── Alert banner ───────────────────────────────────────────────
function buildAlertBanner(alert) {
  const levelMap = { emergency: '🚨', warning: '⚠️', info: 'ℹ️' };
  const icon = levelMap[alert.level] || '⚠️';
  return `
<div class="emergency-alert alert-${escHtml(alert.level||'warning')}" id="emergency-alert" style="display:flex;">
  <div class="alert-content">
    <span class="alert-icon">${icon}</span>
    <div>
      <strong>${escHtml(alert.title||'')}</strong>
      ${alert.message ? `<span style="margin-left:8px;">${escHtml(alert.message)}</span>` : ''}
      ${alert.link    ? `<a href="${escHtml(alert.link)}" style="margin-left:8px;color:inherit;font-weight:700;">Learn more →</a>` : ''}
    </div>
  </div>
  ${alert.dismissible ? `<button onclick="dismissAlert()" class="alert-dismiss" aria-label="Dismiss">✕</button>` : ''}
</div>
<style>
  .emergency-alert { display:flex; justify-content:space-between; align-items:center; padding:10px 20px; gap:12px; position:sticky; top:0; z-index:999; font-family:var(--font-ui); font-size:.88rem; }
  .alert-emergency { background:#b84040; color:white; }
  .alert-warning   { background:#c9933a; color:white; }
  .alert-info      { background:#2d5a3d; color:white; }
  .alert-content   { display:flex; align-items:center; gap:10px; flex:1; }
  .alert-dismiss   { background:rgba(255,255,255,.2); border:none; color:white; width:28px; height:28px; border-radius:50%; cursor:pointer; font-size:1rem; flex-shrink:0; }
</style>`;
}

// ── Nav ────────────────────────────────────────────────────────
function buildNav(cfg) {
  const navItems = (cfg.navigation || []).filter(n => n.show !== false);
  const logo = cfg.logo_image
    ? `<img src="/media/${escHtml(cfg.logo_image)}" alt="${escHtml(cfg.name)}" style="height:36px;width:auto;">`
    : `<div class="logo-icon">${escHtml(cfg.logo_text || '🌾')}</div>`;

  const desktop = navItems.map(n => {
    const cls = n.highlight ? ' class="nav-jobs"' : '';
    return `<a href="${escHtml(n.href)}"${cls}>${escHtml(n.label)}</a>`;
  }).join('\n        ');

  const mobile = navItems.map(n =>
    `<a href="${escHtml(n.href)}"${n.highlight ? ' class="nav-jobs"' : ''}>${escHtml(n.label)}</a>`
  ).join('\n    ');

  return `<nav class="site-nav" id="site-nav" role="navigation" aria-label="Main navigation">
  <div class="container nav-inner">
    <a href="/" class="nav-logo">
      ${logo}
      <span>${escHtml(cfg.name || 'My Town')}<small class="logo-sub">${escHtml(cfg.tagline || '')}</small></span>
    </a>
    <div class="nav-links" id="nav-links">${desktop}</div>
    <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="mobile-menu"><span></span><span></span><span></span></button>
  </div>
</nav>
<div class="mobile-menu" id="mobile-menu">${mobile}</div>`;
}

// ── Hero ───────────────────────────────────────────────────────
function buildHero(cfg) {
  const stats = (cfg.hero_stats || []).filter(s => s.value);
  return `
<section class="hero">
  <div class="hero-bg"></div>
  <div class="container hero-content">
    ${cfg.hero_badge ? `<div class="hero-badge">${escHtml(cfg.hero_badge)}</div>` : ''}
    <h1 class="hero-title">${escHtml(cfg.hero_headline || cfg.name || 'Welcome')}</h1>
    <p class="hero-sub">${escHtml(cfg.hero_subheadline || cfg.description || '')}</p>
    <div class="hero-cta">
      <a href="${escHtml(cfg.hero_cta_primary_href || '/attractions')}" class="btn btn-gold btn-lg">
        ${escHtml(cfg.hero_cta_primary_label || 'Explore')}
      </a>
      <a href="${escHtml(cfg.hero_cta_secondary_href || '/food')}" class="btn btn-outline-white btn-lg">
        ${escHtml(cfg.hero_cta_secondary_label || 'Find Restaurants')}
      </a>
    </div>
    ${stats.length ? `
    <div class="hero-stats">
      ${stats.map(s => `
      <div class="hero-stat">
        <div class="hero-stat-value">${escHtml(s.value)}</div>
        <div class="hero-stat-label">${escHtml(s.label)}</div>
      </div>`).join('')}
    </div>` : ''}
  </div>
</section>`;
}

// ── Footer ─────────────────────────────────────────────────────
function buildFooter(cfg) {
  const year      = new Date().getFullYear();
  const copyright = cfg.footer_copyright || `© ${year} ${cfg.name || 'Community Site'}`;
  const navItems  = (cfg.navigation || []).filter(n => n.show !== false);
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

  return `<footer class="site-footer" role="contentinfo">
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
                   style="flex:1;padding:8px 12px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:white;border-radius:6px;font-size:.82rem;" required>
            <button type="submit" style="padding:8px 14px;background:var(--gold);color:white;border:none;border-radius:6px;font-size:.82rem;font-weight:600;cursor:pointer;flex-shrink:0;">
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

// ── Data loaders ───────────────────────────────────────────────
async function loadLatestContent(env, prefix, limit) {
  try {
    const listed = await env.BUCKET.list({ prefix });
    const items  = [];
    for (const obj of listed.objects.filter(o => o.key.endsWith('.md')).slice(0, limit * 3)) {
      const file = await env.BUCKET.get(obj.key);
      if (!file) continue;
      const raw    = await file.text();
      const parsed = parseMarkdown(raw);
      const slug   = obj.key.split('/').pop().replace('.md', '');
      items.push({ slug, meta: parsed.meta, modified: obj.uploaded });
    }
    items.sort((a, b) => {
      const da = a.meta.date || a.meta.posted || (a.modified ? new Date(a.modified).toISOString() : '') || '';
      const db = b.meta.date || b.meta.posted || (b.modified ? new Date(b.modified).toISOString() : '') || '';
      return String(db).localeCompare(String(da));
    });
    return items.slice(0, limit);
  } catch { return []; }
}

async function loadUpcomingEvents(env, limit) {
  try {
    const today  = new Date().toISOString().split('T')[0];
    const listed = await env.BUCKET.list({ prefix: 'events/' });
    const items  = [];
    for (const obj of listed.objects.filter(o => o.key.endsWith('.md'))) {
      const file = await env.BUCKET.get(obj.key);
      if (!file) continue;
      const raw    = await file.text();
      const parsed = parseMarkdown(raw);
      if ((parsed.meta.date || '') >= today) {
        items.push({ slug: obj.key.replace('events/', '').replace('.md', ''), meta: parsed.meta });
      }
    }
    items.sort((a, b) => (a.meta.date || '').localeCompare(b.meta.date || ''));
    return items.slice(0, limit);
  } catch { return []; }
}

async function countContent(env, prefix) {
  try {
    const listed = await env.BUCKET.list({ prefix });
    return listed.objects.filter(o => o.key.endsWith('.md')).length;
  } catch { return 0; }
}

// ── CSS/Font helpers ───────────────────────────────────────────
function buildFontsUrl(cfg) {
  const h = encodeURIComponent(cfg.font_heading || 'Playfair Display');
  const b = encodeURIComponent(cfg.font_body    || 'Source Serif 4');
  const u = encodeURIComponent(cfg.font_ui      || 'DM Sans');
  return `https://fonts.googleapis.com/css2?family=${h}:ital,wght@0,400;0,700;0,900;1,400;1,700&family=${b}:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;1,8..60,300&family=${u}:wght@300;400;500;600&display=swap`;
}

function buildInlineTheme(cfg) {
  // Theme vars inlined here for homepage (avoids circular import)
  const themes = {
    green:  { primary:'#1a3a2a', secondary:'#2d5a3d', accent:'#c9933a', 'accent-light':'#f0c878', bg:'#faf8f3' },
    blue:   { primary:'#1a2a4a', secondary:'#2d4a7a', accent:'#e8a020', 'accent-light':'#f5cc70', bg:'#f8f9fc' },
    red:    { primary:'#3a1a1a', secondary:'#6a2020', accent:'#c9933a', 'accent-light':'#f0c878', bg:'#fdf8f8' },
    purple: { primary:'#2a1a4a', secondary:'#4a2a7a', accent:'#c9933a', 'accent-light':'#f0c878', bg:'#faf8fc' },
    dark:   { primary:'#0a0a0a', secondary:'#1a1a2e', accent:'#e0a030', 'accent-light':'#f5cc70', bg:'#f5f5f5' },
  };

  let t = themes[cfg.theme] || themes.green;
  if (cfg.theme === 'custom' && cfg.custom_colors) {
    t = { primary: cfg.custom_colors.primary || '#1a3a2a', secondary: cfg.custom_colors.secondary || '#2d5a3d', accent: cfg.custom_colors.accent || '#c9933a', 'accent-light': '#f0c878', bg: cfg.custom_colors.background || '#faf8f3' };
  }

  return `:root {
    --green-deep: ${t.primary};
    --green-mid:  ${t.secondary};
    --gold:       ${t.accent};
    --gold-light: ${t['accent-light']};
    --cream:      ${t.bg};
    --font-display: '${(cfg.font_heading||'Playfair Display').replace(/'/g,"\\'")}', Georgia, serif;
    --font-body:    '${(cfg.font_body||'Source Serif 4').replace(/'/g,"\\'")}', Georgia, serif;
    --font-ui:      '${(cfg.font_ui||'DM Sans').replace(/'/g,"\\'")}', system-ui, sans-serif;
  }`;
}

function gaScript(id) {
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${escHtml(id)}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${escHtml(id)}');</script>`;
}
