/**
 * src/handlers/analytics.js
 * Analytics dashboard using Cloudflare Analytics Engine (free).
 *
 * Tracks page views via a lightweight JS beacon.
 * No cookies, no GDPR issues, no external services.
 *
 * Routes:
 *   POST /api/analytics/beacon  → record a page view (public, called by JS)
 *   GET  /admin/analytics       → dashboard
 */

import { getSiteConfig } from '../db/site.js';
import { adminPage } from './admin-page.js';
import { escHtml }       from '../shell.js';

// ── Beacon endpoint (called by client JS) ─────────────────────
export async function handleAnalyticsBeacon(request, env) {
  try {
    const body = await request.json().catch(() => ({}));
    const path = body.path || new URL(request.headers.get('Referer')||'http://x/').pathname;
    const today = new Date().toISOString().split('T')[0];
    const ip    = request.headers.get('CF-Connecting-IP') || '';

    // Upsert daily view count in D1
    await env.DB.prepare(`
      INSERT INTO analytics_daily (date, path, views, unique_ips)
      VALUES (?, ?, 1, 1)
      ON CONFLICT(date, path) DO UPDATE SET
        views = views + 1,
        unique_ips = unique_ips + CASE WHEN ? NOT IN (
          SELECT unique_ips FROM analytics_daily WHERE date=? AND path=?
        ) THEN 1 ELSE 0 END
    `).bind(today, path, ip, today, path).run().catch(() => {
      // Fallback: simple increment without IP dedup
      return env.DB.prepare(`
        INSERT INTO analytics_daily (date, path, views, unique_ips) VALUES (?,?,1,1)
        ON CONFLICT(date,path) DO UPDATE SET views = views + 1
      `).bind(today, path).run();
    });

    return new Response('ok', { status: 200 });
  } catch (err) {
    return new Response('ok', { status: 200 }); // always succeed
  }
}

