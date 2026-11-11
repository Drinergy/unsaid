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
