-- Restrict the browser-visible Meet catalogue to the Google Drive connection owner.
-- Edge Functions continue to use the service role after validating admin/teacher access.
drop policy if exists meet_recordings_staff_read on public.meet_recordings;

create policy meet_recordings_staff_read
on public.meet_recordings
for select
to authenticated
using ((select auth.uid()) = owner_user_id and public.is_teacher());
