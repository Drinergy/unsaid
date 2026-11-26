-- Baseline: the whole schema in one file, squashed from the earlier migrations 001 to 011 (their history is in
-- git). Run this once on a fresh database. It is the whole setup, including the Realtime publication at the end.
-- A later change to the schema goes in a NEW file, 002_<what>.sql, then 003_..., and so on. Never edit this one
-- once a database has been built from it.
--
-- Note: PostGIS goes in the "extensions" schema, not public (its spatial_ref_sys table cannot be locked down, so it
-- must not sit where the public API key can reach it).
--
-- The parts below are the old migrations in order, kept as they were (they are known to run); they can be tidied
-- into a plain final-state schema later, when there is a Postgres at hand to test it.

-- ================================================================
-- Part 1: 001_initial_schema
-- ================================================================
-- PostGIS goes in the `extensions` schema, NOT public: its own tables (spatial_ref_sys) would otherwise sit in public,
-- be reachable by the public API key, and cannot be locked down because the extension owns them (see 011).
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Unsads table: Main posts/thoughts
CREATE TABLE unsaids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL CHECK (char_length(content) >= 10 AND char_length(content) <= 1000),
    content_hash TEXT NOT NULL, -- MD5 hash for duplicate detection
    city TEXT,
    country_code CHAR(2) NOT NULL, -- ISO 3166-1 alpha-2
    location extensions.GEOMETRY(Point, 4326) NOT NULL, -- Rounded coordinates (10km precision)
    device_id TEXT NOT NULL, -- Anonymous device identifier
    ip_address INET, -- For IP-based rate limiting (hashed or anonymized)
    is_shadow_banned BOOLEAN DEFAULT false NOT NULL,
    report_count INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Replies table: Threaded responses to Unsads
CREATE TABLE replies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unsaid_id UUID NOT NULL REFERENCES unsaids(id) ON DELETE CASCADE,
    parent_reply_id UUID REFERENCES replies(id) ON DELETE CASCADE, -- For threading
    content TEXT NOT NULL CHECK (char_length(content) >= 10 AND char_length(content) <= 500),
    content_hash TEXT NOT NULL,
    device_id TEXT NOT NULL,
    ip_address INET,
    is_shadow_banned BOOLEAN DEFAULT false NOT NULL,
    report_count INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Reports table: User reports for moderation
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unsaid_id UUID REFERENCES unsaids(id) ON DELETE CASCADE,
    reply_id UUID REFERENCES replies(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL, -- Reporter's device ID
    ip_address INET,
    reason TEXT, -- Optional reason for reporting
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT reports_target_check CHECK (
        (unsaid_id IS NOT NULL AND reply_id IS NULL) OR
        (unsaid_id IS NULL AND reply_id IS NOT NULL)
    )
);

-- Rate limiting tracking table
CREATE TABLE rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id TEXT,
    ip_address INET,
    limit_type TEXT NOT NULL, -- 'unsaid' or 'reply'
    count INTEGER DEFAULT 1 NOT NULL,
    window_start TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(device_id, ip_address, limit_type, window_start)
);

-- Indexes for performance

-- Spatial index for location queries (PostGIS GIST)
CREATE INDEX idx_unsaids_location ON unsaids USING GIST (location);

-- Composite index for filtered map queries
CREATE INDEX idx_unsaids_shadow_banned_created ON unsaids (is_shadow_banned, created_at DESC)
WHERE is_shadow_banned = false;

-- Index for device-based queries
CREATE INDEX idx_unsaids_device_id ON unsaids (device_id, created_at DESC);

-- Index for content hash duplicate detection
CREATE INDEX idx_unsaids_content_hash ON unsaids (content_hash, created_at DESC);

-- Index for IP-based rate limiting
CREATE INDEX idx_unsaids_ip_address ON unsaids (ip_address, created_at DESC);

-- Index for replies by unsaid
CREATE INDEX idx_replies_unsaid_id ON replies (unsaid_id, created_at ASC);

-- Index for threaded replies
CREATE INDEX idx_replies_parent ON replies (parent_reply_id, created_at ASC);

-- Index for device-based reply queries
CREATE INDEX idx_replies_device_id ON replies (device_id, created_at DESC);

-- Index for rate limiting lookups
CREATE INDEX idx_rate_limits_lookup ON rate_limits (device_id, ip_address, limit_type, window_start DESC);

