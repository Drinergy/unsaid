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
