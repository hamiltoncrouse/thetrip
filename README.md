# The Trip

AI-forward France itinerary planner built with Next.js 15, Prisma, and the same Render/Postgres/Gemini stack you already use for IdealHome. This repo ships with an opinionated schema, typed env validation, seed API routes, and a landing page so you can immediately start stitching UI + AI workflows together.

## Stack Highlights
- **Next.js 15 (App Router)** with TypeScript, Tailwind, and Turbopack-ready dev server.
- **Prisma ORM** targeting Render-managed Postgres 17. The schema covers users, trips, days, activities, travel segments, hotels, and cached AI suggestions.
- **Route Handlers** for `/api/health`, `/api/trips`, and `/api/ai/suggestions` to showcase database + AI wiring patterns.
- **Env validation** via Zod (`src/lib/env.ts`) so missing secrets fail fast.
- **Gemini/OpenAI ready**. Keys stay server-side; the AI route currently returns placeholder data until you connect the Gemini proxy.

## Requirements
- Node.js 20+ (Render also runs Node 20). `brew install node@20 && echo 'export PATH="/usr/local/opt/node@20/bin:$PATH"' >> ~/.zshrc`
- PostgreSQL database (Render Basic instance works). The default Prisma user only needs standard privileges; migrations are applied with `prisma migrate deploy`.
- npm 10+ recommended.

## Environment Variables
Copy `.env.example` to `.env` (the file is gitignored) and fill in the secrets:
```
DATABASE_URL="postgresql://..."
GEMINI_API_KEY=""
OPENAI_API_KEY=""
GOOGLE_MAPS_API_KEY=""
HOTEL_API_KEY=""
FIREBASE_SERVICE_ACCOUNT=""   # JSON blob from Firebase service account
STARTING_CREDITS=50
NEXT_PUBLIC_APP_NAME="The Trip"
NEXT_PUBLIC_DEFAULT_HOME_CITY="Paris"
```
`DATABASE_URL` is required for any Prisma call. The health check endpoint (`/api/health`) will alert you when keys are missing.

### Authentication
- Create/reuse a Firebase project (you can keep using `room-eadab`).
- In **Firebase Console → Project Settings → Service Accounts**, generate a new private key and paste the entire JSON (single line) into `FIREBASE_SERVICE_ACCOUNT`.
- Every API route that touches trip data now expects a Firebase ID token header: `Authorization: Bearer <firebase-id-token>`.
- The server verifies the token, upserts the user in Postgres, and seeds credits from `STARTING_CREDITS`. Without a valid token the API responds with `401`.

## Database & Prisma
Render’s managed Postgres roles cannot use `pg_terminate_backend`, so `prisma migrate dev` will fail. Instead:

1. **Create a migration** (already done for the initial schema): `prisma/migrations/20241108221000_init`.
2. **Apply migrations**: `npm run prisma:deploy` (or `npx prisma migrate deploy`).
3. **Sync schema without migrations** (useful for prototypes): `npx prisma db push`. Avoid in production when you care about history.
4. **Generate client** after schema changes: `npx prisma generate`.

If you later work locally against a Docker/Postgres instance with superuser rights you can go back to `prisma migrate dev` for a nicer DX, then run `prisma migrate deploy` on Render.

## Useful npm scripts
```
npm run dev      # Next.js dev server with Turbopack
npm run build    # Production build
npm run start    # Production start (Render uses this)
npm run lint     # ESLint via next lint
```

## Local Development
1. Install dependencies: `npm install` (Node 20+).
2. Ensure `.env` has a valid `DATABASE_URL`.
3. Apply migrations: `npx prisma migrate deploy` (first run already sets up the schema).
4. Start the dev server: `npm run dev` and open http://localhost:3000 (or deploy directly to Render if you only run there).
5. When calling protected API routes (e.g., `/api/trips`), send the Firebase ID token from your client: `fetch("/api/trips", { headers: { Authorization: \\"Bearer ${await user.getIdToken()}\\" } })`.

The landing page introduces The Trip. API routes are namespaced at `/api/*`; you can hit `GET /api/health` to confirm DB connectivity and `POST /api/trips` to create demo trips (user auth to come later).

## Deploying to Render
1. **Render Postgres**: reuse the `my-data-vibe` instance or create a new database. Copy the *External Database URL* into the Web Service env.
2. **Web Service**: point to this repo.
   - Build command: `npm install && npm run build`
   - Start command: `npm run start`
   - Environment variables: everything from `.env`, including `DATABASE_URL`, API keys, and optional `CORS_ORIGINS` once you introduce a standalone frontend.
3. **Static assets** ship with the same service, so no extra static site needed yet.
4. **Cron/Background jobs**: use Render Cron to hit internal API routes later (`/api/tasks/cache-travel`, etc.).

## Next Steps
- Wire Firebase auth (reuse the pattern from your IdealHome backend) and swap the `demo-user` placeholder in `/api/trips`.
- Implement the Gemini image/text proxy and bridge it to `/api/ai/suggestions`.
- Build the actual trip dashboard UI (calendar, day timeline, travel dashboard component).
- Add automated tests and CI (Vitest + Playwright) once routes stabilize.

Welcome to The Trip—psychedelic France planning awaits.
