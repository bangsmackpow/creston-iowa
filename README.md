# 🌾 Creston, Iowa — The Crest of Iowa

Dynamic, AI-powered community website and CMS for Creston, Iowa.

## 🚀 Modern Stack
- **Edge Runtime**: Cloudflare Workers for logic and routing.
- **Database**: Cloudflare D1 (SQLite at the edge) for users, analytics, and metadata.
- **Storage**: Cloudflare R2 (S3-compatible) for markdown content and media.
- **AI**: Cloudflare Workers AI (Llama 3) for content enrichment and drafting.
- **Frontend**: Clean, premium Vanilla CSS/JS with server-side rendering for optimal SEO and performance.

## 🛠️ Key Features
- **Admin Dashboard (`/admin`)**: Secure portal for managing all community content.
- **🔍 Content Scout**: Automated discovery tool that finds:
  - 🍽️ **Dining**: Restaurants from OpenStreetMap & Google Places.
  - 📰 **Local News**: Real-time headlines from Creston News Advertiser & Union County feeds.
  - 📅 **Community Events**: Live calendar sync with the Creston Chamber of Commerce (iCal).
  - 💼 **Jobs**: Aggregated listings from USA Jobs and Iowa Workforce Development.
  - 🎈 **Attractions**: Points of interest from Wikipedia and OSM.
- **Draft & Publish Workflow**: Review discovered content, edit in markdown, and schedule for future publishing.
- **Role-Based Access**: Multi-user support with `admin` and `superadmin` permissions.
- **Integrated Search**: Site-wide search powered by D1 indexing.

## 📁 Project Structure
```text
creston-iowa/
├── creston-worker/         ← Core CMS logic
│   ├── src/
│   │   ├── worker.js       ← Main entry & routing
│   │   ├── handlers/       ← Sub-page and tool handlers (including Content Scout)
│   │   ├── db/             ← D1 database schemas and helpers
│   │   └── shell.js        ← HTML/Layout templates
│   ├── css/                ← Admin and Public design systems
│   └── seed-r2.sh          ← Initial content & template library
├── tests/                  ← Playwright regression suite
└── _redirects              ← Cloudflare Pages routing rules
```

## 🌩️ Deployment & Setup

### 1. Infrastructure
Ensure you have the following Cloudflare services enabled:
- **D1 Database**: Create a database named `creston-auth` and run migrations.
- **R2 Bucket**: Create a bucket named `crestoniowa`.
- **Worker**: Deploy the `creston-worker` directory using Wrangler.

### 2. Environment Variables
Configure these secrets in the Cloudflare dashboard or `.dev.vars`:
- `ADMIN_EMAIL`: Default superadmin login.
- `ADMIN_PASSWORD`: Secure password for the admin portal.
- `GOOGLE_PLACES_KEY`: (Optional) For higher quality business data in Content Scout.

### 3. Quick Start (Local Development)
```bash
cd creston-worker
npm install
npx wrangler dev
```

## 📈 Monitoring & SEO
- **Analytics**: Built-in privacy-focused visitor tracking using D1.
- **SEO**: Dynamic `sitemap.xml` and `robots.txt` generation; 100% crawlable semantic HTML.
- **Testing**: Run `npx playwright test` to verify all admin and public routes.

## ✉️ Contact & Support
- General: `hello@creston-iowa.com`
- News: `news@creston-iowa.com`
- Support: `admin@creston-iowa.com`

---
© 2026 Creston, Iowa Community Project. Built for the citizens of the Crest of Iowa.

## SEO Notes
- All pages have `<title>` and `<meta description>` tags.
- `sitemap.xml` is dynamically generated.
- `robots.txt` is included for crawler guidance.
- Semantic HTML5 used throughout for accessibility and SEO.
