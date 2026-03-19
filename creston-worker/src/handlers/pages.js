/**
 * src/handlers/pages.js
 * Arbitrary static pages stored in R2 as pages/*.md
 *
 * Public routes:
 *   GET /about         → renders pages/about.md
 *   GET /government    → renders pages/government.md
 *   GET /:slug         → renders pages/:slug.md (any custom page)
 *
 * Admin routes handled in admin.js:
 *   /admin/pages       → list
 *   /admin/pages/new   → create
 *   /admin/pages/:slug/edit → edit
 *
 * Frontmatter schema:
 *   title:        Page title
 *   slug:         URL slug (e.g. "about" → /about)
 *   nav_label:    Label shown in nav (optional, uses title if blank)
 *   show_in_nav:  true/false
 *   nav_order:    number for ordering in nav
 *   description:  Meta description
 *   og_image:     R2 key for OG image
 *   eyebrow:      Small text above the heading
 *   hero_heading: Override the H1 (uses title if blank)
 *   hero_sub:     Subheading below H1
 *   template:     default | full-width | sidebar
 *   published:    true/false (false = draft, not publicly accessible)
 *   updated:      YYYY-MM-DD
 */

import { renderShell, escHtml } from '../shell.js';
import { parseMarkdown }        from '../markdown.js';
import { adSlot }               from '../shell.js';

const PAGES_PREFIX = 'pages/';

