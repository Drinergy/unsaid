# Data Design Documentation

## Database Schema Overview

### Tables

1. **unsaids** - Main posts/thoughts
2. **replies** - Threaded responses to Unsads
3. **reports** - User reports for moderation (one per device per target)

## Entity Relationships

```
unsaids (1) ──< (many) replies
  │
  └──< (many) reports

replies (1) ──< (many) replies (self-referential for threading)
  │
  └──< (many) reports
```

## Anonymity Strategy

### Device ID
- Generated client-side: UUID v4
- Stored in localStorage: `unsaid_device_id`
- Persists across sessions
- Regenerates if localStorage is cleared
- No server-side tracking of device ID history

### Location Privacy
- Coordinates rounded to 10km grid (removes street-level precision)
- Stored as PostGIS Point geometry
- City name + country code only (no precise coordinates in readable fields)
- Small cities (< 10k population): Show only country
- Random 5-10km offset for small areas
- Opt-out option: Can post without location

### IP Address
- Stored as INET type for rate limiting
- Not exposed in API responses
- Used only for abuse prevention
- Can be hashed/anonymized if needed

## Rate Limiting Strategy

### Limits
- **Unsads**: 10 per day per device ID
- **Replies**: 50 per day per device ID
- **IP-based backup**: 20 Unsads/hour per IP
- **Time throttling**: Minimum 30 seconds between posts

### Implementation
- Count the device's / IP's recent rows in `unsaids` / `replies` before insert
- Rolling windows (last 24 hours for device, last hour for IP)
- Device ID and IP are stored as keyed hashes (`ID_HASH_SECRET`), never raw
- Server-side validation in API routes

## Indexing Strategy

### Primary Indexes
1. **Spatial Index (GIST)**: `idx_unsaids_location` - Fast bbox queries
2. **Composite Index**: `idx_unsaids_shadow_banned_created` - Filtered map queries
3. **Device Index**: `idx_unsaids_device_id` - Rate limiting checks
4. **Content Hash Index**: `idx_unsaids_content_hash` - Duplicate detection

### Query Patterns
- **Map viewport queries**: Use spatial index + shadow_banned filter
- **Rate limit checks**: Device ID + IP address lookup
- **Thread loading**: Unsaid ID + created_at ordering
- **Duplicate detection**: Content hash + time window

## Realtime Update Strategy

### Supabase Realtime Subscriptions
- **Channel**: `unsaids` table changes
- **Channel**: `replies` table changes
- **Filter**: Only non-shadow-banned content
- **Scope**: Viewport bounds only (client-side filtering)

### Events
- `INSERT`: New Unsaid or Reply
- `UPDATE`: Shadow ban status change
- `DELETE`: Content removal

### Debouncing
- Client-side: Batch updates every 500ms
- Server-side: No debouncing (immediate broadcast)

## Shadow Banning Implementation

### Triggers
- **1 report**: Temporary shadow ban (24 hours)
- **3+ reports**: Permanent shadow ban

### Behavior
- Hidden from map queries
- Accessible via direct link (if URL known)
- No notification to poster
- Report count increments automatically

### Database Logic
- Trigger: `check_shadow_ban()` on report_count update
- Trigger: `increment_report_count()` on report insert
- RLS policy: Filter `is_shadow_banned = false` for reads

## Content Validation

### Server-Side Checks
- Length: 10-1000 chars (Unsads), 10-500 chars (Replies)
- Content hash: MD5 for duplicate detection
- Keyword filtering: Basic profanity/spam filter
- Character diversity: Minimum 3 unique words

### Client-Side Validation
- Length limits (pre-submit)
- Character count display
- Basic sanitization (XSS prevention)

## Data Retention

### Permanent Storage
- Unsads and Replies: No expiration (permanent)
- Reports: Retained for moderation history
- Rate limits: Cleaned up after window expires

### Privacy Compliance
- Right to deletion: API endpoint to delete by device_id
- No location logs: Location data not logged separately
- No analytics: No tracking of individual user behavior
- GDPR compliant: Data export and deletion available
