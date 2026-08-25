-- Secure teacher-to-admin issue reporting for the private question bank.
-- Teachers submit only opaque locators that they already use in a sanitized
-- preview. The RPC resolves private document/item IDs server-side and never
-- returns raw TeX, answers, solutions, hashes or provenance.

create table if not exists private.vm_question_bank_issue_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null
    check (target_type in ('source_document','exam','question')),
  target_id uuid not null,
  document_id uuid references private.vm_question_bank_documents(id) on delete set null,
  item_id uuid references private.vm_question_bank_items(id) on delete set null,
  exam_id uuid references public.exams(id) on delete set null,
  source_ordinal integer check (source_ordinal is null or source_ordinal >= 0),
  exam_sort integer check (exam_sort is null or exam_sort >= 0),
  context_key text not null check (char_length(context_key) between 3 and 220),
  target_label text not null check (char_length(target_label) between 1 and 300),
  issue_type text not null check (issue_type in (
    'render','content','choice','asset','classification','answer_suspected','other'
  )),
  description text not null check (char_length(description) between 3 and 2000),
  reported_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'open'
    check (status in ('open','in_review','resolved','dismissed')),
  resolution_note text check (
    resolution_note is null or char_length(resolution_note) <= 2000
  ),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (target_type='source_document' and document_id is not null)
    or (target_type='exam' and exam_id is not null)
    or (target_type='question' and item_id is not null)
  )
);

alter table private.vm_question_bank_issue_reports enable row level security;

-- Queue reads are dominated by unresolved reports; keep the hot index small.
create index if not exists vm_qb_issue_reports_admin_queue_idx
  on private.vm_question_bank_issue_reports(status,created_at desc,id)
  where status in ('open','in_review');

create index if not exists vm_qb_issue_reports_reporter_rate_idx
  on private.vm_question_bank_issue_reports(reported_by,created_at desc);

create index if not exists vm_qb_issue_reports_document_idx
  on private.vm_question_bank_issue_reports(document_id,created_at desc)
  where document_id is not null;

create index if not exists vm_qb_issue_reports_exam_idx
  on private.vm_question_bank_issue_reports(exam_id,created_at desc)
  where exam_id is not null;

create index if not exists vm_qb_issue_reports_item_idx
  on private.vm_question_bank_issue_reports(item_id,created_at desc)
  where item_id is not null;

-- One unresolved report per reporter, issue kind and exact preview location.
-- The create RPC also takes a per-reporter advisory lock, so callers receive
-- the existing report ID instead of a unique-violation race.
create unique index if not exists vm_qb_issue_reports_open_dedupe_idx
  on private.vm_question_bank_issue_reports(reported_by,issue_type,context_key)
  where status in ('open','in_review');

revoke all on table private.vm_question_bank_issue_reports
  from public, anon, authenticated, service_role;

-- Notification rows are addressed to one recipient. The older permissive
-- staff policy allowed any teacher to read notifications sent only to admins;
-- keep the bell private to its recipient before issue alerts are introduced.
drop policy if exists noti_sel on public.notifications;
create policy noti_sel on public.notifications for select to authenticated
  using ((select auth.uid())=user_id);

drop policy if exists noti_upd on public.notifications;
create policy noti_upd on public.notifications for update to authenticated
  using ((select auth.uid())=user_id)
  with check ((select auth.uid())=user_id);

-- Notifications are emitted only by vetted SECURITY DEFINER functions and
-- triggers. Removing the broad staff INSERT policy prevents a teacher from
-- forging an admin alert or an arbitrary bank_report deep link.
drop policy if exists noti_ins on public.notifications;
revoke insert on table public.notifications from authenticated, anon;
revoke update on table public.notifications from authenticated;
grant update(read_at) on table public.notifications to authenticated;
revoke delete on table public.notifications from authenticated, anon;

