-- Keep privileged helper calls out of the anonymous policy path.
alter policy blog_admin_all on public.blog_posts to authenticated;
alter policy blog_read on public.blog_posts to authenticated;
create policy blog_public_read on public.blog_posts for select to anon using (published = true);
