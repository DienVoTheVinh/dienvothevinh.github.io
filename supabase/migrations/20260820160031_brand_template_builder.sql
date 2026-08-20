-- Visual brand templates for class-scoped white-label experiences.
-- Existing classes.theme remains populated for backwards compatibility.

create table public.brand_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_name text not null,
  tagline text not null default '',
  logo_path text not null default 'site:img/logo.png',
  preset text not null default 'vinhmath',
  primary_color text not null default '#7A4D00',
  secondary_color text not null default '#613D00',
  accent_color text not null default '#7A4D00',
  accent_soft_color text not null default '#F4EBDD',
  surface_color text not null default '#FFFFFF',
  text_color text not null default '#1A1A1A',
  topbar_color text not null default '#FAF8F5',
  topbar_text_color text not null default '#111111',
  logo_scale smallint not null default 100,
  logo_x smallint not null default 50,
  logo_y smallint not null default 50,
  radius_px smallint not null default 12,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_templates_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint brand_templates_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint brand_templates_short_name_length check (char_length(btrim(short_name)) between 1 and 32),
  constraint brand_templates_tagline_length check (char_length(tagline) <= 160),
  constraint brand_templates_logo_path_length check (char_length(logo_path) between 1 and 512),
  constraint brand_templates_preset_check check (preset in ('vinhmath', 'map', 'duyminh')),
  constraint brand_templates_primary_color_check check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint brand_templates_secondary_color_check check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint brand_templates_accent_color_check check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint brand_templates_accent_soft_color_check check (accent_soft_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint brand_templates_surface_color_check check (surface_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint brand_templates_text_color_check check (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint brand_templates_topbar_color_check check (topbar_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint brand_templates_topbar_text_color_check check (topbar_text_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint brand_templates_logo_scale_check check (logo_scale between 40 and 160),
  constraint brand_templates_logo_x_check check (logo_x between 0 and 100),
  constraint brand_templates_logo_y_check check (logo_y between 0 and 100),
  constraint brand_templates_radius_check check (radius_px between 4 and 32)
);

comment on table public.brand_templates is
  'Reusable visual identities selected by a class. Only administrators may mutate templates.';
comment on column public.brand_templates.logo_path is
  'site:<relative path> for checked-in assets, otherwise an object path in the brand-assets bucket.';

create index brand_templates_active_name_idx
  on public.brand_templates (is_active, name);
create index brand_templates_created_by_idx
  on public.brand_templates (created_by);
create index brand_templates_updated_by_idx
  on public.brand_templates (updated_by);

alter table public.brand_templates enable row level security;

revoke all on table public.brand_templates from anon, authenticated;
grant select on table public.brand_templates to anon, authenticated;
grant insert, update on table public.brand_templates to authenticated;
grant all on table public.brand_templates to service_role;

create policy brand_templates_read
on public.brand_templates
for select
to anon, authenticated
using (true);

create policy brand_templates_insert_admin
on public.brand_templates
for insert
to authenticated
with check ((select public.is_admin()));

create policy brand_templates_update_admin
on public.brand_templates
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

insert into public.brand_templates (
  slug, name, short_name, tagline, logo_path, preset,
  primary_color, secondary_color, accent_color, accent_soft_color,
  surface_color, text_color, topbar_color, topbar_text_color,
  logo_scale, logo_x, logo_y, radius_px
)
values
  ('vinhmath', 'VinhMath', 'VinhMath', 'Học toán bằng đam mê', 'site:img/logo.png', 'vinhmath',
    '#7A4D00', '#613D00', '#7A4D00', '#F4EBDD', '#FFFFFF', '#1A1A1A', '#FAF8F5', '#111111', 100, 50, 50, 12),
  ('map', 'CLB M.A.P', 'M.A.P', 'Math And Passion', 'site:logo/CLB-MAP-logo.png', 'map',
    '#1B2644', '#24335C', '#1B2644', '#EAEFF6', '#FFFFFF', '#1A1A1A', '#FAF8F5', '#111111', 100, 50, 50, 12),
  ('duyminh', 'Trung tâm Duy Minh', 'DUY MINH', 'Đồng hành cùng học sinh', 'site:logo/duyminh-logo.png', 'duyminh',
    '#C81E27', '#8E1018', '#C81E27', '#FCEBEC', '#FFFFFF', '#1A1A1A', '#FAF8F5', '#111111', 100, 50, 50, 12)
on conflict (slug) do nothing;

alter table public.classes add column brand_id uuid;

alter table public.classes
  add constraint classes_brand_id_fkey
  foreign key (brand_id) references public.brand_templates(id) on delete restrict;

create index classes_brand_id_idx on public.classes (brand_id);

update public.classes c
set brand_id = b.id
from public.brand_templates b
where b.slug = coalesce(nullif(c.theme, ''), 'vinhmath')
  and c.brand_id is null;

update public.classes c
set brand_id = b.id
from public.brand_templates b
where b.slug = 'vinhmath'
  and c.brand_id is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets',
  'brand-assets',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy brand_assets_insert_admin
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'brand-assets'
  and (select public.is_admin())
);

create policy brand_assets_update_admin
on storage.objects
for update
to authenticated
using (
  bucket_id = 'brand-assets'
  and (select public.is_admin())
)
with check (
  bucket_id = 'brand-assets'
  and (select public.is_admin())
);

create policy brand_assets_delete_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'brand-assets'
  and (select public.is_admin())
);
