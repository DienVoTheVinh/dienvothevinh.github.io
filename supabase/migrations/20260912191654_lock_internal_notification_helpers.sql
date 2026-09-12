-- These fan-out helpers are called only by trusted database triggers, not by
-- browser clients. Their SQL bypasses RLS and must not be a public RPC API.
-- Keep owner/service access so existing lesson/submission/schedule triggers work.
revoke all on function public.notify_class(uuid,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.notify_staff(uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.notify_class(uuid,text,text,text,text)
  to service_role;
grant execute on function public.notify_staff(uuid,text,text,text,text)
  to service_role;

-- Resolve trusted application tables before temporary objects.
alter function public.notify_class(uuid,text,text,text,text)
  set search_path = public, pg_temp;
alter function public.notify_staff(uuid,text,text,text,text)
  set search_path = public, pg_temp;

comment on function public.notify_class(uuid,text,text,text,text) is
  'Internal notification fan-out. Trigger/service use only; browser must use an authorized workflow.';
comment on function public.notify_staff(uuid,text,text,text,text) is
  'Internal notification fan-out. Trigger/service use only; browser must use an authorized workflow.';

-- Reading a message is not permission to rewrite its sender/content. Existing
-- clients only update read_at. Keep RLS recipient checks and narrow the columns.
revoke update on public.messages, public.notifications from public, anon, authenticated;
revoke update (id,sender_id,recipient_id,body,created_at,read_at)
  on public.messages from public, anon, authenticated;
revoke update (id,user_id,title,body,link,kind,class_ref,read_at,created_at)
  on public.notifications from public, anon, authenticated;
grant update (read_at) on public.messages, public.notifications to authenticated;