// ── Public page renderer ───────────────────────────────────────
export async function handlePage(request, env, slug) {
  try {
    const file = await env.BUCKET.get(`${PAGES_PREFIX}${slug}.md`);
    if (!file) return null; // signal 404 to caller

    const raw    = await file.text();
    const parsed = parseMarkdown(raw);
    const m      = parsed.meta;

    // Draft check — only superadmin can see drafts
    if (m.published === false || m.published === 'false') {
      return new Response('Page not published', { status: 404 });
    }

    const title   = m.hero_heading || m.title || slug;
    const content = renderPageContent(parsed, m);

    return new Response(await renderShell({
      title,
      description: m.description || '',
      eyebrow:     m.eyebrow     || '',
      heading:     title,
      subheading:  m.hero_sub    || '',
      activeNav:   m.nav_label   || m.title || '',
      env,
      content,
    }), {
      headers: {
        'Content-Type':  'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      }
    });

  } catch (err) {
    console.error(`handlePage error for ${slug}:`, err);
    return null;
  }
}

// ── List all pages (for admin and sitemap) ─────────────────────
export async function listPages(env) {
  try {
    const listed = await env.BUCKET.list({ prefix: PAGES_PREFIX });
    const pages  = [];

    for (const obj of listed.objects.filter(o => o.key.endsWith('.md'))) {
      const file = await env.BUCKET.get(obj.key);
      if (!file) continue;
      const raw    = await file.text();
      const parsed = parseMarkdown(raw);
      const slug   = obj.key.replace(PAGES_PREFIX, '').replace('.md', '');

      pages.push({
        slug,
        key:      obj.key,
        meta:     parsed.meta,
        body:     parsed.body,
        html:     parsed.html,
        modified: obj.uploaded,
      });
    }

    // Sort by nav_order, then title
    pages.sort((a, b) => {
      const oa = parseInt(a.meta.nav_order || '99');
      const ob = parseInt(b.meta.nav_order || '99');
      if (oa !== ob) return oa - ob;
      return (a.meta.title || a.slug).localeCompare(b.meta.title || b.slug);
    });

    return pages;
  } catch (err) {
    console.error('listPages error:', err);
    return [];
  }
}

// ── Page content renderer ──────────────────────────────────────
function renderPageContent(parsed, m) {
  const template = m.template || 'default';

  if (template === 'full-width') {
    return `
      <section class="section">
        <div class="container">
          <div class="markdown-body page-body">
            ${parsed.html}
          </div>
        </div>
      </section>`;
  }

  if (template === 'sidebar') {
    return `
      <section class="section">
        <div class="container">
          <div class="layout-sidebar">
            <div class="markdown-body page-body">
              ${parsed.html}
            </div>
            <aside>
              ${adSlot('square')}
            </aside>
          </div>
        </div>
      </section>`;
  }

  // Default template
  return `
    <section class="section">
      <div class="container">
        <div class="page-content-wrap">
          <div class="markdown-body page-body">
            ${parsed.html}
          </div>
        </div>
      </div>
    </section>`;
}

// ── Page template for new pages ────────────────────────────────
export function getPageTemplate() {
  const today = new Date().toISOString().split('T')[0];
  return `---
title: Page Title
slug: page-slug
nav_label: Nav Label
show_in_nav: false
nav_order: 10
description: Brief description for SEO.
eyebrow: 
hero_heading: 
hero_sub: 
template: default
published: true
updated: ${today}
---

## Introduction

Write your page content here using markdown.

## Section Two

Add as many sections as you need.

- List item one
- List item two

## Contact

For more information, [contact us](/contact).
`;
}

// ── Prebuilt migration templates ───────────────────────────────
export const MIGRATION_PAGES = {
  about: {
    meta: `---
title: About Creston, Iowa
slug: about
nav_label: About
show_in_nav: true
nav_order: 2
description: The history and heritage of Creston, Iowa — the Crest of Iowa. Founded in 1868 as a Burlington Railroad survey camp, county seat of Union County.
eyebrow: 📖 Our Story
hero_heading: The Crest of Iowa
hero_sub: In 1868, Burlington Railroad surveyors chose the highest point on the prairie between two great rivers. They named it Creston. What followed was 150+ years of community, grit, and pride.
template: default
published: true
updated: 2025-01-01
---`,
    body: `
## Why "Creston"?

The name *Creston* comes directly from geography. When Burlington and Missouri Railroad surveyors laid out the route in 1868, they identified the highest point on the line — the crest — between the Missouri and Mississippi river basins in southwest Iowa. That high prairie peak became the town's defining identity. **Creston sits at the crest of Iowa.**

The geographic advantage made it strategically ideal as a railroad division point. The Burlington line built machine shops, a roundhouse, and a construction camp, drawing workers from Chicago and across the Midwest.

## Creston Through the Years

**1868 — Survey Camp Established**
Burlington & Missouri Railroad surveyors establish a survey camp at the high point on the prairie. The site is named "Creston" for its position at the crest.

**1869 — Town Founded**
The town of Creston is officially established. The Burlington Railroad chooses Creston as a division point, building machine shops, a roundhouse, and worker housing.

**1871 — Incorporated**
Creston is officially incorporated as a city. Growth accelerates as the railroad brings commerce, workers, and regional prominence.

**1890 — County Seat**
On November 25, 1890, Creston officially becomes the county seat of Union County — a designation it holds to this day.

**1899 — CB&Q Depot Built**
The majestic CB&Q Railroad Depot is constructed, becoming the heart of Creston's railroad identity. Later saved from demolition — the city purchased it for just $1.

**Early 1900s — Frank Phillips**
A young Frank Phillips works as a barber in Creston, marries a local banker's daughter, and launches what would become Phillips Petroleum — making him one of the wealthiest men in America.

**1983+ — Mural Movement**
The first murals begin appearing in Creston. Today, 50+ murals define the visual identity of Uptown Creston, with 30 concentrated in just two blocks.

## Notable Crestonians

**Frank Phillips** — Started as a Creston barber, founded Phillips Petroleum Corporation. The Frank Phillips Visitor Center on Hwy 34 West honors his Creston roots.

**Jerome C. Hunsaker** (1886–1984) — Born in Creston, became a pioneering aviation designer shaping the early era of American aviation.

**James M. McCoy** — From Creston, rose to become the 6th Chief Master Sergeant of the United States Air Force.

## Geography

Creston is located on **U.S. Route 34** in southwest Iowa:

- **Des Moines:** ~55 miles northeast
- **Omaha, NE:** ~80 miles west
- **County:** Union County seat
- **Population:** 7,536 (2020 Census)
- **Area:** 5.25 sq miles
- **ZIP Code:** 50801

Creston is the largest city between Des Moines and Council Bluffs on US-34, making it a natural regional hub for southwest Iowa.
`
  },

  government: {
    meta: `---
title: City Government & Public Safety
slug: government
nav_label: Government
show_in_nav: true
nav_order: 6
description: Creston, Iowa city government, police department, emergency services, and public contacts. Union County government resources.
eyebrow: 🏛️ Civic Resources
hero_heading: Government & Public Safety
hero_sub: City services, elected officials, police, fire, and emergency contacts for Creston and Union County, Iowa.
template: default
published: true
updated: 2025-01-01
---`,
    body: `
## ⚠️ Emergency — Call 911

For any life-threatening emergency — fire, medical, or crime in progress — always call **911** immediately.

## Creston Police Department

Serving the City of Creston with integrity and compassion. The department is comprised of twelve officers dedicated to keeping the community safe.

- **Address:** 302 N Pine Street (Suite 3), Creston, IA 50801
- **Non-Emergency:** [(641) 782-8402](tel:6417828402)
- **Email:** [crestonpd@iowatelecom.net](mailto:crestonpd@iowatelecom.net)
- **Official page:** [crestoniowa.gov/Police](https://www.crestoniowa.gov/2158/Police)

## City of Creston

The City of Creston is the county seat of Union County. City Hall handles permits, ordinances, utilities, and local government operations.

- **Address:** 116 West Adams Street, Creston, IA 50801
- **Website:** [crestoniowa.gov](https://www.crestoniowa.gov)

## Contact Directory

| Department | Phone | Notes |
|---|---|---|
| **Emergency** | **911** | Fire, Police, Medical |
| Police Non-Emergency | [(641) 782-8402](tel:6417828402) | Always open |
| City Hall | — | 116 W Adams St |
| Union County Courthouse | — | 300 N Pine St |
| Chamber of Commerce | [(641) 782-7021](tel:6417827021) | |
| Tourism | [(641) 782-7022](tel:6417827022) | Hwy 34 West |
| C.A.R.E. (Animal Adoptions) | [(641) 782-2330](tel:6417822330) | Leave message |

## Police FAQ

**How do I pay a speeding ticket?**
Traffic citations are paid at the **Union County Clerk of Court** — not the police department.

**How do I get a police report?**
Come to the Police Department at 302 N Pine Street. Reports are free for involved parties; non-involved parties pay $5.

**Who handles stray animals?**
Animal Control operates Mon–Fri 7 AM–4 PM. Call [(641) 782-8402](tel:6417828402).

**How do I apply for a building permit?**
Building permit applications are handled at **Creston City Hall**, 116 W Adams Street.
`
  },

  chamber: {
    meta: `---
title: Chamber of Commerce
slug: chamber
nav_label: Chamber
show_in_nav: true
nav_order: 7
description: The Greater Creston Chamber of Commerce — connecting businesses, supporting growth, and advocating for a thriving Union County economy.
eyebrow: 🤝 Business Community
hero_heading: Chamber of Commerce
hero_sub: The Greater Creston Chamber of Commerce — connecting businesses, supporting growth, and advocating for a thriving Union County economy.
template: default
published: true
updated: 2025-01-01
---`,
    body: `
## Greater Creston Chamber of Commerce

The Creston Chamber represents the interests of local businesses, organizes community events including Balloon Days, and serves as the hub for economic development in Union County.

- **Phone:** [(641) 782-7021](tel:6417827021)
- **Website:** [crestoniowachamber.com](https://www.crestoniowachamber.com)

## Business Resources

**Business Licenses** — Obtain business licenses and permits through Creston City Hall at 116 W Adams Street.

**Local Banks** — 7 bank branches in Creston including Iowa State Savings Bank and First National Bank.

**Workforce Training** — Southwestern Community College offers workforce development programs serving southwest Iowa businesses.

**Job Board** — Post openings and find local talent on the [Creston Job Board](/jobs).

**Advertise Locally** — Reach Creston residents through targeted ads on creston-iowa.com. [See ad options](/advertise).

## Government Resources

- [City of Creston](https://www.crestoniowa.gov) — Permits, ordinances, utilities
- [Iowa SBDC](https://www.iowasbdc.org) — Small business development
- [Iowa Economic Development](https://www.iowaeconomicdevelopment.com) — State business resources
- [Southwestern Community College](https://www.swcciowa.edu) — Workforce training

## Important Links

- [Creston Chamber](https://www.crestoniowachamber.com)
- [City of Creston](https://www.crestoniowa.gov)
- [Union County Tourism](http://www.unioncountyiowatourism.com)
- [Greater Regional Health](https://www.greaterregional.org)
- [Creston News Advertiser](https://www.crestonnews.com)
`
  },
};
