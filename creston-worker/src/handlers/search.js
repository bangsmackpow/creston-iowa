/**
 * src/handlers/search.js
 * Two-mode search:
 *
 * PUBLIC  /search?q=...
 *   Full-text search across R2 content (news, food, jobs, events,
 *   attractions, meetings, notices, documents, pages, directory).
 *   Returns ranked results grouped by type.
 *
 * ADMIN   /admin/search?q=...
 *   Everything above PLUS admin content (drafts, bulletin pending)
 *   PLUS a built-in training guide / help system that explains
 *   every feature, setting, and workflow in the platform.
 */

import { renderShell, escHtml } from '../shell.js';
import { getSiteConfig }        from '../db/site.js';
import { parseMarkdown }        from '../markdown.js';
import { adminPage }            from './admin-page.js';

// ── Content index — all R2 prefixes to search ──────────────────
const PUBLIC_PREFIXES = [
  { prefix: 'news/',         type: 'News',        emoji: '📰', base: '/news/' },
  { prefix: 'food/',         type: 'Dining',       emoji: '🍽️', base: '/food/' },
  { prefix: 'jobs/active/',  type: 'Jobs',         emoji: '💼', base: '/jobs/' },
  { prefix: 'events/',       type: 'Events',       emoji: '📅', base: '/events/' },
  { prefix: 'attractions/',  type: 'Attractions',  emoji: '🎈', base: '/attractions/' },
  { prefix: 'meetings/',     type: 'Meetings',     emoji: '🏛️', base: '/meetings/' },
  { prefix: 'notices/',      type: 'Notices',      emoji: '📢', base: '/notices/' },
  { prefix: 'documents/',    type: 'Documents',    emoji: '📂', base: '/documents/' },
  { prefix: 'pages/',        type: 'Pages',        emoji: '📄', base: '/' },
  { prefix: 'directory/',    type: 'Directory',    emoji: '🏪', base: '/directory/' },
  { prefix: 'bulletin/approved/', type: 'Bulletin', emoji: '📌', base: '/bulletin/' },
];

const ADMIN_EXTRA_PREFIXES = [
  { prefix: 'drafts/',       type: 'Drafts',       emoji: '📝', base: '/admin/drafts', adminOnly: true },
  { prefix: 'bulletin/pending/', type: 'Pending Bulletin', emoji: '📌', base: '/admin/bulletin', adminOnly: true },
];

