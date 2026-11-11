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
SET search_path = public
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
