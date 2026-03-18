/**
 * handlers/food.js
 * Serves /food (grid) and /food/:slug (detail)
 * Reads from R2: food/*.md
 */

import { listContent, findBySlug } from '../r2.js';
import { renderShell, escHtml, adSlot } from '../shell.js';
import { getSiteConfig } from '../db/site.js';

export async function handleFood(request, env, url) {
  const slug = url.pathname.replace(/^\/food\/?/, '').split('/').filter(Boolean)[0];

  if (slug) return renderFoodDetail(request, env, slug);
  return renderFoodList(request, env);
}

async function renderFoodList(request, env) {
  const cfg = await getSiteConfig(env);
  const items = await listContent(env, 'food');

  const CATEGORIES = ['steakhouse','mexican','american','chinese','cafe','pizza','bar','brewery','other'];

  const filterBtns = ['All', ...CATEGORIES.map(c => c.charAt(0).toUpperCase() + c.slice(1))]
    .map((label, i) => {
      const val = i === 0 ? 'all' : label.toLowerCase();
      return `<button class="filter-btn${i === 0 ? ' active' : ''}" data-filter="${val}">${label}</button>`;
    }).join('\n');

  const cards = items.length === 0
    ? `<div class="empty-state"><div style="font-size:3rem;margin-bottom:16px;">🍽️</div><h3>No Restaurants Yet</h3><p>Check back soon.</p></div>`
    : items.map(renderFoodCard).join('\n');

  const content = `
    <div class="container" style="padding:24px 24px 0;">
      ${adSlot('leaderboard', cfg)}
    </div>

    <section class="section">
      <div class="container">
        <div class="filter-bar">${filterBtns}</div>
        <div class="restaurant-grid" id="food-grid">
          ${cards}
        </div>

        <div class="submit-cta">
          <div>
            <h3>Missing a Restaurant?</h3>
            <p>Know a Creston-area eatery that should be listed? Submit it and we'll add it.</p>
          </div>
          <a href="/contact" class="btn btn-primary">Submit a Restaurant</a>
        </div>
      </div>
    </section>

    <script>
      const btns  = document.querySelectorAll('.filter-btn');
      const cards = document.querySelectorAll('.restaurant-card');
      btns.forEach(btn => {
        btn.addEventListener('click', () => {
          btns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const filter = btn.dataset.filter;
          cards.forEach(card => {
            const show = filter === 'all' || (card.dataset.category || '').includes(filter);
            card.style.display = show ? '' : 'none';
          });
        });
      });
    </script>`;

  return htmlResponse(await renderShell({
    title:       'Dining & Restaurants',
    description: `Creston Iowa restaurant guide — ${items.length} local restaurants and eateries in Union County.`,
    eyebrow:     '🍽️ Eat & Drink',
    heading:     'Dining in Creston',
    subheading:  'From chophouses and cantinas to espresso bars and craft breweries.',
    activeNav:   'Dining',
    env,
    config: cfg,
    content,
  }));
}

