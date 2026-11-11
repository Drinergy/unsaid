# How to Enable Realtime in Supabase

## What You're Seeing

The "Replication" page you see is for **external data warehouse replication** (like BigQuery, Snowflake) - this is a different feature in private alpha. 

**We need Realtime subscriptions** for client-side updates (when users create Unsads or replies, other users see them instantly).

## Correct Steps to Enable Realtime

### Method 1: Using Database Publications (Easiest)

1. **Go to Database → Publications** (in the left sidebar, under DATABASE MANAGEMENT)
   - If you don't see "Publications", it might be under a different section or you may need to use SQL

2. **Click on `supabase_realtime` publication**
   - This is the default publication for Realtime

3. **Add your tables**:
   - You should see a list of tables
   - Check the boxes for `unsaids` and `replies`
   - Click **Save**

### Method 2: Using SQL Editor (Most Reliable)

1. **Go to SQL Editor** (left sidebar)

2. **Run this SQL**:

```sql
-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE unsaids;
ALTER PUBLICATION supabase_realtime ADD TABLE replies;
```

3. **Verify it worked**:

```sql
-- Check which tables are in the realtime publication
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
```

You should see `unsaids` and `replies` in the results.

### Method 3: Check Table Settings

1. **Go to Table Editor** (left sidebar)
2. **Click on `unsaids` table**
3. **Look for Realtime settings**:
   - Some Supabase versions have a Realtime toggle in table settings
   - Or a "Replication" section in the table details
4. **Enable Realtime** if you see the option
5. **Repeat for `replies` table**

## What Realtime Does

Once enabled, your app can:
- ✅ Listen for new Unsads being created
- ✅ Listen for new replies being posted
- ✅ Listen for deletions
- ✅ Listen for shadow ban updates

This is what powers the live updates in the app - when someone posts a new Unsaid, it appears on everyone's map in real-time.

## Troubleshooting

### "Publication not found" error

If you get an error about `supabase_realtime` not existing, create it:

```sql
CREATE PUBLICATION supabase_realtime FOR TABLE unsaids, replies;
```

### Realtime still not working

1. **Check RLS policies**: Realtime respects Row Level Security
   - Make sure your RLS policies allow SELECT on `unsaids` and `replies`
   - Our migration already sets this up correctly

2. **Check Supabase project settings**:
   - Go to **Project Settings** → **API**
   - Make sure Realtime is enabled for your project

3. **Verify in code**:
   - Check browser console for Realtime connection errors
   - Make sure your `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct

### "Replication" vs "Realtime"

- **Replication** (what you saw): External data warehouse streaming (BigQuery, etc.) - NOT what we need
- **Realtime**: Client-side subscriptions for live updates - THIS is what we need

## Quick Verification

After enabling, test in your app:

1. Open the app in two browser windows
2. Create an Unsaid in one window
3. It should appear on the map in the other window automatically (within a few seconds)

If it doesn't appear automatically, Realtime might not be enabled correctly.

## Alternative: Use Polling (Fallback)

If Realtime doesn't work, the app has a fallback to polling every 10 seconds. But Realtime is much better for user experience.
