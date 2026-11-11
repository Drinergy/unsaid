# Setup Instructions

## Prerequisites

Before setting up the project, ensure you have:

1. **Node.js 20+** installed (required for Next.js 16)
   - Check: `node --version`
   - Download: https://nodejs.org/
   - Recommended: Node.js 20 LTS or 22 LTS

2. **npm** (comes with Node.js)
   - Check: `npm --version`

## Initial Setup

### 1. Install Dependencies

Run the following command in the project root:

```bash
npm install
```

This will install all dependencies listed in `package.json`:
- Next.js 16
- React 19
- Supabase client libraries
- Leaflet (map, with MapTiler tiles)
- TypeScript
- Tailwind CSS
- And all other required packages

### 2. Set Up Environment Variables

Copy the example environment file:

```bash
cp .env.local.example .env.local
```

Then edit `.env.local` with your actual credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXT_PUBLIC_MAPTILER_KEY=your_maptiler_key
ID_HASH_SECRET=any_long_random_string
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Set Up Supabase Database

**📖 See [MIGRATIONS.md](./MIGRATIONS.md) for detailed step-by-step instructions**

Quick overview:
1. Create a Supabase project at https://supabase.com
2. Go to SQL Editor in Supabase Dashboard
3. Enable PostGIS extension:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   ```
4. Run migrations in order (copy/paste each file into SQL Editor):
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/003_spatial_functions.sql`
   - `supabase/migrations/004_security_hardening.sql`
   - `supabase/migrations/005_cluster_function.sql`
   - `supabase/migrations/006_reactions.sql`
   - `supabase/migrations/007_reaction_types.sql`
   - `supabase/migrations/008_reply_location.sql`
   - `supabase/migrations/009_report_ips_and_reply_depth.sql`
5. Enable Realtime replication:
   - Go to Database → Replication
   - Enable for `unsaids` and `replies` tables

### 4. Get a MapTiler Key (free)

1. Create an account at https://cloud.maptiler.com
2. Account → API keys → create a key (allowed origin: `localhost`)
3. Add it to `.env.local` as `NEXT_PUBLIC_MAPTILER_KEY`

### 5. Run Development Server

```bash
npm run dev
```

The app will be available at http://localhost:3000

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## Troubleshooting

### npm install fails

- Ensure Node.js 20+ is installed
- Try deleting `node_modules` and `package-lock.json`, then run `npm install` again
- Check your internet connection
- See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed solutions

### npm global install permission errors

If you encounter permission errors when trying to update npm globally:
- **You don't need to update npm globally** - the project works with your current npm version
- If you want to fix permissions anyway, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for solutions
- Recommended: Use nvm (Node Version Manager) for managing Node.js versions

### Map not loading

- Verify `NEXT_PUBLIC_MAPTILER_KEY` is correct in `.env.local` and restart the dev server
- Check browser console for errors
- Ensure the key's allowed origins include your domain

### Database errors

- Verify PostGIS extension is enabled
- Check that all migrations ran successfully
- Verify RLS policies are active

### Realtime not working

- Ensure replication is enabled for `unsaids` and `replies` tables
- Check Supabase dashboard → Database → Replication
- Verify WebSocket connections aren't blocked

## Next Steps

After setup is complete, see:
- `README.md` for project overview
- `DEPLOYMENT.md` for deployment instructions
