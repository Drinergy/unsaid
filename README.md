# Unsaid

A privacy-first web app where people anonymously share unsaid thoughts on a dark world map.

## Features

- **Anonymous posting**: no accounts; each browser gets a random device ID
- **Dark world map**: Leaflet with MapTiler dark tiles, thoughts shown as soft glowing lights
- **Threaded replies**: nested up to 5 levels deep
- **Realtime**: new thoughts and replies appear live
- **Privacy**: location is blurred to about 100m on the server; IP and device ID are stored only as keyed hashes
- **Abuse control**: rate limits, link/email filter, duplicate check, community reports

## Tech stack

- Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS
- Leaflet + react-leaflet, MapTiler tiles
- Supabase: Postgres + PostGIS, Realtime
- Vitest for unit tests
- Vercel for deployment

## Getting started

**Prerequisites:** Node.js 20+, a Supabase project, a free [MapTiler](https://cloud.maptiler.com) API key.

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env.local` from the example and fill it in:
   ```bash
   cp .env.local.example .env.local
   ```
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_secret_key
   NEXT_PUBLIC_MAPTILER_KEY=your_maptiler_key
   ID_HASH_SECRET=any_long_random_string   # openssl rand -hex 32
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
   The service key and `ID_HASH_SECRET` are server-only: never expose them or commit `.env.local`.

3. Set up the database (details in [MIGRATIONS.md](./MIGRATIONS.md)). In the Supabase SQL Editor run, in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/003_spatial_functions.sql`
   - `supabase/migrations/004_security_hardening.sql`
   - `supabase/migrations/005_cluster_function.sql`
   - `supabase/migrations/006_reactions.sql`
   - `supabase/migrations/007_reaction_types.sql`
   - `supabase/migrations/008_reply_location.sql`
   - `supabase/migrations/009_report_ips_and_reply_depth.sql`

   (There is no `002`: it was removed.) Then enable realtime:
   ```sql
   alter publication supabase_realtime add table unsaids, replies;
   ```

4. Run the app:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

More help: [SETUP.md](./SETUP.md), [TROUBLESHOOTING.md](./TROUBLESHOOTING.md), [DEPLOYMENT.md](./DEPLOYMENT.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Run unit tests (Vitest) |
| `npm run type-check` | TypeScript check |
| `npm run lint` | ESLint |

## Project structure

```
unsaid/
├── app/              # Next.js App Router
│   ├── api/          # API routes: unsaids, replies, reports
│   ├── page.tsx      # Main page
│   └── layout.tsx
├── components/       # React components (map, unsaid, landing, ui)
├── lib/
│   ├── supabase/     # Supabase clients (browser and server)
│   ├── hooks/        # React hooks (realtime, geolocation, state)
│   └── utils/        # Rate limit, filters, validation, hashing
├── types/            # TypeScript types
├── public/sw.js      # Clears the old offline cache and removes itself (no service worker is registered now)
└── supabase/         # Database migrations
```

## How it works

### Anonymous identity
- Device ID is a UUID in localStorage; no accounts.
- The server hashes the device ID and the caller's IP with `ID_HASH_SECRET` before storing them.

### Location privacy
- Coordinates are rounded to about 100m **on the server**, whatever the client sends.
- City and country come from reverse geocoding (OpenStreetMap Nominatim); IP lookup is the fallback if location is denied.
- Replies show the replier's city and country too (never coordinates); it is optional and unverified, like a thought's place.

### Rate limiting
- 10 thoughts per 24 hours per device, 50 replies per 24 hours per device
- 20 posts per hour per IP
- 30 seconds minimum between posts
- Counted from the posts themselves (rolling windows); a failed check blocks the request.

### Moderation
- Links and email addresses are blocked.
- One report per device per post; **3 reports from different devices** hide a post (shadow ban).
- All database writes go through the API; direct writes with the public key are blocked.

## Deployment

1. Push to GitHub and import the project in Vercel.
2. Add all environment variables above (including `ID_HASH_SECRET`).
3. In MapTiler, restrict the key's allowed origins to your domain.
4. Deploy.

## License

Private project - All rights reserved
