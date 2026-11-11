-- Enable PostGIS extension for spatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Unsads table: Main posts/thoughts
CREATE TABLE unsaids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL CHECK (char_length(content) >= 10 AND char_length(content) <= 1000),
    content_hash TEXT NOT NULL, -- MD5 hash for duplicate detection
    city TEXT,
    country_code CHAR(2) NOT NULL, -- ISO 3166-1 alpha-2
    location GEOMETRY(Point, 4326) NOT NULL, -- Rounded coordinates (10km precision)
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
