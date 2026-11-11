# Database Migrations Guide

This guide explains how to run the database migrations for the Unsaid app.

## Migration Files

The migrations are located in `supabase/migrations/` and must be run in order:

1. `001_initial_schema.sql` - Creates tables, indexes, triggers, and RLS policies
2. `003_spatial_functions.sql` - Creates PostGIS spatial query functions
3. `004_security_hardening.sql` - Locks down direct DB access, stores hashed IPs, fixes moderation triggers, drops `rate_limits`
4. `005_cluster_function.sql` - Server-side clustering for the zoomed-out map
5. `006_reactions.sql` - Reactions stored in the database (one per device per thought)
6. `007_reaction_types.sql` - New reaction set (felt, me too, here for you, proud of you)
7. `008_reply_location.sql` - City and country on replies
8. `009_report_ips_and_reply_depth.sql` - Reports count distinct IPs; replies store their depth

(There is no `002`: the old rate-limit counter table and function were removed. Rate limits now count the posts themselves.)

## Prerequisites

- Supabase project created at https://supabase.com
- Access to your Supabase project dashboard
- PostGIS extension enabled (we'll do this in the steps below)

## Method 1: Using Supabase Dashboard (Recommended for Beginners)

This is the easiest method if you're new to Supabase.

### Step 1: Enable PostGIS Extension

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** (left sidebar)
3. Click **New Query**
4. Run this SQL:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

5. Click **Run** (or press Cmd/Ctrl + Enter)
6. You should see "Success. No rows returned"

### Step 2: Run Migration 001

1. In the SQL Editor, click **New Query**
2. Open `supabase/migrations/001_initial_schema.sql` in your code editor
3. Copy the entire contents
4. Paste into the Supabase SQL Editor
5. Click **Run**
6. Verify success - you should see "Success. No rows returned"

### Step 3: Run Migration 003

1. Click **New Query** again
2. Open `supabase/migrations/003_spatial_functions.sql`
3. Copy and paste the contents
4. Click **Run**

### Step 4: Run Migration 004

1. Click **New Query** again
2. Open `supabase/migrations/004_security_hardening.sql`
3. Copy and paste the contents
4. Click **Run**

### Step 4b: Run Migration 005

1. Click **New Query** again
2. Open `supabase/migrations/005_cluster_function.sql`
3. Copy and paste the contents
4. Click **Run**

### Step 4c: Run Migration 006

1. Click **New Query** again
2. Open `supabase/migrations/006_reactions.sql`
3. Copy and paste the contents
4. Click **Run**

### Step 4d: Run Migration 007

1. Click **New Query** again
2. Open `supabase/migrations/007_reaction_types.sql`
3. Copy and paste the contents
4. Click **Run**

### Step 4e: Run Migration 008

1. Click **New Query** again
2. Open `supabase/migrations/008_reply_location.sql`
3. Copy and paste the contents
4. Click **Run**

### Step 4f: Run Migration 009

1. Click **New Query** again
2. Open `supabase/migrations/009_report_ips_and_reply_depth.sql`
3. Copy and paste the contents
4. Click **Run**

### Step 5: Enable Realtime Subscriptions

**⚠️ Important**: The "Replication" page is for external data warehouses (private alpha). We need **Realtime subscriptions** for client-side live updates.

**See [ENABLE_REALTIME.md](./ENABLE_REALTIME.md) for detailed instructions**

**Quick method (SQL Editor):**

1. Go to **SQL Editor**
2. Run this SQL:

```sql
-- Add tables to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE unsaids;
ALTER PUBLICATION supabase_realtime ADD TABLE replies;
```

3. Verify it worked:

```sql
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename IN ('unsaids', 'replies');
```

Should return 2 rows.

### Step 6: Verify Tables

1. Go to **Table Editor** (left sidebar)
2. You should see these tables:
   - `unsaids`
   - `replies`
   - `reports`

## Method 2: Using Supabase CLI (Recommended for Developers)

If you have the Supabase CLI installed, this is the most efficient method.

### Step 1: Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Or using npm
npm install -g supabase
```

### Step 2: Login to Supabase

```bash
supabase login
```

### Step 3: Link Your Project

```bash
# Get your project reference ID from Supabase dashboard
# Project Settings → General → Reference ID

supabase link --project-ref your-project-ref-id
```

### Step 4: Run Migrations

```bash
# Run all migrations
supabase db push

# Or run a specific migration
supabase migration up
```

### Step 5: Enable Realtime

You still need to enable replication in the dashboard:
1. Go to **Database** → **Replication**
2. Enable replication for `unsaids` and `replies` tables

## Method 3: Using psql (Advanced)

If you have direct database access:

### Step 1: Get Connection String

1. Go to Supabase Dashboard → **Project Settings** → **Database**
2. Find **Connection string** → **URI**
3. Copy the connection string (it includes your password)

### Step 2: Connect and Run Migrations

```bash
# Connect to database
psql "your-connection-string-here"

# Run migrations in order
\i supabase/migrations/001_initial_schema.sql
\i supabase/migrations/003_spatial_functions.sql
\i supabase/migrations/004_security_hardening.sql
\i supabase/migrations/005_cluster_function.sql
\i supabase/migrations/006_reactions.sql
\i supabase/migrations/007_reaction_types.sql
\i supabase/migrations/008_reply_location.sql
\i supabase/migrations/009_report_ips_and_reply_depth.sql

# Exit psql
\q
```

## Verification Checklist

After running migrations, verify everything is set up correctly:

### ✅ Check Extensions

Run in SQL Editor:
```sql
SELECT * FROM pg_extension WHERE extname IN ('postgis', 'uuid-ossp');
```

Should return 2 rows.

### ✅ Check Tables

Run in SQL Editor:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('unsaids', 'replies', 'reports')
ORDER BY table_name;
```

Should return 4 rows.

### ✅ Check Indexes

Run in SQL Editor:
```sql
SELECT indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'unsaids';
```

Should show several indexes including `idx_unsaids_location`.

### ✅ Check Functions

Run in SQL Editor:
```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN (
    'get_unsaids_in_bbox',
    'create_unsaid_with_location',
    'increment_rate_limit',
    'check_shadow_ban',
    'increment_report_count',
    'update_updated_at_column'
  );
```

Should return 6 rows.

### ✅ Check RLS Policies

Run in SQL Editor:
```sql
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('unsaids', 'replies', 'reports');
```

Should show policies for each table.

### ✅ Test Spatial Function

Run in SQL Editor:
```sql
-- This should return empty result (no data yet, but function should work)
SELECT * FROM get_unsaids_in_bbox(-180, -90, 180, 90, 10);
```

Should execute without errors.

## Troubleshooting

### Error: "extension postgis does not exist"

**Solution**: Run the PostGIS extension creation SQL first:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### Error: "permission denied for schema public"

**Solution**: Make sure you're using the correct database user. In Supabase, use the SQL Editor which has the right permissions.

### Error: "relation already exists"

**Solution**: The table/function already exists. You can either:
1. Drop it first: `DROP TABLE IF EXISTS unsaids CASCADE;`
2. Or skip that migration if you've already run it

### Error: "function get_unsaids_in_bbox does not exist"

**Solution**: Make sure you ran migration 003 (`003_spatial_functions.sql`)

### Realtime Not Working

**Solution**: 
1. Go to **Database** → **Replication**
2. Ensure `unsaids` and `replies` tables have replication enabled
3. Wait a few minutes for changes to propagate

## Rollback (If Needed)

If you need to rollback migrations:

```sql
-- Drop tables (in reverse order)
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS replies CASCADE;
DROP TABLE IF EXISTS unsaids CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS get_unsaids_in_bbox CASCADE;
DROP FUNCTION IF EXISTS create_unsaid_with_location CASCADE;
DROP FUNCTION IF EXISTS increment_rate_limit CASCADE;
DROP FUNCTION IF EXISTS check_shadow_ban CASCADE;
DROP FUNCTION IF EXISTS increment_report_count CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;

-- Drop extensions (optional - only if you want to remove PostGIS)
-- DROP EXTENSION IF EXISTS postgis;
-- DROP EXTENSION IF EXISTS "uuid-ossp";
```

## Next Steps

After migrations are complete:

1. ✅ Verify all tables exist
2. ✅ Enable Realtime replication
3. ✅ Test the app: `npm run dev`
4. ✅ Try creating an Unsaid to verify database works

## Quick Reference

**Supabase Dashboard**: https://app.supabase.com

**SQL Editor Location**: Dashboard → SQL Editor (left sidebar)

**Replication Settings**: Dashboard → Database → Replication

**Project Settings**: Dashboard → Project Settings → General
