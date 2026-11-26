-- DESTROYS ALL DATA. Wipes the app's tables and functions, and reinstalls PostGIS in the `extensions` schema
-- (001_schema.sql does the same on a fresh database). Run this, then run supabase/migrations/001_schema.sql, then
--   alter publication supabase_realtime add table unsaids, replies;
--
-- Why: PostGIS used to live in the public schema, where its own table spatial_ref_sys was open to the public API
-- key and could not be locked down (the extension owns it). In `extensions` the API does not expose it.

DROP TABLE IF EXISTS public.reactions, public.reports, public.replies, public.unsaids CASCADE;
DROP FUNCTION IF EXISTS public.get_unsaids_in_bbox, public.create_unsaid_with_location, public.get_unsaid_clusters, public.get_reaction_counts;

-- Takes spatial_ref_sys and every PostGIS type and function with it
DROP EXTENSION IF EXISTS postgis CASCADE;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION postgis WITH SCHEMA extensions;