// ── Built-in admin help / training guide ──────────────────────
const HELP_ARTICLES = [
  {
    id: 'content-news',
    title: 'Publishing News Articles',
    section: 'Content Management',
    keywords: 'news article publish write create headline',
    body: `Go to <strong>Admin → News → + Write Article</strong>. Fill in the frontmatter fields at the top:
    <code>title</code>, <code>category</code>, <code>date</code>, <code>author</code>, <code>summary</code>.
    Write your article body in Markdown below the <code>---</code> separator. Use the <strong>AI toolbar</strong>
    (🤖 AI ▾) to fix grammar, improve writing, or auto-generate a summary. Set <strong>Status</strong> to
    "Draft" to save without publishing. Click <strong>Save Changes</strong> to go live instantly.
    Articles appear at <a href="/news">/news</a> and on the homepage news feed.`,
  },
  {
    id: 'content-jobs',
    title: 'Posting Jobs',
    section: 'Content Management',
    keywords: 'job post employer listing credit expire featured',
    body: `Employers purchase credits via <a href="/jobs/post">/jobs/post</a> (Stripe billing). Each credit = one
    job posting. Admins can also add credits manually in <strong>Admin → Companies</strong>. To post a job:
    <strong>Admin → Jobs → + New Job</strong>. Required frontmatter: <code>title</code>, <code>company</code>,
    <code>location</code>, <code>type</code> (Full-Time/Part-Time), <code>pay</code>, <code>expires</code>.
    Jobs auto-expire when the expires date passes. Use <strong>Expire</strong> / <strong>Restore</strong>
    buttons in the job list to manage active/expired status. Featured jobs appear first and have a ⭐ badge.`,
  },
  {
    id: 'content-events',
    title: 'Adding Events',
    section: 'Content Management',
    keywords: 'event calendar ical feed date location recurring',
    body: `Go to <strong>Admin → Events → + New Event</strong>. Required frontmatter: <code>title</code>,
    <code>date</code>, <code>time</code>, <code>location</code>, <code>category</code>, <code>summary</code>.
    Optional: <code>end_date</code>, <code>cost</code>, <code>registration_url</code>, <code>featured: true</code>.
    Events appear at <a href="/events">/events</a> sorted by date. An iCal feed is available at
    <a href="/events/feed.ical">/events/feed.ical</a> — residents can subscribe in Google Calendar,
    Apple Calendar, or Outlook. Featured events appear at the top of the listing.`,
  },
  {
    id: 'content-meetings',
    title: 'Managing Meeting Minutes & Agendas',
    section: 'Content Management',
    keywords: 'meeting minutes agenda PDF council board upload',
    body: `Go to <strong>Admin → Meetings → + New Meeting</strong>. Frontmatter: <code>title</code>,
    <code>date</code>, <code>time</code>, <code>location</code>, <code>body</code> (council/board/commission),
    <code>status</code> (upcoming/completed/cancelled). For minutes and agendas: upload PDFs to
    <strong>Admin → Media</strong> first, copy the URL, then add to frontmatter as <code>minutes_pdf</code>
    and <code>agenda_pdf</code>. Past meetings show ⬇ Download buttons automatically.`,
  },
  {
    id: 'content-directory',
    title: 'Business Directory',
    section: 'Content Management',
    keywords: 'business directory listing company phone hours address',
    body: `The business directory at <a href="/directory">/directory</a> is admin-managed (businesses don't
    self-register). Go to <strong>Admin → Directory → + Add Business</strong>. Frontmatter fields:
    <code>name</code>, <code>category</code>, <code>address</code>, <code>phone</code>, <code>website</code>,
    <code>hours</code>, <code>email</code>, <code>summary</code>, <code>featured: true/false</code>.
    Featured businesses appear in a highlighted card at the top. Categories filter the sidebar.`,
  },
  {
    id: 'content-drafts',
    title: 'Drafts & Scheduled Publishing',
    section: 'Content Management',
    keywords: 'draft schedule publish date future queue',
    body: `In any content editor, set the <strong>Status</strong> dropdown to "Draft" to save without
    publishing. Optionally set a <strong>Publish On</strong> date — the daily cron at 6am auto-publishes
    when the date arrives and emails you a notification. View all drafts at <strong>Admin → Drafts</strong>.
    Click <strong>▶ Publish Now</strong> to publish immediately. Drafts are invisible to public visitors
    and don't appear in search results or the sitemap.`,
  },
  {
    id: 'citizen-311',
    title: '311 Service Requests',
    section: 'Citizen Services',
    keywords: '311 request pothole streetlight park complaint status assign priority',
    body: `Residents submit requests at <a href="/311">/311</a> and receive a ticket ID (SR-2025-XXXX).
    Manage at <strong>Admin → 311 Requests</strong>. Use the <strong>Status</strong> dropdown to update
    (Open → In Progress → Resolved → Closed). The resident receives an email on every status change.
    <strong>Priority</strong> controls sort order (Urgent appears first). Add internal <strong>Notes</strong>
    visible only to staff. Filter by status using the pill buttons above the table.`,
  },
  {
    id: 'citizen-foia',
    title: 'FOIA / Open Records Requests',
    section: 'Citizen Services',
    keywords: 'FOIA records request Iowa law 10 days overdue deadline fulfill deny',
    body: `Under <strong>Iowa Code Chapter 22</strong>, you must respond to open records requests within
    <strong>10 business days</strong>. Requests appear at <strong>Admin → FOIA</strong>. Red rows = overdue.
    Update status using the dropdown: Received → In Review → Fulfilled / Partial / Denied.
    For denial, add a denial reason in the notes. The requester is emailed on every status change.
    To fulfill: upload documents to Media Library, share the URL with the requester via email reply.`,
  },
  {
    id: 'citizen-bulletin',
    title: 'Community Bulletin Board',
    section: 'Citizen Services',
    keywords: 'bulletin board community post approve moderate pending reject',
    body: `Residents submit posts at <a href="/bulletin/submit">/bulletin/submit</a>. Posts go to a
    <strong>pending queue</strong> and are invisible until approved. Go to <strong>Admin → Bulletin</strong>
    to review pending posts — click <strong>Approve</strong> to publish or <strong>Reject</strong> to decline.
    Approved posts appear at <a href="/bulletin">/bulletin</a>. You can also add posts directly from admin.
    Moderation protects against spam and inappropriate content.`,
  },
  {
    id: 'citizen-permits',
    title: 'Permits & Licenses',
    section: 'Citizen Services',
    keywords: 'permit license garage sale burn sign event building approve deny',
    body: `Residents apply online at <a href="/permits">/permits</a>. Applications land in
    <strong>Admin → Permits</strong> with "Pending" status. Use the status dropdown to Approve or Deny.
    The applicant receives an email with the decision. Garage sale permits are auto-approved (no action needed).
    For building permits, you may want to add notes with conditions. Permit ID format: PRMT-2025-XXX.
    Residents track their permit at <a href="/permits/track">/permits/track</a>.`,
  },
  {
    id: 'ai-writing',
    title: 'AI Writing Assistant',
    section: 'AI Features',
    keywords: 'AI write assistant grammar rewrite formal friendly summary title meta',
    body: `The AI writing assistant appears in every content editor — click <strong>🤖 AI ▾</strong> in
    the toolbar. <strong>Select text first</strong> to apply an action to just that selection, or leave the
    cursor anywhere to process the full document. Actions:
    <ul style="margin:8px 0 0 16px;line-height:2;">
      <li><strong>Rewrite / Improve</strong> — clearer, more engaging version</li>
      <li><strong>Fix Grammar</strong> — spelling and punctuation only</li>
      <li><strong>Make Formal / Friendly</strong> — tone adjustment</li>
      <li><strong>Expand Bullets</strong> — turn bullet points into paragraphs</li>
      <li><strong>Write Summary</strong> — generates the summary frontmatter field</li>
      <li><strong>Suggest Titles</strong> — 3 headline options</li>
      <li><strong>Meta Description</strong> — SEO-optimized 160-char description</li>
    </ul>
    Requires Workers AI binding named "AI" in Cloudflare Pages → Settings → Functions.`,
  },
  {
    id: 'ai-suggestions',
    title: 'AI Content Suggestions',
    section: 'AI Features',
    keywords: 'suggestions RSS feed AI approve reject scan auto content',
    body: `The AI scans configured RSS feeds and suggests content relevant to Creston. Go to
    <strong>Admin → AI Suggestions</strong>. Click <strong>▶ Run Now</strong> to scan immediately, or
    <strong>↺ Run Fresh</strong> to ignore previously-seen items. Configure feeds at
    <strong>Manage Feeds</strong> — add the Creston News Advertiser feed, Iowa Workforce Development
    for jobs, and any other local sources. Approve a suggestion to import it as a draft. Reject to dismiss.
    The scanner also runs automatically as part of the daily cron.`,
  },
  {
    id: 'comms-newsletter',
    title: 'Email Newsletter',
    section: 'Communications',
    keywords: 'newsletter email campaign broadcast subscribers Resend send',
    body: `Go to <strong>Admin → Newsletter → + New Campaign</strong>. Write your newsletter in Markdown —
    the preview shows the formatted email. Subject line and preview text appear in email clients.
    Send to your full subscriber list or a segment. Subscribers join at <a href="/subscribe">/subscribe</a>.
    View subscriber list at <strong>Admin → Newsletter → Subscribers</strong>. Powered by
    <a href="https://resend.com" target="_blank">Resend</a> — requires <code>RESEND_API_KEY</code>,
    <code>RESEND_AUDIENCE_ID</code> secrets in Cloudflare.`,
  },
  {
    id: 'comms-sms',
    title: 'SMS Alerts',
    section: 'Communications',
    keywords: 'SMS text message Twilio alert emergency broadcast phone',
    body: `Go to <strong>Admin → SMS Alerts</strong> to send text messages to opted-in subscribers.
    Residents subscribe at <a href="/subscribe">/subscribe</a> or by texting in. Messages support
    categories: All, Emergency, News, Events. Messages over 160 characters count as 2 SMS messages.
    STOP/START replies are handled automatically via the webhook. Requires Twilio secrets:
    <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code>, <code>TWILIO_FROM_NUMBER</code>.
    Set webhook URL in Twilio console: <code>https://creston-iowa.com/api/sms/webhook</code>.`,
  },
  {
    id: 'comms-social',
    title: 'Social Media Auto-Post',
    section: 'Communications',
    keywords: 'social Facebook Twitter X auto-post syndicate share',
    body: `Enable at <strong>Settings → Features → Social media auto-post</strong>. When enabled, publishing
    news, jobs, or events automatically posts to Facebook and/or Twitter/X. Go to
    <strong>Admin → Social</strong> to check connection status and send test posts. Requires secrets:
    Facebook: <code>FACEBOOK_PAGE_ID</code>, <code>FACEBOOK_ACCESS_TOKEN</code>.
    Twitter/X: <code>TWITTER_API_KEY</code>, <code>TWITTER_API_SECRET</code>,
    <code>TWITTER_ACCESS_TOKEN</code>, <code>TWITTER_ACCESS_SECRET</code>.`,
  },
  {
    id: 'site-settings',
    title: 'Site Settings',
    section: 'Site Configuration',
    keywords: 'settings name tagline color theme font logo SEO analytics alert navigation',
    body: `Go to <strong>Admin → Settings</strong>. Eight tabs:
    <ul style="margin:8px 0 0 16px;line-height:2.2;">
      <li><strong>General</strong> — site name, tagline, contact email, address</li>
      <li><strong>Design</strong> — colors, fonts, logo upload</li>
      <li><strong>Navigation</strong> — reorder, show/hide, add custom links</li>
      <li><strong>Homepage</strong> — hero text, sections, feature toggles</li>
      <li><strong>Alert Banner</strong> — emergency/warning/info banner (sticky, dismissible)</li>
      <li><strong>SEO</strong> — meta title template, OG image, Google Search Console</li>
      <li><strong>Features</strong> — toggle content types on/off</li>
      <li><strong>Integrations</strong> — Resend, maps, and third-party services</li>
    </ul>
    Settings are saved to <code>config/site.json</code> in R2. Theme CSS is auto-generated on save.`,
  },
  {
    id: 'site-media',
    title: 'Media Library',
    section: 'Site Configuration',
    keywords: 'media image upload photo PDF file library URL copy',
    body: `Go to <strong>Admin → Media</strong> to upload and manage files. Click <strong>+ Upload</strong>
    to add images (JPG, PNG, GIF, WebP) or documents (PDF). Files are stored in Cloudflare R2 at
    <code>media/images/</code> and <code>media/docs/</code>. Copy a file's URL to use it in content
    frontmatter (e.g. <code>image: /media/images/photo.jpg</code>) or as a document download link.
    Delete files by clicking the trash icon. Maximum file size: 10MB per file.`,
  },
  {
    id: 'site-analytics',
    title: 'Analytics Dashboard',
    section: 'Site Configuration',
    keywords: 'analytics views visitors traffic pages popular',
    body: `Go to <strong>Admin → Analytics</strong>. Shows page views, unique visitors, top pages, and
    a daily bar chart. Switch between 7-day, 30-day, and 90-day windows. Data is collected by a
    lightweight beacon script (<code>js/analytics.js</code>) on every page — no cookies, no GDPR
    consent banners needed. Data is stored in D1 (<code>analytics_daily</code> table). Note: only
    pages served through the Pages Function are tracked (static assets like JS/CSS are not counted).`,
  },
  {
    id: 'site-users',
    title: 'Managing Admin Users',
    section: 'Site Configuration',
    keywords: 'users invite admin editor company role password',
    body: `Go to <strong>Admin → Users</strong>. Three roles:
    <ul style="margin:8px 0 0 16px;line-height:2;">
      <li><strong>superadmin</strong> — full access including settings, billing, user management</li>
      <li><strong>editor</strong> — can create/edit all content but not settings or users</li>
      <li><strong>company_admin</strong> — scoped to their company's job postings only</li>
    </ul>
    To add a user: <strong>+ Invite User</strong> → enter email → they receive a link to create their password.
    Invite links expire after 7 days. Deactivate users with the toggle — their content is preserved.
    Change your own password at <strong>Admin → Account</strong>.`,
  },
  {
    id: 'site-companies',
    title: 'Managing Companies',
    section: 'Site Configuration',
    keywords: 'company employer job credits billing plan basic featured premium',
    body: `Go to <strong>Admin → Companies</strong>. Companies are employer accounts for the job board.
    Each company has a <strong>job credits balance</strong> — one credit = one job posting. Credits are
    added via Stripe billing at <a href="/jobs/post">/jobs/post</a> or manually by superadmin.
    Plans: Basic (1 credit), Featured (1 credit + featured badge), Premium (3 credits).
    Company admins can only see and manage their own company's job listings.`,
  },
  {
    id: 'site-r2',
    title: 'R2 Storage Structure',
    section: 'Technical Reference',
    keywords: 'R2 bucket storage structure keys markdown files config',
    body: `All content is stored as Markdown files in Cloudflare R2 bucket <strong>crestoniowa</strong>.
    Structure:
    <pre style="background:#f5f5f5;padding:10px;border-radius:6px;font-size:.78rem;margin-top:8px;overflow-x:auto;">
config/site.json          ← site settings
config/theme.css          ← generated theme
pages/*.md                ← CMS pages
news/*.md                 ← news articles
food/*.md                 ← restaurants
attractions/*.md          ← attractions
jobs/active/{co}/*.md     ← active jobs
jobs/expired/{co}/*.md    ← expired jobs
events/*.md               ← events
meetings/*.md             ← meetings
directory/*.md            ← business directory
notices/*.md              ← public notices
documents/{cat}/{yr}/*.md ← document library
bulletin/pending/*.json   ← awaiting approval
bulletin/approved/*.md    ← live bulletin posts
drafts/{type}/*.md        ← saved drafts
revisions/{type}/{slug}/  ← revision history
media/images/*            ← uploaded images
media/docs/*              ← uploaded PDFs
social/log/*.json         ← social post log</pre>`,
  },
  {
    id: 'site-d1',
    title: 'D1 Database Schema',
    section: 'Technical Reference',
    keywords: 'D1 database tables schema SQL users sessions companies',
    body: `D1 database <strong>creston-auth</strong> stores auth and transactional data:
    <ul style="margin:8px 0 0 16px;line-height:2.2;font-family:monospace;font-size:.82rem;">
      <li>users — admin accounts (email, role, company_id)</li>
      <li>sessions — active admin login sessions</li>
      <li>invites — pending user invitations</li>
      <li>companies — employer accounts + job credits</li>
      <li>job_posts — mirrors of R2 job metadata</li>
      <li>service_requests — 311 tickets</li>
      <li>foia_requests — open records requests</li>
      <li>permits — permit applications</li>
      <li>residents — public resident accounts</li>
      <li>resident_sessions — resident login sessions</li>
      <li>sms_subscribers — SMS opt-in list</li>
      <li>stripe_orders — payment history</li>
      <li>analytics_daily — page view counts</li>
    </ul>
    Run <code>npx wrangler d1 migrations apply creston-auth --remote</code> after adding migrations.`,
  },
  {
    id: 'tech-deploy',
    title: 'Deployment & CI/CD',
    section: 'Technical Reference',
    keywords: 'deploy git GitHub Actions Cloudflare Pages build commit push CI/CD',
    body: `<strong>Pipeline:</strong> Laptop → git push → GitHub → Cloudflare Pages auto-build → live in ~30 seconds.
    <br><br><strong>To deploy:</strong>
    <pre style="background:#f5f5f5;padding:10px;border-radius:6px;font-size:.78rem;margin-top:8px;">
git add .
git commit -m "your message"
git push</pre>
    The build indicator on the login screen shows the current deployed commit SHA.
    <br><br><strong>R2 content</strong> (markdown files) is not deployed via git — it's written directly
    via the admin interface or <code>npx wrangler r2 object put</code>.
    <br><br><strong>D1 migrations</strong> run with:
    <code>npx wrangler d1 migrations apply creston-auth --remote</code>
    <br><br><strong>Secrets</strong> are added with:
    <code>npx wrangler secret put SECRET_NAME --remote</code>`,
  },
  {
    id: 'tech-secrets',
    title: 'Required Secrets & Environment Variables',
    section: 'Technical Reference',
    keywords: 'secrets environment variables API keys Resend Twilio Stripe Facebook Twitter',
    body: `Add secrets via <code>npx wrangler secret put NAME --remote</code> or in the Cloudflare Dashboard
    under Pages → Settings → Environment Variables.
    <table style="width:100%;border-collapse:collapse;margin-top:8px;font-family:monospace;font-size:.78rem;">
      <tr style="background:#f5f5f5;"><th style="padding:6px;text-align:left;">Secret</th><th style="padding:6px;text-align:left;">Required for</th></tr>
      <tr><td style="padding:5px;border-top:1px solid #eee;">ADMIN_TOKEN</td><td style="padding:5px;border-top:1px solid #eee;">Admin API auth</td></tr>
      <tr><td style="padding:5px;border-top:1px solid #eee;">RESEND_API_KEY</td><td style="padding:5px;border-top:1px solid #eee;">Email (newsletter, notifications)</td></tr>
      <tr><td style="padding:5px;border-top:1px solid #eee;">RESEND_AUDIENCE_ID</td><td style="padding:5px;border-top:1px solid #eee;">Newsletter subscriber list</td></tr>
      <tr><td style="padding:5px;border-top:1px solid #eee;">CONTACT_EMAIL</td><td style="padding:5px;border-top:1px solid #eee;">Admin notification destination</td></tr>
      <tr><td style="padding:5px;border-top:1px solid #eee;">CONTACT_FROM</td><td style="padding:5px;border-top:1px solid #eee;">From address for outbound email</td></tr>
      <tr><td style="padding:5px;border-top:1px solid #eee;">STRIPE_SECRET_KEY</td><td style="padding:5px;border-top:1px solid #eee;">Job board billing</td></tr>
      <tr><td style="padding:5px;border-top:1px solid #eee;">STRIPE_WEBHOOK_SECRET</td><td style="padding:5px;border-top:1px solid #eee;">Stripe webhook verification</td></tr>
      <tr><td style="padding:5px;border-top:1px solid #eee;">TWILIO_ACCOUNT_SID</td><td style="padding:5px;border-top:1px solid #eee;">SMS alerts</td></tr>
      <tr><td style="padding:5px;border-top:1px solid #eee;">TWILIO_AUTH_TOKEN</td><td style="padding:5px;border-top:1px solid #eee;">SMS alerts</td></tr>
      <tr><td style="padding:5px;border-top:1px solid #eee;">TWILIO_FROM_NUMBER</td><td style="padding:5px;border-top:1px solid #eee;">SMS alerts</td></tr>
      <tr><td style="padding:5px;border-top:1px solid #eee;">FACEBOOK_PAGE_ID</td><td style="padding:5px;border-top:1px solid #eee;">Social auto-post</td></tr>
      <tr><td style="padding:5px;border-top:1px solid #eee;">FACEBOOK_ACCESS_TOKEN</td><td style="padding:5px;border-top:1px solid #eee;">Social auto-post</td></tr>
      <tr><td style="padding:5px;border-top:1px solid #eee;">TWITTER_API_KEY</td><td style="padding:5px;border-top:1px solid #eee;">Social auto-post</td></tr>
      <tr><td style="padding:5px;border-top:1px solid #eee;">TWITTER_ACCESS_TOKEN</td><td style="padding:5px;border-top:1px solid #eee;">Social auto-post</td></tr>
    </table>`,
  },
];

