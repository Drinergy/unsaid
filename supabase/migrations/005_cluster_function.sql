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
SET search_path = public
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
