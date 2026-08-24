-- Storage RLS evaluates this helper for private lesson images.  The helper
-- performs its own auth.uid(), staff, enrolment and publication checks, so the
-- authenticated role needs only enough privilege to invoke this one function.
grant usage on schema private to authenticated;
grant execute on function private.vm_can_read_course_asset(text, text) to authenticated;
