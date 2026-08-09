-- Follow-up for projects that applied tex_environment_admin before the
-- published table was made RPC-only. The public SELECT policy already supplies
-- the row visibility required by publish_tex_environment; direct writes remain
-- revoked, so the redundant ALL policy only added a second SELECT policy.
drop policy if exists tex_environment_configs_admin_write
  on public.tex_environment_configs;
