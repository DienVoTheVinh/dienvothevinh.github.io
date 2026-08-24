-- The existing app_settings table is public-readable and admin-writable under
-- RLS.  Festival configuration is presentation-only and contains no secrets.
insert into public.app_settings (key, value)
values (
  'festival_config',
  '{"mode":"on","festival":"mid_autumn","intensity":"balanced","start_date":"","end_date":""}'
)
on conflict (key) do nothing;
