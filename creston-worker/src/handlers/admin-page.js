/**
 * src/handlers/admin-page.js
 * Standalone adminPage() shell — extracted from admin.js to break
 * the circular import chain where admin.js imported handlers that
 * imported adminPage back from admin.js.
 *
 * Import THIS file, not admin.js, whenever you need adminPage().
 */

import { escapeHtml } from '../shell.js';

export function adminPage(title, body, user) {
  const name    = user?.name || user?.email || 'Admin';
  const sha     = user?._env?.CF_PAGES_COMMIT_SHA || '';
  const branch  = user?._env?.CF_PAGES_BRANCH     || '';
  const short   = sha ? sha.slice(0, 7) : '';
  const isProd  = !branch || branch === 'main' || branch === 'master';

  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} — Admin</title>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/admin.css">
</head>
<body class="admin-body">

<aside class="admin-sidebar" id="admin-sidebar">
  <div class="admin-sidebar-inner">
    <div class="sidebar-brand">
      <a href="/admin" class="sidebar-logo">🌾 Creston</a>
      ${short ? `<div class="sidebar-build" title="Build: ${short}${branch ? ' on ' + escapeHtml(branch) : ''}">
        ${short}${!isProd ? ` <span class="branch-pill">${escapeHtml(branch)}</span>` : ''}
      </div>` : ''}
    </div>

    <nav class="sidebar-nav" aria-label="Admin navigation">
      <div class="nav-group">
        <div class="nav-group-label">Content</div>
        <a href="/admin/news"        class="nav-item" data-p="/admin/news">📰 News</a>
        <a href="/admin/food"        class="nav-item" data-p="/admin/food">🍽️ Dining</a>
        <a href="/admin/attractions" class="nav-item" data-p="/admin/attractions">🎈 Attractions</a>
        <a href="/admin/jobs"        class="nav-item" data-p="/admin/jobs">💼 Jobs</a>
        <a href="/admin/events"      class="nav-item" data-p="/admin/events">📅 Events</a>
        <a href="/admin/meetings"    class="nav-item" data-p="/admin/meetings">🏛️ Meetings</a>
        <a href="/admin/directory"   class="nav-item" data-p="/admin/directory">🏪 Directory</a>
        <a href="/admin/pages"       class="nav-item" data-p="/admin/pages">📄 Pages</a>
        <a href="/admin/documents"   class="nav-item" data-p="/admin/documents">📂 Documents</a>
        <a href="/admin/notices"     class="nav-item" data-p="/admin/notices">📢 Notices</a>
        <a href="/admin/drafts"      class="nav-item" data-p="/admin/drafts">📝 Drafts</a>
        <a href="/admin/media"       class="nav-item" data-p="/admin/media">🖼️ Media</a>
      </div>

      <div class="nav-group">
        <div class="nav-group-label">Citizen Services</div>
        <a href="/admin/311"         class="nav-item" data-p="/admin/311">📋 311 Requests</a>
        <a href="/admin/foia"        class="nav-item" data-p="/admin/foia">⚖️ FOIA</a>
        <a href="/admin/bulletin"    class="nav-item" data-p="/admin/bulletin">📌 Bulletin</a>
      </div>

      <div class="nav-group">
        <div class="nav-group-label">Communications</div>
        <a href="/admin/newsletter"  class="nav-item" data-p="/admin/newsletter">📧 Newsletter</a>
        <a href="/admin/suggestions" class="nav-item" data-p="/admin/suggestions">🤖 AI Suggestions</a>
      </div>

      <div class="nav-group">
        <div class="nav-group-label">Site</div>
        <a href="/admin/analytics"   class="nav-item" data-p="/admin/analytics">📊 Analytics</a>
        <a href="/admin/billing"     class="nav-item" data-p="/admin/billing">💳 Billing</a>
        <a href="/admin/companies"   class="nav-item" data-p="/admin/companies">🏢 Companies</a>
        <a href="/admin/users"       class="nav-item" data-p="/admin/users">👥 Users</a>
        <a href="/admin/settings"    class="nav-item" data-p="/admin/settings">⚙️ Settings</a>
      </div>
    </nav>

    <div class="sidebar-footer">
      <a href="/admin/account">👤 ${escapeHtml(name)}</a>
      <a href="/" target="_blank">View Site ↗</a>
      <a href="/admin/logout">Log out</a>
    </div>
  </div>
</aside>

<div class="admin-overlay" id="admin-overlay" onclick="closeSidebar()"></div>

<div class="admin-wrap">
  <header class="admin-topbar">
    <button class="topbar-menu-btn" onclick="toggleSidebar()" aria-label="Toggle menu">☰</button>
    <div class="topbar-title">${escapeHtml(title)}</div>
    <a href="/" target="_blank" class="topbar-site-link">View Site ↗</a>
  </header>
  <main class="admin-main">
    ${body}
  </main>
</div>

<script>
  // Active nav link
  var p = location.pathname;
  document.querySelectorAll('.nav-item[data-p]').forEach(function(a) {
    var prefix = a.dataset.p;
    if (p === prefix || p.startsWith(prefix + '/')) a.classList.add('active');
  });

  // Mobile sidebar toggle
  function toggleSidebar() {
    document.getElementById('admin-sidebar').classList.toggle('open');
    document.getElementById('admin-overlay').classList.toggle('visible');
  }
  function closeSidebar() {
    document.getElementById('admin-sidebar').classList.remove('open');
    document.getElementById('admin-overlay').classList.remove('visible');
  }

  // Store token for API calls in subpages
  var TOKEN = '';
  try {
    TOKEN = sessionStorage.getItem('admin_token') ||
      (document.cookie.split('; ').find(function(r){return r.startsWith('admin_token=');})||'').split('=')[1] || '';
  } catch(e) {}
</script>
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