async function renderFoodDetail(request, env, slug) {
  const cfg = await getSiteConfig(env);
  const item = await findBySlug(env, 'food', slug);
  if (!item) return new Response('Restaurant not found', { status: 404 });

  const m = item.meta;

  const content = `
    <section class="section">
      <div class="container">
        <div class="layout-sidebar">
          <div>
            <div class="attraction-detail">
              <div class="attraction-header" style="background:linear-gradient(135deg,var(--green-mid),var(--green-deep));">
                <div class="attraction-header-icon">${escHtml(m.emoji || '🍽️')}</div>
                <div>
                  <h2>${escHtml(m.name || item.slug)}</h2>
                  <p>${escHtml(m.category || '')}${m.price ? ' · ' + escHtml(m.price) : ''}</p>
                </div>
              </div>
              <div class="attraction-body">
                <div class="markdown-body">${item.html}</div>
                <div class="attraction-meta">
                  ${m.address  ? `<div class="att-meta-item">📍 ${escHtml(m.address)}</div>` : ''}
                  ${m.phone    ? `<div class="att-meta-item">📞 <a href="tel:${escHtml(m.phone.replace(/\D/g,''))}">${escHtml(m.phone)}</a></div>` : ''}
                  ${m.website  ? `<div class="att-meta-item">🌐 <a href="${escHtml(m.website)}" target="_blank" rel="noopener">${escHtml(m.website.replace(/^https?:\/\//,''))}</a></div>` : ''}
                  ${m.hours    ? `<div class="att-meta-item">🕐 ${escHtml(m.hours)}</div>` : ''}
                </div>
              </div>
            </div>
            <a href="/food" class="btn btn-outline mt-3">← Back to Dining</a>
          </div>
          <aside>
            <div class="sidebar-widget" style="margin-bottom:20px;">
              <div class="widget-header">📋 Quick Info</div>
              <div class="widget-body">
                ${infoRow('Address', m.address)}
                ${infoRow('Phone',   m.phone)}
                ${infoRow('Hours',   m.hours)}
                ${infoRow('Price',   m.price)}
                ${m.tags && Array.isArray(m.tags) ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">${m.tags.map(t => `<span class="tag tag-green">${escHtml(t)}</span>`).join('')}</div>` : ''}
              </div>
            </div>
            ${adSlot('square', cfg)}
          </aside>
        </div>
      </div>
    </section>`;

  return htmlResponse(await renderShell({
    title:       m.name || item.slug,
    description: `${m.name} — ${m.category || 'restaurant'} in Creston, Iowa. ${m.address || ''}`,
    eyebrow:     '🍽️ Restaurant',
    heading:     m.name || item.slug,
    subheading:  `${m.category || ''}${m.address ? ' · ' + m.address : ''}`,
    activeNav:   'Dining',
    env,
    config: cfg,
    content,
  }));
}

function renderFoodCard(item) {
  const m       = item.meta;
  const cat     = (m.category || 'other').toLowerCase();
  const bgColor = {
    steakhouse: 'linear-gradient(135deg,var(--green-mid),var(--green-deep))',
    mexican:    'linear-gradient(135deg,var(--gold),#8a5a1a)',
    american:   'linear-gradient(135deg,var(--navy-mid),var(--navy))',
    chinese:    'linear-gradient(135deg,#1a4a2a,#2d6a3d)',
    cafe:       'linear-gradient(135deg,#5c3d2e,#8b6041)',
    pizza:      'linear-gradient(135deg,#8b3a0f,#c05020)',
    bar:        'linear-gradient(135deg,#3a2a1a,#6b4a2a)',
    brewery:    'linear-gradient(135deg,#2d4a6b,#1c2b45)',
    other:      'linear-gradient(135deg,#4a5a6a,#6a7a8a)',
  }[cat] || 'linear-gradient(135deg,var(--green-mid),var(--green-deep))';

  return `
    <div class="restaurant-card" data-category="${escHtml(cat)}">
      <div class="rc-header" style="background:${bgColor};">
        <span class="rc-emoji">${escHtml(m.emoji || '🍽️')}</span>
        ${m.featured === true ? `<div class="rc-badges"><span class="tag tag-gold">Featured</span></div>` : ''}
      </div>
      <div class="rc-body">
        <div class="card-tag">${escHtml(m.category || 'Restaurant')}</div>
        <h3><a href="/food/${escHtml(item.slug)}" style="color:var(--green-deep);">${escHtml(m.name || item.slug)}</a></h3>
        <p>${escHtml(m.summary || '')}</p>
        <div class="rc-meta-grid">
          ${m.address ? `<div class="rc-meta-item"><span>📍</span> ${escHtml(m.address)}</div>` : ''}
          ${m.phone   ? `<div class="rc-meta-item"><span>📞</span> <a href="tel:${escHtml(m.phone.replace(/\D/g,''))}">${escHtml(m.phone)}</a></div>` : ''}
        </div>
        <div class="flex gap-1 mt-2" style="flex-wrap:wrap;">
          ${m.tags && Array.isArray(m.tags) ? m.tags.map(t => `<span class="tag tag-green">${escHtml(t)}</span>`).join('') : ''}
          ${m.price ? `<span class="tag tag-navy">${escHtml(m.price)}</span>` : ''}
        </div>
      </div>
    </div>`;
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
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    }
  });
}
