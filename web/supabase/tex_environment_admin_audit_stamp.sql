-- Server-side audit fields for direct draft upserts from the admin UI.
create or replace function public.stamp_tex_environment_draft()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists stamp_tex_environment_draft on public.tex_environment_drafts;
create trigger stamp_tex_environment_draft
before insert or update on public.tex_environment_drafts
for each row execute function public.stamp_tex_environment_draft();

revoke all on function public.stamp_tex_environment_draft()
  from public, anon, authenticated;
