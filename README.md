# Unsaid

**Say the thing you never said, to no one in particular.**

Unsaid is an anonymous web app where people leave short thoughts on a dark world map. There are no accounts and no profiles. A thought is a small glowing light at a place on Earth; anyone can open it, react, or reply in a Threads-style thread.

## Features

- **Anonymous by design**: no sign-up. Each browser gets a random device ID; the server stores only keyed hashes of it and of the IP.
- **Dark world map**: Leaflet with MapTiler dark tiles. Thoughts glow softly and cluster when you zoom out; only what is in view is loaded (clustering is done in the database).
- **Threaded replies**: nested up to 5 levels. Replies show the replier's city and country, never coordinates.
- **Reactions**: four reaction types, one per device per thought.
- **Realtime**: new thoughts and replies appear live, only if they are in your view.
- **Location privacy**: coordinates are rounded to about 100 m **on the server**, whatever the client sends.
- **Abuse control**: rate limits, link/email filter, duplicate check, and community reports (3 reports from different IPs hide a post).
- **Extras**: saved thoughts, a daily thought, a "my location" button, keyboard shortcuts.

## Tech stack

Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS, Leaflet / react-leaflet, MapTiler tiles, Supabase (Postgres + PostGIS, Realtime), Vitest. Deployed on Vercel.

## Getting started

You need Node.js 20+, a [Supabase](https://supabase.com) project, and a free [MapTiler](https://cloud.maptiler.com) key.

```bash
npm install
cp .env.local.example .env.local   # then fill it in
npm run dev                        # http://localhost:3000
```

### Environment variables

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Publishable (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Secret key. Never expose it |
| `ID_HASH_SECRET` | **server only** | Long random string (`openssl rand -hex 32`). Changing it breaks rate-limit history |
| `NEXT_PUBLIC_MAPTILER_KEY` | public | Restrict it to your domain in MapTiler |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public | Cloudflare Turnstile site key (bot check when posting). Add your domain and `localhost` to the widget's hostnames |
| `TURNSTILE_SECRET_KEY` | **server only** | Turnstile secret key. In production, posting is refused if it is missing; local development skips the check |
| `NEXT_PUBLIC_APP_URL` | public | `http://localhost:3000` locally |

### Database

In the Supabase SQL editor, run the files in `supabase/migrations/` in this order (there is no `002`):

`001_initial_schema` → `003_spatial_functions` → `004_security_hardening` → `005_cluster_function` → `006_reactions` → `007_reaction_types` → `008_reply_location` → `009_report_ips_and_reply_depth` → `010_hide_private_columns`

Then turn on realtime:

```sql
alter publication supabase_realtime add table unsaids, replies;
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Unit tests (Vitest) |
| `npm run type-check` | TypeScript check |
| `npm run lint` | ESLint |

## Voice

Every sentence people read lives in `lib/copy.ts`: warm, short, never blaming. One vocabulary: *Unsaid* is the app's name; what people write is a **thought** (they write it and share it); an answer is a **reply**. A test keeps cold words ("failed", "invalid", "spam") and the word "unsaid" out of those sentences. After someone shares, a quiet notice appears and the new light glows in on the map where it was written.

## Project structure

```
app/            Next.js routes and API (unsaids, replies, reactions, reports)
components/     map, unsaid (thread, forms, reactions), landing, saved thoughts, ui
lib/            hooks, supabase clients, utils (hashing, rate limits, clustering, filters)
supabase/       SQL migrations
types/          shared TypeScript types
```

## How privacy and safety work

- **Identity**: device ID is a UUID in `localStorage`. Device ID and IP are HMAC-hashed with `ID_HASH_SECRET` before they are stored.
- **Reads**: the public key can only read the columns the app shows (not the hashed device id or IP; migration 010).
- **Writes**: the public key cannot write. Row-level security has no write policies; every write goes through the API using the server-only service key.
- **Bot check**: new thoughts and replies need a Cloudflare Turnstile token (checked on the server before the database is touched).
- **Rate limits** (counted from stored posts): 10 thoughts and 50 replies per device per 24 h, 20 posts per IP per hour, 30 s between posts.
- **Reports**: one per IP per post, 20 per hour per IP; 3 distinct IPs hide the post.
- **Client IP** comes from platform headers (`x-vercel-forwarded-for`, `x-real-ip`) or the last `x-forwarded-for` hop. In `next dev` there is no proxy, so everyone shares one IP.

- **Third parties**: reverse geocoding sends the already-blurred coordinates to OpenStreetMap Nominatim. When someone enters the map, the browser asks ipapi.co for an approximate place from their IP (no permission prompt). The exact position is only asked from the device when someone shares a thought. The posting forms load Cloudflare Turnstile (the bot check), so Cloudflare sees the visitor's IP when a form opens.

## Running on free tiers (spam and traffic spikes)

- **Map tiles:** MapTiler's free plan allows about 5,000 map sessions a month. The map only loads after a visitor enters, and if MapTiler refuses (quota or bad key) it falls back to plain OpenStreetMap tiles shown dark. That fallback is a stopgap: OpenStreetMap's servers are for light use.
- **Live updates:** a free Supabase project allows 200 open live connections, so hidden tabs disconnect and reload when they come back.
- **Reads:** 600 per minute per IP (generous, because many phones share one mobile-carrier IP), with short CDN caching on map queries.
- **Emergency brake:** set `POSTING_PAUSED=1` in Vercel and redeploy to stop new thoughts, replies and reactions (reading and reporting still work).
- **Clean-up:** `node --env-file=.env.local scripts/moderate.mjs top` shows the busiest posters (hashed IPs); `hide <ip-hash>` / `unhide <ip-hash>` shadow-bans or restores everything from one IP.

## Deploying

1. Push to GitHub and import the repo in Vercel.
2. Add the environment variables above.
3. Restrict the MapTiler key to your domain.
4. Deploy.

## Troubleshooting

- **Blank or grey map**: `NEXT_PUBLIC_MAPTILER_KEY` is missing or restricted to another domain.
- **Writes fail**: check `SUPABASE_SERVICE_ROLE_KEY` and `ID_HASH_SECRET` are set.
- **No live updates**: run the realtime `alter publication` statement above.
- **Blocked when testing locally**: the 30 s throttle and daily limits apply to you too.

## License

MIT, see [LICENSE](./LICENSE).
