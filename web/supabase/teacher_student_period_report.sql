-- Báo cáo học tập theo kỳ cho giáo viên.
-- Chỉ áp dụng sau khi đã review trên nhánh/PR; không chứa dữ liệu hoặc bí mật.

create index if not exists idx_class_sessions_class_held
  on public.class_sessions (class_id, held_on);

create index if not exists idx_lessons_class_published_locked
  on public.lessons (class_id, published, locked);

create index if not exists idx_submissions_student_lesson_kind
  on public.submissions (student_id, lesson_id, kind, submitted_at);

create index if not exists idx_attempts_student_submitted
  on public.attempts (student_id, submitted_at);

create index if not exists idx_analytics_sessions_profile_started
  on public.analytics_sessions (profile_id, started_at);

create index if not exists idx_lesson_item_progress_student_done
  on public.lesson_item_progress (student_id, done_at);

create or replace function public.gv_bao_cao_hoc_tap(
  p_student uuid,
  p_class uuid,
  p_start date,
  p_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_uid;

  if v_role is null or v_role not in ('admin', 'teacher') then
    return jsonb_build_object('error', 'forbidden');
  end if;

  if v_role <> 'admin' and not coalesce(public.can_manage_class(p_class), false) then
    return jsonb_build_object('error', 'not_allowed');
  end if;

  if not exists (
    select 1
    from public.class_students cs
    where cs.class_id = p_class and cs.student_id = p_student
  ) then
    return jsonb_build_object('error', 'student_not_in_class');
  end if;

  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 366 then
    return jsonb_build_object('error', 'invalid_period');
  end if;

  v_start_at := p_start::timestamp at time zone 'Asia/Ho_Chi_Minh';
  v_end_at := (p_end + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh';

  select jsonb_build_object(
    'student', (
      select jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'username', p.username,
        'school', p.school
      )
      from public.profiles p
      where p.id = p_student and p.role = 'student'
    ),
    'class', (
      select jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'grade', c.grade,
        'mode', c.mode,
        'is_specialized', c.is_specialized
      )
      from public.classes c
      where c.id = p_class
    ),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'held_on', s.held_on,
        'lesson_id', s.lesson_id,
        'status', a.status,
        'checked_at', a.checked_at
      ) order by s.held_on, s.created_at)
      from public.class_sessions s
      left join public.attendance a
        on a.session_id = s.id and a.student_id = p_student
      where s.class_id = p_class
        and s.held_on between p_start and p_end
    ), '[]'::jsonb),
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'title', l.title,
        'created_at', l.created_at,
        'homework_text', l.homework_text,
        'homework_images', l.homework_images,
        'homework_latex_content', l.homework_latex_content,
        'homework_document_id', l.homework_document_id,
        'homework_due', l.homework_due,
        'homework2_text', l.homework2_text,
        'homework2_images', l.homework2_images,
        'homework2_latex_content', l.homework2_latex_content,
        'homework2_document_id', l.homework2_document_id,
        'homework2_due', l.homework2_due,
        'test_document_id', l.test_document_id,
        'test_latex_content', l.test_latex_content,
        'linked_exam_id', l.linked_exam_id,
        'test_deadline', l.test_deadline
      ) order by l.created_at)
      from public.lessons l
      where l.class_id = p_class and l.published and not l.locked
    ), '[]'::jsonb),
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lesson_id', lip.lesson_id,
        'item', lip.item,
        'done_at', lip.done_at
      ) order by lip.done_at)
      from public.lesson_item_progress lip
      join public.lessons l on l.id = lip.lesson_id
      where lip.student_id = p_student
        and l.class_id = p_class
        and lip.done_at >= v_start_at and lip.done_at < v_end_at
    ), '[]'::jsonb),
    'submissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'lesson_id', s.lesson_id,
        'kind', s.kind,
        'submitted_at', s.submitted_at,
        'is_late', s.is_late,
        'status', s.status,
        'score', s.score,
        'feedback', s.feedback,
        'graded_at', s.graded_at,
        'reviewed_at', s.reviewed_at
      ) order by s.submitted_at)
      from public.submissions s
      join public.lessons l on l.id = s.lesson_id
      where s.student_id = p_student
        and l.class_id = p_class
        and s.submitted_at < v_end_at
    ), '[]'::jsonb),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lesson_id', a.lesson_id,
        'exam_id', a.exam_id,
        'submitted_at', a.submitted_at,
        'score', a.score
      ) order by a.submitted_at)
      from public.attempts a
      where a.student_id = p_student
        and a.submitted_at < v_end_at
        and (
          exists (
            select 1 from public.lessons l
            where l.id = a.lesson_id and l.class_id = p_class
          )
          or exists (
            select 1 from public.lessons l
            where l.linked_exam_id = a.exam_id and l.class_id = p_class
          )
        )
    ), '[]'::jsonb),
    'remarks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ngay', r.ngay,
        'remark', r.remark,
        'attitude_score', r.attitude_score,
        'author_name', r.author_name
      ) order by r.ngay desc, r.created_at desc)
      from public.session_remarks r
      where r.class_id = p_class and r.student_id = p_student
        and r.ngay between p_start and p_end
    ), '[]'::jsonb),
    'analytics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'duration_seconds', s.duration_seconds,
        'started_at', s.started_at
      ) order by s.started_at)
      from public.analytics_sessions s
      where s.profile_id = p_student
        and s.started_at >= v_start_at and s.started_at < v_end_at
    ), '[]'::jsonb),
    'study', coalesce((
      select jsonb_agg(jsonb_build_object(
        'focus_seconds', s.focus_seconds,
        'started_at', s.started_at,
        'completed', s.completed
      ) order by s.started_at)
      from public.study_sessions s
      where s.student_id = p_student
        and s.started_at >= v_start_at and s.started_at < v_end_at
    ), '[]'::jsonb)
  ) into v_result;

  if v_result->'student' is null or v_result->'student' = 'null'::jsonb then
    return jsonb_build_object('error', 'student_not_found');
  end if;

  return v_result;
end;
$$;

revoke all on function public.gv_bao_cao_hoc_tap(uuid, uuid, date, date) from public;
revoke all on function public.gv_bao_cao_hoc_tap(uuid, uuid, date, date) from anon;
grant execute on function public.gv_bao_cao_hoc_tap(uuid, uuid, date, date) to authenticated;
