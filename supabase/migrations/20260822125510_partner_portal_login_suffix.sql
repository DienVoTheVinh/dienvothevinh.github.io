-- A compact suffix gives each partner a memorable student login such as
-- minh@hstt while plain minh (or minh@hs) remains a VinhMath student.
alter table public.exam_portals
  add column login_suffix text;

update public.exam_portals
set login_suffix = case
  when slug = 'demo-doi-tac' then 'hsdemo'
  else 'hs' || left(regexp_replace(slug, '[^a-z0-9]', '', 'g'), 12) || left(replace(id::text, '-', ''), 4)
end;

alter table public.exam_portals
  alter column login_suffix set not null,
  add constraint exam_portals_login_suffix_format
    check (login_suffix ~ '^hs[a-z0-9]{2,20}$' and login_suffix <> 'hs'),
  add constraint exam_portals_login_suffix_key unique (login_suffix);

comment on column public.exam_portals.login_suffix is
  'Compact student login suffix, for example hstt in username@hstt.';
