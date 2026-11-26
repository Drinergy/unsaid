// Checks what the PUBLIC key (the one every visitor's browser holds) can do to the database. It must hold no write
// privilege on any table, and must not read any table with `select *` (the app reads only named columns of
// unsaids and replies). Run after every change to the schema:
//   node --env-file=.env.local scripts/check-anon-access.mjs
// Writes are tried with a filter that matches no row, so nothing is ever changed. A refused write answers 401/403.
// An answer of 204 means the key holds the privilege: with row level security on that still changes no row, but one
// missing policy later would be enough, so it counts as a failure here.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const nothing = (table) => (table === 'spatial_ref_sys' ? 'srid=eq.-999999' : 'id=eq.00000000-0000-0000-0000-000000000000');
const call = async (method, table, query, body) => (await fetch(`${url}/rest/v1/${table}?${query}`, { method, headers, body })).status;

// A column of each table to try an update on (an empty update body would be answered 204 without the database being asked)
const tables = { unsaids: 'content', replies: 'content', reports: 'reason', reactions: 'type', spatial_ref_sys: 'auth_name' };
let failures = 0;
for (const [table, column] of Object.entries(tables)) {
  const del = await call('DELETE', table, nothing(table));
  const upd = await call('PATCH', table, nothing(table), JSON.stringify({ [column]: null }));
  const read = await call('GET', table, 'select=*&limit=1');
  const ok = del >= 400 && upd >= 400 && read >= 400;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${table.padEnd(16)} delete ${del}  update ${upd}  read(select *) ${read}`);
}
console.log(failures ? `\n${failures} table(s) still open to the public key.` : '\nThe public key holds no write privilege and reads nothing it should not.');
process.exit(failures ? 1 : 0);
