-- Private, content-addressed TikZ render cache. Only the LaTeX Edge Function
-- uses the service role to read/write this bucket; browsers never list it.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'latex-render-cache',
  'latex-render-cache',
  false,
  25000000,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- Explicitly leave the bucket without authenticated/anon object policies.
-- Access is performed by the verified-JWT Edge Function through service_role.