// ── Public search ──────────────────────────────────────────────
export async function handleSearch(request, env, url) {
  const cfg = await getSiteConfig(env);
  const q   = (url.searchParams.get('q') || '').trim();

  if (!q) return renderSearchPage(cfg, q, [], false);

  const results = await searchContent(env, q, PUBLIC_PREFIXES);
  return renderSearchPage(cfg, q, results, false);
}

// ── Admin search + training guide ─────────────────────────────
export async function handleAdminSearch(request, env, url, user) {
  const q = (url.searchParams.get('q') || '').trim();

  // Search help articles
  const helpResults = q
    ? HELP_ARTICLES.filter(a =>
        a.title.toLowerCase().includes(q.toLowerCase()) ||
        a.keywords.toLowerCase().includes(q.toLowerCase()) ||
        a.body.toLowerCase().includes(q.toLowerCase()) ||
        a.section.toLowerCase().includes(q.toLowerCase())
      )
    : HELP_ARTICLES;

  // Search R2 content
  const contentResults = q
    ? await searchContent(env, q, [...PUBLIC_PREFIXES, ...ADMIN_EXTRA_PREFIXES])
    : [];

  const articleId = url.searchParams.get('article');
  const article   = articleId ? HELP_ARTICLES.find(a => a.id === articleId) : null;

  // Article detail view
  if (article) {
    const body = `
      <div class="settings-header">
        <div>
          <a href="/admin/search" style="font-family:sans-serif;font-size:.82rem;color:var(--green-mid);">← Help Index</a>
          <h2 style="margin-top:8px;">${escHtml(article.title)}</h2>
          <p style="color:#888;font-family:sans-serif;font-size:.85rem;">${escHtml(article.section)}</p>
        </div>
      </div>
      <div style="background:white;border:1.5px solid #e0e0e0;border-radius:12px;padding:28px;font-family:var(--font-ui);font-size:.88rem;line-height:1.9;color:#333;">
        ${article.body}
      </div>`;
    return adminPage(`📖 ${article.title}`, body, user);
  }

  // Group help by section
  const sections = [...new Set(HELP_ARTICLES.map(a => a.section))];

  const searchResults = contentResults.length > 0 ? `
    <div style="margin-bottom:28px;">
      <h3 style="font-family:sans-serif;font-size:.95rem;margin-bottom:12px;">📄 Content Results (${contentResults.length})</h3>
      ${contentResults.slice(0, 20).map(r => `
      <a href="${escHtml(r.url)}" style="display:block;padding:12px 16px;background:white;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:6px;text-decoration:none;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
          <span>${r.emoji}</span>
          <span style="font-family:sans-serif;font-size:.72rem;color:#888;text-transform:uppercase;letter-spacing:.05em;">${escHtml(r.type)}</span>
        </div>
        <div style="font-family:sans-serif;font-size:.9rem;font-weight:600;color:#1a3a2a;">${escHtml(r.title)}</div>
        ${r.summary ? `<div style="font-family:sans-serif;font-size:.8rem;color:#666;margin-top:2px;">${escHtml(r.summary.slice(0,120))}…</div>` : ''}
      </a>`).join('')}
    </div>` : q ? '<p style="font-family:sans-serif;color:#888;margin-bottom:20px;">No content found for that query.</p>' : '';

  const helpHTML = sections.map(section => {
    const articles = helpResults.filter(a => a.section === section);
    if (!articles.length) return '';
    return `
      <div style="margin-bottom:24px;">
        <div style="font-family:sans-serif;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:8px;">${escHtml(section)}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;">
          ${articles.map(a => `
          <a href="/admin/search?article=${a.id}" style="display:block;padding:14px 16px;background:white;border:1.5px solid #e0e0e0;border-radius:10px;text-decoration:none;transition:border-color .12s;">
            <div style="font-family:sans-serif;font-size:.88rem;font-weight:600;color:#1a3a2a;margin-bottom:4px;">${escHtml(a.title)}</div>
            <div style="font-family:sans-serif;font-size:.76rem;color:#888;">${escHtml(a.keywords.split(' ').slice(0,5).join(' · '))}</div>
          </a>`).join('')}
        </div>
      </div>`;
  }).join('');

  const body = `
    <div class="settings-header">
      <h2>🔍 Search & Help</h2>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:28px;">
      <input type="text" id="search-q" value="${escHtml(q)}"
             placeholder="Search content or help articles..."
             class="form-input" style="flex:1;"
             onkeydown="if(event.key==='Enter')doSearch()">
      <button onclick="doSearch()" class="btn-admin-primary">Search</button>
      ${q ? `<a href="/admin/search" class="btn-admin-secondary">Clear</a>` : ''}
    </div>

    ${searchResults}

    <div>
      <h3 style="font-family:sans-serif;font-size:.95rem;margin-bottom:16px;">
        📖 ${q ? `Help Articles (${helpResults.length})` : 'Admin Training Guide'}
      </h3>
      ${helpResults.length === 0 ? '<p style="font-family:sans-serif;color:#888;">No help articles matched your search.</p>' : helpHTML}
    </div>

    <script>
      function doSearch(){
        const q=document.getElementById('search-q').value.trim();
        if(q) window.location.href='/admin/search?q='+encodeURIComponent(q);
      }
    </script>`;

  return adminPage('🔍 Search & Help', body, user);
}

