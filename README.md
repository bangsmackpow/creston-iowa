# creston-iowa.com

Community website for Creston, Iowa — The Crest of Iowa.

## Stack
- 100% static HTML/CSS/JS — no build step required
- Cloudflare Pages ready (includes `_redirects`, `_headers`, `sitemap.xml`, `robots.txt`)
- Mobile-first responsive design
- Google Fonts (Playfair Display, Source Serif 4, DM Sans)

## File Structure
```
creston-iowa/
├── index.html              ← Homepage
├── _redirects              ← Cloudflare URL redirects
├── _headers                ← Security & cache headers
├── robots.txt
├── sitemap.xml
├── css/
│   ├── style.css           ← Design system (variables, nav, footer, buttons)
│   ├── home.css            ← Homepage-specific styles
│   └── pages.css           ← All sub-page styles
├── js/
│   ├── nav.js              ← Shared nav + footer injection
│   └── home.js             ← Homepage animations
├── pages/
│   ├── about.html          ← History & heritage (the "Crest of Iowa" story)
│   ├── dining.html         ← Restaurant guide with category filter
│   ├── attractions.html    ← Things to do (Balloon Days, lakes, murals, etc.)
│   ├── news.html           ← Community news + links to official sources
│   ├── government.html     ← City, police, emergency contacts
│   ├── chamber.html        ← Chamber of Commerce & business resources
│   ├── jobs.html           ← Job board + paid listing system
│   ├── advertise.html      ← Ad packages & rates
│   └── contact.html        ← Contact / news submissions
└── images/                 ← Add your own images here
```

## Deploying to Cloudflare Pages

### Option A — GitHub (recommended)
1. Push this folder to a GitHub repo (e.g. `creston-iowa-site`)
2. Go to [Cloudflare Pages](https://pages.cloudflare.com)
3. Click **"Create a project"** → Connect to GitHub
4. Select your repo
5. **Build settings:**
   - Framework preset: `None`
   - Build command: *(leave blank)*
   - Build output directory: `/` (root)
6. Click **Deploy**
7. Point `creston-iowa.com` DNS to the Pages project via Cloudflare DNS

### Option B — Direct Upload
1. Go to Cloudflare Pages → Create Project → **Upload Assets**
2. Drag and drop the entire `creston-iowa/` folder
3. Set custom domain to `creston-iowa.com`

## Adding Custom Domain
1. In Cloudflare Pages project → Custom Domains → Add
2. Enter `creston-iowa.com` and `www.creston-iowa.com`
3. Cloudflare handles SSL automatically

## Monetization
The site has three revenue streams built in:

### 1. Advertising
- Ad slots are placed throughout: leaderboard banners, sidebar squares, ad strips
- Ad packages defined in `/pages/advertise.html`
- Contact: `advertise@creston-iowa.com`
- Rates: $29–$99/month depending on placement

### 2. Job Board Listings
- Employers submit via email: `jobs@creston-iowa.com`
- Pricing: $49 Basic / $89 Featured / $149 Premium (60 days)
- Payment via PayPal invoice, then manually publish listing
- For automated payments, integrate Stripe Checkout (separate project)

### 3. Future: Stripe Integration
To automate job post payments, you can add a Stripe Payment Link
to the "Post a Job" button — no backend required, just a hosted checkout URL.

## Updating Content
Since this is static HTML, you update pages directly in a text editor or VS Code:
- **Add a restaurant:** Edit `pages/dining.html` — copy an existing `.restaurant-card` block
- **Add a news article:** Edit `pages/news.html` — copy an existing `.news-article` block
- **Add a job listing:** Edit `pages/jobs.html` — copy an existing `.job-listing` block
- **Add an attraction:** Edit `pages/attractions.html` — copy an existing `.attraction-detail` block

## Future Enhancements
- Integrate OpenWeatherMap API for live weather widget
- Add Stripe Payment Links for job board checkout
- Connect a headless CMS (your existing PocketBase project!) for news articles
- Add an events calendar widget
- Email newsletter (Mailchimp or Buttondown embed)
- Google Analytics 4 (add GA4 snippet to nav.js)

## Emails to Set Up
- `hello@creston-iowa.com` — General contact
- `news@creston-iowa.com` — News tips
- `jobs@creston-iowa.com` — Job board
- `advertise@creston-iowa.com` — Ad inquiries

Set these up via Cloudflare Email Routing (free) pointing to your personal inbox.

## SEO Notes
- All pages have `<title>` and `<meta description>` tags
- `sitemap.xml` is included — submit to Google Search Console
- `robots.txt` allows all crawlers
- Semantic HTML throughout (article, aside, nav, footer, section)