-- Preserve the existing "lớp bắt đầu" action without restoring arbitrary
-- notification INSERT access to staff. The server checks exact class scope,
-- validates the link, deduplicates for 20 minutes and addresses only students
-- who actually belong to that class.
create or replace function public.vm_notify_class_start(
  p_class_id uuid,
  p_meet_link text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_actor uuid:=auth.uid();
  v_link text:=trim(coalesce(p_meet_link,''));
  v_class_name text;
  v_inserted integer:=0;
begin
  if v_actor is null or not public.is_teacher()
     or not coalesce(public.can_manage_class(p_class_id),false) then
    raise exception 'class_start_forbidden' using errcode='42501';
  end if;
  if char_length(v_link)<8 or char_length(v_link)>1000
     or v_link !~* '^https://[^[:space:]]+$' then
    raise exception 'class_start_link_invalid' using errcode='22023';
  end if;

  select class.name into v_class_name
  from public.classes class where class.id=p_class_id;
  if v_class_name is null then
    raise exception 'class_start_class_not_found' using errcode='P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vm_class_start:'||p_class_id::text,0)
  );
  if exists (
    select 1 from public.notifications notification
    where notification.kind='class_start'
      and notification.class_ref=p_class_id
      and notification.created_at>now()-interval '20 minutes'
  ) then
    return jsonb_build_object('ok',true,'duplicate',true,'notified',0);
  end if;

  insert into public.notifications(user_id,title,body,link,kind,class_ref)
  select membership.student_id,
    '🔴 Lớp '||v_class_name||' đã bắt đầu!',
    'Thầy đã vào phòng học trực tuyến. Em vào lớp ngay nhé!',
    v_link,'class_start',p_class_id
  from public.class_students membership
  where membership.class_id=p_class_id
  on conflict do nothing;
  get diagnostics v_inserted=row_count;

  return jsonb_build_object(
    'ok',true,'duplicate',false,'notified',v_inserted,'class_id',p_class_id
  );
end;
$function$;

revoke all on function public.vm_notify_class_start(uuid,text)
  from public, anon;
grant execute on function public.vm_notify_class_start(uuid,text)
  to authenticated;

-- Protected question-bank compositions are server-managed. A teacher may
-- generate, assign, preview and publish through vetted RPCs, but must never
-- obtain the technical question UUIDs or rewrite the composition through the
-- public exam_questions table. Ordinary teacher-authored exams keep the
-- legacy direct-table workflow.
create or replace function private.vm_bank_direct_exam_question_allowed(
  p_exam_id uuid,
  p_question_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
  select exists (
    select 1 from public.exams exam
    where exam.id=p_exam_id
      and case
        when private.vm_bank_exam_is_protected(
          exam.id,exam.bank_generated,exam.source_bank_document_id
        ) then public.is_admin()
        when not private.vm_bank_direct_question_allowed(p_question_id)
          then public.is_admin()
        else true
      end
  );
$function$;

revoke all on function private.vm_bank_direct_exam_question_allowed(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.vm_bank_direct_exam_question_allowed(uuid,uuid)
  to anon, authenticated;

drop policy if exists exam_questions_bank_direct_scope on public.exam_questions;
create policy exam_questions_bank_direct_scope
on public.exam_questions as restrictive for all to anon, authenticated
using ((select private.vm_bank_direct_exam_question_allowed(exam_id,question_id)))
with check ((select private.vm_bank_direct_exam_question_allowed(exam_id,question_id)));

-- Metadata-only catalogue for the teacher fullscreen switcher. Counts are
-- computed inside the SECURITY DEFINER function; no question UUID, raw TeX,
-- answer, solution, internal ID or provenance crosses the RPC boundary.
create or replace function public.vm_bank_exam_catalog(
  p_limit integer default 120
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,120),1),200);
  v_items jsonb:='[]'::jsonb;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'bank_teacher_required' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(row.payload order by row.created_at desc,row.id),'[]'::jsonb)
    into v_items
  from (
    select exam.id,exam.created_at,
      jsonb_build_object(
        'id',exam.id,
        'title',exam.title,
        'duration_minutes',exam.duration_minutes,
        'published',exam.published,
        'class_id',exam.class_id,
        'class_name',classroom.name,
        'de_type',exam.de_type,
        'bank_generated',exam.bank_generated,
        'source_bank_document_id',exam.source_bank_document_id,
        'question_count',(
          select count(*)::integer
          from public.exam_questions composition
          where composition.exam_id=exam.id
        )
      ) payload
    from public.exams exam
    left join public.classes classroom on classroom.id=exam.class_id
    where private.vm_bank_exam_is_protected(
        exam.id,exam.bank_generated,exam.source_bank_document_id
      )
      and private.vm_bank_can_manage_exam(exam.id)
    order by exam.created_at desc,exam.id
    limit v_limit
  ) row;

  return jsonb_build_object('items',v_items,'limit',v_limit);
