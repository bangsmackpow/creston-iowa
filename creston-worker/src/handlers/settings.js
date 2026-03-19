/**
 * src/handlers/settings.js
 * Site settings admin UI — /admin/settings
 * Reads and writes config/site.json in R2.
 *
 * Tabs:
 *   General     — name, tagline, description, logo, contact emails
 *   Design      — theme, colors, fonts
 *   Navigation  — reorder, show/hide, add custom links
 *   Homepage    — toggle and reorder sections, hero content
 *   SEO         — meta templates, GA, OG image
 *   Features    — toggle content types on/off
 *   Integrations — Resend, maps, etc.
 */

import { getSiteConfig, saveSiteConfig, DEFAULT_SITE_CONFIG } from '../db/site.js';
import { escHtml as e } from '../shell.js';

export async function handleSettings(request, env, url, user) {
  if (user.role !== 'superadmin') {
    return new Response('Forbidden — only superadmins can edit site settings.', { status: 403 });
  }

  const path = url.pathname;

  // API endpoint — save settings as JSON (called by the settings form via fetch)
  if (path === '/admin/settings/save' && request.method === 'POST') {
    return saveSettings(request, env);
  }

  // Navigation reorder API
  if (path === '/admin/settings/nav' && request.method === 'POST') {
    return saveNav(request, env);
  }

  // Theme preview API
  if (path === '/admin/settings/preview-theme' && request.method === 'POST') {
    return previewTheme(request, env);
  }

  // Main settings page
  const cfg   = await getSiteConfig(env);
  const tab   = url.searchParams.get('tab') || 'general';
  const saved = url.searchParams.get('saved') === '1';

  return settingsPage(cfg, tab, saved, user);
}

// ── Save handler ───────────────────────────────────────────────
async function saveSettings(request, env) {
  try {
    const updates = await request.json();
    const current = await getSiteConfig(env);

    // Merge updates into current config
    const newConfig = mergeSettings(current, updates);
    await saveSiteConfig(env, newConfig);

    // Write theme as a static CSS file to R2
    // This means theme.js just loads a CSS file — no async fetch, no flash
    await writeThemeCSS(env, newConfig);

    // Purge Cloudflare edge cache so theme/config changes show immediately
    await purgeCache(env);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('saveSettings error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function writeThemeCSS(env, cfg) {
  const { buildThemeCSS } = await import('../db/site.js');
  const themeCSS = buildThemeCSS(cfg);

  // Parse the CSS string into variables
  const vars = {};
  themeCSS.split(';').forEach(pair => {
    const idx = pair.indexOf(':');
    if (idx === -1) return;
    vars[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  });

  const primary     = vars['--primary']      || '#1a3a2a';
  const secondary   = vars['--secondary']    || '#2d5a3d';
  const accent      = vars['--accent']       || '#c9933a';
  const accentLight = vars['--accent-light'] || '#f0c878';
  const bg          = vars['--bg']           || '#faf8f3';
  const rgb         = hexToRgb(primary);

  const css = `/* Auto-generated theme — do not edit manually */
/* Last updated: ${new Date().toISOString()} */
:root {
  --green-deep:  ${primary}     !important;
  --green-mid:   ${secondary}   !important;
  --gold:        ${accent}      !important;
  --gold-light:  ${accentLight} !important;
  --cream:       ${bg}          !important;
  --navy:        ${primary}     !important;
  --navy-mid:    ${secondary}   !important;
}
.site-nav { background: rgba(${rgb}, 0.97) !important; }
.site-nav.scrolled { background: rgba(${rgb}, 0.99) !important; }
.page-hero { background: ${primary} !important; }
.bg-green-deep { background: ${primary} !important; }
.site-footer { background: ${primary} !important; }
.btn-primary { background: ${secondary} !important; border-color: ${secondary} !important; }
.btn-primary:hover { background: ${primary} !important; border-color: ${primary} !important; }
.btn-gold { background: ${accent} !important; border-color: ${accent} !important; }
.eyebrow { color: ${accent} !important; }
.nav-jobs { background: ${accent} !important; }
.widget-header { background: ${primary} !important; }
.filter-btn.active { background: ${secondary} !important; border-color: ${secondary} !important; }
.admin-header { background: ${primary} !important; }
h1, h2, h3, h4, h5 { color: ${primary} !important; }
.page-hero h1, .hero-title, .about-strip h2, .jobs-promo h2 { color: white !important; }
a { color: ${secondary}; }
a:hover { color: ${accent}; }
`;

  await env.BUCKET.put('config/theme.css', css, {
    httpMetadata: {
      contentType: 'text/css; charset=utf-8',
      cacheControl: 'public, max-age=0, must-revalidate',
    }
  });
}

function hexToRgb(hex) {
  if (!hex) return '26,58,42';
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)}`
    : '26,58,42';
}

async function purgeCache(env) {
  // Requires CF_ZONE_ID and CF_API_TOKEN secrets
  // Set via: npx wrangler secret put CF_ZONE_ID
  //          npx wrangler secret put CF_API_TOKEN (needs Cache Purge permission)
  if (!env.CF_ZONE_ID || !env.CF_API_TOKEN) {
    console.log('Cache purge skipped — CF_ZONE_ID or CF_API_TOKEN not set');
    return;
  }
  try {
    await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/purge_cache`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ purge_everything: true }),
    });
  } catch (err) {
    console.error('Cache purge failed:', err);
    // Non-fatal — settings still saved
  }
}

