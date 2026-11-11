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
SET search_path = public
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
SET search_path = public
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
