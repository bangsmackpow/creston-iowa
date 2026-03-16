#!/bin/bash
# seed-r2.sh
# Seeds the R2 bucket with sample markdown files.
# Run once after creating the bucket:
#   chmod +x seed-r2.sh && ./seed-r2.sh
#
# Requires: wrangler CLI installed and authenticated
# Usage: ./seed-r2.sh [bucket-name]
# Default bucket name: crestoniowa

BUCKET=${1:-crestoniowa}
echo "Seeding R2 bucket: $BUCKET"

# ── Helper ──────────────────────────────────────────────────
upload() {
  local KEY=$1
  local FILE=$2
  echo "  → Uploading $KEY"
  wrangler r2 object put "$BUCKET/$KEY" --file="$FILE"
}

# ── Create temp directory ────────────────────────────────────
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# ══════════════════════════════════════════════
# JOBS
# ══════════════════════════════════════════════

cat > "$TMPDIR/rn-greater-regional.md" << 'EOF'
---
title: Registered Nurse — Med/Surg Unit
company: Greater Regional Health
location: Creston, IA
type: Full-Time
category: Healthcare
pay: "$28-34/hr"
posted: 2025-01-15
expires: 2025-02-15
featured: true
apply_url: https://www.greaterregional.org/careers
summary: Seeking a compassionate RN for our Medical/Surgical unit. Sign-on bonus available.
---

## About the Role

Greater Regional Health is seeking a dedicated Registered Nurse for our Medical/Surgical unit. Join a team committed to providing exceptional care to patients across southwest Iowa.

## Responsibilities

- Provide direct patient care in a 20-bed Med/Surg unit
- Administer medications and treatments per physician orders
- Collaborate with interdisciplinary care team
- Document patient care using electronic health record system
- Mentor new nursing staff

## Requirements

- Active Iowa RN license (or eligibility)
- BLS certification required, ACLS preferred
- 1+ year acute care experience preferred — new grads considered
- Strong communication and critical thinking skills

## Benefits

- Competitive pay: $28–$34/hr depending on experience
- Sign-on bonus available for qualified candidates
- Comprehensive health, dental, and vision insurance
- 401(k) with employer match
- Tuition reimbursement
- Paid time off and holiday pay

## About Greater Regional Health

Greater Regional Health is the region's leading healthcare provider, serving Creston and southwest Iowa since 1920. Our 48-bed critical access hospital offers a full range of inpatient, outpatient, and emergency services.

## How to Apply

