create table public.vmtools_web_experience (
 id integer primary key check(id=1),
 audience text not null default 'closed' check(audience in ('closed','teachers','everyone')),
 features text[] not null default array['ink','geometry2d','geometry3d','graphs','calculator']::text[]
 check(features <@ array['ink','geometry2d','geometry3d','graphs','calculator']::text[]),
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null
);
insert into public.vmtools_web_experience(id) values(1);
alter table public.vmtools_web_experience enable row level security;
revoke all on public.vmtools_web_experience from anon,authenticated;
grant all on public.vmtools_web_experience to service_role;
create index vmtools_web_experience_actor_idx on public.vmtools_web_experience(updated_by);
comment on table public.vmtools_web_experience is 'Server-only trial policy, public sanitized read via license endpoint; never grants downloads or desktop licenses.';

alter table public.google_oauth_states add column purpose text not null default 'meet' check(purpose in ('meet','vmtools'));
create table public.vmtools_drive_connections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 google_email text, refresh_token_ciphertext text not null, granted_scopes text[] not null,
 connected_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.vmtools_drive_connections enable row level security;
revoke all on public.vmtools_drive_connections from anon,authenticated;
grant all on public.vmtools_drive_connections to service_role;
comment on table public.vmtools_drive_connections is 'Encrypted teacher Drive OAuth credentials; server-only, separate from Meet integration.';
