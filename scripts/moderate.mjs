// Spam clean-up with the server key. Run from the project folder:
//   node --env-file=.env.local scripts/moderate.mjs top            who posted most in the last 24h (hashed IPs)
//   node --env-file=.env.local scripts/moderate.mjs hide <ip>      hide every thought and reply from that IP hash
//   node --env-file=.env.local scripts/moderate.mjs unhide <ip>    undo
// "Hide" is a shadow ban (the rows stay in the database); the map drops them live.
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const [command, ip] = process.argv.slice(2);
const tables = ['unsaids', 'replies'];

if (command === 'top') {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const counts = new Map();
  for (const table of tables) {
    const { data, error } = await db.from(table).select('ip_address').gte('created_at', since).limit(10000);
    if (error) throw error;
    for (const row of data) counts.set(row.ip_address, (counts.get(row.ip_address) ?? 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(top.length ? top.map(([hash, n]) => `${String(n).padStart(5)}  ${hash}`).join('\n') : 'No posts in the last 24 hours.');
} else if ((command === 'hide' || command === 'unhide') && ip) {
  for (const table of tables) {
    const { data, error } = await db.from(table).update({ is_shadow_banned: command === 'hide' }).eq('ip_address', ip).select('id');
    if (error) throw error;
    console.log(`${command} ${table}: ${data.length} rows`);
  }
} else {
  console.log('Usage: top | hide <ip-hash> | unhide <ip-hash>');
  process.exit(1);
}