async function saveNav(request, env) {
  try {
    const { navigation } = await request.json();
    const current        = await getSiteConfig(env);
    current.navigation   = navigation;
    await saveSiteConfig(env, current);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function previewTheme(request, env) {
  const { theme } = await request.json();
  return new Response(JSON.stringify({ ok: true, theme }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// ── Main settings page ─────────────────────────────────────────
function settingsPage(cfg, tab, saved, user) {
  const tabs = [
    { id: 'general',      label: '⚙️ General',      },
    { id: 'design',       label: '🎨 Design',        },
    { id: 'navigation',   label: '🧭 Navigation',    },
    { id: 'homepage',     label: '🏠 Homepage',       },
    { id: 'seo',          label: '🔍 SEO',            },
    { id: 'features',     label: '🔧 Features',       },
    { id: 'integrations', label: '🔌 Integrations',   },
  ];

  const tabNav = tabs.map(t => `
    <a href="/admin/settings?tab=${t.id}"
       class="settings-tab${tab === t.id ? ' active' : ''}">${e(t.label)}</a>
  `).join('');

  const tabContent = {
    general:      generalTab(cfg),
    design:       designTab(cfg),
    navigation:   navigationTab(cfg),
    homepage:     homepageTab(cfg),
    seo:          seoTab(cfg),
    features:     featuresTab(cfg),
    integrations: integrationsTab(cfg),
  }[tab] || generalTab(cfg);

  const body = `
    <div class="settings-header">
      <div>
        <h2>Site Settings</h2>
        <p style="color:#888;font-family:sans-serif;font-size:.88rem;margin:4px 0 0;">
          Changes take effect immediately after saving.
        </p>
      </div>
      <a href="/" target="_blank" class="btn-admin-secondary">🔗 View Site</a>
    </div>

    ${saved ? `<div class="alert-box alert-ok" style="margin-bottom:20px;">✅ Settings saved successfully!</div>` : ''}

    <div class="settings-layout">
      <nav class="settings-sidebar">
        ${tabNav}
      </nav>
      <div class="settings-content">
        <form id="settings-form">
          ${tabContent}
          <div class="settings-actions">
            <button type="button" onclick="saveSettings()" class="btn-admin-primary btn-save">
              💾 Save Changes
            </button>
            <div id="save-status" style="font-family:sans-serif;font-size:.88rem;"></div>
          </div>
        </form>
      </div>
    </div>

    <script>
      const TOKEN = sessionStorage.getItem('admin_token') || '';

      async function saveSettings() {
        const form    = document.getElementById('settings-form');
        const status  = document.getElementById('save-status');
        const data    = {};

        // Collect all form inputs
        form.querySelectorAll('[name]').forEach(el => {
          const key = el.name;
          // Skip unchecked radio buttons — only save the selected one
          if (el.type === 'radio' && !el.checked) return;
          const val = el.type === 'checkbox' ? el.checked : el.value;

          // Handle nested keys like "custom_colors.primary"
          if (key.includes('.')) {
            const [parent, child] = key.split('.');
            if (!data[parent]) data[parent] = {};
            data[parent][child] = val;
          } else {
            data[key] = val;
          }
        });

        // Collect features checkboxes
        const features = {};
        form.querySelectorAll('[name^="feature_"]').forEach(el => {
          features[el.name.replace('feature_', '')] = el.checked;
        });
        if (Object.keys(features).length) data.features = features;

        status.textContent = '⏳ Saving...';
        status.style.color = '#888';

        try {
          const r = await fetch('/admin/settings/save', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
            body:    JSON.stringify(data),
          });

          if (r.ok) {
            status.textContent = '✅ Saved!';
            status.style.color = '#2d5a3d';
            setTimeout(() => { status.textContent = ''; }, 3000);
          } else {
            const j = await r.json();
            status.textContent = '❌ ' + (j.error || 'Save failed');
            status.style.color = '#b84040';
          }
        } catch (err) {
          status.textContent = '❌ ' + err.message;
          status.style.color = '#b84040';
        }
      }

      // Keyboard shortcut
      document.addEventListener('keydown', ev => {
        if ((ev.metaKey || ev.ctrlKey) && ev.key === 's') {
          ev.preventDefault(); saveSettings();
        }
      });

      // Live theme preview
      const themeSelect = document.getElementById('theme-select');
      if (themeSelect) {
        themeSelect.addEventListener('change', () => {
          document.body.dataset.previewTheme = themeSelect.value;
        });
      }

      // Custom color live preview
      ['primary','secondary','accent','background'].forEach(key => {
        const el = document.getElementById('color-' + key);
        if (el) el.addEventListener('input', () => {
          document.documentElement.style.setProperty('--preview-' + key, el.value);
        });
      });
    </script>`;

  return adminSettingsPage('⚙️ Settings', body, user);
}

// ── Tab: General ───────────────────────────────────────────────
function generalTab(cfg) {
  return `
    <div class="settings-section">
      <h3>Site Identity</h3>
      <div class="settings-grid">
        <div class="form-group">
          <label class="form-label">Site Name *</label>
          <input type="text" name="name" class="form-input" value="${e(cfg.name)}" placeholder="My Town">
          <small>Appears in the nav, footer, and page titles.</small>
        </div>
        <div class="form-group">
          <label class="form-label">Tagline</label>
          <input type="text" name="tagline" class="form-input" value="${e(cfg.tagline)}" placeholder="Your Community Hub">
          <small>Shown below the site name in the nav.</small>
        </div>
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Site Description</label>
          <textarea name="description" class="form-textarea" rows="2">${e(cfg.description)}</textarea>
          <small>Used as the default meta description for SEO.</small>
        </div>
        <div class="form-group">
          <label class="form-label">Site URL</label>
          <input type="url" name="url" class="form-input" value="${e(cfg.url)}" placeholder="https://mytown.com">
        </div>
        <div class="form-group">
          <label class="form-label">Logo Emoji / Icon</label>
          <input type="text" name="logo_text" class="form-input" value="${e(cfg.logo_text)}" placeholder="🌾">
          <small>Single emoji shown in the nav. Leave blank if using a logo image.</small>
        </div>
        <div class="form-group">
          <label class="form-label">Logo Image (PNG/SVG/WebP)</label>
          ${cfg.logo_image
            ? `<div style="margin-bottom:8px;"><img src="/media/${e(cfg.logo_image)}" style="height:48px;border:1.5px solid #ddd;border-radius:6px;padding:4px;background:white;" alt="Logo"></div>`
            : ''}
          <input type="text" name="logo_image" class="form-input" value="${e(cfg.logo_image || '')}" placeholder="images/logo.png">
          <small>R2 key of image uploaded to Media Library. Leave blank to use emoji. <a href="/admin/media" target="_blank">Upload in Media Library →</a></small>
        </div>
        <div class="form-group">
          <label class="form-label">Favicon</label>
          ${cfg.favicon
            ? `<div style="margin-bottom:8px;"><img src="/media/${e(cfg.favicon)}" style="height:32px;width:32px;border:1.5px solid #ddd;border-radius:4px;padding:2px;background:white;object-fit:contain;" alt="Favicon"></div>`
            : ''}
          <input type="text" name="favicon" class="form-input" value="${e(cfg.favicon || '')}" placeholder="images/favicon.png">
          <small>R2 key of 32×32 or 64×64 PNG/ICO uploaded to Media Library. Served at /favicon.ico. <a href="/admin/media" target="_blank">Upload →</a></small>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>Contact Emails</h3>
      <p class="settings-desc">These appear in the footer and contact page. Set up forwarding via Cloudflare Email Routing.</p>
      <div class="settings-grid">
        <div class="form-group">
          <label class="form-label">General Contact</label>
          <input type="email" name="email_general" class="form-input" value="${e(cfg.email_general)}" placeholder="hello@yoursite.com">
        </div>
        <div class="form-group">
          <label class="form-label">News Tips</label>
          <input type="email" name="email_news" class="form-input" value="${e(cfg.email_news)}" placeholder="news@yoursite.com">
        </div>
        <div class="form-group">
          <label class="form-label">Job Board</label>
          <input type="email" name="email_jobs" class="form-input" value="${e(cfg.email_jobs)}" placeholder="jobs@yoursite.com">
        </div>
        <div class="form-group">
          <label class="form-label">Advertising</label>
          <input type="email" name="email_advertise" class="form-input" value="${e(cfg.email_advertise)}" placeholder="advertise@yoursite.com">
        </div>
        <div class="form-group">
          <label class="form-label">Phone (optional)</label>
          <input type="tel" name="phone" class="form-input" value="${e(cfg.phone)}" placeholder="(555) 123-4567">
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>Social Media</h3>
      <div class="settings-grid">
        <div class="form-group">
          <label class="form-label">Facebook URL</label>
          <input type="url" name="social_facebook" class="form-input" value="${e(cfg.social_facebook)}" placeholder="https://facebook.com/yourpage">
        </div>
        <div class="form-group">
          <label class="form-label">Twitter / X URL</label>
          <input type="url" name="social_twitter" class="form-input" value="${e(cfg.social_twitter)}" placeholder="https://twitter.com/yourhandle">
        </div>
        <div class="form-group">
          <label class="form-label">Instagram URL</label>
          <input type="url" name="social_instagram" class="form-input" value="${e(cfg.social_instagram)}" placeholder="https://instagram.com/yourhandle">
        </div>
        <div class="form-group">
          <label class="form-label">YouTube URL</label>
          <input type="url" name="social_youtube" class="form-input" value="${e(cfg.social_youtube)}" placeholder="https://youtube.com/@yourchannel">
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>Footer</h3>
      <div class="settings-grid">
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Footer Tagline</label>
          <input type="text" name="footer_tagline" class="form-input" value="${e(cfg.footer_tagline)}" placeholder="Your community hub for news, events, and more.">
        </div>
        <div class="form-group">
          <label class="form-label">Copyright Text</label>
          <input type="text" name="footer_copyright" class="form-input" value="${e(cfg.footer_copyright)}" placeholder="Leave blank for auto-generated">
          <small>Leave blank to auto-generate: © 2025 Site Name</small>
        </div>
        <div class="form-group">
          <label class="form-label">Disclaimer</label>
          <input type="text" name="footer_disclaimer" class="form-input" value="${e(cfg.footer_disclaimer)}" placeholder="Independent community site.">
        </div>
      </div>
    </div>`;
}

// ── Tab: Design ────────────────────────────────────────────────
function designTab(cfg) {
  const themes = [
    { id: 'green',  label: '🌿 Forest Green',   preview: '#1a3a2a' },
    { id: 'blue',   label: '🌊 Ocean Blue',      preview: '#1a2a4a' },
    { id: 'red',    label: '🍎 Deep Red',        preview: '#3a1a1a' },
    { id: 'purple', label: '🔮 Royal Purple',    preview: '#2a1a4a' },
    { id: 'dark',   label: '🌑 Dark Mode',       preview: '#0a0a0a' },
    { id: 'custom', label: '🎨 Custom Colors',   preview: cfg.custom_colors?.primary || '#333' },
  ];

  const fonts = [
    'Playfair Display', 'Merriweather', 'Lora', 'Libre Baskerville',
    'Raleway', 'Montserrat', 'Oswald', 'Roboto Slab',
  ];

  const themeOptions = themes.map(t => `
    <label class="theme-option ${cfg.theme === t.id ? 'active' : ''}">
      <input type="radio" name="theme" value="${t.id}" ${cfg.theme === t.id ? 'checked' : ''}>
      <span class="theme-swatch" style="background:${t.preview};"></span>
      <span>${e(t.label)}</span>
    </label>`).join('');

  const isCustom = cfg.theme === 'custom';

  return `
    <div class="settings-section">
      <h3>Color Theme</h3>
      <p class="settings-desc">Choose a preset theme or define custom colors.</p>
      <div id="theme-select" class="theme-grid">${themeOptions}</div>
    </div>

    <div class="settings-section" id="custom-colors" style="${isCustom ? '' : 'opacity:.4;pointer-events:none;'}">
      <h3>Custom Colors</h3>
      <div class="settings-grid">
        ${colorPicker('Primary (Nav/Header)', 'custom_colors.primary',    cfg.custom_colors?.primary    || '#1a3a2a', 'primary')}
        ${colorPicker('Secondary (Buttons)',  'custom_colors.secondary',  cfg.custom_colors?.secondary  || '#2d5a3d', 'secondary')}
        ${colorPicker('Accent (Gold/Highlight)', 'custom_colors.accent',  cfg.custom_colors?.accent     || '#c9933a', 'accent')}
        ${colorPicker('Background',           'custom_colors.background', cfg.custom_colors?.background || '#faf8f3', 'background')}
      </div>
    </div>

    <div class="settings-section">
      <h3>Typography</h3>
      <div class="settings-grid">
        <div class="form-group">
          <label class="form-label">Heading Font</label>
          <select name="font_heading" class="form-select">
            ${fonts.map(f => `<option value="${f}" ${cfg.font_heading === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
          <small>Used for page titles, section headings, hero text.</small>
        </div>
        <div class="form-group">
          <label class="form-label">Body Font</label>
          <select name="font_body" class="form-select">
            ${fonts.map(f => `<option value="${f}" ${cfg.font_body === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
          <small>Used for article text and descriptions.</small>
        </div>
      </div>
    </div>

    <script>
      // Toggle custom colors section
      document.querySelectorAll('[name="theme"]').forEach(el => {
        el.addEventListener('change', () => {
          const custom = document.getElementById('custom-colors');
          if (custom) {
            custom.style.opacity      = el.value === 'custom' ? '1' : '.4';
            custom.style.pointerEvents = el.value === 'custom' ? '' : 'none';
          }
        });
      });
    </script>`;
}

function colorPicker(label, name, value, id) {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <div style="display:flex;gap:8px;align-items:center;">
      <input type="color" id="color-${id}" name="${name}" value="${value}"
             style="width:44px;height:36px;padding:2px;border:1.5px solid #ddd;border-radius:6px;cursor:pointer;">
      <input type="text" value="${value}" oninput="document.getElementById('color-${id}').value=this.value"
             style="width:90px;padding:8px 10px;border:1.5px solid #ddd;border-radius:6px;font-family:monospace;font-size:.85rem;">
    </div>
  </div>`;
}

// ── Tab: Navigation ────────────────────────────────────────────
function navigationTab(cfg) {
  const nav  = cfg.navigation || [];
  const rows = nav.map((item, i) => `
    <tr class="nav-row" data-index="${i}">
      <td class="drag-handle" title="Drag to reorder">⠿</td>
      <td>
        <input type="text" class="form-input nav-label" value="${e(item.label)}"
               style="width:100%;" placeholder="Label">
      </td>
      <td>
        <input type="text" class="form-input nav-href" value="${e(item.href)}"
               style="width:100%;" placeholder="/page-url">
      </td>
      <td style="text-align:center;">
        <input type="checkbox" class="nav-highlight" ${item.highlight ? 'checked' : ''}
               title="Highlight this item (button style)">
      </td>
      <td style="text-align:center;">
        <input type="checkbox" class="nav-show" ${item.show !== false ? 'checked' : ''}
               title="Show in navigation">
      </td>
      <td>
        <button type="button" class="tbl-btn tbl-btn-danger" onclick="removeNavRow(this)">✕</button>
      </td>
    </tr>`).join('');

  return `
    <div class="settings-section">
      <h3>Navigation Menu</h3>
      <p class="settings-desc">Drag rows to reorder. Toggle visibility and highlight style per item.</p>

      <table class="admin-table nav-editor-table">
        <thead>
          <tr>
            <th style="width:30px;"></th>
            <th>Label</th>
            <th>URL / Path</th>
            <th style="width:80px;text-align:center;">Highlight</th>
            <th style="width:60px;text-align:center;">Show</th>
            <th style="width:40px;"></th>
          </tr>
        </thead>
        <tbody id="nav-tbody">${rows}</tbody>
      </table>

      <div style="margin-top:16px;display:flex;gap:12px;">
        <button type="button" class="btn-admin-secondary" onclick="addNavRow()">+ Add Link</button>
        <button type="button" class="btn-admin-primary" onclick="saveNav()">💾 Save Navigation</button>
        <div id="nav-status" style="font-family:sans-serif;font-size:.85rem;align-self:center;"></div>
      </div>
    </div>

    <script>
      const TOKEN = sessionStorage.getItem('admin_token') || '';

      function addNavRow() {
        const tbody = document.getElementById('nav-tbody');
        const i     = tbody.querySelectorAll('tr').length;
        const tr    = document.createElement('tr');
        tr.className = 'nav-row';
        tr.dataset.index = i;
        tr.innerHTML = \`
          <td class="drag-handle">⠿</td>
          <td><input type="text" class="form-input nav-label" placeholder="Label" style="width:100%;"></td>
          <td><input type="text" class="form-input nav-href"  placeholder="/url"  style="width:100%;"></td>
          <td style="text-align:center;"><input type="checkbox" class="nav-highlight"></td>
          <td style="text-align:center;"><input type="checkbox" class="nav-show" checked></td>
          <td><button type="button" class="tbl-btn tbl-btn-danger" onclick="removeNavRow(this)">✕</button></td>
        \`;
        tbody.appendChild(tr);
      }

      function removeNavRow(btn) {
        btn.closest('tr').remove();
      }

      function getNavData() {
        return Array.from(document.querySelectorAll('.nav-row')).map(row => ({
          label:     row.querySelector('.nav-label').value,
          href:      row.querySelector('.nav-href').value,
          highlight: row.querySelector('.nav-highlight').checked,
          show:      row.querySelector('.nav-show').checked,
        }));
      }

      async function saveNav() {
        const status = document.getElementById('nav-status');
        status.textContent = '⏳ Saving...';
        status.style.color = '#888';
        try {
          const r = await fetch('/admin/settings/nav', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
            body:    JSON.stringify({ navigation: getNavData() }),
          });
          if (r.ok) { status.textContent = '✅ Navigation saved!'; status.style.color = '#2d5a3d'; }
          else      { status.textContent = '❌ Save failed'; status.style.color = '#b84040'; }
        } catch (err) {
          status.textContent = '❌ ' + err.message; status.style.color = '#b84040';
        }
      }

      // Simple drag-to-reorder
      let dragRow = null;
      document.getElementById('nav-tbody').addEventListener('dragstart', e => {
        dragRow = e.target.closest('tr');
        dragRow.style.opacity = '.5';
      });
      document.getElementById('nav-tbody').addEventListener('dragover', e => {
        e.preventDefault();
        const over = e.target.closest('tr');
        if (over && over !== dragRow) {
          const tbody = document.getElementById('nav-tbody');
          const rows  = [...tbody.querySelectorAll('tr')];
          const fromI = rows.indexOf(dragRow);
          const toI   = rows.indexOf(over);
          if (toI > fromI) over.after(dragRow); else over.before(dragRow);
        }
      });
      document.getElementById('nav-tbody').addEventListener('dragend', e => {
        if (dragRow) dragRow.style.opacity = '';
        dragRow = null;
      });
      document.querySelectorAll('.nav-row').forEach(r => r.setAttribute('draggable', 'true'));
    </script>`;
}

// ── Tab: Homepage ──────────────────────────────────────────────
function homepageTab(cfg) {
  return `
    <div class="settings-section">
      <h3>Hero Section</h3>
      <div class="settings-grid">
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Main Headline</label>
          <input type="text" name="hero_headline" class="form-input"
                 value="${e(cfg.hero_headline)}" placeholder="Welcome to My Town">
        </div>
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Sub-headline</label>
          <textarea name="hero_subheadline" class="form-textarea" rows="2">${e(cfg.hero_subheadline)}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Badge Text (optional)</label>
          <input type="text" name="hero_badge" class="form-input"
                 value="${e(cfg.hero_badge)}" placeholder="Population 7,500 · Union County">
          <small>Small pill shown above the headline.</small>
        </div>
        <div class="form-group">
          <label class="form-label">Primary Button Label</label>
          <input type="text" name="hero_cta_primary_label" class="form-input"
                 value="${e(cfg.hero_cta_primary_label)}" placeholder="Explore">
        </div>
        <div class="form-group">
          <label class="form-label">Primary Button Link</label>
          <input type="text" name="hero_cta_primary_href" class="form-input"
                 value="${e(cfg.hero_cta_primary_href)}" placeholder="/attractions">
        </div>
        <div class="form-group">
          <label class="form-label">Secondary Button Label</label>
          <input type="text" name="hero_cta_secondary_label" class="form-input"
                 value="${e(cfg.hero_cta_secondary_label)}" placeholder="Find Restaurants">
        </div>
        <div class="form-group">
          <label class="form-label">Secondary Button Link</label>
          <input type="text" name="hero_cta_secondary_href" class="form-input"
                 value="${e(cfg.hero_cta_secondary_href)}" placeholder="/food">
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>Hero Stats</h3>
      <p class="settings-desc">Up to 4 stat figures shown at the bottom of the hero (e.g. Founded, Population, Events).</p>
      <div id="hero-stats">
        ${(cfg.hero_stats || []).slice(0,4).map((s, i) => `
        <div class="settings-grid" style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #eee;">
          <div class="form-group">
            <label class="form-label">Stat ${i+1} Value</label>
            <input type="text" name="hero_stat_${i}_value" class="form-input"
                   value="${e(s.value)}" placeholder="1868">
          </div>
          <div class="form-group">
            <label class="form-label">Stat ${i+1} Label</label>
            <input type="text" name="hero_stat_${i}_label" class="form-input"
                   value="${e(s.label)}" placeholder="Founded">
          </div>
        </div>`).join('')}
      </div>
    </div>

    <div class="settings-section">
      <h3>Page Sections</h3>
      <p class="settings-desc">Toggle which sections appear on the homepage.</p>
      <div class="features-grid">
        ${(cfg.homepage_sections || []).map(s => `
        <label class="feature-toggle">
          <input type="checkbox" name="section_${s.id}" ${s.show ? 'checked' : ''}>
          <span class="toggle-label">${s.id.charAt(0).toUpperCase() + s.id.slice(1)}</span>
        </label>`).join('')}
      </div>
    </div>`;
}

// ── Tab: SEO ───────────────────────────────────────────────────
function seoTab(cfg) {
  return `
    <div class="settings-section">
      <h3>Page Title Format</h3>
      <div class="settings-grid">
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Title Template</label>
          <input type="text" name="seo_title_template" class="form-input"
                 value="${e(cfg.seo_title_template || '{page} — {site}')}"
                 placeholder="{page} — {site}">
          <small>Use <code>{page}</code> and <code>{site}</code> as placeholders. Example: "Dining — Creston Iowa"</small>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>Google Analytics</h3>
      <div class="settings-grid">
        <div class="form-group">
          <label class="form-label">Measurement ID</label>
          <input type="text" name="google_analytics_id" class="form-input"
                 value="${e(cfg.google_analytics_id)}" placeholder="G-XXXXXXXXXX">
          <small>Leave blank to disable. Get your ID from Google Analytics → Admin → Data Streams.</small>
        </div>
        <div class="form-group">
          <label class="form-label">Google Search Console Verification</label>
          <input type="text" name="google_search_console" class="form-input"
                 value="${e(cfg.google_search_console)}" placeholder="Verification meta tag content">
          <small>Just the content value from the meta tag, not the full tag.</small>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>Open Graph / Social Sharing</h3>
      <p class="settings-desc">Controls how your site looks when shared on Facebook, Twitter, Slack, etc.</p>
      <div class="settings-grid">
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Default OG Image URL</label>
          <input type="url" name="seo_default_image" class="form-input"
                 value="${e(cfg.seo_default_image)}"
                 placeholder="https://yoursite.com/images/og-default.jpg">
          <small>Recommended size: 1200×630px. Used when no page-specific image is set.</small>
        </div>
      </div>
    </div>`;
}

// ── Tab: Features ──────────────────────────────────────────────
function featuresTab(cfg) {
  const features = [
    { id: 'job_board',    label: '💼 Job Board',         desc: 'Enable the /jobs route and job management' },
    { id: 'dining',       label: '🍽️ Dining / Food',     desc: 'Enable the /food route and restaurant listings' },
    { id: 'news',         label: '📰 News & Articles',   desc: 'Enable the /news route and article publishing' },
    { id: 'attractions',  label: '🎈 Attractions',       desc: 'Enable the /attractions route' },
    { id: 'contact_form', label: '✉️ Contact Form',      desc: 'Enable the /contact route with Resend email' },
    { id: 'advertising',  label: '📢 Ad Slots',          desc: 'Show advertising placeholder slots throughout the site' },
    { id: 'chamber',      label: '🤝 Chamber Page',      desc: 'Enable the /chamber static page' },
    { id: 'government',   label: '🏛️ Government Page',   desc: 'Enable the /government static page' },
  ];

  return `
    <div class="settings-section">
      <h3>Content Features</h3>
      <p class="settings-desc">Toggle sections on or off. Disabled features hide the route and remove it from the nav.</p>
      <div class="features-list">
        ${features.map(f => `
        <label class="feature-row">
          <div class="feature-info">
            <strong>${f.label}</strong>
            <span>${f.desc}</span>
          </div>
          <div class="toggle-switch">
            <input type="checkbox" name="feature_${f.id}" id="feature_${f.id}"
                   ${(cfg.features || {})[f.id] !== false ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </div>
        </label>`).join('')}
      </div>
    </div>`;
}

// ── Tab: Integrations ──────────────────────────────────────────
function integrationsTab(cfg) {
  return `
    <div class="settings-section">
      <h3>Email — Resend</h3>
      <p class="settings-desc">
        Resend powers the contact form. The API key is stored as a Worker secret, not here.
        Set it via: <code>npx wrangler secret put RESEND_API_KEY</code>
        or in Cloudflare Pages → Settings → Environment Variables.
      </p>
      <div class="settings-grid">
        <div class="form-group">
          <label class="form-label">From Name</label>
          <input type="text" name="resend_from_name" class="form-input"
                 value="${e(cfg.resend_from_name)}" placeholder="My Town Contact">
          <small>Shown as the sender name in contact form emails.</small>
        </div>
      </div>
      <div class="info-callout">
        <strong>✅ Resend Setup Checklist</strong>
        <ol>
          <li>Sign up at <a href="https://resend.com" target="_blank">resend.com</a></li>
          <li>Add and verify your domain (adds DNS records in Cloudflare)</li>
          <li>Copy your API key</li>
          <li>Run: <code>npx wrangler secret put RESEND_API_KEY</code></li>
          <li>Add <code>RESEND_API_KEY</code> to Pages environment variables too</li>
        </ol>
      </div>
    </div>

    <div class="settings-section">
      <h3>Maps</h3>
      <div class="settings-grid">
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Google Maps Embed URL</label>
          <input type="url" name="maps_embed_url" class="form-input"
                 value="${e(cfg.maps_embed_url)}"
                 placeholder="https://www.google.com/maps/embed?pb=...">
          <small>Get this from Google Maps → Share → Embed a map → Copy HTML, extract the src URL.</small>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>Cloudflare Services</h3>
      <p class="settings-desc">These are configured directly in your Cloudflare dashboard — not here.</p>
      <div class="cf-services-grid">
        <div class="cf-service">
          <div class="cf-icon">📊</div>
          <strong>Web Analytics</strong>
          <span>Enable in Pages → Analytics tab. No setup needed here.</span>
          <a href="https://dash.cloudflare.com" target="_blank" class="tbl-btn">Open Dashboard →</a>
        </div>
        <div class="cf-service">
          <div class="cf-icon">🛡️</div>
          <strong>WAF / Security</strong>
          <span>Configure firewall rules, bot protection, and rate limiting in your zone settings.</span>
          <a href="https://dash.cloudflare.com" target="_blank" class="tbl-btn">Open Dashboard →</a>
        </div>
        <div class="cf-service">
          <div class="cf-icon">✉️</div>
          <strong>Email Routing</strong>
          <span>Forward hello@yoursite.com to your personal inbox for free.</span>
          <a href="https://dash.cloudflare.com" target="_blank" class="tbl-btn">Open Dashboard →</a>
        </div>
        <div class="cf-service">
          <div class="cf-icon">🖼️</div>
          <strong>Cloudflare Images</strong>
          <span>$5/month for image optimization, resizing, and CDN delivery.</span>
          <a href="https://dash.cloudflare.com" target="_blank" class="tbl-btn">Open Dashboard →</a>
        </div>
      </div>
    </div>`;
}

// ── Page shell ─────────────────────────────────────────────────
function adminSettingsPage(title, body, user) {
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${e(title)} — Admin</title>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/admin.css">
  <link rel="stylesheet" href="/css/settings.css">
</head>
<body class="admin-body">
  <header class="admin-header">
    <a href="/admin" class="admin-logo">🌾 CMS Admin</a>
    <nav class="admin-nav">
      <a href="/admin/jobs">💼 Jobs</a>
      <a href="/admin/food">🍽️ Food</a>
      <a href="/admin/news">📰 News</a>
      <a href="/admin/attractions">🎈 Attractions</a>
      <a href="/admin/companies">🏢 Companies</a>
      <a href="/admin/users">👥 Users</a>
      <a href="/admin/settings" class="active">⚙️ Settings</a>
    </nav>
    <div class="admin-header-right">
      <a href="/admin/account" class="admin-view-site">⚙️ ${e(user?.name || 'Account')}</a>
      <a href="/" target="_blank" class="admin-view-site">View Site →</a>
      <a href="/admin/logout" class="admin-logout">Logout</a>
    </div>
  </header>
  <main class="admin-main">${body}</main>
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ── Utilities ──────────────────────────────────────────────────
function mergeSettings(current, updates) {
  const result = { ...current };
  for (const [key, val] of Object.entries(updates)) {
    if (key === 'features' && typeof val === 'object') {
      result.features = { ...current.features, ...val };
    } else if (key === 'custom_colors' && typeof val === 'object') {
      result.custom_colors = { ...current.custom_colors, ...val };
    } else {
      result[key] = val;
    }
  }

  // Rebuild hero_stats from named inputs
  const stats = [];
  for (let i = 0; i < 4; i++) {
    const v = updates[`hero_stat_${i}_value`];
    const l = updates[`hero_stat_${i}_label`];
    if (v !== undefined || l !== undefined) {
      stats.push({ value: v || '', label: l || '' });
    }
  }
  if (stats.length) result.hero_stats = stats;

  return result;
}
