-- The whole schema, in one file. Run it once on a fresh database; it is the whole setup, including the Realtime
-- publication at the end. (It is what the earlier migrations 001 to 011 add up to; their history is in git.)
-- A later change to the schema goes in a NEW file, 002_<what>.sql, then 003_..., and so on. Never edit this one
-- once a database has been built from it.
--
-- Two things to know:
--   * PostGIS goes in the "extensions" schema, not public. Its own table (spatial_ref_sys) cannot be locked down
--     because the extension owns it, so it must not sit where the public API key can reach it.
--   * Every write goes through the API with the service key. The public (anon) key, which every visitor's
--     browser holds, may only read the visible columns of unsaids and replies (for Realtime).

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- Tables
-- ================================================================

-- Thoughts. device_id and ip_address are keyed hashes (never the raw values); the API rounds the location.
CREATE TABLE unsaids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
    content_hash TEXT NOT NULL, -- for duplicate detection
    city TEXT,
    country_code CHAR(2) NOT NULL, -- ISO 3166-1 alpha-2
    location extensions.GEOMETRY(Point, 4326) NOT NULL, -- rounded to about 100 m by the API
    device_id TEXT NOT NULL,
    ip_address TEXT,
    is_shadow_banned BOOLEAN DEFAULT false NOT NULL,
    report_count INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Replies, threaded. city and country_code are the replier's coarse place (never coordinates), optional.