end;
$function$;

revoke all on function public.vm_bank_exam_catalog(integer)
  from public, anon;
grant execute on function public.vm_bank_exam_catalog(integer)
  to authenticated;

-- The legacy corpus also uses \giaibai{...} and, occasionally, matching
-- environments. Keep the public sanitizer aligned with the parser so a
-- historic solution command can never survive into a teacher preview.
create or replace function public.vm_strip_latex_solutions(p_source text)
returns text
language plpgsql
immutable
set search_path = public
as $function$
declare v_out text:=coalesce(p_source,'');
begin
  v_out:=public.vm_remove_latex_environment(v_out,'loigiai');
  v_out:=public.vm_remove_latex_environment(v_out,'giaibai');
  v_out:=public.vm_remove_latex_environment(v_out,'solution');
  v_out:=public.vm_remove_latex_environment(v_out,'onlysolution');
  v_out:=public.vm_remove_latex_environment(v_out,'answer');
  v_out:=public.vm_remove_latex_environment(v_out,'sol');
  v_out:=public.vm_remove_latex_group_command(v_out,'loigiai');
  v_out:=public.vm_remove_latex_group_command(v_out,'giaibai');
  v_out:=public.vm_remove_latex_group_command(v_out,'solution');
  v_out:=public.vm_remove_latex_group_command(v_out,'answer');
  v_out:=public.vm_remove_latex_group_command(v_out,'sol');
  return v_out;
end;
$function$;

revoke all on function public.vm_strip_latex_solutions(text)
  from public, anon, authenticated;
grant execute on function public.vm_strip_latex_solutions(text) to service_role;

-- Keep the existing sanitized preview contract. A teacher receives only the
-- visible ordinal, never a private item UUID; the report RPC resolves the item
-- server-side from the document/exam plus that ordinal.
create or replace function public.vm_bank_source_exam_preview(
  p_document_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_title text;
  v_question_count integer;
  v_questions jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'bank_teacher_required' using errcode='42501';
  end if;

  select document.title into v_title
  from private.vm_question_bank_documents document
  where document.id=p_document_id
    and document.source_kind='mock_exam'
    and document.status='active';
  if v_title is null then
    raise exception 'bank_source_exam_not_found' using errcode='P0002';
  end if;

  select count(*)::integer into v_question_count
  from private.vm_question_bank_item_sources source_item
  join private.vm_question_bank_items bank_item
    on bank_item.id=source_item.item_id and bank_item.status='active'
  where source_item.document_id=p_document_id;
  if v_question_count>200 then
    raise exception 'bank_source_exam_question_limit_exceeded' using errcode='22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sort',source_item.source_ordinal,
    'question_type',bank_item.question_type,
    'content_latex',private.vm_bank_preview_content(bank_item.content_latex),
    'choices',private.vm_bank_preview_choices(
      bank_item.question_type,bank_item.public_choices
    )
  ) order by source_item.source_ordinal),'[]'::jsonb)
  into v_questions
  from private.vm_question_bank_item_sources source_item
  join private.vm_question_bank_items bank_item
    on bank_item.id=source_item.item_id and bank_item.status='active'
  where source_item.document_id=p_document_id;

  return jsonb_build_object(
    'title',v_title,'question_count',v_question_count,'questions',v_questions
  );
