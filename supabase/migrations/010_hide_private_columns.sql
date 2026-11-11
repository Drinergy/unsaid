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
