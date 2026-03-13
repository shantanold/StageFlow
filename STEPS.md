# StageFlow — Claude Code Build Steps

Copy-paste these prompts into Claude Code in order. Wait for each phase to complete before starting the next. Each prompt assumes the previous phases are done.

---

## Phase 0: Project setup

```
Read CLAUDE.md in this repo — it's the full product spec for StageFlow, a home staging inventory management PWA. 

Set up the project from scratch:
- Create a monorepo structure with /client (React + Vite + Tailwind) and /server (Node + Express + Prisma + PostgreSQL)
- Initialize both with their package.json, tsconfig, and configs
- Set up Tailwind with a dark theme matching the design direction in CLAUDE.md (deep navy/slate backgrounds, blue accent, green/amber/red for status colors)
- Set up Prisma with the full database schema from CLAUDE.md (users, sets, items, jobs, job_items, movements tables with all fields and relationships)
- Create a .env.example with placeholders for DATABASE_URL, JWT_SECRET, and PORT
- Add a docker-compose.yml for local PostgreSQL
- Run the initial Prisma migration
- Set up basic Express server with CORS, JSON parsing, and a health check endpoint
- Set up Vite dev server with proxy to the backend

Don't build any features yet — just get the scaffolding clean and running.
```

---

## Phase 1: Auth and user management

```
Referring to CLAUDE.md for the full spec:

Build the authentication system:
- JWT-based auth with bcrypt password hashing
- POST /api/v1/auth/register (name, email, password, role)
- POST /api/v1/auth/login (email, password) → returns JWT
- GET /api/v1/auth/me → returns current user from token
- Auth middleware that validates JWT on protected routes
- Role middleware (staff vs manager) for route-level access control

On the frontend:
- Login screen with email/password form
- Simple register screen (for initial setup — can be restricted later)
- Auth context/provider that stores the JWT token and current user
- Protected route wrapper that redirects to login if not authenticated
- App shell with the bottom tab bar (Home, Inventory, Scan, Jobs, More) — just placeholder pages for now, but the navigation structure should be fully working

Use the dark theme from the prototype in CLAUDE.md. The tab bar should have the scan button as a prominent center circle.
```

---

## Phase 2: Inventory management (items and sets)

```
Referring to CLAUDE.md for the full spec:

Build the items and sets CRUD:

Backend:
- Full REST endpoints for items: GET (with search, filter by status/category/set), POST, GET/:id, PUT/:id, GET/:id/movements
- Full REST endpoints for sets: GET, POST, GET/:id, PUT/:id, GET/:id/items
- Items should support filtering by: status (available/staged/disposed), category, set_id, and text search across name and SKU
- Auto-generate SKU on item creation (format: STG-ITM-XXXX, incrementing)

Frontend:
- Inventory tab: searchable list with filter chips (All, Available, Staged, Flagged), each item row shows emoji by category, name, SKU, set name, status badge
- Item Detail screen: all item info, current location if staged (which job/house), movement history timeline
- Add Item form: name, category dropdown, set dropdown (optional), cost, purchase date, notes
- Sets screen (accessible from More tab): list of sets with item count and availability, tap to see set detail with all items
- Create Set modal: name and description

Match the visual style from the prototype — dark cards, colored status badges, clean typography.
```

---

## Phase 3: QR code generation and label printing

```
Referring to CLAUDE.md for the full spec:

Build QR code generation and label printing:

- Install the 'qrcode' npm package on the server side
- Each item's QR code encodes just its SKU string (e.g. "STG-ITM-0042") — nothing else
- Add a GET /api/v1/items/:id/qr endpoint that returns the QR code as a PNG image
- Add a GET /api/v1/labels/generate endpoint that accepts an array of item IDs (via query string) and returns a printable PDF with a grid layout of QR code labels — each label should show the QR code, item name, and SKU underneath
- Use jsPDF or pdfkit for the PDF generation
- The PDF should be formatted for standard label sheets (something like 3 columns x 10 rows per page on US Letter)

Frontend:
- On the Item Detail screen, show the QR code image
- On the Inventory screen, add a "Select for printing" mode where you can check multiple items and then tap "Print Labels" to download the PDF
- On the Sets screen, add a "Print all labels" button that generates labels for all items in the set
- Add a "Print QR Labels" section in the More tab that lets you select items across the whole inventory for batch printing
```

