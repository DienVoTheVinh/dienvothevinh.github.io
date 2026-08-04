-- Web Push subscriptions for VinhMath devices.
-- This is a reviewed schema definition, not a generated migration file.
-- Apply through a named Supabase migration only after production approval.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  expiration_time bigint,
  device_label text not null default 'Thiết bị',
  timezone text not null default 'Asia/Ho_Chi_Minh',
  user_agent text,
  enabled boolean not null default true,
  failure_count integer not null default 0 check (failure_count >= 0),
  last_error text,
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_length check (char_length(endpoint) between 20 and 4096),
  constraint push_subscriptions_key_length check (char_length(p256dh) between 16 and 512 and char_length(auth) between 16 and 512)
);

create index if not exists push_subscriptions_user_enabled_idx
  on public.push_subscriptions (user_id, enabled);

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from anon;
revoke all on table public.push_subscriptions from authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own
  on public.push_subscriptions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own
  on public.push_subscriptions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own
  on public.push_subscriptions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.push_subscriptions is
  'Standards-based Web Push subscriptions. Private VAPID keys remain in Edge Function secrets, never in this table or the browser.';
