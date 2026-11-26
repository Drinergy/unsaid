-- 011: Supabase's security advisor flagged "rls_disabled_in_public". The table is PostGIS's own
-- spatial_ref_sys (coordinate-system reference data, 8,500 rows) which lives in the public schema with row level
-- security off. I checked with the public (anon) key, the one every visitor's browser holds: it could read the
-- table and also DELETE and UPDATE its rows (deleting SRID 4326 would break every geography value this app
-- stores). The rest of our tables have row level security on, so the public key cannot change a row there, but it
-- still holds write PRIVILEGES on them (Supabase grants them by default). This migration removes all of that:
-- the public key keeps only what the app uses (reading the visible columns of unsaids and replies, for Realtime).
-- Our API uses the service key, and PostGIS reads its own table as the owner, so neither is affected.
--
-- Steps on tables we do not own may be refused ("must be owner"); each one is allowed to fail alone and prints a
-- NOTICE. If you see one, read the fallback in README ("Database").

-- 1. PostGIS's own objects in public
DO $$
BEGIN
  REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon, authenticated;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'could not revoke privileges on spatial_ref_sys: %', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'could not enable row level security on spatial_ref_sys: %', SQLERRM;
END $$;

DO $$
BEGIN
  REVOKE ALL ON TABLE public.geometry_columns, public.geography_columns FROM anon, authenticated;
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE 'could not revoke privileges on the PostGIS catalog views: %', SQLERRM;
END $$;

-- 2. Our tables: the public key never writes (all writes go through the API), and reads only the visible
--    columns of unsaids and replies (granted in 010). reports and reactions are private to the API.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.unsaids, public.replies FROM anon, authenticated;
REVOKE ALL ON TABLE public.reports, public.reactions FROM anon, authenticated;

-- 3. Tables made later in public should not be open to the public key by default (Supabase grants it unless told
--    otherwise). A new table that the browser must read needs its own explicit GRANT SELECT and a policy.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