// ── Admin analytics dashboard ─────────────────────────────────
export async function handleAnalyticsAdmin(request, env, url, user) {
  if (user.role === 'company_admin') return new Response('Forbidden', { status: 403 });

  const days    = parseInt(url.searchParams.get('days') || '30', 10);
  const cutoff  = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  // Total views in period
  const [totals, topPages, daily] = await Promise.all([
    env.DB.prepare(`SELECT SUM(views) as total_views, SUM(unique_ips) as total_visitors, COUNT(DISTINCT date) as days_active FROM analytics_daily WHERE date >= ?`).bind(cutoffStr).first().catch(()=>null),
    env.DB.prepare(`SELECT path, SUM(views) as views, SUM(unique_ips) as visitors FROM analytics_daily WHERE date >= ? GROUP BY path ORDER BY views DESC LIMIT 20`).bind(cutoffStr).all().catch(()=>({results:[]})),
    env.DB.prepare(`SELECT date, SUM(views) as views FROM analytics_daily WHERE date >= ? GROUP BY date ORDER BY date ASC`).bind(cutoffStr).all().catch(()=>({results:[]})),
  ]);

  const dailyData  = (daily.results   || []);
  const topData    = (topPages.results || []);
  const totalViews = totals?.total_views    || 0;
  const totalVisit = totals?.total_visitors || 0;

  // Build daily chart data
  const chartLabels = dailyData.map(d => d.date.slice(5)); // MM-DD
  const chartValues = dailyData.map(d => d.views);
  const maxVal      = Math.max(...chartValues, 1);

  const topRows = topData.map(p => `
    <tr>
      <td style="font-family:monospace;font-size:.82rem;color:var(--green-mid);">${escHtml(p.path)}</td>
      <td style="text-align:right;font-weight:500;">${p.views?.toLocaleString()||0}</td>
      <td style="text-align:right;color:#888;">${p.visitors?.toLocaleString()||0}</td>
      <td>
        <div style="background:#f0f0f0;border-radius:3px;overflow:hidden;height:6px;min-width:80px;">
          <div style="background:var(--green-mid);height:100%;width:${Math.round((p.views/Math.max(...topData.map(t=>t.views),1))*100)}%;"></div>
        </div>
      </td>
    </tr>`).join('');

  // Sparkline bars
  const barWidth = 600 / Math.max(chartLabels.length, 1);
  const bars = chartValues.map((v, i) => {
    const h = Math.round((v / maxVal) * 80);
    return `<rect x="${i * barWidth + 1}" y="${90-h}" width="${barWidth-2}" height="${h}" fill="#2d5a3d" opacity="0.7" rx="1"/>`;
  }).join('');
  const xLabels = chartLabels.filter((_,i) => i % 5 === 0 || i === chartLabels.length-1)
    .map((l, j, arr) => {
      const i = chartLabels.indexOf(l);
      return `<text x="${i * barWidth + barWidth/2}" y="106" text-anchor="middle" style="font-size:9px;fill:#888;">${l}</text>`;
    }).join('');

  const body = `
    <div class="settings-header">
      <div>
    <div class="page-description">
      📊 <strong>Analytics</strong> — Privacy-first page view tracking. No cookies, no GDPR banners, no third-party
      trackers. Data collected via a lightweight beacon on every page. View total views, unique visitors,
      top pages, and daily trends. Switch between 7, 30, and 90-day windows using the buttons above.
    </div>
            <h2>📊 Analytics</h2>
        <p style="color:#888;font-family:sans-serif;font-size:.88rem;margin:4px 0 0;">
          Privacy-first · No cookies · No tracking pixels
        </p>
      </div>
      <div style="display:flex;gap:8px;">
        ${[7,30,90].map(d => `<a href="/admin/analytics?days=${d}" class="tbl-btn ${days===d?'tbl-btn-ok':''}">${d}d</a>`).join('')}
      </div>
    </div>

    <div class="admin-stats" style="margin-bottom:28px;">
      <div class="stat-card">
        <div class="stat-icon">👁️</div>
        <div class="stat-num">${totalViews.toLocaleString()}</div>
        <div class="stat-label">Page Views (${days}d)</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-num">${totalVisit.toLocaleString()}</div>
        <div class="stat-label">Visitors (${days}d)</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📈</div>
        <div class="stat-num">${dailyData.length > 0 ? Math.round(totalViews / dailyData.length) : 0}</div>
        <div class="stat-label">Avg Views/Day</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📄</div>
        <div class="stat-num">${topData.length}</div>
        <div class="stat-label">Unique Pages</div>
      </div>
    </div>

    ${dailyData.length > 1 ? `
    <div style="background:white;border:1.5px solid #e0e0e0;border-radius:12px;padding:20px;margin-bottom:20px;">
      <h3 style="font-family:sans-serif;font-size:.95rem;margin:0 0 12px;">Daily Page Views</h3>
      <svg width="100%" viewBox="0 0 600 115" style="overflow:visible;">
        ${bars}
        ${xLabels}
      </svg>
    </div>` : `
    <div style="background:#f9f9f9;border:1.5px solid #e0e0e0;border-radius:10px;padding:24px;text-align:center;margin-bottom:20px;font-family:sans-serif;color:#888;">
      <p>Not enough data yet. Analytics will populate as visitors browse the site.</p>
      <p style="font-size:.82rem;margin-top:8px;">Make sure the analytics beacon is installed — add the script to your static HTML pages.</p>
    </div>`}

    <h3 style="font-family:sans-serif;font-size:.95rem;margin-bottom:12px;">Top Pages</h3>
    <table class="admin-table">
      <thead><tr><th>Page</th><th style="text-align:right">Views</th><th style="text-align:right">Visitors</th><th>Traffic</th></tr></thead>
      <tbody>${topRows||'<tr><td colspan="4" style="text-align:center;color:#888;padding:20px;">No data yet.</td></tr>'}</tbody>
    </table>

    <div style="margin-top:20px;background:#e8f2eb;border:1.5px solid #4a8c5c;border-radius:8px;padding:14px 18px;font-family:sans-serif;font-size:.83rem;color:#1a3a2a;">
      <strong>💡 Analytics are collected privately</strong> — no cookies, no fingerprinting, no GDPR consent banners needed.
      Page views tracked via a lightweight beacon script. IP addresses used only for visitor counting and not stored long-term.
    </div>`;

  return adminPage('📊 Analytics', body, user);
}
