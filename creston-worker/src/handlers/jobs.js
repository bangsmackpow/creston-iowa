/**
 * handlers/jobs.js
 * Serves /jobs (listing) and /jobs/:slug (detail)
 * Reads from R2: jobs/active/*.md
 */

import { listContent, findBySlug } from '../r2.js';
import { renderShell, escHtml, adSlot } from '../shell.js';
import { getSiteConfig } from '../db/site.js';
import { formatDate, isExpired } from '../markdown.js';

export async function handleJobs(request, env, url) {
  const parts = url.pathname.replace(/^\/jobs\/?/, '').split('/').filter(Boolean);
  const slug  = parts[0];

  // Detail view: /jobs/rn-greater-regional
  if (slug && slug !== 'active' && slug !== 'expired') {
    return renderJobDetail(request, env, slug);
  }

  // List view: /jobs
  return renderJobList(request, env);
}

// ── Job Listing Page ─────────────────────────────────────────
async function renderJobList(request, env) {
  const cfg = await getSiteConfig(env);
  const jobs = await listContent(env, 'jobs/active');

  // Filter out truly expired ones (past expires date)
  const active = jobs.filter(j => !isExpired(j.meta));

  const jobCards = active.length === 0
    ? `<div class="empty-state">
        <div style="font-size:3rem;margin-bottom:16px;">💼</div>
        <h3>No Active Job Listings</h3>
        <p>Check back soon — or <a href="/pages/advertise.html#jobs">post a job</a> to reach Creston talent.</p>
       </div>`
    : active.map(renderJobCard).join('\n');

  const content = `
    <section class="section">
      <div class="container">
        <div class="layout-sidebar">
          <div>
            <div class="jobs-header-bar">
              <div>
                <h2 style="margin-bottom:4px;">Open Positions</h2>
                <div class="jobs-count">${active.length} active listing${active.length !== 1 ? 's' : ''} in Union County, IA</div>
              </div>
              <div class="flex gap-2" style="flex-wrap:wrap;">
                <select class="form-select" id="category-filter" style="width:auto;font-size:.85rem;">
                  <option value="">All Categories</option>
                  ${getCategoryOptions(active)}
                </select>
                <select class="form-select" id="type-filter" style="width:auto;font-size:.85rem;">
                  <option value="">All Types</option>
                  <option>Full-Time</option>
                  <option>Part-Time</option>
                  <option>Contract</option>
                  <option>Seasonal</option>
                </select>
              </div>
            </div>

            <div id="job-listings">
              ${jobCards}
            </div>
          </div>

          <aside>
            <div class="sidebar-widget" style="margin-bottom:20px; border-color:var(--gold);">
              <div class="widget-header" style="background:var(--gold);">💼 Hire Local Talent</div>
              <div class="widget-body">
                <p style="font-size:.87rem;margin-bottom:12px;">Post a job listing and reach qualified candidates in Creston and Union County.</p>
                <div style="font-family:var(--font-display);font-size:2rem;color:var(--gold);font-weight:900;line-height:1;margin-bottom:4px;">$49</div>
                <div style="font-family:var(--font-ui);font-size:.72rem;color:var(--text-muted);margin-bottom:16px;">per 30-day listing</div>
                <a href="/pages/jobs.html#post" class="btn btn-gold" style="width:100%;justify-content:center;">Post a Job</a>
              </div>
            </div>

            ${renderCategorySidebar(active)}

            ${adSlot('square', cfg)}
          </aside>
        </div>
      </div>
    </section>

    <script>
      // Client-side filter
      const categorySelect = document.getElementById('category-filter');
      const typeSelect     = document.getElementById('type-filter');
      function applyFilters() {
        const cat  = categorySelect.value.toLowerCase();
        const type = typeSelect.value.toLowerCase();
        document.querySelectorAll('.job-listing').forEach(card => {
          const cardCat  = (card.dataset.category || '').toLowerCase();
          const cardType = (card.dataset.type || '').toLowerCase();
          const show = (!cat  || cardCat.includes(cat)) &&
                       (!type || cardType.includes(type));
          card.style.display = show ? '' : 'none';
        });
      }
      categorySelect.addEventListener('change', applyFilters);
      typeSelect.addEventListener('change', applyFilters);
    </script>`;

  return htmlResponse(await renderShell({
    title:      'Job Board',
    description: `Find jobs in Creston, Iowa and Union County. ${active.length} open positions.`,
    eyebrow:    '💼 Local Opportunities',
    heading:    'Creston Job Board',
    subheading: 'Connecting Creston-area employers with local talent. Live and work in Union County.',
    activeNav:  'Jobs',
    env,
    config: cfg,
    content,
  }));
}

