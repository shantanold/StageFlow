# StageFlow — Project Brief

## What this is

StageFlow is an inventory management system for a home staging business. We own furniture that we place in houses to make them look good for sale. When the house sells, the furniture comes back to our warehouse and waits to be deployed again. This app tracks every piece of furniture through that cycle, using QR code scanning to keep the data accurate.

## Who uses it

A small team of about 5 people. Managers create jobs and assign furniture. Warehouse/delivery staff scan items in and out using their phones. Everyone needs visibility into what's available, what's staged where, and what's coming back soon.

## Deployment

This is a Progressive Web App (PWA). No app stores. The team opens a URL on their phones, taps "Add to Home Screen," and uses it like a native app. We develop on Windows (no Mac available), so no Xcode. If we ever need native iOS, we'll use Expo EAS for cloud builds.

---

## Core concept

Every furniture item follows this lifecycle:

```
AVAILABLE (in warehouse)
    ↓  assigned to a job, scanned out
IN TRANSIT
    ↓  delivered to house
STAGED (in a house)
    ↓  house sells, scanned back in
RETURNED → condition check
    ↓           ↓           ↓
  AVAILABLE   DAMAGED    DISPOSED
  (good)     (flagged)   (thrown away)
```

The entire system tracks where each item is in this cycle at any given moment.

---

## Key business rules

1. **Sets are convenience groupings, not rigid bundles.** A set like "Modern Living Room A" groups items that often travel together. When assigning items to a job, you can pick a whole set (and all available items get added), then uncheck specific pieces you don't need, or skip sets entirely and cherry-pick individual items. An item belongs to one set (or none), but being in a set doesn't mean it always travels with the set.

2. **One warehouse.** No multi-location logic needed.

3. **Damaged items get flagged.** During the scan-return process, each item gets a condition check: good, damaged, or dispose. "Good" goes back to available. "Damaged" gets flagged for attention but stays in inventory. "Dispose" removes it from active inventory permanently (but the record stays for history).

3a. **Missing items get flagged too, via manager override.** A job can't auto-complete until every assigned item is scanned back — but real furniture sometimes doesn't come back (lost, stolen, left behind). A manager can "Force complete" a job from Job Detail; every not-yet-returned item on that job gets `status: missing` (flagged in inventory, same as damaged) and the job closes with `status: completed`. A missing item can be resolved later via "Mark as found" on its Item Detail page, which sets it back to `available`. See `POST /jobs/:id/force-complete` and `POST /items/:id/found`.

