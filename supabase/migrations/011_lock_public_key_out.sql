-- 011: close what the public (anon) key can do. It is the key every visitor's browser holds.
-- Supabase's security advisor flagged "rls_disabled_in_public": PostGIS's own table spatial_ref_sys sat in the public
-- schema with row level security off, and the public key could read it and DELETE and UPDATE its rows (deleting
-- SRID 4326 would break every location this app stores). The extension owns that table, so it cannot be locked down
-- from here; the fix is that PostGIS now lives in the `extensions` schema (see 001), which the API does not expose.
--
-- Our own tables have row level security on, but the public key still held write PRIVILEGES on them (Supabase grants
-- them by default). Remove those too: the public key keeps only what the app uses (reading the visible columns of
-- unsaids and replies, for Realtime). Our API uses the service key, which is not affected.

-- 1. Our tables: the public key never writes (all writes go through the API), and reads only the visible
--    columns of unsaids and replies (granted in 010). reports and reactions are private to the API.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.unsaids, public.replies FROM anon, authenticated;
REVOKE ALL ON TABLE public.reports, public.reactions FROM anon, authenticated;

-- 2. Tables made later in public should not be open to the public key by default (Supabase grants it unless told
--    otherwise). A new table that the browser must read needs its own explicit GRANT SELECT and a policy.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