---

## Phase 4: Jobs and item assignment

```
Referring to CLAUDE.md for the full spec:

Build the jobs system:

Backend:
- Full REST endpoints for jobs: GET (filter by status), POST, GET/:id, PUT/:id, GET/:id/items
- POST /api/v1/jobs/:id/assign — accepts { itemIds: [] }, updates item statuses to 'staged', creates job_items records, creates movement records
- Job creation should only be allowed for managers (role check)
- When assigning items, validate that each item is currently 'available'

Frontend:
- Jobs tab: tabbed view (Active / Completed), each job card shows address, client, item count, date range, status badge
- Create Job form: address, city, state, zip, client name, client contact, start date, expected close date, notes. Default city to "Pearland", state to "TX"
- Job Detail screen: all job info in stat cards, item list grouped by set membership (show "X of Y items from Set Name") and standalone items
- Edit Job modal: all fields editable including expected close date and status. This is a bottom sheet / modal, not a separate page.
- Assign Items modal: two modes toggled by chips — "By Set" (shows sets with available items, tap set to select all, expand to uncheck individual items) and "Individual" (flat searchable list with checkboxes). Confirm button with selected count.

The assign-by-set interaction is important — when you tap a set, ALL available items in that set get selected. Then you can expand the set and uncheck specific items you don't want on this job. This is the core workflow.
```

---

## Phase 5: QR scanning and scan workflows

```
Referring to CLAUDE.md for the full spec:

Build the scanning system:

- Install html5-qrcode for camera-based QR reading
- The scanner should use the rear camera by default on mobile

Frontend screens:

1. Scanner hub (Scan tab): shows a Quick Scan card and a list of active jobs with "Scan Out" and "Scan Return" buttons for each

2. Quick Scan: camera viewfinder that reads QR codes. When scanned, shows the item's full detail card (name, SKU, status, set, current location if staged). Tappable to navigate to full Item Detail. Also include a manual text input as fallback for when camera scanning is difficult.

3. Scan Out (for a specific job):
   - Shows which job you're scanning for at the top
   - Camera viewfinder + manual entry fallback
   - Each scan adds the item to a running list with green confirmation
   - If item is not available, show red warning
   - If item is already staged elsewhere, show red warning with which job it's on
   - "Confirm & Assign" button calls the assign endpoint for all scanned items

4. Scan Return (for a specific job):
   - Shows which job you're returning from at the top
   - Camera viewfinder + manual entry fallback  
   - After each scan: condition check prompt with three buttons — Good, Damaged, Dispose
   - POST /api/v1/jobs/:id/scan-return — body: { itemId, condition, notes? }
   - This endpoint: updates item status (available/damaged/disposed), removes from job_items or updates status, creates movement record
   - Progress bar showing returned count vs expected count
   - Running list of returned items with their condition color-coded
   - When all items returned, auto-complete the job (update job status to 'completed', set actual_end_date)

Backend:
- POST /api/v1/jobs/:id/scan-out — body: { itemId } — validates and assigns single item
- POST /api/v1/jobs/:id/scan-return — body: { itemId, condition, notes? } — processes return with condition
```

---

## Phase 6: Dashboard and stats

