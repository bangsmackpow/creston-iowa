/**
 * handlers/attractions.js
 * Serves /attractions and /attractions/:slug
 * Reads from R2: attractions/*.md
 */

import { listContent, findBySlug } from '../r2.js';
import { renderShell, escHtml, adSlot } from '../shell.js';
import { getSiteConfig } from '../db/site.js';
import { buildSEO } from '../seo.js';
import { shareBar } from './meetings.js';

export async function handleAttractions(request, env, url) {
  const slug = url.pathname.replace(/^\/attractions\/?/, '').split('/').filter(Boolean)[0];
  if (slug) return renderAttractionDetail(request, env, slug);
  return renderAttractionList(request, env);
}

async function renderAttractionList(request, env) {
  const cfg = await getSiteConfig(env);
  const items = await listContent(env, 'attractions');

  const cards = items.length === 0
    ? `<div class="empty-state"><div style="font-size:3rem;margin-bottom:16px;">🎈</div><h3>No Attractions Listed Yet</h3></div>`
    : items.map(renderAttractionCard).join('\n');

  const content = `
    <section class="section">
      <div class="container">
        <div class="grid-4" id="attraction-grid">
          ${cards}
        </div>
      </div>
    </section>`;

  return htmlResponse(await renderShell({
    title:       'Attractions & Things To Do',
    description: 'Things to do in Creston, Iowa — Balloon Days, lakes, murals, the CB&Q Depot, historical village, trails, and more.',
    eyebrow:     '🎈 Explore Creston',
    heading:     'Things To Do',
    subheading:  'Outdoor adventures, rich railroad heritage, vibrant arts, and Iowa\'s best balloon festival.',
    activeNav:   'Attractions',
    env,
    config: cfg,
    content,
  }));
}

async function renderAttractionDetail(request, env, slug) {
  const cfg = await getSiteConfig(env);
  const item = await findBySlug(env, 'attractions', slug);
  if (!item) return new Response('Attraction not found', { status: 404 });

  const m = item.meta;

  const content = `
    <section class="section">
      <div class="container">
        <div class="attraction-detail">
          <div class="attraction-header">
            <div class="attraction-header-icon">${escHtml(m.emoji || '🎈')}</div>
            <div>
              <h2>${escHtml(m.name || item.slug)}</h2>
              <p>${escHtml(m.tagline || m.category || '')}</p>
            </div>
          </div>
          <div class="attraction-body">
            <div class="markdown-body">${item.html}</div>
            <div class="attraction-meta">
              ${m.season   ? `<div class="att-meta-item">📅 ${escHtml(m.season)}</div>` : ''}
              ${m.location ? `<div class="att-meta-item">📍 ${escHtml(m.location)}</div>` : ''}
              ${m.phone    ? `<div class="att-meta-item">📞 <a href="tel:${escHtml(m.phone.replace(/\D/g,''))}">${escHtml(m.phone)}</a></div>` : ''}
              ${m.website  ? `<div class="att-meta-item">🌐 <a href="${escHtml(m.website)}" target="_blank" rel="noopener">${escHtml(m.website.replace(/^https?:\/\//,''))}</a></div>` : ''}
              ${m.cost     ? `<div class="att-meta-item">💡 ${escHtml(m.cost)}</div>` : ''}
            </div>
          </div>
        </div>
        ${shareBar((cfg.url || 'https://creston-iowa.com') + '/attractions/' + item.slug, m.name || item.slug, m.summary || (m.name + " - Creston, Iowa"))}

              <a href="/attractions" class="btn btn-outline mt-3">← Back to Attractions</a>
      </div>
    </section>`;

  const seo = buildSEO({ type:'attractions', meta:m, slug:item.slug, cfg, pageUrl:`${cfg.url||''}/attractions/${item.slug}`, html:item.html });
  return htmlResponse(await renderShell({
    title:       seo.title,
    description: seo.description,
    schema:      seo.schema,
    canonical:   seo.fullUrl,
    ogImage:     seo.imgUrl,
    eyebrow:     `🎈 ${m.category || 'Attraction'}`,
    heading:     m.name || item.slug,
    subheading:  m.tagline || '',
    activeNav:   'Attractions',
    env,
    config: cfg,
    content,
  }));
}

function renderAttractionCard(item) {
  const m = item.meta;
  return `
    <a href="/attractions/${escHtml(item.slug)}" class="attract-card">
      <span class="attract-icon">${escHtml(m.emoji || '🎈')}</span>
      <h4>${escHtml(m.name || item.slug)}</h4>
      <p>${escHtml(m.tagline || m.summary || '')}</p>
    </a>`;
}

function htmlResponse(html) {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' }
  });
}
