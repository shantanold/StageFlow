# StageFlow

Home staging inventory management PWA. Track furniture inventory, organize items into sets, manage staging jobs, scan QR codes for check-out/return, and print label sheets — all from a mobile-first web app your team installs directly to their home screen.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript + TanStack Query v5 |
| Styling | Tailwind CSS + CSS variables (dark navy theme) |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 14+ via Prisma ORM |
| Auth | JWT (7-day expiry) + bcrypt |
| PWA | vite-plugin-pwa + Workbox (offline-capable) |
| QR | `qrcode` (server PNG generation) + `html5-qrcode` (camera scanning) |
| Labels | `pdfkit` — 3×10 grid, US Letter PDF |

## Running locally

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ running locally

### 1. Clone and install

```bash
git clone <repo-url>
cd inventory_project
npm install
```

### 2. Set up the database

```bash
# Create the database
createdb stageflow

# Copy and edit server env
cp .env.example server/.env
# Edit server/.env with your DATABASE_URL and a JWT_SECRET
```

### 3. Run migrations and seed

```bash
cd server
npx prisma migrate deploy
npm run seed
cd ..
```

### 4. Start the dev server

```bash
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

### Default test credentials

| Role | Email | Password |
|---|---|---|
| Manager | manager@stageflow.app | staging123 |
| Staff | staff@stageflow.app | staging123 |

Managers can create/edit items, sets, and jobs. Staff can scan and view.

## Deployment

### Database — Supabase (free tier)

1. Create a new project at [supabase.com](https://supabase.com)
2. Copy the **Connection string** (URI format) from Settings → Database
3. Use it as `DATABASE_URL` in your backend env vars

```bash
# Run migrations against prod DB (from server/)
DATABASE_URL="postgresql://..." npx prisma migrate deploy
DATABASE_URL="postgresql://..." npm run seed
```

### Backend — Railway

1. Create a new project at [railway.app](https://railway.app)
2. Connect your GitHub repo, set root directory to `server/`
3. Set environment variables:
   ```
   DATABASE_URL=postgresql://...
   JWT_SECRET=<output of: openssl rand -base64 32>
   CORS_ORIGIN=https://your-app.vercel.app
   PORT=3001
   ```
4. Railway auto-detects the `start` script (`node dist/index.js`) after running `npm run build`
5. Add a custom start command: `npm run build && npm start`

### Frontend — Vercel

1. Import the repo at [vercel.com](https://vercel.com)
2. Set **Root Directory** to `client/`
3. Set environment variable:
   ```
   VITE_API_BASE_URL=https://your-api.railway.app/api/v1
   ```
4. Build command: `npm run build` | Output directory: `dist`

The PWA manifest and service worker are automatically included in the `dist/` build output.

### "Add to Home Screen"

- **iOS Safari**: tap Share → "Add to Home Screen"
- **Android Chrome**: tap the install prompt or Menu → "Add to Home Screen"

## Environment variables reference

### Server (`server/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret for signing JWTs — use a long random string |
| `PORT` | | Server port (default: 3001) |
| `CORS_ORIGIN` | | Allowed frontend origin (default: http://localhost:5173) |

### Client (`client/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Prod only | Full base URL of the API e.g. `https://api.railway.app/api/v1` |

## Project structure

```
inventory_project/
├── client/                 # React + Vite PWA
│   ├── public/             # Icons, manifest source
│   ├── scripts/            # generate-icons.mjs (PNG from SVG)
│   └── src/
│       ├── components/     # AppShell, TabBar, ErrorBoundary, ConfirmDialog
│       ├── contexts/       # AuthContext, ToastContext
│       ├── hooks/          # useDebounce
│       ├── lib/            # api.ts, queries.ts, labels.ts, utils.ts
│       ├── pages/          # All screens
│       └── types/          # Shared TypeScript types
├── server/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   └── src/
│       ├── middleware/     # auth.ts, role.ts
│       ├── routes/         # auth, items, sets, jobs, labels, stats
│       └── index.ts
├── docker-compose.yml      # Local PostgreSQL (optional)
└── .env.example
```

## Available scripts

From the project root:

```bash
npm run dev        # Start client + server concurrently
npm run build      # Build both client and server
npm run migrate    # Run Prisma migrations (dev)
```

From `server/`:

```bash
npm run seed            # Seed test data
npm run migrate:prod    # Deploy migrations to production DB
npm run studio          # Open Prisma Studio
```