Apply online at [greaterregional.org/careers](https://www.greaterregional.org/careers) or contact HR at (641) 782-7091.
EOF
upload "jobs/active/rn-greater-regional.md" "$TMPDIR/rn-greater-regional.md"

cat > "$TMPDIR/machine-operator-donaldson.md" << 'EOF'
---
title: Machine Operator — 1st Shift
company: Donaldson Company
location: Creston, IA
type: Full-Time
category: Manufacturing
pay: "$22-28/hr"
posted: 2025-01-20
expires: 2025-02-20
featured: false
apply_url: https://www.donaldson.com/careers
summary: Operate and monitor production machinery on 1st shift. Will train the right candidate.
---

## About the Role

Donaldson Company's Creston facility is seeking a dependable Machine Operator for our 1st shift production team. We manufacture filtration solutions used in commercial, industrial, and agricultural applications worldwide.

## Responsibilities

- Operate CNC and automated production equipment
- Monitor production quality and perform visual inspections
- Complete production logs and documentation accurately
- Perform basic machine maintenance and troubleshooting
- Follow all safety protocols and maintain a clean work area

## Requirements

- High school diploma or GED
- Ability to stand for extended periods and lift up to 50 lbs
- Previous manufacturing experience preferred — we will train motivated candidates
- Mechanical aptitude and attention to detail
- Reliable attendance record

## Schedule & Pay

- 1st Shift: Monday–Friday, 6:00 AM – 2:30 PM
- Starting pay: $22–$28/hr depending on experience
- Overtime available

## Benefits

- Full health, dental, and vision benefits
- 401(k) with company match
- Paid vacation and holidays
- Advancement opportunities within the facility

## How to Apply

Apply at [donaldson.com/careers](https://www.donaldson.com/careers) or visit the Creston facility at 1200 Industrial Park Drive.
EOF
upload "jobs/active/machine-operator-donaldson.md" "$TMPDIR/machine-operator-donaldson.md"

# ══════════════════════════════════════════════
# FOOD
# ══════════════════════════════════════════════

cat > "$TMPDIR/spencers-chophouse.md" << 'EOF'
---
name: Spencer's Chophouse & Tavern
category: steakhouse
emoji: 🥩
address: 119 N. Walnut St, Creston, IA 50801
phone: "(641) 278-1008"
website: https://spencerschophouse.net
hours: "Tue-Sat 4pm-9pm, Sun 11am-8pm"
price: "$$"
tags: [Dine-In, Takeout, Reservations]
featured: true
summary: Creston's premier steakhouse serving steaks, seafood, pasta, and more. Rated tops in the area.
---

## About Spencer's

Spencer's Chophouse & Tavern is Creston's finest dining destination. Set in a warm, inviting atmosphere, Spencer's delivers upscale comfort food at approachable prices — the kind of restaurant that becomes your go-to for anniversaries, business dinners, and well-earned Friday nights.

With a 98% recommendation rate from local diners, Spencer's has earned its reputation as the best restaurant in southwest Iowa.

## The Menu

Spencer's menu spans the full range of chophouse classics:

- **Steaks** — hand-cut ribeyes, New York strips, and filets cooked to your exact specification
- **Seafood** — salmon, shrimp, and seasonal selections
- **Pasta** — house-made sauces with fresh ingredients
- **Chicken & Pork** — signature preparations that keep customers coming back
- **Appetizers & Salads** — fresh starts before your main

## The Bar

The Tavern side features a well-curated cocktail menu, local and regional craft beers, and a solid wine list. The perfect setting for after-work drinks or a pre-dinner cocktail.

## Reservations

Reservations recommended on weekends. Call ahead at (641) 278-1008 or visit spencerschophouse.net.
EOF
upload "food/spencers-chophouse.md" "$TMPDIR/spencers-chophouse.md"

cat > "$TMPDIR/casa-de-oro.md" << 'EOF'
---
name: Casa de Oro
category: mexican
emoji: 🌮
address: Creston, IA 50801
phone: ""
website: ""
hours: "Mon-Sun 11am-9pm"
price: "$$"
tags: [Dine-In, Family Friendly, Margaritas]
featured: false
summary: Authentic Mexican cuisine beloved by Creston residents. Great margaritas and fast, friendly service.
---

## About Casa de Oro

Casa de Oro is a Creston staple — the kind of Mexican restaurant that locals bring out-of-town guests to with total confidence. Generous portions, consistent quality, and a staff that makes you feel like a regular from your first visit.

## Why Locals Love It

Reviewers consistently praise the margaritas as some of the best in the region — strong, well-balanced, and reasonably priced. The food arrives quickly, the portions are generous, and the atmosphere is warm and family-friendly.

## Menu Highlights

- Classic enchiladas, tacos, and burritos
- Fajitas sizzling at the table
- House-made salsa and chips
- Full bar with excellent margaritas
- Daily lunch specials

## Great for Groups

Casa de Oro's spacious dining room handles large parties well. Whether it's a family birthday dinner or a work lunch, the staff accommodates groups without the usual wait.
EOF
upload "food/casa-de-oro.md" "$TMPDIR/casa-de-oro.md"

# ══════════════════════════════════════════════
# NEWS
# ══════════════════════════════════════════════

cat > "$TMPDIR/1776-firehouse-opens.md" << 'EOF'
---
title: "1776 Firehouse & Lounge Opens at 301 W. Adams"
category: Business
date: 2024-12-17
author: Staff Reporter
summary: Mayor Waylon Clayton and wife Kylie open a new steakhouse, barbecue, and cocktail lounge in the historic Berning Motor Inn building.
---

## Creston Gets a New Fine Dining Option

Creston welcomed a new dining destination in December 2024 when Mayor Waylon Clayton and wife Kylie opened the 1776 Firehouse & Lounge at 301 W. Adams Street, in the historic Berning Motor Inn building.

The restaurant serves steaks, barbecue, pasta, and elevated specialty cocktails — filling a gap in Creston's dining scene that Mayor Clayton described as a long-time need.

## The Mayor's Vision

In interviews ahead of the opening, Clayton said the restaurant was "a dream" years in the making, and that "the people are crying out for their town to get these things back."

The 1776 name carries patriotic symbolism, and the Firehouse concept nods to community service and American heritage.

## Menu & Hours

The menu features:
- Hand-cut steaks and slow-smoked barbecue
- Pasta dishes and chicken entrées
- A full cocktail program with house specialty drinks
- Appetizers and shareable plates

For current hours and reservations, contact the restaurant at 301 W. Adams Street in Creston.

## A Vote of Confidence

The opening of a new full-service restaurant by a sitting mayor signals confidence in Creston's dining economy and Uptown revitalization. The Berning Motor Inn building's new life as a restaurant destination is seen as a win for historic preservation and economic development alike.
EOF
upload "news/1776-firehouse-opens.md" "$TMPDIR/1776-firehouse-opens.md"

cat > "$TMPDIR/balloon-days-2025-announced.md" << 'EOF'
---
title: Balloon Days 2025 — 37th Annual Festival Plans Announced
category: Events
date: 2025-03-01
author: Staff Reporter
summary: Iowa's second-largest hot air balloon festival returns to Creston in September 2025 with expanded activities and a new balloon race format.
---

## Balloon Days Returns This September

The 37th Annual Creston/Southwest Iowa Balloon Days festival is set for the third weekend of September 2025. The Creston Chamber of Commerce confirmed dates and announced several new additions to the lineup.

## What to Expect

The festival's signature events return in full:

- **Hot Air Balloon Races** — multiple launches from the Creston Municipal Airport
- **NightGlow** — Saturday evening at dusk, when tethered balloons illuminate the sky
- **Grand Parade** — Saturday morning through Uptown Creston, featuring high school marching bands from across the region
- **Flea Market & Craft Fair** — at and around the historic CB&Q Depot
- **Children's Activities** — Pedal Pull, Pet Show, games, and more at the airport

## New for 2025

The Chamber announced an expanded vendor area and a new balloon race format with timed precision challenges. Live music is expected Friday evening ahead of the main Saturday events.

## Getting There

Balloon Days draws visitors from across Iowa, Nebraska, and Missouri. The Creston Municipal Airport serves as the primary balloon launch site, with activities throughout the Creston City Center.

For more information and to volunteer, contact the Creston Chamber of Commerce at (641) 782-7021 or visit [crestoniowachamber.com](https://www.crestoniowachamber.com).
EOF
upload "news/balloon-days-2025-announced.md" "$TMPDIR/balloon-days-2025-announced.md"

# ══════════════════════════════════════════════
# ATTRACTIONS
# ══════════════════════════════════════════════

cat > "$TMPDIR/balloon-days.md" << 'EOF'
---
name: Creston/SW Iowa Balloon Days
category: Festival
emoji: 🎈
tagline: Iowa's 2nd largest hot air balloon festival — every September
season: 3rd weekend of September, annually
location: Creston City Center & Municipal Airport
phone: "(641) 782-7021"
website: https://www.crestoniowachamber.com
cost: Free admission
featured: true
summary: Iowa's second-largest hot air balloon festival featuring races, NightGlow, parade, and family activities.
---

## About Balloon Days

Now in its fourth decade, the Creston/Southwest Iowa Balloon Days festival is the second-largest hot air balloon festival in the state of Iowa — and one of the region's most beloved summer traditions.

What started as a local community celebration has grown into a weekend-long event drawing thousands of visitors from Iowa, Nebraska, and Missouri.

## The Events

### Hot Air Balloon Races
Multiple balloon launches from Creston Municipal Airport, with pilots competing in precision and distance challenges. Spectators line up along race routes for close-up views of the aircraft.

### NightGlow
The crown jewel of Balloon Days — held at dusk on Saturday evening. Tethered balloons inflate and glow in synchrony with music, creating a breathtaking spectacle that draws the largest crowds of the weekend.

### Grand Parade
Saturday morning through Uptown Creston. High school marching bands from across southwest Iowa compete for top honors, accompanied by floats, community organizations, and dignitaries.

### Flea Market & Craft Fair
Held in and around the historic CB&Q Depot, the flea market attracts vendors from across the region selling antiques, crafts, food, and unique finds.

### Family Activities
Children's Pedal Pull and Pet Show at the airport. Carnival-style activities, food vendors, and live entertainment throughout the grounds.

## When & Where

- **When:** 3rd Saturday/Weekend of September, annually
- **Balloon launches:** Creston Municipal Airport
- **Parade, NightGlow, vendors:** Creston City Center / CB&Q Depot area
- **Admission:** Free

## More Information

Contact the Greater Creston Chamber of Commerce at (641) 782-7021 or visit [crestoniowachamber.com](https://www.crestoniowachamber.com).
EOF
upload "attractions/balloon-days.md" "$TMPDIR/balloon-days.md"

cat > "$TMPDIR/high-lakes.md" << 'EOF'
---
name: The High Lakes of Union County
category: Outdoor Recreation
emoji: 💧
tagline: Five lakes, 2,100+ acres of water, 6,000 acres of parks
season: Year-round (camping May–October)
location: Within 25 miles of Creston, IA
cost: Day use fees apply at state parks
featured: false
summary: Five lakes totaling over 2,100 acres of water surrounded by 6,000+ acres of parks, prairie, and wetlands.
---

## Southwest Iowa's Outdoor Recreation Hub

Creston sits at the center of one of southwest Iowa's finest outdoor recreation areas. Five lakes totaling over **2,100 acres of water** lie within a 25-mile radius, surrounded by more than **6,000 acres** of publicly owned parks, woodlands, prairie, and wetlands.

The system includes four campgrounds, making it a destination for weekend campers from across the region.

## The Five Lakes

### Green Valley State Park
The flagship of the system. Green Valley Lake offers boating, fishing, swimming, and camping in a rolling Iowa landscape. The park-to-park trail connects to Creston's McKinley Park.

### Three Mile Recreation Area
Three Mile Lake is a popular fishing destination known for its bass and crappie populations. The recreation area includes boat ramps, fishing piers, and picnic facilities.

### Twelve Mile Lake
A quieter, more secluded option surrounded by timber and native prairie. Excellent for fishing and wildlife watching.

### Summit Lake
A smaller, spring-fed lake offering a peaceful setting for fishing and non-motorized boating.

### McKinley Lake
Located within Creston city limits at McKinley Park. The park connects to the Park-to-Park Trail and serves as the gateway to the larger lake system.

## Activities

- **Fishing** — bass, crappie, catfish, walleye, and more
- **Boating** — electric motors and non-motorized crafts at most lakes
- **Swimming** — designated swim beaches at Green Valley State Park
- **Camping** — four campgrounds with electric hookups, showers, and primitive sites
- **Hiking & Biking** — the 9-mile Park-to-Park Trail connects city to wilderness
- **Wildlife Watching** — deer, wild turkey, eagles, and migratory waterfowl

## Getting There

The lake system is accessible from Creston via US-34 and various county roads. The Iowa DNR maintains detailed maps at [iowadnr.gov](https://www.iowadnr.gov).
EOF
upload "attractions/high-lakes.md" "$TMPDIR/high-lakes.md"

echo ""
echo "✅ Seed complete! Uploaded to bucket: $BUCKET"
echo ""
echo "Contents:"
echo "  jobs/active/  — 2 job listings"
echo "  food/         — 2 restaurants"
echo "  news/         — 2 news articles"
echo "  attractions/  — 2 attractions"
echo ""
echo "Next steps:"
echo "  1. npx wrangler deploy"
echo "  2. Visit https://creston-iowa.com/jobs"
echo "  3. Visit https://creston-iowa.com/admin (set ADMIN_PASSWORD first)"
