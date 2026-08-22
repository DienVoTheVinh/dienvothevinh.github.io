-- INSERT ... RETURNING evaluates the restrictive USING expression against the
-- new row. Authorize managers directly from portal_id so the check does not
-- depend on looking the just-inserted row up again through RLS.

drop policy if exists classes_portal_only_scope on public.classes;
create policy classes_portal_only_scope
on public.classes as restrictive for all to authenticated
using (
  (
    portal_id is null
    and not (select private.is_portal_only_user())
  )
  or (
    portal_id is not null
    and (
      (select private.can_manage_exam_portal(portal_id))
      or (select private.can_access_portal_class(id))
    )
  )
)
with check (
  (
    portal_id is null
    and not (select private.is_portal_only_user())
  )
  or (
    portal_id is not null
    and (select private.can_manage_exam_portal(portal_id))
  )
);

drop policy if exists exams_portal_only_scope on public.exams;
create policy exams_portal_only_scope
on public.exams as restrictive for all to authenticated
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
)
with check (
  (
    portal_id is null
    and not (select private.is_portal_only_user())
  )
  or (select private.portal_exam_payload_valid(portal_id, class_id))
);
