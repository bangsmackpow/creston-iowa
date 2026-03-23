/**
 * js/analytics.js
 * Lightweight analytics beacon — no cookies, no tracking pixels.
 * Sends a simple page view ping to /api/analytics/beacon.
 * Safe to include on all pages. Fails silently if blocked.
 */
(function() {
  'use strict';
  // Don't track admin pages or bots
  if (location.pathname.startsWith('/admin')) return;
  if (navigator.doNotTrack === '1') return;

  function send() {
    try {
      fetch('/api/analytics/beacon', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ path: location.pathname }),
        keepalive: true,
      }).catch(() => {});
    } catch(e) {}
  }

  // Send on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', send);
  } else {
    send();
  }

  // Track soft navigation (for SPAs, not needed here but good practice)
  let lastPath = location.pathname;
  const observer = new MutationObserver(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      send();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
