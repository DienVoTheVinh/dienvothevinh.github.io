-- INSERT ... RETURNING evaluates SELECT policies before helper lookups can
-- reliably find the newly inserted row. Authorize portal managers directly
-- from the row's portal_id, while students remain class/assignment scoped.

drop policy if exists classes_portal_only_scope on public.classes;
create policy classes_portal_only_scope
on public.classes as restrictive for select to authenticated
using (
  (
    portal_id is null
    and not (select private.is_portal_only_user())
  )
  or (
    portal_id is not null
    and (select private.can_manage_exam_portal(portal_id))
  )
  or (select private.can_access_portal_class(id))
);

drop policy if exists exams_portal_only_scope on public.exams;
create policy exams_portal_only_scope
on public.exams as restrictive for select to authenticated
using (
  (
    portal_id is null
    and not (select private.is_portal_only_user())
  )
  or (
    portal_id is not null
    and (select private.can_manage_exam_portal(portal_id))
  )
  or (select private.can_access_portal_exam(id))
);

drop policy if exists exams_portal_manager_read on public.exams;
create policy exams_portal_manager_read
on public.exams for select to authenticated
using (
  portal_id is not null
  and (select private.can_manage_exam_portal(portal_id))
);