end;
$function$;

revoke all on function public.vm_bank_source_exam_preview(uuid)
  from public, anon;
grant execute on function public.vm_bank_source_exam_preview(uuid)
  to authenticated, service_role;

create or replace function public.vm_bank_exam_preview(p_exam_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_exam public.exams%rowtype;
  v_question_count integer;
  v_questions jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'bank_teacher_required' using errcode='42501';
  end if;

  select exam.* into v_exam
  from public.exams exam
  where exam.id=p_exam_id
    and private.vm_bank_exam_is_protected(
      exam.id,exam.bank_generated,exam.source_bank_document_id
    );
  if v_exam.id is null then
    raise exception 'bank_exam_not_found' using errcode='P0002';
  end if;
  if not public.is_admin() and not private.vm_bank_can_manage_exam(p_exam_id) then
    raise exception 'bank_exam_preview_access_denied' using errcode='42501';
  end if;

  select count(*)::integer into v_question_count
  from private.vm_question_bank_exam_occurrences occurrence
  join private.vm_question_bank_items bank_item on bank_item.id=occurrence.item_id
  where occurrence.exam_id=p_exam_id;
  if v_question_count>200 then
    raise exception 'bank_exam_question_limit_exceeded' using errcode='22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sort',occurrence.sort,
    'question_type',bank_item.question_type,
    'content_latex',private.vm_bank_preview_content(bank_item.content_latex),
    'choices',private.vm_bank_preview_choices(
      bank_item.question_type,bank_item.public_choices
    )
  ) order by occurrence.sort),'[]'::jsonb)
  into v_questions
  from private.vm_question_bank_exam_occurrences occurrence
  join private.vm_question_bank_items bank_item on bank_item.id=occurrence.item_id
  where occurrence.exam_id=p_exam_id;

  return jsonb_build_object(
    'title',v_exam.title,'question_count',v_question_count,'questions',v_questions
  );
end;
$function$;

revoke all on function public.vm_bank_exam_preview(uuid)
  from public, anon;
grant execute on function public.vm_bank_exam_preview(uuid)
  to authenticated, service_role;

