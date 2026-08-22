-- Prevent portal-only teachers from reaching the normal VinhMath authoring scope
-- through the broad legacy teacher write policies. Restrictive policies compose
-- with existing policies, so normal VinhMath accounts keep their current access.

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
    and (select private.can_access_portal_class(id))
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

drop policy if exists lessons_portal_only_scope on public.lessons;
create policy lessons_portal_only_scope
on public.lessons as restrictive for all to authenticated
using (
  (
    not exists (
      select 1 from public.classes c
      where c.id = lessons.class_id and c.portal_id is not null
    )
    and not (select private.is_portal_only_user())
  )
  or (select private.can_access_portal_class(class_id))
)
with check (
  (
    not exists (
      select 1 from public.classes c
      where c.id = lessons.class_id and c.portal_id is not null
    )
    and not (select private.is_portal_only_user())
  )
  or (select private.can_manage_portal_class(class_id))
);

drop policy if exists exams_portal_only_scope on public.exams;
create policy exams_portal_only_scope
on public.exams as restrictive for all to authenticated
using (
  (
    portal_id is null
    and not (select private.is_portal_only_user())
  )
  or (select private.can_access_portal_exam(id))
  or (select private.can_manage_portal_exam(id))
)
with check (
  (
    portal_id is null
    and not (select private.is_portal_only_user())
  )
  or (select private.portal_exam_payload_valid(portal_id, class_id))
);

drop policy if exists questions_portal_only_scope on public.questions;
create policy questions_portal_only_scope
on public.questions as restrictive for all to authenticated
using (
  (
    portal_id is null
    and not (select private.is_portal_only_user())
  )
  or (select private.can_access_portal_question(id))
  or (
    portal_id is not null
    and (select private.can_manage_exam_portal(portal_id))
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

drop policy if exists exam_questions_portal_only_scope on public.exam_questions;
create policy exam_questions_portal_only_scope
on public.exam_questions as restrictive for all to authenticated
using (
  (
    not (select private.is_portal_only_user())
    and not exists (
      select 1 from public.exams exam
      where exam.id = exam_questions.exam_id and exam.portal_id is not null
    )
  )
  or (select private.can_access_portal_exam(exam_id))
  or (select private.can_manage_portal_exam(exam_id))
)
with check (
  (
    not (select private.is_portal_only_user())
    and not exists (
      select 1 from public.exams exam
      where exam.id = exam_questions.exam_id and exam.portal_id is not null
    )
  )
  or (select private.portal_exam_question_valid(exam_id, question_id))
);