```
Referring to CLAUDE.md for the full spec:

Build the dashboard and reporting:

Backend:
- GET /api/v1/stats/dashboard — returns: available count, staged count, total active items, flagged count (damaged), active jobs count, upcoming returns (active jobs sorted by expected_end_date with item counts)

Frontend — Dashboard (Home tab):
- Stat cards in a 2x2 grid: Available (green), Staged (blue), Active Jobs (white), Needs Attention (amber)
- Each stat card is tappable — navigates to the relevant filtered view
- "Upcoming Returns" section below: list of active jobs sorted by expected close date, showing address, item count, client name, and a date badge (amber if closing within 7 days, blue otherwise)
- The dashboard should feel like the command center — first thing you see when you open the app

More tab additions:
- Quick stats: utilization percentage (staged / total active), total inventory value (sum of purchase costs)
- These should be stat cards at the top of the More tab
```

---

## Phase 7: PWA setup and polish

```
Referring to CLAUDE.md for the full spec:

Make this a proper installable PWA and polish the UX:

PWA setup:
- Create manifest.json with app name "StageFlow", dark theme color (#0a0f1a), standalone display mode, portrait orientation
- Create a service worker that caches the app shell and static assets for offline capability (use Workbox via the vite-plugin-pwa plugin)
- Generate proper PWA icons (192x192 and 512x512) — simple dark icon with "SF" text
- Add apple-mobile-web-app meta tags for iOS home screen support
- Test that "Add to Home Screen" works on both iOS Safari and Android Chrome

Polish:
- Add loading skeletons/spinners for data fetching states
- Add toast notifications for actions (item added, job created, scan successful, errors)
- Add pull-to-refresh on list screens
- Add empty states with helpful messages ("No items found", "No active jobs — create one to get started")
- Add confirmation dialogs for destructive actions (disposing items, cancelling jobs)
- Smooth page transitions and animations
- Make sure all forms validate inputs and show clear error messages
- Test the full flow: create items → create a set → create a job → assign items by set → scan out → scan return with condition checks → verify items return to available
```

---

## Phase 8: Deployment

```
Set up deployment for StageFlow:

Database:
- Set up a free PostgreSQL instance on Supabase (or Neon)
- Run Prisma migrations against the production database
- Seed it with a few test items, sets, and a test user

Backend:
- Configure for deployment on Railway (or Render)
- Set up environment variables: DATABASE_URL, JWT_SECRET, CORS_ORIGIN
- Make sure the server serves on the PORT environment variable

Frontend:
- Configure Vite build for production
- Set up deployment on Vercel (or Netlify)
- Configure the API proxy / environment variable for the production backend URL
- Make sure the PWA manifest and service worker are included in the build output

Create a README.md with:
- What the app does (one paragraph)
- Tech stack summary
- How to run locally (docker-compose up for DB, npm run dev for both client and server)
- How to deploy
- Environment variables reference
- Default test user credentials
```

---

## Optional follow-up prompts

Use these as needed after the main build is done:

### Add photo upload for items
```
Add photo upload capability to items. Use Supabase Storage (or Cloudflare R2) for file storage. On the Add Item and Item Detail screens, add a camera/upload button that lets users take a photo or pick from gallery. Store the URL in the item's photo_url field. Show the photo as the item thumbnail throughout the app instead of the category emoji.
```

### Add bulk operations
```
Add bulk operations to the inventory screen. When in selection mode, let users select multiple items and then: assign all to a job, print labels for all, or dispose all (with confirmation). Use a floating action bar at the bottom when items are selected.
```

### Add simple reporting
```
Add a Reports screen accessible from the More tab. Include: 
- Item utilization chart (% of time each item spends staged vs available over the last 90 days)
- Average job duration
- Most-used items (sorted by number of jobs they've been on)
- Monthly activity summary (items moved out vs returned)
Use Recharts for the charts.
```

### Add push notifications
```
Add push notifications using Firebase Cloud Messaging (FCM). Notify managers when:
- A job's expected close date is within 3 days
- An item is flagged as damaged during return
- A scan return completes with missing items
Set up the FCM integration on the backend and request notification permission on the frontend.
```