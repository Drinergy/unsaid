// Checks what the PUBLIC key (the one every visitor's browser holds) can do. Run it after every change to the schema:
//   node --env-file=.env.local scripts/check-anon-access.mjs
//
// It asks the API (with the service key) which tables and functions it exposes, so a new one is checked without
// anyone remembering to add it here. Then, with the public key:
//   * every table: no delete, no update, and no `select *` (the app reads only named columns of unsaids and replies)
//   * every function: no call. A function runs with its owner's rights, so one that is open lets any visitor do what
//     it does. (If one IS open, this call runs it once, with empty values, which our functions reject.)
// A refused call answers 401 or 403. Anything else counts as a failure, including 404, which says nothing: it is
// what a call with the wrong parameter names gets. Deletes and updates use a filter that matches no row.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const api = `${url}/rest/v1`;
const headersFor = (key) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const anon = headersFor(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const service = headersFor(process.env.SUPABASE_SERVICE_ROLE_KEY);

const spec = await (await fetch(`${api}/`, { headers: service })).json();
const tables = Object.entries(spec.definitions ?? {});
const functions = Object.entries(spec.paths ?? {}).filter(([path]) => path.startsWith('/rpc/'));
if (tables.length === 0) {
  console.error('Could not list the tables with the service key. Is SUPABASE_SERVICE_ROLE_KEY set?');
  process.exit(2);
}

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const isNumber = (format = '') => /int|double|numeric|real|float/.test(format);
const refused = (status) => status === 401 || status === 403;
const call = async (method, path, body) => (await fetch(`${api}/${path}`, { method, headers: anon, body })).status;

let failures = 0;
const report = (ok, name, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(28)} ${detail}`);
};

for (const [table, { properties }] of tables) {
  const [[first, firstProp], second] = Object.entries(properties);
  // a value of the right type for the first column that no row has, so a permitted call changes nothing
  const nothing = firstProp.format === 'uuid' ? ZERO_UUID : isNumber(firstProp.format) ? '-999999' : 'x';
  const filter = `${first}=eq.${nothing}`;
  const column = (second ?? [first])[0];
  const del = await call('DELETE', `${table}?${filter}`);
  const upd = await call('PATCH', `${table}?${filter}`, JSON.stringify({ [column]: null }));
  const read = await call('GET', `${table}?select=*&limit=1`);
  report([del, upd, read].every(refused), `table ${table}`, `delete ${del}  update ${upd}  read(select *) ${read}`);
}

for (const [path, { post }] of functions) {
  const props = post.parameters?.find((p) => p.in === 'body')?.schema?.properties ?? {};
  const args = Object.fromEntries(
    Object.entries(props).map(([name, { format }]) => [name, format === 'uuid' ? ZERO_UUID : isNumber(format) ? 0 : ''])
  );
  const status = await call('POST', path.slice(1), JSON.stringify(args));
  report(refused(status), `function ${path.slice(5)}`, `call ${status}`);
}

console.log(
  failures
    ? `\n${failures} problem(s) among ${tables.length} tables and ${functions.length} functions: the public key can do something it should not.`
    : `\nChecked ${tables.length} tables and ${functions.length} functions: the public key can write nothing, read nothing it should not, and call nothing.`
);
process.exit(failures ? 1 : 0);