// ── Job Detail Page ──────────────────────────────────────────
async function renderJobDetail(request, env, slug) {
  const cfg = await getSiteConfig(env);
  const job = await findBySlug(env, 'jobs/active', slug);

  if (!job) {
    return new Response('Job not found', { status: 404 });
  }

  const m = job.meta;
  const applyBtn = m.apply_url
    ? `<a href="${escHtml(m.apply_url)}" target="_blank" rel="noopener" class="btn btn-gold btn-lg">Apply Now →</a>`
    : m.apply_email
      ? `<a href="mailto:${escHtml(m.apply_email)}" class="btn btn-gold btn-lg">Apply via Email</a>`
      : '';

  const content = `
    <section class="section">
      <div class="container">
        <div class="layout-sidebar">
          <div>
            <div class="job-detail-card">
              <div class="job-detail-header">
                <div>
                  <h2 style="color:var(--green-deep);margin-bottom:8px;">${escHtml(m.title || job.slug)}</h2>
                  <div class="job-company" style="font-size:1rem;">
                    <span>🏢</span> ${escHtml(m.company || '')} · ${escHtml(m.location || 'Creston, IA')}
                  </div>
                  <div class="job-tags" style="margin-top:12px;">
                    ${m.type     ? `<span class="tag tag-green">${escHtml(m.type)}</span>` : ''}
                    ${m.category ? `<span class="tag tag-navy">${escHtml(m.category)}</span>` : ''}
                    ${m.pay      ? `<span class="tag tag-gold">${escHtml(m.pay)}</span>` : ''}
                    ${m.featured === true ? `<span class="tag tag-gold">⭐ Featured</span>` : ''}
                  </div>
                </div>
                <div style="flex-shrink:0;">
                  ${applyBtn}
                </div>
              </div>

              <div class="job-detail-meta">
                ${m.posted  ? `<div class="att-meta-item">📅 Posted: ${formatDate(m.posted)}</div>` : ''}
                ${m.expires ? `<div class="att-meta-item">⏰ Listing expires: ${formatDate(m.expires)}</div>` : ''}
                ${m.location ? `<div class="att-meta-item">📍 ${escHtml(m.location)}</div>` : ''}
              </div>

              <div class="job-detail-body markdown-body">
                ${job.html}
              </div>

              <div class="job-detail-footer">
                ${applyBtn}
                <a href="/jobs" class="btn btn-outline">← Back to Job Board</a>
              </div>
            </div>
          </div>

          <aside>
            <div class="sidebar-widget" style="margin-bottom:20px;">
              <div class="widget-header">📋 Job Summary</div>
              <div class="widget-body">
                ${infoRow('Company',  m.company)}
                ${infoRow('Location', m.location || 'Creston, IA')}
                ${infoRow('Type',     m.type)}
                ${infoRow('Category', m.category)}
                ${infoRow('Pay',      m.pay)}
                ${infoRow('Posted',   formatDate(m.posted))}
                ${infoRow('Expires',  formatDate(m.expires))}
              </div>
            </div>
            ${adSlot('square', cfg)}
          </aside>
        </div>
      </div>
    </section>`;

  return htmlResponse(await renderShell({
    title:      m.title || job.slug,
    description: `${m.title} at ${m.company} in ${m.location || 'Creston, IA'}. ${m.type || ''} position.`,
    eyebrow:    '💼 Job Listing',
    heading:    m.title || job.slug,
    subheading: `${m.company || ''} · ${m.location || 'Creston, IA'}`,
    activeNav:  'Jobs',
    env,
    config: cfg,
    content,
  }));
}

// ── Render helpers ───────────────────────────────────────────
function renderJobCard(job) {
  const m = job.meta;
  const isFeatured = m.featured === true;

  return `
    <div class="job-listing${isFeatured ? ' featured' : ''}"
         data-category="${escHtml(m.category || '')}"
         data-type="${escHtml(m.type || '')}">
      ${isFeatured ? '<!-- featured -->' : ''}
      <div>
        <h3 class="job-title">
          <a href="/jobs/${escHtml(job.slug)}">${escHtml(m.title || job.slug)}</a>
        </h3>
        <div class="job-company">
          <span>🏢</span> ${escHtml(m.company || '')} · ${escHtml(m.location || 'Creston, IA')}
        </div>
        ${m.summary ? `<p class="job-desc">${escHtml(m.summary)}</p>` : ''}
        <div class="job-tags">
          ${m.type     ? `<span class="tag tag-green">${escHtml(m.type)}</span>` : ''}
          ${m.category ? `<span class="tag tag-navy">${escHtml(m.category)}</span>` : ''}
          ${m.pay      ? `<span class="tag tag-gold">${escHtml(m.pay)}</span>` : ''}
        </div>
      </div>
      <div class="job-actions">
        <div class="job-date">Posted: ${formatDate(m.posted)}</div>
        <a href="/jobs/${escHtml(job.slug)}" class="btn btn-outline" style="font-size:.82rem;padding:9px 18px;">View &amp; Apply</a>
      </div>
    </div>`;
}

function renderCategorySidebar(jobs) {
  const counts = {};
  for (const j of jobs) {
    const cat = j.meta.category || 'Other';
    counts[cat] = (counts[cat] || 0) + 1;
  }
  if (Object.keys(counts).length === 0) return '';

  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:.85rem;padding:4px 0;border-bottom:1px solid var(--border);">
        <span style="font-family:var(--font-ui);">${escHtml(cat)}</span>
        <span class="tag tag-green">${n} open</span>
      </div>`).join('');

  return `<div class="sidebar-widget" style="margin-bottom:20px;">
    <div class="widget-header">📊 By Category</div>
    <div class="widget-body">${rows}</div>
  </div>`;
}

function getCategoryOptions(jobs) {
  const cats = [...new Set(jobs.map(j => j.meta.category).filter(Boolean))].sort();
  return cats.map(c => `<option>${escHtml(c)}</option>`).join('');
}

function infoRow(label, value) {
  if (!value) return '';
  return `<div class="info-block" style="padding:8px 0;">
    <div><h4>${escHtml(label)}</h4><p style="margin:0;">${escHtml(String(value))}</p></div>
  </div>`;
}

function htmlResponse(html) {
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    }
  });
}