-- Index for reports
CREATE INDEX idx_reports_unsaid ON reports (unsaid_id, created_at DESC);
CREATE INDEX idx_reports_reply ON reports (reply_id, created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_unsaids_updated_at BEFORE UPDATE ON unsaids
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_replies_updated_at BEFORE UPDATE ON replies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to handle shadow banning based on report count
CREATE OR REPLACE FUNCTION check_shadow_ban()
RETURNS TRIGGER AS $$
BEGIN
    -- If 3+ reports, permanent shadow ban
    IF NEW.report_count >= 3 THEN
        NEW.is_shadow_banned = true;
    -- If 1 report, temporary shadow ban (24 hours)
    ELSIF NEW.report_count = 1 THEN
        NEW.is_shadow_banned = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-shadow-ban on report threshold
CREATE TRIGGER shadow_ban_unsaid AFTER UPDATE OF report_count ON unsaids
    FOR EACH ROW
    WHEN (OLD.report_count IS DISTINCT FROM NEW.report_count)
    EXECUTE FUNCTION check_shadow_ban();

CREATE TRIGGER shadow_ban_reply AFTER UPDATE OF report_count ON replies
    FOR EACH ROW
    WHEN (OLD.report_count IS DISTINCT FROM NEW.report_count)
    EXECUTE FUNCTION check_shadow_ban();

-- Function to increment report count when report is created
CREATE OR REPLACE FUNCTION increment_report_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.unsaid_id IS NOT NULL THEN
        UPDATE unsaids SET report_count = report_count + 1 WHERE id = NEW.unsaid_id;
    ELSIF NEW.reply_id IS NOT NULL THEN
        UPDATE replies SET report_count = report_count + 1 WHERE id = NEW.reply_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to increment report count
CREATE TRIGGER increment_report_count_trigger AFTER INSERT ON reports
    FOR EACH ROW EXECUTE FUNCTION increment_report_count();

-- Row Level Security (RLS) policies
-- Allow anonymous read access to non-shadow-banned content
ALTER TABLE unsaids ENABLE ROW LEVEL SECURITY;
ALTER TABLE replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read non-shadow-banned unsaids
CREATE POLICY "Allow read non-shadow-banned unsaids" ON unsaids
    FOR SELECT USING (is_shadow_banned = false);

-- Policy: Anyone can read non-shadow-banned replies
CREATE POLICY "Allow read non-shadow-banned replies" ON replies
    FOR SELECT USING (is_shadow_banned = false);

-- Policy: Anyone can insert unsaids (server-side validation handles rate limits)
CREATE POLICY "Allow insert unsaids" ON unsaids
    FOR INSERT WITH CHECK (true);

-- Policy: Anyone can insert replies
CREATE POLICY "Allow insert replies" ON replies
    FOR INSERT WITH CHECK (true);

-- Policy: Anyone can create reports
CREATE POLICY "Allow insert reports" ON reports
    FOR INSERT WITH CHECK (true);

-- Note: Updates and deletes will be handled via API routes with proper authorization
-- Direct database access is limited to inserts and reads

-- ================================================================
-- Part 2: 003_spatial_functions
-- ================================================================
-- RPC function to get Unsads within bounding box
CREATE OR REPLACE FUNCTION get_unsaids_in_bbox(
    min_lng DOUBLE PRECISION,
    min_lat DOUBLE PRECISION,
    max_lng DOUBLE PRECISION,
    max_lat DOUBLE PRECISION,
    result_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    city TEXT,
    country_code CHAR(2),
    location JSONB,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.content,
        u.city,
        u.country_code,
        ST_AsGeoJSON(u.location)::JSONB as location,
        u.created_at
    FROM unsaids u
    WHERE u.is_shadow_banned = false
      AND ST_Within(
          u.location,
          ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
      )
    ORDER BY u.created_at DESC
    LIMIT result_limit;
END;
$$;

-- RPC function to create Unsaid with PostGIS point
CREATE OR REPLACE FUNCTION create_unsaid_with_location(
    p_content TEXT,
    p_content_hash TEXT,
    p_city TEXT,
    p_country_code CHAR(2),
    p_lng DOUBLE PRECISION,
    p_lat DOUBLE PRECISION,
    p_device_id TEXT,
    p_ip_address INET
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    city TEXT,
    country_code CHAR(2),
    location JSONB,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO unsaids (
        content,
        content_hash,
        city,
        country_code,
        location,
        device_id,
        ip_address
    )
    VALUES (
        p_content,
        p_content_hash,
        p_city,
        p_country_code,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326),
        p_device_id,
        p_ip_address
    )
    RETURNING unsaids.id INTO v_id;

    RETURN QUERY
    SELECT
        u.id,
        u.content,
        u.city,
        u.country_code,
        ST_AsGeoJSON(u.location)::JSONB as location,
        u.created_at
    FROM unsaids u
    WHERE u.id = v_id;
END;
$$;

-- ================================================================
-- Part 3: 004_security_hardening
-- ================================================================
-- 004: close direct-database bypasses, stop storing raw IPs, fix report moderation.

-- 1. All writes go through the API (service role bypasses RLS), so anon needs no insert access.
DROP POLICY IF EXISTS "Allow insert unsaids" ON unsaids;
DROP POLICY IF EXISTS "Allow insert replies" ON replies;
DROP POLICY IF EXISTS "Allow insert reports" ON reports;

-- Functions are executable by PUBLIC by default; lock them to the service role.
REVOKE EXECUTE ON FUNCTION create_unsaid_with_location(TEXT, TEXT, TEXT, CHAR, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INET) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_unsaids_in_bbox(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) FROM PUBLIC, anon, authenticated;

-- 2. The API now stores a keyed hash of the IP / device id, not the raw value.

ALTER TABLE unsaids     ALTER COLUMN ip_address TYPE TEXT USING ip_address::TEXT;
ALTER TABLE replies     ALTER COLUMN ip_address TYPE TEXT USING ip_address::TEXT;
ALTER TABLE reports     ALTER COLUMN ip_address TYPE TEXT USING ip_address::TEXT;

DROP FUNCTION IF EXISTS create_unsaid_with_location(TEXT, TEXT, TEXT, CHAR, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INET);

CREATE OR REPLACE FUNCTION create_unsaid_with_location(
    p_content TEXT,
    p_content_hash TEXT,
    p_city TEXT,
    p_country_code CHAR(2),
    p_lng DOUBLE PRECISION,
    p_lat DOUBLE PRECISION,
    p_device_id TEXT,
    p_ip_address TEXT
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    city TEXT,
    country_code CHAR(2),
    location JSONB,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO unsaids (content, content_hash, city, country_code, location, device_id, ip_address)
    VALUES (p_content, p_content_hash, p_city, p_country_code,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326), p_device_id, p_ip_address)
    RETURNING unsaids.id INTO v_id;

    RETURN QUERY
    SELECT u.id, u.content, u.city, u.country_code,
           ST_AsGeoJSON(u.location)::JSONB, u.created_at
    FROM unsaids u WHERE u.id = v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_unsaid_with_location(TEXT, TEXT, TEXT, CHAR, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- 4. Moderation: the old trigger was AFTER UPDATE, so its change to NEW was ignored.
--    Now BEFORE UPDATE, one ban rule: 3 reports from 3 different devices.
CREATE OR REPLACE FUNCTION check_shadow_ban()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.report_count >= 3 THEN
        NEW.is_shadow_banned = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shadow_ban_unsaid ON unsaids;
DROP TRIGGER IF EXISTS shadow_ban_reply ON replies;

CREATE TRIGGER shadow_ban_unsaid BEFORE UPDATE OF report_count ON unsaids
    FOR EACH ROW
    WHEN (OLD.report_count IS DISTINCT FROM NEW.report_count)
    EXECUTE FUNCTION check_shadow_ban();

CREATE TRIGGER shadow_ban_reply BEFORE UPDATE OF report_count ON replies
    FOR EACH ROW
    WHEN (OLD.report_count IS DISTINCT FROM NEW.report_count)
    EXECUTE FUNCTION check_shadow_ban();

-- One report per device per target (a repeat insert fails with 23505, handled in the API).

CREATE UNIQUE INDEX reports_one_per_device_unsaid ON reports (device_id, unsaid_id) WHERE unsaid_id IS NOT NULL;
CREATE UNIQUE INDEX reports_one_per_device_reply  ON reports (device_id, reply_id)  WHERE reply_id IS NOT NULL;

ALTER TABLE reports ADD CONSTRAINT reports_reason_length CHECK (reason IS NULL OR char_length(reason) <= 500);

-- Rate limits now count the posts themselves; the counter table is gone.
DROP TABLE IF EXISTS rate_limits;

-- The API only requires non-empty content (see content-validation.ts); the old
-- 10-character database minimum made short posts fail with a 500.
ALTER TABLE unsaids DROP CONSTRAINT IF EXISTS unsaids_content_check;
ALTER TABLE unsaids ADD CONSTRAINT unsaids_content_check CHECK (char_length(content) BETWEEN 1 AND 1000);
ALTER TABLE replies DROP CONSTRAINT IF EXISTS replies_content_check;
ALTER TABLE replies ADD CONSTRAINT replies_content_check CHECK (char_length(content) BETWEEN 1 AND 500);

-- ================================================================
-- Part 4: 005_cluster_function
-- ================================================================
-- 005: server-side clustering for zoomed-out map views.
-- Groups visible thoughts into grid cells inside the bounding box and returns one row
-- per cell: count, average position, the bounds of its points and the newest thought
-- as a sample (shown directly when a cell holds a single thought).

CREATE OR REPLACE FUNCTION get_unsaid_clusters(
    min_lng DOUBLE PRECISION,
    min_lat DOUBLE PRECISION,
    max_lng DOUBLE PRECISION,
    max_lat DOUBLE PRECISION,
    cell_size DOUBLE PRECISION
)
RETURNS TABLE (
    lng DOUBLE PRECISION,
    lat DOUBLE PRECISION,
    count BIGINT,
    bounds_min_lng DOUBLE PRECISION,
    bounds_min_lat DOUBLE PRECISION,
    bounds_max_lng DOUBLE PRECISION,
    bounds_max_lat DOUBLE PRECISION,
    sample_id UUID,
    sample_content TEXT,
    sample_city TEXT,
    sample_country_code CHAR(2),
    sample_created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    WITH pts AS (
        SELECT u.id, u.content, u.city, u.country_code, u.created_at,
               ST_X(u.location) AS x, ST_Y(u.location) AS y,
               floor(ST_X(u.location) / cell_size) AS cx,
               floor(ST_Y(u.location) / cell_size) AS cy
        FROM unsaids u
        WHERE u.is_shadow_banned = false
          AND u.location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
    ),
    ranked AS (
        SELECT pts.*,
               row_number() OVER w AS rn,
               count(*) OVER c AS cnt,
               avg(x) OVER c AS ax, avg(y) OVER c AS ay,
               min(x) OVER c AS mnx, min(y) OVER c AS mny,
               max(x) OVER c AS mxx, max(y) OVER c AS mxy
        FROM pts
        WINDOW c AS (PARTITION BY cx, cy),
               w AS (PARTITION BY cx, cy ORDER BY created_at DESC)
    )
    SELECT ax, ay, cnt, mnx, mny, mxx, mxy, id, content, city, country_code, created_at
    FROM ranked
    WHERE rn = 1
    LIMIT 2000;
$$;

REVOKE EXECUTE ON FUNCTION get_unsaid_clusters(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon, authenticated;

-- ================================================================
-- Part 5: 006_reactions
-- ================================================================
-- 006: reactions stored in the database (one per device per thought) so everyone sees real counts.
-- Same access model as the rest: no public policies, only the API (service key) reads and writes.

CREATE TABLE reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unsaid_id UUID NOT NULL REFERENCES unsaids(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,   -- keyed hash, never the raw id
    ip_address TEXT,           -- keyed hash, for the API's spam throttle
    type TEXT NOT NULL CHECK (type IN ('felt', 'me_too', 'understood')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE (unsaid_id, device_id)
);

CREATE INDEX idx_reactions_ip ON reactions (ip_address, created_at DESC);

CREATE TRIGGER update_reactions_updated_at BEFORE UPDATE ON reactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;  -- no policies: anon cannot read or write
REVOKE ALL ON reactions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION get_reaction_counts(p_unsaid_id UUID)
RETURNS TABLE (type TEXT, count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT r.type, count(*) FROM reactions r WHERE r.unsaid_id = p_unsaid_id GROUP BY r.type;
$$;

REVOKE EXECUTE ON FUNCTION get_reaction_counts(UUID) FROM PUBLIC, anon, authenticated;

-- ================================================================
-- Part 6: 007_reaction_types
-- ================================================================
-- 007: new reaction set (felt, me_too, here_for_you, proud_of_you). "understood" is retired:
-- it overlapped with the others and read as "approved". Existing ones become "here_for_you".

ALTER TABLE reactions DROP CONSTRAINT IF EXISTS reactions_type_check;

UPDATE reactions SET type = 'here_for_you' WHERE type = 'understood';

ALTER TABLE reactions ADD CONSTRAINT reactions_type_check
    CHECK (type IN ('felt', 'me_too', 'here_for_you', 'proud_of_you'));

-- ================================================================
-- Part 7: 008_reply_location
-- ================================================================
-- 008: replies can show the replier's coarse place (city and country only, never coordinates),
-- the same way thoughts do. Nullable: older replies and replies without a detected place show only the time.

ALTER TABLE replies ADD COLUMN city TEXT CHECK (city IS NULL OR char_length(city) <= 100);
ALTER TABLE replies ADD COLUMN country_code CHAR(2);

-- ================================================================
-- Part 8: 009_report_ips_and_reply_depth
-- ================================================================
-- 009: (1) hiding a post needs reports from different IPs, not different device ids (a caller can
-- invent device ids freely); (2) replies remember their depth so posting a reply no longer has to
-- read the whole thread to measure it.

-- 1. Reports: one per IP per target, and a quick way to count an IP's recent reports.
DELETE FROM reports a USING reports b
WHERE a.ctid > b.ctid AND a.ip_address IS NOT NULL AND a.ip_address = b.ip_address
  AND a.unsaid_id IS NOT DISTINCT FROM b.unsaid_id
  AND a.reply_id IS NOT DISTINCT FROM b.reply_id;

UPDATE unsaids u SET report_count = (SELECT count(*) FROM reports r WHERE r.unsaid_id = u.id)
WHERE report_count <> (SELECT count(*) FROM reports r WHERE r.unsaid_id = u.id);
UPDATE replies p SET report_count = (SELECT count(*) FROM reports r WHERE r.reply_id = p.id)
WHERE report_count <> (SELECT count(*) FROM reports r WHERE r.reply_id = p.id);

CREATE UNIQUE INDEX reports_one_per_ip_unsaid ON reports (ip_address, unsaid_id)
    WHERE unsaid_id IS NOT NULL AND ip_address IS NOT NULL;
CREATE UNIQUE INDEX reports_one_per_ip_reply ON reports (ip_address, reply_id)
    WHERE reply_id IS NOT NULL AND ip_address IS NOT NULL;
CREATE INDEX idx_reports_ip_created ON reports (ip_address, created_at DESC);

-- 2. Reply depth (0 = a reply to the thought itself).
ALTER TABLE replies ADD COLUMN depth SMALLINT NOT NULL DEFAULT 0;

WITH RECURSIVE tree AS (
    SELECT id, 0 AS d FROM replies WHERE parent_reply_id IS NULL
    UNION ALL
    SELECT r.id, tree.d + 1 FROM replies r JOIN tree ON r.parent_reply_id = tree.id
)
UPDATE replies SET depth = tree.d FROM tree WHERE replies.id = tree.id;

-- ================================================================
-- Part 9: 010_hide_private_columns
-- ================================================================
-- 010: the public (anon) key could read every column of unsaids and replies, including the keyed
-- hashes of device id and IP. Those hashes cannot be reversed, but they are stable labels: anyone
-- could group all posts from one device or network. Give anon only the columns the app shows.
-- The API uses the service key, which is not affected.
--
-- After running this, post something and check that it still appears live in a second tab.
-- If Realtime stops delivering events, undo with:
--   GRANT SELECT ON unsaids, replies TO anon;

REVOKE SELECT ON unsaids, replies FROM anon, authenticated;

GRANT SELECT (id, content, city, country_code, location, created_at, is_shadow_banned) ON unsaids TO anon, authenticated;
GRANT SELECT (id, unsaid_id, parent_reply_id, content, city, country_code, created_at, depth, is_shadow_banned) ON replies TO anon, authenticated;

-- ================================================================
-- Part 10: 011_lock_public_key_out
-- ================================================================
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

-- ================================================================
-- Part 11: Realtime (live updates for new thoughts and replies)
-- ================================================================
-- Added to Supabase's own "supabase_realtime" publication. Written so it can run twice: a plain
-- ALTER PUBLICATION ... ADD TABLE fails when the table is already in it, and skipping it quietly keeps this file
-- usable on a Postgres that has no such publication.
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['unsaids', 'replies'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;
