-- VinhMath - Google Meet recording catalogue (metadata only)
-- Videos remain in Google Drive. No binary content is copied into Supabase.

create extension if not exists pgcrypto;

create table if not exists public.google_drive_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  google_email text,
  refresh_token_ciphertext text not null,
  granted_scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.google_oauth_states (
  state_hash text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.meet_recordings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  google_file_id text not null,
  file_name text not null,
  mime_type text,
  created_time timestamptz,
  modified_time timestamptz,
  drive_url text not null,
  size_bytes bigint,
  duration_ms bigint,
  width integer,
  height integer,
  suggested_class_id uuid references public.classes(id) on delete set null,
  suggested_lesson_id uuid references public.lessons(id) on delete set null,
  match_confidence smallint not null default 0 check (match_confidence between 0 and 100),
  match_reason text,
  assigned_class_id uuid references public.classes(id) on delete set null,
  assigned_lesson_id uuid references public.lessons(id) on delete set null,
  assigned_at timestamptz,
  assigned_by uuid references public.profiles(id) on delete set null,
  sync_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id, google_file_id)
);

create index if not exists meet_recordings_created_time_idx on public.meet_recordings(created_time desc);
create index if not exists meet_recordings_suggested_class_idx on public.meet_recordings(suggested_class_id);
create index if not exists meet_recordings_suggested_lesson_idx on public.meet_recordings(suggested_lesson_id);
create index if not exists meet_recordings_assigned_class_idx on public.meet_recordings(assigned_class_id);
create index if not exists meet_recordings_assigned_lesson_idx on public.meet_recordings(assigned_lesson_id);
create index if not exists meet_recordings_assigned_by_idx on public.meet_recordings(assigned_by);
create index if not exists google_oauth_states_expiry_idx on public.google_oauth_states(expires_at);
create index if not exists google_oauth_states_user_idx on public.google_oauth_states(user_id);

alter table public.google_drive_connections enable row level security;
alter table public.google_oauth_states enable row level security;
alter table public.meet_recordings enable row level security;

-- OAuth credentials and one-time states are server-only. The service role bypasses RLS.
revoke all on public.google_drive_connections from anon, authenticated;
revoke all on public.google_oauth_states from anon, authenticated;
revoke insert, update, delete on public.meet_recordings from anon, authenticated;
grant select on public.meet_recordings to authenticated;

drop policy if exists google_drive_connections_server_only on public.google_drive_connections;
create policy google_drive_connections_server_only on public.google_drive_connections
for all to anon, authenticated using (false) with check (false);

drop policy if exists google_oauth_states_server_only on public.google_oauth_states;
create policy google_oauth_states_server_only on public.google_oauth_states
for all to anon, authenticated using (false) with check (false);

drop policy if exists meet_recordings_staff_read on public.meet_recordings;
create policy meet_recordings_staff_read on public.meet_recordings
for select to authenticated using ((select auth.uid()) = owner_user_id and public.is_teacher());

comment on table public.google_drive_connections is 'Encrypted Google OAuth refresh token; never exposed through client RLS.';
comment on table public.meet_recordings is 'Metadata-only catalogue of Google Meet recordings. Video content stays in Drive.';
