/**
 * handlers/news.js
 * Serves /news and /news/:slug
 * Reads from R2: news/*.md
 */

import { listContent, findBySlug } from '../r2.js';
import { renderShell, escHtml, adSlot } from '../shell.js';
import { getSiteConfig } from '../db/site.js';
import { shareBar } from './meetings.js';
import { formatDate } from '../markdown.js';

export async function handleNews(request, env, url) {
  const slug = url.pathname.replace(/^\/news\/?/, '').split('/').filter(Boolean)[0];
  if (slug) return renderNewsDetail(request, env, slug);
  return renderNewsList(request, env);
}

async function renderNewsList(request, env) {
  const cfg = await getSiteConfig(env);
  const articles = await listContent(env, 'news');

  const articleCards = articles.length === 0
    ? `<div class="empty-state"><div style="font-size:3rem;margin-bottom:16px;">📰</div><h3>No News Yet</h3><p>Check back soon, or <a href="/contact">submit a news tip</a>.</p></div>`
    : articles.map(renderNewsCard).join('\n');

  const content = `
    <section class="section">
      <div class="container">
        <div class="news-layout">
          <div>
            <div class="news-article-list">
              ${articleCards}
            </div>
            <div class="submit-cta" style="margin-top:32px;">
              <div>
                <h3>Have News to Share?</h3>
                <p>Submit a tip, press release, or community announcement.</p>
              </div>
              <a href="mailto:news@creston-iowa.com" class="btn btn-primary">Submit News</a>
            </div>
          </div>
          <aside>
            <div class="sidebar-widget" style="margin-bottom:20px;">
              <div class="widget-header">📰 Official Sources</div>
              <div class="widget-body">
                <ul style="display:flex;flex-direction:column;gap:10px;">
                  <li><a href="https://www.crestonnews.com" target="_blank" style="font-family:var(--font-ui);font-size:.9rem;font-weight:600;">Creston News Advertiser</a></li>
                  <li><a href="https://www.ksibradio.com" target="_blank" style="font-family:var(--font-ui);font-size:.9rem;font-weight:600;">KSIB Radio</a></li>
                  <li><a href="https://www.crestoniowa.gov" target="_blank" style="font-family:var(--font-ui);font-size:.9rem;font-weight:600;">City of Creston Official</a></li>
                </ul>
              </div>
            </div>
            ${adSlot('square', cfg)}
          </aside>
        </div>
      </div>
    </section>`;

  return htmlResponse(await renderShell({
    title:       'News & Updates',
    description: 'Community news, events, and announcements from Creston and Union County, Iowa.',
    eyebrow:     '📰 Local News',
    heading:     'Creston News & Updates',
    subheading:  'Community news, events, and announcements from Creston and Union County, Iowa.',
    activeNav:   'News',
    env,
    config: cfg,
    content,
  }));
}

async function renderNewsDetail(request, env, slug) {
  const cfg = await getSiteConfig(env);
  const article = await findBySlug(env, 'news', slug);
  if (!article) return new Response('Article not found', { status: 404 });
  const m = article.meta;

  const content = `
    <section class="section">
      <div class="container">
        <div class="layout-sidebar">
          <article>
            <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-md);padding:36px;box-shadow:var(--shadow-sm);">
              <div class="flex gap-2" style="margin-bottom:16px;flex-wrap:wrap;align-items:center;">
                ${m.category ? `<span class="tag tag-green">${escHtml(m.category)}</span>` : ''}
                ${m.date     ? `<span class="card-meta">📅 ${formatDate(m.date)}</span>` : ''}
                ${m.author   ? `<span class="card-meta">✍️ ${escHtml(m.author)}</span>` : ''}
              </div>
              <h2 style="margin-bottom:20px;">${escHtml(m.title || article.slug)}</h2>
              <div class="markdown-body">${article.html}</div>
            </div>
            <div class="flex gap-2 mt-3">
              ${shareBar((cfg.url || 'https://creston-iowa.com') + '/news/' + article.slug, m.title || article.slug, m.summary || m.title)}

              <a href="/news" class="btn btn-outline">← Back to News</a>
            </div>
          </article>
          <aside>
            <div class="sidebar-widget" style="margin-bottom:20px;">
              <div class="widget-header">📋 Article Info</div>
              <div class="widget-body">
                ${m.date     ? `<div class="info-block" style="padding:8px 0;"><div><h4>Date</h4><p style="margin:0;">${formatDate(m.date)}</p></div></div>` : ''}
                ${m.category ? `<div class="info-block" style="padding:8px 0;"><div><h4>Category</h4><p style="margin:0;">${escHtml(m.category)}</p></div></div>` : ''}
                ${m.author   ? `<div class="info-block" style="padding:8px 0;border:none;"><div><h4>Author</h4><p style="margin:0;">${escHtml(m.author)}</p></div></div>` : ''}
              </div>
            </div>
            ${adSlot('square', cfg)}
          </aside>
        </div>
      </div>
    </section>`;

  return htmlResponse(await renderShell({
    title:       m.title || article.slug,
    description: m.summary || m.title || '',
    eyebrow:     `📰 ${m.category || 'News'}`,
    heading:     m.title || article.slug,
    subheading:  m.summary || '',
    activeNav:   'News',
    env,
    config: cfg,
    content,
  }));
}

function renderNewsCard(article) {
  const m    = article.meta;
  const date = m.date ? new Date(m.date + 'T12:00:00') : null;
  const day   = date ? date.getDate() : '—';
  const month = date ? date.toLocaleString('en-US', { month: 'short' }).toUpperCase() : '';
  const year  = date ? date.getFullYear() : '';

  return `
    <article class="news-article">
      <div class="na-date">
        <div class="day">${day}</div>
        <div class="month">${month}</div>
        <div class="year">${year}</div>
      </div>
      <div class="na-body">
        ${m.category ? `<span class="card-tag">${escHtml(m.category)}</span>` : ''}
        <h3><a href="/news/${escHtml(article.slug)}">${escHtml(m.title || article.slug)}</a></h3>
        ${m.summary ? `<p>${escHtml(m.summary)}</p>` : ''}
        <div class="flex gap-1">
          ${m.category ? `<span class="tag tag-green">${escHtml(m.category)}</span>` : ''}
        </div>
      </div>
    </article>`;
}

function htmlResponse(html) {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' }
  });
}