create or replace function public.vm_bank_report_issue(
  p_target_type text,
  p_target jsonb,
  p_issue_type text,
  p_description text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_reporter uuid := auth.uid();
  v_is_admin boolean := false;
  v_target_type text := lower(trim(coalesce(p_target_type,'')));
  v_target jsonb := coalesce(p_target,'{}'::jsonb);
  v_issue_type text := lower(trim(coalesce(p_issue_type,'')));
  v_description text := trim(coalesce(p_description,''));
  v_document_id uuid;
  v_item_id uuid;
  v_exam_id uuid;
  v_target_id uuid;
  v_source_ordinal integer;
  v_exam_sort integer;
  v_context_key text;
  v_target_label text;
  v_reporter_name text;
  v_issue_label text;
  v_report_id uuid;
  v_existing_status text;
begin
  if v_reporter is null or not public.is_teacher() then
    raise exception 'bank_teacher_required' using errcode='42501';
  end if;
  v_is_admin:=public.is_admin();

  -- A private item UUID must never become a yes/no oracle for teachers. Even
  -- when the UUID happens to match the visible ordinal, reject the key before
  -- parsing or resolving any locator. Admin repair tools may still address an
  -- item directly.
  if not v_is_admin and (
    v_target ? 'item_id'
    or (v_target_type='question' and v_target ? 'target_id')
  ) then
    raise exception 'bank_issue_locator_invalid' using errcode='22023';
  end if;

  if v_target_type not in ('source_document','exam','question') then
    raise exception 'bank_issue_target_invalid' using errcode='22023';
  end if;
  if v_issue_type not in (
    'render','content','choice','asset','classification','answer_suspected','other'
  ) then
    raise exception 'bank_issue_type_invalid' using errcode='22023';
  end if;
  if char_length(v_description)<3 or char_length(v_description)>2000 then
    raise exception 'bank_issue_description_invalid' using errcode='22023';
  end if;

  -- Parse untrusted JSON locators without allowing a malformed UUID/integer to
  -- escape as a database implementation error.
  begin
    v_document_id:=nullif(v_target->>'document_id','')::uuid;
    v_item_id:=nullif(v_target->>'item_id','')::uuid;
    v_exam_id:=nullif(v_target->>'exam_id','')::uuid;
    v_source_ordinal:=nullif(v_target->>'source_ordinal','')::integer;
    v_exam_sort:=nullif(coalesce(v_target->>'exam_sort',v_target->>'sort'),'')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'bank_issue_locator_invalid' using errcode='22023';
  end;
  if coalesce(v_source_ordinal,0)<0 or coalesce(v_exam_sort,0)<0 then
    raise exception 'bank_issue_locator_invalid' using errcode='22023';
  end if;

  if v_target_type='source_document' then
    if v_document_id is null then
      begin
        v_document_id:=nullif(v_target->>'target_id','')::uuid;
      exception when invalid_text_representation then
        raise exception 'bank_issue_locator_invalid' using errcode='22023';
      end;
    end if;
    select document.id,document.title
      into v_document_id,v_target_label
    from private.vm_question_bank_documents document
    where document.id=v_document_id
      and (
        v_is_admin
        or (document.source_kind='mock_exam' and document.status='active')
      );
    if v_document_id is null then
      raise exception 'bank_issue_preview_access_denied' using errcode='42501';
    end if;
    v_target_id:=v_document_id;
    v_context_key:='document:'||v_document_id::text;

  elsif v_target_type='exam' then
    if v_exam_id is null then
      begin
        v_exam_id:=nullif(v_target->>'target_id','')::uuid;
      exception when invalid_text_representation then
        raise exception 'bank_issue_locator_invalid' using errcode='22023';
      end;
    end if;
    select exam.id,
      coalesce(exam.source_bank_document_id,spec.source_document_id),
      exam.title
      into v_exam_id,v_document_id,v_target_label
    from public.exams exam
    left join private.vm_question_bank_exam_specs spec on spec.exam_id=exam.id
    where exam.id=v_exam_id
      and private.vm_bank_exam_is_protected(
        exam.id,exam.bank_generated,exam.source_bank_document_id
      )
      and (v_is_admin or private.vm_bank_can_manage_exam(exam.id));
    if v_exam_id is null then
      raise exception 'bank_issue_preview_access_denied' using errcode='42501';
    end if;
    v_target_id:=v_exam_id;
    v_context_key:='exam:'||v_exam_id::text;

  else
    -- A teacher never sends a private item ID. The server resolves one from
    -- the visible source-document ordinal or managed-exam sort position.
    if v_document_id is not null and v_source_ordinal is not null then
      select source_item.item_id,document.title
        into v_item_id,v_target_label
      from private.vm_question_bank_documents document
      join private.vm_question_bank_item_sources source_item
        on source_item.document_id=document.id
       and source_item.source_ordinal=v_source_ordinal
      join private.vm_question_bank_items item on item.id=source_item.item_id
      where document.id=v_document_id
        and (v_item_id is null or source_item.item_id=v_item_id)
        and (
          v_is_admin
          or (
            document.source_kind='mock_exam'
            and document.status='active'
            and item.status='active'
          )
        );
      if v_item_id is null then
        raise exception 'bank_issue_preview_access_denied' using errcode='42501';
      end if;
      v_target_label:='Câu '||(v_source_ordinal+1)::text||' · '||v_target_label;
      v_context_key:='document:'||v_document_id::text||':ordinal:'||v_source_ordinal::text;

    elsif v_exam_id is not null and v_exam_sort is not null then
      select occurrence.item_id,occurrence.source_document_id,exam.title
        into v_item_id,v_document_id,v_target_label
      from public.exams exam
      join private.vm_question_bank_exam_occurrences occurrence
        on occurrence.exam_id=exam.id and occurrence.sort=v_exam_sort
      where exam.id=v_exam_id
        and (v_item_id is null or occurrence.item_id=v_item_id)
        and private.vm_bank_exam_is_protected(
          exam.id,exam.bank_generated,exam.source_bank_document_id
        )
        and (v_is_admin or private.vm_bank_can_manage_exam(exam.id));
      if v_item_id is null then
        raise exception 'bank_issue_preview_access_denied' using errcode='42501';
      end if;
      v_target_label:='Câu '||(v_exam_sort+1)::text||' · '||v_target_label;
      v_context_key:='exam:'||v_exam_id::text||':sort:'||v_exam_sort::text;

    elsif v_is_admin and v_item_id is not null then
      select item.id,coalesce(item.legacy_code,'Câu hỏi ngân hàng')
        into v_item_id,v_target_label
      from private.vm_question_bank_items item where item.id=v_item_id;
      if v_item_id is null then
        raise exception 'bank_issue_target_not_found' using errcode='P0002';
      end if;
      v_context_key:='item:'||v_item_id::text;
    else
      raise exception 'bank_issue_question_context_required' using errcode='22023';
    end if;
    v_target_id:=v_item_id;
  end if;

  -- Serialize a reporter's submissions so the rate check and partial-unique
  -- dedupe behave deterministically under double-clicks/concurrent requests.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vm_bank_issue:'||v_reporter::text,0)
  );

  select report.id,report.status
    into v_report_id,v_existing_status
  from private.vm_question_bank_issue_reports report
  where report.reported_by=v_reporter
    and report.issue_type=v_issue_type
    and report.context_key=v_context_key
    and report.status in ('open','in_review')
  order by report.created_at desc
  limit 1;
  if v_report_id is not null then
    return jsonb_build_object(
      'ok',true,'duplicate',true,'report_id',v_report_id,'status',v_existing_status
    );
  end if;

  if not v_is_admin and (
    select count(*) from private.vm_question_bank_issue_reports report
    where report.reported_by=v_reporter
      and report.created_at>now()-interval '1 hour'
  )>=20 then
    raise exception 'bank_issue_report_rate_limited' using errcode='P0001';
  end if;

  insert into private.vm_question_bank_issue_reports(
    target_type,target_id,document_id,item_id,exam_id,source_ordinal,exam_sort,
    context_key,target_label,issue_type,description,reported_by
  ) values (
    v_target_type,v_target_id,v_document_id,v_item_id,v_exam_id,
    v_source_ordinal,v_exam_sort,v_context_key,left(v_target_label,300),
    v_issue_type,v_description,v_reporter
  ) returning id into v_report_id;

  select coalesce(nullif(trim(profile.full_name),''),profile.username,'Giáo viên')
    into v_reporter_name
  from public.profiles profile where profile.id=v_reporter;
  v_reporter_name:=coalesce(v_reporter_name,'Giáo viên');
  v_issue_label:=case v_issue_type
    when 'render' then 'hiển thị công thức'
    when 'content' then 'nội dung câu hỏi'
    when 'choice' then 'phương án trả lời'
    when 'asset' then 'hình ảnh / tài nguyên'
    when 'classification' then 'phân loại câu hỏi'
    when 'answer_suspected' then 'nghi ngờ đáp án'
    else 'vấn đề khác'
  end;

  insert into public.notifications(user_id,title,body,link,kind)
  select profile.id,
    '🛠️ Báo lỗi Ngân hàng đề',
    left(v_reporter_name||' báo lỗi '||v_issue_label||' tại '||v_target_label||'.',500),
    'quan-tri-de?tab=bank&bank_view=repository&bank_report='||v_report_id::text||'#bank-repository',
    'bank_issue_report'
  from public.profiles profile
  where profile.role='admin';

  return jsonb_build_object(
    'ok',true,'duplicate',false,'report_id',v_report_id,'status','open'
  );
