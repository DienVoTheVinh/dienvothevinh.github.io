-- Follow-up from Supabase performance advisors: cover portal foreign keys and
-- keep read policies separate from admin write policies.

create index exam_portals_brand_idx on public.exam_portals (brand_id) where brand_id is not null;
create index exam_portals_created_by_idx on public.exam_portals (created_by) where created_by is not null;

drop policy exam_portals_admin_write on public.exam_portals;
create policy exam_portals_admin_insert on public.exam_portals for insert to authenticated
with check ((select public.is_admin()));
create policy exam_portals_admin_update on public.exam_portals for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy exam_portals_admin_delete on public.exam_portals for delete to authenticated
using ((select public.is_admin()));

drop policy exam_portal_members_admin_write on public.exam_portal_members;
create policy exam_portal_members_admin_insert on public.exam_portal_members for insert to authenticated
with check ((select public.is_admin()));
create policy exam_portal_members_admin_update on public.exam_portal_members for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy exam_portal_members_admin_delete on public.exam_portal_members for delete to authenticated
using ((select public.is_admin()));

drop policy exam_portal_exams_admin_write on public.exam_portal_exams;
create policy exam_portal_exams_admin_insert on public.exam_portal_exams for insert to authenticated
with check ((select public.is_admin()));
create policy exam_portal_exams_admin_update on public.exam_portal_exams for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy exam_portal_exams_admin_delete on public.exam_portal_exams for delete to authenticated
using ((select public.is_admin()));