// ── Public search page renderer ────────────────────────────────
async function renderSearchPage(cfg, q, results, isAdmin) {
  const grouped = {};
  for (const r of results) {
    if (!grouped[r.type]) grouped[r.type] = [];
    grouped[r.type].push(r);
  }

  const resultHtml = results.length === 0 && q
    ? `<div style="text-align:center;padding:48px 0;font-family:var(--font-ui);color:#888;">
        <div style="font-size:3rem;margin-bottom:12px;">🔍</div>
        <h3>No results for "${escHtml(q)}"</h3>
        <p style="margin-top:8px;">Try different keywords or browse the site sections above.</p>
       </div>`
    : Object.entries(grouped).map(([type, items]) => `
      <div style="margin-bottom:28px;">
        <h3 style="font-family:var(--font-display);font-size:1.1rem;color:var(--green-deep);margin-bottom:12px;">
          ${items[0].emoji} ${type}
        </h3>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${items.slice(0,5).map(r => `
          <a href="${escHtml(r.url)}" style="display:block;padding:14px 18px;background:white;border:1.5px solid #e0e0e0;border-radius:10px;text-decoration:none;transition:border-color .15s;">
            <div style="font-family:var(--font-display);font-size:.95rem;font-weight:700;color:var(--green-deep);margin-bottom:3px;">${escHtml(r.title)}</div>
            ${r.summary ? `<div style="font-family:var(--font-ui);font-size:.82rem;color:#666;line-height:1.5;">${escHtml(r.summary.slice(0,150))}${r.summary.length>150?'…':''}</div>` : ''}
            <div style="font-family:var(--font-ui);font-size:.72rem;color:#aaa;margin-top:4px;">${escHtml(r.url)}</div>
          </a>`).join('')}
        </div>
      </div>`).join('');

  const content = `
    <section class="section">
      <div class="container" style="max-width:760px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div class="eyebrow">Site Search</div>
          <h1 style="font-family:var(--font-display);font-size:2rem;color:var(--green-deep);margin-bottom:16px;">
            ${q ? `Results for "${escHtml(q)}"` : `Search ${escHtml(cfg.name||'Creston')}`}
          </h1>
        </div>
        <form method="GET" action="/search" style="display:flex;gap:10px;margin-bottom:32px;">
          <input type="text" name="q" value="${escHtml(q)}" placeholder="Search news, jobs, events, restaurants…"
                 class="form-input" style="flex:1;" autofocus>
          <button type="submit" class="btn btn-primary">Search →</button>
        </form>
        ${q ? `<p style="font-family:var(--font-ui);font-size:.85rem;color:#888;margin-bottom:20px;">${results.length} result${results.length!==1?'s':''} for "${escHtml(q)}"</p>` : ''}
        ${resultHtml}
        ${!q ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-top:24px;">
          ${PUBLIC_PREFIXES.map(p => `
          <a href="${p.base}" style="display:flex;align-items:center;gap:8px;padding:12px 16px;background:white;border:1.5px solid #e0e0e0;border-radius:10px;text-decoration:none;font-family:var(--font-ui);font-size:.85rem;color:#333;font-weight:500;">
            <span>${p.emoji}</span> ${p.type}
          </a>`).join('')}
        </div>` : ''}
      </div>
    </section>`;

  return new Response(await renderShell({
    title:      q ? `Search: ${q}` : `Search`,
    description: `Search news, jobs, events, restaurants, and more in ${cfg.name||'Creston, Iowa'}.`,
    eyebrow:    '🔍 Search',
    heading:    q ? `Search results for "${q}"` : `Search ${cfg.name||'Creston'}`,
    config: cfg,
    content,
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ── R2 full-text search ────────────────────────────────────────
async function searchContent(env, q, prefixes) {
  const ql      = q.toLowerCase();
  const results = [];

  for (const { prefix, type, emoji, base } of prefixes) {
    try {
      const listed = await env.BUCKET.list({ prefix });
      for (const obj of listed.objects.filter(o => o.key.endsWith('.md')).slice(0, 50)) {
        const file = await env.BUCKET.get(obj.key);
        if (!file) continue;
        const raw    = await file.text();
        const parsed = parseMarkdown(raw);
        const m      = parsed.meta;

        const searchable = [
          m.title||'', m.name||'', m.summary||'', m.description||'',
          m.category||'', m.tags||'', parsed.content||'',
        ].join(' ').toLowerCase();

        if (!searchable.includes(ql)) continue;

        const slug  = obj.key.split('/').pop().replace('.md','');
        const title = m.title || m.name || slug;
        const url   = base + slug;

        // Relevance: title match scores higher
        const score = (title.toLowerCase().includes(ql) ? 10 : 0)
                    + (searchable.split(ql).length - 1);

        results.push({ type, emoji, title, summary: m.summary||m.description||'', url, score });
      }
    } catch (e) { /* skip prefix on error */ }
  }

  return results.sort((a, b) => b.score - a.score);
}