end;
$function$;

revoke all on function public.vm_bank_report_issue(text,jsonb,text,text)
  from public, anon;
grant execute on function public.vm_bank_report_issue(text,jsonb,text,text)
  to authenticated;

create or replace function public.vm_bank_admin_issue_reports(
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_status text:=nullif(lower(trim(coalesce(p_filters->>'status',''))),'');
  v_issue_type text:=nullif(lower(trim(coalesce(p_filters->>'issue_type',''))),'');
  v_target_type text:=nullif(lower(trim(coalesce(p_filters->>'target_type',''))),'');
  v_query text:=lower(trim(coalesce(p_filters->>'query','')));
  v_total bigint;
  v_items jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;

  select count(*) into v_total
  from private.vm_question_bank_issue_reports report
  left join public.profiles reporter on reporter.id=report.reported_by
  where (v_status is null or report.status=v_status)
    and (v_issue_type is null or report.issue_type=v_issue_type)
    and (v_target_type is null or report.target_type=v_target_type)
    and (
      v_query=''
      or lower(report.target_label||' '||report.description||' '
        ||coalesce(reporter.full_name,'')||' '||coalesce(reporter.username,''))
        like '%'||v_query||'%'
    );

  select coalesce(jsonb_agg(row_data order by status_rank,created_at desc,id),'[]'::jsonb)
    into v_items
  from (
    select report.id,report.created_at,
      case report.status when 'open' then 0 when 'in_review' then 1 else 2 end status_rank,
      jsonb_build_object(
        'id',report.id,
        'target_type',report.target_type,
        'target_id',report.target_id,
        'document_id',report.document_id,
        'item_id',report.item_id,
        'exam_id',report.exam_id,
        'source_ordinal',report.source_ordinal,
        'exam_sort',report.exam_sort,
        'target_label',report.target_label,
        'issue_type',report.issue_type,
        'description',report.description,
        'reported_by',report.reported_by,
        'reporter_name',coalesce(reporter.full_name,reporter.username,'Giáo viên'),
        'status',report.status,
        'created_at',report.created_at,
        'updated_at',report.updated_at,
        'deep_link','quan-tri-de?tab=bank&bank_view=repository&bank_report='
          ||report.id::text||'#bank-repository'
      ) row_data
    from private.vm_question_bank_issue_reports report
    left join public.profiles reporter on reporter.id=report.reported_by
    where (v_status is null or report.status=v_status)
      and (v_issue_type is null or report.issue_type=v_issue_type)
      and (v_target_type is null or report.target_type=v_target_type)
      and (
        v_query=''
        or lower(report.target_label||' '||report.description||' '
          ||coalesce(reporter.full_name,'')||' '||coalesce(reporter.username,''))
          like '%'||v_query||'%'
      )
    order by status_rank,report.created_at desc,report.id
    limit v_limit offset v_offset
  ) rows;

  return jsonb_build_object(
    'total',v_total,'items',v_items,'limit',v_limit,'offset',v_offset
  );
end;
$function$;

revoke all on function public.vm_bank_admin_issue_reports(jsonb,integer,integer)
  from public, anon;
grant execute on function public.vm_bank_admin_issue_reports(jsonb,integer,integer)
  to authenticated;

create or replace function public.vm_bank_admin_issue_report(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'id',report.id,
    'target_type',report.target_type,
    'target_id',report.target_id,
    'target_label',report.target_label,
    'issue_type',report.issue_type,
    'description',report.description,
    'reported_by',report.reported_by,
    'reporter_name',coalesce(reporter.full_name,reporter.username,'Giáo viên'),
    'status',report.status,
    'resolution_note',report.resolution_note,
    'resolved_by',report.resolved_by,
    'resolver_name',coalesce(resolver.full_name,resolver.username),
    'resolved_at',report.resolved_at,
    'created_at',report.created_at,
    'updated_at',report.updated_at,
    'focus',jsonb_strip_nulls(jsonb_build_object(
      'document_id',report.document_id,
      'item_id',report.item_id,
      'exam_id',report.exam_id,
      'source_ordinal',report.source_ordinal,
      'exam_sort',report.exam_sort,
      'legacy_code',item.legacy_code
    )),
    'deep_link','quan-tri-de?tab=bank&bank_view=repository&bank_report='
      ||report.id::text||'#bank-repository'
  ) into v_result
  from private.vm_question_bank_issue_reports report
  left join public.profiles reporter on reporter.id=report.reported_by
  left join public.profiles resolver on resolver.id=report.resolved_by
  left join private.vm_question_bank_items item on item.id=report.item_id
  where report.id=p_report_id;

  if v_result is null then
    raise exception 'bank_issue_report_not_found' using errcode='P0002';
  end if;
  return v_result;
end;
$function$;

revoke all on function public.vm_bank_admin_issue_report(uuid)
  from public, anon;
grant execute on function public.vm_bank_admin_issue_report(uuid)
  to authenticated;

create or replace function public.vm_bank_admin_resolve_issue(
  p_report_id uuid,
  p_status text,
  p_resolution_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_actor uuid:=auth.uid();
  v_status text:=lower(trim(coalesce(p_status,'')));
  v_note text:=nullif(trim(coalesce(p_resolution_note,'')),'');
  v_report private.vm_question_bank_issue_reports%rowtype;
  v_previous_status text;
begin
  if v_actor is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;
  if v_status not in ('open','in_review','resolved','dismissed') then
    raise exception 'bank_issue_status_invalid' using errcode='22023';
  end if;
  if v_note is not null and char_length(v_note)>2000 then
    raise exception 'bank_issue_resolution_note_invalid' using errcode='22023';
  end if;

  select * into v_report
  from private.vm_question_bank_issue_reports report
  where report.id=p_report_id
  for update;
  if v_report.id is null then
    raise exception 'bank_issue_report_not_found' using errcode='P0002';
  end if;
  v_previous_status:=v_report.status;

  update private.vm_question_bank_issue_reports report
  set status=v_status,
      resolution_note=coalesce(v_note,report.resolution_note),
      resolved_by=case when v_status in ('resolved','dismissed') then v_actor else null end,
      resolved_at=case when v_status in ('resolved','dismissed') then now() else null end,
      updated_at=now()
  where report.id=p_report_id
  returning * into v_report;

  if v_status in ('resolved','dismissed') and v_previous_status<>v_status then
    insert into public.notifications(user_id,title,body,link,kind)
    values (
      v_report.reported_by,
      case when v_status='resolved'
        then '✅ Báo lỗi Ngân hàng đề đã được xử lý'
        else '🔎 Báo lỗi Ngân hàng đề đã được xem xét' end,
      left(coalesce(v_note,'Cảm ơn thầy/cô đã gửi phản hồi.'),500),
      'quan-tri-de?tab=bank#bank-overview',
      'bank_issue_'||v_status
    );
  end if;

  return jsonb_build_object(
    'ok',true,'report_id',v_report.id,'status',v_report.status,
    'resolved_at',v_report.resolved_at,'updated_at',v_report.updated_at
  );
end;
$function$;

revoke all on function public.vm_bank_admin_resolve_issue(uuid,text,text)
  from public, anon;
grant execute on function public.vm_bank_admin_resolve_issue(uuid,text,text)
  to authenticated;
