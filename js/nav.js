/* nav.js - shared nav injection */
(function() {
  // Load dynamic theme from site config
  if (!document.getElementById('creston-theme-script')) {
    const ts = document.createElement('script');
    ts.id = 'creston-theme-script';
    ts.src = '/js/theme.js';
    document.head.appendChild(ts);
  }

  const NAV_HTML = `
  <nav class="site-nav" id="site-nav">
    <div class="container nav-inner">
      <a href="/index.html" class="nav-logo">
        <div class="logo-icon">🌾</div>
        <span>
          Creston, Iowa
          <small class="logo-sub">The Crest of Iowa</small>
        </span>
      </a>
      <div class="nav-links" id="nav-links">
        <a href="/index.html">Home</a>
        <a href="/pages/about.html">About</a>
        <a href="/pages/dining.html">Dining</a>
        <a href="/pages/attractions.html">Attractions</a>
        <a href="/pages/news.html">News</a>
        <a href="/pages/government.html">Government</a>
        <a href="/pages/chamber.html">Chamber</a>
        <a href="/pages/jobs.html" class="nav-jobs">🧳 Job Board</a>
      </div>
      <button class="nav-toggle" id="nav-toggle" aria-label="Toggle menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>
  <div class="mobile-menu" id="mobile-menu">
    <a href="/index.html">🏠 Home</a>
    <a href="/pages/about.html">📖 About Creston</a>
    <a href="/pages/dining.html">🍽️ Dining</a>
    <a href="/pages/attractions.html">🎈 Attractions</a>
    <a href="/pages/news.html">📰 News</a>
    <a href="/pages/government.html">🏛️ Government</a>
    <a href="/pages/chamber.html">🤝 Chamber</a>
    <a href="/pages/jobs.html" class="nav-jobs">🧳 Post a Job / Find Work</a>
  </div>
  `;

  const FOOTER_HTML = `
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <h3>Creston, Iowa</h3>
          <p>The Crest of Iowa — a proud railroad heritage city nestled in the rolling hills of Union County. Your community hub for news, dining, events, and opportunity.</p>
          <div class="social-links">
            <a href="https://www.facebook.com/groups/crestoniowa" class="social-link" target="_blank" rel="noopener" aria-label="Facebook">f</a>
            <a href="https://twitter.com" class="social-link" target="_blank" rel="noopener" aria-label="Twitter">𝕏</a>
            <a href="https://instagram.com" class="social-link" target="_blank" rel="noopener" aria-label="Instagram">📷</a>
          </div>
        </div>
        <div class="footer-col">
          <h4>Explore</h4>
          <ul>
            <li><a href="/pages/dining.html">Restaurants & Dining</a></li>
            <li><a href="/pages/attractions.html">Attractions</a></li>
            <li><a href="/pages/news.html">Local News</a></li>
            <li><a href="/pages/chamber.html">Chamber of Commerce</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Community</h4>
          <ul>
            <li><a href="/pages/government.html">City Government</a></li>
            <li><a href="/pages/government.html#police">Police Department</a></li>
            <li><a href="/pages/government.html#emergency">Emergency Services</a></li>
            <li><a href="/pages/jobs.html">Job Board</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Site</h4>
          <ul>
            <li><a href="/pages/about.html">About Creston</a></li>
            <li><a href="/pages/advertise.html">Advertise With Us</a></li>
            <li><a href="/pages/contact.html">Contact</a></li>
            <li><a href="/pages/submit-news.html">Submit News</a></li>
          </ul>
        </div>
      </div>
    </div>
    <div class="container">
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} creston-iowa.com — Community site. Not affiliated with City of Creston government.</span>
        <a href="/pages/advertise.html">Advertise</a>
      </div>
    </div>
  </footer>
  `;


  // Inject nav
  const navTarget = document.getElementById('nav-placeholder');
  if (navTarget) navTarget.innerHTML = NAV_HTML;
  else document.body.insertAdjacentHTML('afterbegin', NAV_HTML);

  // Inject footer
  const footerTarget = document.getElementById('footer-placeholder');
  if (footerTarget) footerTarget.innerHTML = FOOTER_HTML;
  else document.body.insertAdjacentHTML('beforeend', FOOTER_HTML);

  // Always init nav behavior — runs after nav + footer are in the DOM
  initNav();
})();

function initNav() {
  // Scroll behavior
  const nav = document.getElementById('site-nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    });
  }

  // Mobile toggle
  const toggle = document.getElementById('nav-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  if (toggle && mobileMenu) {
    toggle.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
    });
    // Close menu when a link is clicked
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
      });
    });
  }

  // Active nav link
  const links = document.querySelectorAll('.nav-links a, .mobile-menu a');
  links.forEach(link => {
    if (link.href === window.location.href) link.classList.add('active');
  });
}