4. **Close dates change.** A house might sell early, get extended, or fall through. The expected close date on a job is editable through an "Edit Job" flow (not a quick-tap — it doesn't change frequently enough to warrant inline editing).

5. **Only our team creates jobs.** No client-facing portal. Realtors/clients are just a name and contact number on the job record.

6. **Scanning always happens in the context of a job.** You don't scan an item into the void — you scan it as part of a specific move (scan out for a job, scan return from a job). The one exception is "Quick Scan," which is just a lookup tool to see an item's current status and history.

---

## Data model

Six tables. All primary keys are UUIDs.

### users
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| name | string | |
| email | string | unique |
| password_hash | string | |
| role | enum | `staff`, `manager` |
| created_at | timestamp | |

Staff can scan and view. Managers can also create/edit jobs, assign items, dispose items, and view reports.

### sets
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| name | string | e.g. "Modern Living Room A" |
| description | string | |
| created_at | timestamp | |

### items
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| sku | string | unique, e.g. "STG-ITM-0042" — this is what the QR code encodes |
| name | string | |
| category | string | sofa, table, lamp, bed, rug, art, decor, plant, textile, mirror, shelf, etc. |
| set_id | uuid | FK → sets, nullable (standalone items have no set) |
| status | enum | `available`, `staged`, `disposed`, `missing` |
| condition | enum | `good`, `fair`, `damaged` |
| photo_url | text | nullable |
| purchase_cost | decimal | |
| purchase_date | date | |
| notes | text | nullable |
| created_at | timestamp | |

### jobs
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| address | string | |
| city | string | |
| state | string | |
| zip | string | |
| client_name | string | realtor or agency |
| client_contact | string | phone or email |
| status | enum | `planning`, `active`, `completed`, `cancelled` |
| start_date | date | |
| expected_end_date | date | editable — houses sell on unpredictable timelines |
| actual_end_date | date | nullable, filled when job completes |
| created_by | uuid | FK → users |
| notes | text | nullable |
| created_at | timestamp | |

### job_items
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| job_id | uuid | FK → jobs |
| item_id | uuid | FK → items |
| status | enum | `assigned`, `loaded`, `delivered`, `picked_up`, `returned`, `missing` |
| return_condition | enum | nullable — filled on return: `good`, `damaged`, `dispose` |
| return_notes | text | nullable |
| assigned_at | timestamp | |
| returned_at | timestamp | nullable |

This is the critical join table. It tracks not just which items are on which job, but each item's individual status through the staging lifecycle for that specific job.

### movements
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| item_id | uuid | FK → items |
| job_id | uuid | FK → jobs, nullable (some movements aren't job-related) |
| from_status | enum | |
| to_status | enum | |
| performed_by | uuid | FK → users |
| notes | text | nullable |
| created_at | timestamp | |

This is the append-only audit trail. Every scan, every status change creates a row. Never edit or delete movement records. This is the source of truth if anything gets questioned.

---

## QR code approach

Each item gets a QR code label that encodes only the item's SKU string (e.g. `STG-ITM-0042`). Nothing else — no URLs, no metadata. All logic lives in the app.

- **Generation:** Use an open-source QR library (like `qrcode` npm package) to generate QR images on the fly. Build a "Print Labels" feature that batches selected items into a printable PDF grid of QR codes with the item name and SKU underneath each one.
- **Scanning:** Use the `html5-qrcode` library for camera-based QR reading in the browser. This works well in modern mobile browsers for a PWA.
- **Hardware:** Phone cameras are the primary scanner. No dedicated scan guns needed initially.

---

## Screens and navigation

### Tab bar (always visible)
Five tabs: Home, Inventory, Scan (center, prominent), Jobs, More.

### Dashboard (Home tab)
- Stat cards: available count, staged count, active jobs, items needing attention (damaged/missing)
- Upcoming returns list: active jobs sorted by expected close date, with closing date badges
- Stat cards are tappable — they navigate to filtered inventory or jobs views

### Inventory (Inventory tab)
- Search bar at top
- Filter chips: All, Available, Staged, Flagged
- List of items showing: emoji icon by category, item name, SKU, set name (if any), status badge
- Each row taps through to Item Detail

### Item Detail
- Item info: name, SKU, category, set, cost, purchase date, current status/condition
- If staged: shows which house it's at (tappable to go to that job)
- Movement history timeline: chronological list of every status change with who/when/notes

### Sets (accessible from More tab)
- List of all sets with item count and availability summary
- Tap a set to see all its items with their statuses
- "New Set" button to create sets

### Jobs (Jobs tab)
- Tabbed: Active / Completed
- Each job card shows: address, client, item count, date range, status badge
- "New Job" button

### Job Detail
- Job info: address, client, contact, start date, expected close date, notes
- "Scan Return" primary action button (for active jobs)
- "Edit Job" button — opens a modal/sheet with all editable fields including expected close date and status
- "Assign Items" button — opens the item picker
- Item list grouped by: sets (showing "X of Y items from this set") and individual/standalone items

### Assign Items (modal from Job Detail)
- Two modes toggled by chips: "By Set" and "Individual"
- By Set mode: shows each set with its available items. Tapping a set selects all available items in it. You can then expand and uncheck individual items you don't want.
- Individual mode: flat list of all available items with checkboxes
- Confirm button shows count of selected items

### Scanner (Scan tab)
- Hub screen with:
  - Quick Scan card — look up any item by scanning
  - List of active jobs, each with "Scan Out" and "Scan Return" buttons

### Quick Scan
- Camera viewfinder (or manual ID entry as fallback)
- Shows item detail card when scanned: name, SKU, status, set, current location
- Tappable to go to full item detail

### Scan Out (for a specific job)
- Camera viewfinder + manual entry
- Scans items one by one — each scan adds to a running list
- Shows green confirmation for expected items, yellow for unexpected (with option to add anyway), red for items already staged elsewhere
- "Confirm & Assign" button finalizes and marks all scanned items as staged for this job

### Scan Return (for a specific job)
- Camera viewfinder + manual entry
- Scans items one by one
- After each scan: condition check with three buttons — Good, Damaged, Dispose
- Progress bar showing X of Y items returned
- Running list of returned items with their condition
- Items not scanned at the end are flagged as missing
- When all items returned, job auto-completes

### More tab
- Quick stats: utilization percentage, total inventory value
- Links to: Sets management, Print QR Labels
- (Future: reports, user management, settings)

---

## Tech stack

### Frontend
- **React** (with Vite for build tooling)
- **React Router** for client-side routing
- **TanStack Query** (React Query) for API state management
- **Tailwind CSS** for styling
- **html5-qrcode** for camera-based QR scanning
- **PWA** with service worker for offline capability and home screen install

### Backend
- **Node.js with Express** (or Fastify)
- **Prisma** as the ORM
- **PostgreSQL** database
- **JWT-based auth** with role-based access control (staff vs manager)
- **REST API** with versioned routes (`/api/v1/...`)

### Infrastructure
- **Database:** Supabase (free tier) or Neon for managed PostgreSQL
- **Backend hosting:** Railway or Render (free/cheap tiers)
- **Frontend hosting:** Vercel or Netlify (free tier, auto-deploy from git)
- **Photo storage:** Supabase Storage or Cloudflare R2

### QR code libraries
- `qrcode` npm package for generating QR images
- `html5-qrcode` for camera scanning in the browser
- `pdfkit` or `jspdf` for generating printable label PDFs

---

## API routes (suggested structure)

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
GET    /api/v1/auth/me

GET    /api/v1/items
POST   /api/v1/items
GET    /api/v1/items/:id
PUT    /api/v1/items/:id
GET    /api/v1/items/:id/movements
POST   /api/v1/items/:id/dispose
POST   /api/v1/items/:id/found          — resolves a `missing` item back to `available` (manager only)

GET    /api/v1/sets
POST   /api/v1/sets
GET    /api/v1/sets/:id
PUT    /api/v1/sets/:id
GET    /api/v1/sets/:id/items

GET    /api/v1/jobs
POST   /api/v1/jobs
GET    /api/v1/jobs/:id
PUT    /api/v1/jobs/:id
GET    /api/v1/jobs/:id/items
POST   /api/v1/jobs/:id/assign        — body: { itemIds: [] }
POST   /api/v1/jobs/:id/scan-out      — body: { itemId }
POST   /api/v1/jobs/:id/scan-return   — body: { itemId, condition, notes? }
POST   /api/v1/jobs/:id/force-complete — manager only; marks all unreturned items on the job `missing` and completes the job

GET    /api/v1/stats/dashboard
GET    /api/v1/labels/generate         — query: { itemIds } → returns PDF
```

---

## Reference prototype

The file `prototype/index.html` in this repo is a working single-file React prototype of the complete UI. It has all screens, navigation, mock data, and the full interaction flow. Use it as a visual reference for layout, component structure, and UX patterns. Build the real app to match this look and feel, but with proper components, real API integration, and production code structure.

---

## Deployment (live)

- **Frontend:** Vercel, root directory `client/`. Requires `VITE_API_BASE_URL` set to the full API base including the `/api/v1` suffix (e.g. `https://<railway-app>.up.railway.app/api/v1`) — a bare domain with no path will 404 on every request. Env var changes need a manual redeploy to take effect.
- **Backend:** Railway, root directory `server/`. Requires `CORS_ORIGIN` to exactly match the Vercel origin with **no trailing slash**. Railway CLI is linked locally (project `vivacious-cooperation`, service `StageFlow`) — use `railway run <cmd>` to run one-off commands (migrations, seed) against the production DB without exporting `DATABASE_URL` locally.
- **Database:** Supabase Postgres. **Must use the connection pooler, not the direct `db.<ref>.supabase.co:5432` host** — that host is IPv6-only and unreachable from Railway. Use the Session pooler (`aws-0-<region>.pooler.supabase.com:5432`), which is IPv4 and (unlike the Transaction pooler on :6543) supports prepared statements, so it works for both runtime queries and `prisma migrate deploy` without needing a separate `directUrl`.
  - Known risk: Supabase free-tier projects auto-pause after ~1 week of inactivity, which would take prod down silently. Worth a periodic health-check ping or a paid tier once this is load-bearing for the business.
- To run migrations/seed against prod from `server/`: `railway run npm run migrate:prod` and `railway run npm run seed`.

## Auth & access control

- Registration (`POST /api/v1/auth/register`) requires a `code` field matching the server-side `SIGNUP_CODE` env var — without it, anyone with the public URL could otherwise self-register as `manager` (the role is still client-supplied, but gated behind the shared code). Fails closed if `SIGNUP_CODE` is unset.
- Backend enforces role checks via `requireManager` middleware on all mutating manager-only routes (create/edit jobs, assign items, dispose items, create sets) — this is the real security boundary.
- Frontend role checks (`user?.role === "manager"` via `useAuth()`) are UX only, not security. Convention used throughout: hide the entry-point button/link for staff (see `Sets.tsx`, `Inventory.tsx`, `Jobs.tsx`), **and** guard the destination page itself with an early `<Navigate>` redirect for anyone who lands there directly by URL (see `CreateJob.tsx`) — hiding the button alone doesn't stop direct navigation.

---

## Non-goals (for now)

- Multi-warehouse support
- Client/realtor portal
- Automated scheduling or route optimization
- Financial reporting or invoicing
- Integration with MLS or real estate platforms
- Native mobile app (PWA only for now)