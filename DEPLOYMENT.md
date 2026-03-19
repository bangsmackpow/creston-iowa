# creston-iowa — D1 Multi-User Deployment Guide

## What Changed in v2

- Admin now uses email + password (not a single shared password)
- D1 database stores users, companies, sessions, and invites
- Company admins can only see and manage their own jobs
- Superadmin sees everything
- Job posts are scoped to company: `jobs/active/{company-slug}/job.md`
- Invite system — you generate a link, employer sets their own password

---

## One-Time Setup Steps

### 1. Create the D1 database

```powershell
npx wrangler d1 create creston-auth
```

Copy the `database_id` from the output. It looks like:
`2a3b4c5d-6e7f-8a9b-0c1d-2e3f4a5b6c7d`

### 2. Update wrangler.toml

Open `creston-worker/wrangler.toml` and replace:
```
database_id = "REPLACE_WITH_YOUR_D1_ID"
```
with your actual ID.

### 3. Run the database migrations

```powershell
cd creston-worker
npx wrangler d1 migrations apply creston-auth
```

You should see:
```
✅ Applied migration 0001_initial.sql
✅ Applied migration 0002_seed_superadmin.sql
```

### 4. Add D1 binding to Cloudflare PAGES (important!)

The Worker gets D1 automatically from wrangler.toml.
But the Pages Function also needs it:

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. **Workers & Pages** → your Pages project (creston-iowa)
3. **Settings** → **Bindings**
4. Add **D1 Database** binding:
   - Variable name: `DB`
   - D1 database: `creston-auth`
5. Add **R2 Bucket** binding (if not already there):
   - Variable name: `BUCKET`
   - R2 bucket: `crestoniowa`
6. Add **Environment Variable**:
   - Name: `ADMIN_TOKEN`
   - Value: same random string you set as a Worker secret

### 5. Deploy the Worker

```powershell
cd creston-worker
npx wrangler deploy --env=""
```

### 6. Push the Pages site (includes updated functions/[[path]].js)

```powershell
cd ..
git add .
git commit -m "v2 multi-user admin with D1"
git push
```

---

## First Login

1. Go to `https://creston-iowa.com/admin/login`
2. Email: `admin@creston-iowa.com`
3. Password: `changeme`
4. You'll be redirected to **My Account** to set a real password
5. Set your password (min 8 characters) and save

---

## Adding a Company Employer

### Step 1 — Create the company

Go to `/admin/companies/new` and fill in:
- **Company Name** — e.g. "Greater Regional Health"
- **Slug** — e.g. `greater-regional` (used in R2 path: `jobs/active/greater-regional/`)
- **Contact Email**
- **Job Posting Credits** — how many jobs they've paid for (e.g. 1 for a $49 basic listing)
- **Plan** — basic / featured / premium

### Step 2 — Invite their admin user

Go to `/admin/users/new` and fill in:
- **Email** — the employer's email
- **Role** — Company Admin
- **Company** — select from dropdown

Click **Generate Invite Link** — copy the URL shown.

### Step 3 — Send the invite

Email the invite URL to the employer. It looks like:
`https://creston-iowa.com/admin/accept-invite?token=abc123...`

They click it, set their name and password, and they're in.

### Step 4 — They post their job

They log in at `/admin/login`, see only their company's jobs,
and click **+ Post a Job**. Their job gets saved to R2 at:
`jobs/active/their-company-slug/their-job-slug.md`

When their credits run out, the Publish button is disabled until
you add more credits via `/admin/companies/{id}/edit`.

---

## Role Summary

| Role | Can Do |
|------|--------|
| `superadmin` | Everything — all content, all companies, all users |
| `company_admin` | Post/edit/expire their own jobs only |
| `editor` | Manage food, news, attractions (no jobs, no admin settings) |

---

## Monetization Flow

```
Employer contacts you to post a job
  → You create company + set credits (e.g. 1)
  → You send invite link
  → They log in and post their job
  → Credits decrement
  → When credits = 0, posting is disabled
  → They pay again → you add credits via /admin/companies/{id}/edit
```

Future: connect Stripe webhook to auto-increment credits on payment.

---

## Troubleshooting

**"D1 database not bound"** on login page
→ Add `DB` binding in Pages Settings → Bindings

**"Invalid email or password"** on first login
→ Make sure migrations ran: `npx wrangler d1 migrations apply creston-auth`
→ Check the seed inserted: `npx wrangler d1 execute creston-auth --command="SELECT * FROM users"`

**Company admin can't see their jobs**
→ Jobs must be in `jobs/active/{company-slug}/` prefix in R2
→ Check the company slug matches exactly

**Invite link says "invalid or expired"**
→ Invites expire after 7 days
→ Generate a new one from `/admin/users/new`
