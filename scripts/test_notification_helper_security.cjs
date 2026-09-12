const assert = require('node:assert/strict');
const fs = require('node:fs');
const dir = 'supabase/migrations';
const filename = fs.readdirSync(dir).find(f=>f.endsWith('_lock_internal_notification_helpers.sql'));
assert(filename,'migration exists');
const sql = fs.readFileSync(dir+'/'+filename,'utf8');
for (const fn of ['notify_class','notify_staff']) {
  assert(sql.includes(`revoke all on function public.${fn}(uuid,text,text,text,text)\n  from public, anon, authenticated;`));
  assert(sql.includes(`grant execute on function public.${fn}(uuid,text,text,text,text)\n  to service_role;`));
}
assert(sql.includes('grant update (read_at) on public.messages, public.notifications to authenticated;'));
assert(!/update\s+(?:auth\.users|public\.profiles)|delete\s+from|truncate\s+/i.test(sql),'no existing account/data mutation');
console.log('PASS notification helper grants and read-only message content contract');