-- depth is 0 for a reply to the thought itself, so posting a reply does not have to read the whole thread.
CREATE TABLE replies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unsaid_id UUID NOT NULL REFERENCES unsaids(id) ON DELETE CASCADE,
    parent_reply_id UUID REFERENCES replies(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
    content_hash TEXT NOT NULL,
    city TEXT CHECK (city IS NULL OR char_length(city) <= 100),
    country_code CHAR(2),
    depth SMALLINT NOT NULL DEFAULT 0,
    device_id TEXT NOT NULL,
    ip_address TEXT,
    is_shadow_banned BOOLEAN DEFAULT false NOT NULL,
    report_count INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Reports, for moderation. One report per device and one per IP for each target (a repeat insert fails with 23505,
-- which the API treats as success). Hiding a post needs reports from 3 different IPs, because a caller can invent
-- device ids freely.
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unsaid_id UUID REFERENCES unsaids(id) ON DELETE CASCADE,
    reply_id UUID REFERENCES replies(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    ip_address TEXT,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT reports_target_check CHECK (
        (unsaid_id IS NOT NULL AND reply_id IS NULL) OR
        (unsaid_id IS NULL AND reply_id IS NOT NULL)
    ),
    CONSTRAINT reports_reason_length CHECK (reason IS NULL OR char_length(reason) <= 500)
);

-- Reactions: one per device per thought, so everyone sees real counts.
CREATE TABLE reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unsaid_id UUID NOT NULL REFERENCES unsaids(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,   -- keyed hash, never the raw id
    ip_address TEXT,           -- keyed hash, for the API's spam throttle
    type TEXT NOT NULL CHECK (type IN ('felt', 'me_too', 'here_for_you', 'proud_of_you')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE (unsaid_id, device_id)
);

-- ================================================================
-- Indexes
-- ================================================================

CREATE INDEX idx_unsaids_location ON unsaids USING GIST (location);
CREATE INDEX idx_unsaids_shadow_banned_created ON unsaids (is_shadow_banned, created_at DESC)
    WHERE is_shadow_banned = false;
CREATE INDEX idx_unsaids_device_id ON unsaids (device_id, created_at DESC); -- rate limits
CREATE INDEX idx_unsaids_content_hash ON unsaids (content_hash, created_at DESC); -- duplicates
CREATE INDEX idx_unsaids_ip_address ON unsaids (ip_address, created_at DESC); -- rate limits

CREATE INDEX idx_replies_unsaid_id ON replies (unsaid_id, created_at ASC);
CREATE INDEX idx_replies_parent ON replies (parent_reply_id, created_at ASC);
CREATE INDEX idx_replies_device_id ON replies (device_id, created_at DESC);

CREATE INDEX idx_reports_unsaid ON reports (unsaid_id, created_at DESC);
CREATE INDEX idx_reports_reply ON reports (reply_id, created_at DESC);
CREATE INDEX idx_reports_ip_created ON reports (ip_address, created_at DESC); -- the API's per-IP report limit
CREATE UNIQUE INDEX reports_one_per_device_unsaid ON reports (device_id, unsaid_id) WHERE unsaid_id IS NOT NULL;
CREATE UNIQUE INDEX reports_one_per_device_reply  ON reports (device_id, reply_id)  WHERE reply_id IS NOT NULL;
CREATE UNIQUE INDEX reports_one_per_ip_unsaid ON reports (ip_address, unsaid_id)
    WHERE unsaid_id IS NOT NULL AND ip_address IS NOT NULL;
CREATE UNIQUE INDEX reports_one_per_ip_reply ON reports (ip_address, reply_id)
    WHERE reply_id IS NOT NULL AND ip_address IS NOT NULL;

CREATE INDEX idx_reactions_ip ON reactions (ip_address, created_at DESC);

-- ================================================================
-- Triggers
-- ================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_unsaids_updated_at BEFORE UPDATE ON unsaids
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_replies_updated_at BEFORE UPDATE ON replies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reactions_updated_at BEFORE UPDATE ON reactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- One ban rule: 3 reports hide a post. BEFORE UPDATE, because a change made to NEW in an AFTER trigger is ignored.
CREATE OR REPLACE FUNCTION check_shadow_ban()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.report_count >= 3 THEN
        NEW.is_shadow_banned = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shadow_ban_unsaid BEFORE UPDATE OF report_count ON unsaids
    FOR EACH ROW
    WHEN (OLD.report_count IS DISTINCT FROM NEW.report_count)
    EXECUTE FUNCTION check_shadow_ban();

CREATE TRIGGER shadow_ban_reply BEFORE UPDATE OF report_count ON replies
    FOR EACH ROW
    WHEN (OLD.report_count IS DISTINCT FROM NEW.report_count)
    EXECUTE FUNCTION check_shadow_ban();

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

CREATE TRIGGER increment_report_count_trigger AFTER INSERT ON reports
    FOR EACH ROW EXECUTE FUNCTION increment_report_count();

-- ================================================================
-- Functions the API calls with the service key (the public key may not run them)
-- ================================================================

-- Thoughts inside a box (the zoomed-in map)
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

REVOKE EXECUTE ON FUNCTION get_unsaids_in_bbox(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) FROM PUBLIC, anon, authenticated;

-- Create a thought with its PostGIS point
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

-- Server-side clustering for zoomed-out map views.
-- Groups visible thoughts into grid cells inside the bounding box and returns one row per cell: count, average
-- position, the bounds of its points and the newest thought as a sample (shown directly when a cell holds one).
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

-- Reaction counts of one thought
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
-- Access for the public (anon) key
-- ================================================================

ALTER TABLE unsaids ENABLE ROW LEVEL SECURITY;
ALTER TABLE replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY; -- no policies: only the API (service key) reads and writes
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY; -- no policies: only the API (service key) reads and writes

-- Hidden posts are not readable. There are no write policies on purpose: all writes go through the API.
CREATE POLICY "Allow read non-shadow-banned unsaids" ON unsaids
    FOR SELECT USING (is_shadow_banned = false);
CREATE POLICY "Allow read non-shadow-banned replies" ON replies
    FOR SELECT USING (is_shadow_banned = false);

-- Supabase grants new tables to the public key by default. Take all of it back, then give back only the columns
-- the app shows (not the hashed device id or IP, which would let anyone group all posts from one device or network).
REVOKE ALL ON TABLE unsaids, replies, reports, reactions FROM anon, authenticated;
GRANT SELECT (id, content, city, country_code, location, created_at, is_shadow_banned) ON unsaids TO anon, authenticated;
GRANT SELECT (id, unsaid_id, parent_reply_id, content, city, country_code, created_at, depth, is_shadow_banned) ON replies TO anon, authenticated;

-- Tables made later in public should not be open to the public key by default either. A new table that the browser
-- must read needs its own explicit GRANT SELECT and a policy.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- ================================================================
-- Realtime (live updates for new thoughts and replies)
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
