# creston-iowa — Cloudflare Worker + R2

Dynamic content layer for creston-iowa.com.
Serves jobs, restaurants, news, and attractions from markdown files stored in Cloudflare R2.

## Architecture

```
Browser
  └─ creston-iowa.com/jobs        ← Cloudflare Worker intercepts
       └─ Lists R2: jobs/active/*.md
            └─ Parses frontmatter + markdown
                 └─ Returns rendered HTML page

  └─ creston-iowa.com/admin       ← Password-protected CMS
       └─ Editor writes .md files directly to R2
```

## R2 Bucket Structure

```
crestoniowa/
├── jobs/
│   ├── active/
│   │   ├── rn-greater-regional.md
│   │   └── machine-operator.md
│   └── expired/
│       └── old-job.md
├── food/
│   ├── spencers-chophouse.md
│   └── casa-de-oro.md
├── news/
│   └── balloon-days-2025.md
└── attractions/
    └── balloon-days.md
```

## Setup

### 1. Install Wrangler
```bash
npm install
# or globally:
npm install -g wrangler
```

### 2. Authenticate
```bash
npx wrangler login
```

### 3. Create the R2 Bucket
```bash
npx wrangler r2 bucket create crestoniowa
# For preview/dev:
npx wrangler r2 bucket create crestoniowa-preview
```

### 4. Set Secrets
```bash
# Your admin password (you'll use this to log into /admin)
npx wrangler secret put ADMIN_PASSWORD
# Enter your chosen password when prompted

# A random token for API auth (generate one below)
npx wrangler secret put ADMIN_TOKEN
# Enter a random 32+ char string, e.g.:
# openssl rand -hex 32
```

### 5. Seed Sample Data (optional)
```bash
chmod +x seed-r2.sh
./seed-r2.sh
```

### 6. Copy Admin CSS to Static Site
The admin UI needs its CSS served from the static Cloudflare Pages site:
```bash
cp admin/admin.css ../creston-iowa/css/admin.css
```

Also create a minimal `dynamic.css` in the static site:
```bash
touch ../creston-iowa/css/dynamic.css
```

### 7. Deploy
```bash
npx wrangler deploy
```

### 8. Local Development
```bash
npx wrangler dev
# Worker runs at http://localhost:8787
# Static site still served separately
```

---

## URL Routes

| URL                        | Handler          | R2 Prefix          |
|----------------------------|------------------|--------------------|
| `/jobs`                    | jobs.js          | `jobs/active/`     |
| `/jobs/:slug`              | jobs.js          | `jobs/active/`     |
| `/food`                    | food.js          | `food/`            |
| `/food/:slug`              | food.js          | `food/`            |
| `/news`                    | news.js          | `news/`            |
| `/news/:slug`              | news.js          | `news/`            |
| `/attractions`             | attractions.js   | `attractions/`     |
| `/attractions/:slug`       | attractions.js   | `attractions/`     |
| `/admin`                   | admin.js         | —                  |
| `/admin/login`             | admin.js         | —                  |
| `/admin/:type`             | admin.js         | lists content      |
| `/admin/:type/new`         | admin.js         | new editor         |
| `/admin/:type/:slug/edit`  | admin.js         | edit editor        |
| `/api/content/:type`       | api.js           | CRUD               |
| `/api/jobs/:slug/expire`   | api.js           | move to expired/   |
| `/api/jobs/:slug/restore`  | api.js           | move to active/    |

---

## Markdown Frontmatter Schemas

### Job Listing (`jobs/active/*.md`)
```yaml
---
title: Job Title
company: Company Name
location: Creston, IA
type: Full-Time          # Full-Time | Part-Time | Contract | Seasonal
category: Healthcare     # Healthcare | Manufacturing | Trades | etc.
pay: "$18-24/hr"
posted: 2025-01-15       # YYYY-MM-DD
expires: 2025-02-15      # YYYY-MM-DD — auto-hides after this date
featured: false          # true = gold highlight + top of list
apply_url: https://...
apply_email: hr@company.com
summary: One-line description for the job board list view.
---
Job description body in markdown...
```

### Restaurant (`food/*.md`)
```yaml
---
name: Restaurant Name
category: steakhouse     # steakhouse|mexican|american|chinese|cafe|pizza|bar|brewery|other
emoji: 🥩
address: 119 N. Walnut St, Creston, IA
phone: "(641) 278-1008"
website: https://...
hours: "Tue-Sat 4pm-9pm"
price: "$$"              # $ | $$ | $$$
tags: [Dine-In, Takeout]
featured: false
summary: One-line description for the restaurant grid.
---
Restaurant description in markdown...
```

### News Article (`news/*.md`)
```yaml
---
title: Article Headline
category: Community      # Community | Business | Events | Arts | Sports
date: 2025-01-15         # YYYY-MM-DD
author: Staff Reporter
summary: One-line summary for the news list.
---
Article body in markdown...
```

### Attraction (`attractions/*.md`)
```yaml
---
name: Attraction Name
category: Festival       # Festival | Recreation | Heritage | Arts | Dining
emoji: 🎈
tagline: Short tagline
season: Year-round
location: Creston, IA
phone: "(641) 555-1234"
website: https://...
cost: Free admission
featured: false
summary: One-line description for the attractions grid.
---
Attraction description in markdown...
```

---

## Managing Content (Without the Admin UI)

You can also manage content directly from the CLI:

```bash
# Upload a new job
wrangler r2 object put crestoniowa/jobs/active/my-new-job.md \
  --file=my-new-job.md

# Expire a job (move to expired/)
wrangler r2 object put crestoniowa/jobs/expired/old-job.md \
  --file=old-job.md
wrangler r2 object delete crestoniowa/jobs/active/old-job.md

# Delete a restaurant
wrangler r2 object delete crestoniowa/food/old-restaurant.md

# List all jobs
wrangler r2 object list crestoniowa --prefix jobs/active/
```

---

## Deploying Updates to the Worker

```bash
git add .
git commit -m "update worker"
git push
# If connected to Cloudflare CI, deploys automatically.
# Or manually:
npx wrangler deploy
```

---

## Cost Estimate

- **Cloudflare Workers**: Free tier = 100,000 requests/day. Paid plan = $5/month for 10M requests.
- **Cloudflare R2**: Free tier = 10GB storage, 1M Class A ops (writes), 10M Class B ops (reads) per month.
- **Cloudflare Pages**: Free for static assets.

For a community site like creston-iowa.com, the entire stack will almost certainly run **free forever** on the free tiers.

---

## Future Enhancements

- **Stripe webhook** → auto-publish job listings after payment
- **Scheduled Worker** → auto-expire jobs past their `expires` date
- **R2 versioning** → keep edit history on all markdown files
- **Image uploads** → store photos in R2 alongside markdown
- **RSS feed** → `/news/rss.xml` generated from news/ markdown files
- **Search** → client-side search using Fuse.js on serialized content index
