-- Sanitized staff previews for bank source documents and bank-backed exams.
--
-- These RPCs intentionally return the same small JSON contract used by both
-- the instant HTML renderer and the PDF compiler. They never return canonical
-- item IDs, taxonomy, source metadata, answer keys, raw TeX or solutions.

create or replace function private.vm_bank_preview_choices(
  p_question_type text,
  p_choices jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_choices jsonb := coalesce(p_choices,'[]'::jsonb);
  v_result jsonb;
begin
  -- Even an old/malformed short-answer row must never put its answer in the
  -- preview payload. Keep the one empty field expected by the renderer.
  if p_question_type='short_answer' then
    return jsonb_build_array(jsonb_build_object('key','short','latex',''));
  end if;
  if jsonb_typeof(v_choices)<>'array' then
    return '[]'::jsonb;
  end if;

  -- Build a strict allow-list rather than trying to blacklist every possible
  -- answer field that a future importer could add. Also remove a stray \True
  -- marker if a historical public_choices row was not normalized correctly.
  select coalesce(jsonb_agg(jsonb_build_object(
    'key',case
      when jsonb_typeof(choice_value)='object'
        then coalesce(choice_value->>'key',choice_value->>'label','')
      else ''
    end,
    'latex',replace(case
      when jsonb_typeof(choice_value)='object'
        then coalesce(choice_value->>'latex',choice_value->>'tex','')
      else coalesce(choice_value#>>'{}','')
    end,E'\\True','')
  ) order by choice_ordinal),'[]'::jsonb)
  into v_result
  from jsonb_array_elements(v_choices)
    with ordinality choices(choice_value,choice_ordinal);

  return v_result;
end;
$function$;

revoke all on function private.vm_bank_preview_choices(text,jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.vm_bank_preview_content(p_content text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_content text;
begin
  v_content := public.vm_strip_latex_solutions(coalesce(p_content,''));
  -- Corpus classification comments such as %[1D6N2-3] are operational IDs,
  -- not part of the mathematical statement shown to a teacher. Remove the
  -- complete comment line so any corpus-only marker after the ID cannot be
  -- activated accidentally when the leading comment is stripped.
  return regexp_replace(v_content,E'%\\[[^\\r\\n]*\\][^\\r\\n]*(\\r?\\n|$)',E'\\1','g');
end;
$function$;

revoke all on function private.vm_bank_preview_content(text)
  from public, anon, authenticated, service_role;

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

  select d.title
  into v_title
  from private.vm_question_bank_documents d
  where d.id=p_document_id
    and d.source_kind='mock_exam'
    and d.status='active';

  if v_title is null then
    raise exception 'bank_source_exam_not_found' using errcode='P0002';
  end if;

  select count(*)::integer
  into v_question_count
  from private.vm_question_bank_item_sources source_item
  join private.vm_question_bank_items bank_item
    on bank_item.id=source_item.item_id
   and bank_item.status='active'
  where source_item.document_id=p_document_id;

  if v_question_count>200 then
    raise exception 'bank_source_exam_question_limit_exceeded' using errcode='22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sort',source_item.source_ordinal,
    'question_type',bank_item.question_type,
    -- Strip any accidentally embedded \loigiai block as defense in depth;
    -- the canonical raw source and extracted solution never leave private.
    'content_latex',private.vm_bank_preview_content(bank_item.content_latex),
    'choices',private.vm_bank_preview_choices(
      bank_item.question_type,bank_item.public_choices
    )
  ) order by source_item.source_ordinal),'[]'::jsonb)
  into v_questions
  from private.vm_question_bank_item_sources source_item
  join private.vm_question_bank_items bank_item
    on bank_item.id=source_item.item_id
   and bank_item.status='active'
  where source_item.document_id=p_document_id;

  return jsonb_build_object(
    'title',v_title,
    'question_count',v_question_count,
    'questions',v_questions
  );
end;
$function$;

revoke all on function public.vm_bank_source_exam_preview(uuid)
  from public, anon;
grant execute on function public.vm_bank_source_exam_preview(uuid)
  to authenticated, service_role;

create or replace function public.vm_bank_exam_preview(
  p_exam_id uuid
)
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

  select exam.*
  into v_exam
  from public.exams exam
  where exam.id=p_exam_id
    and private.vm_bank_exam_is_protected(
      exam.id,exam.bank_generated,exam.source_bank_document_id
    );

  if v_exam.id is null then
    raise exception 'bank_exam_not_found' using errcode='P0002';
  end if;

  -- Admin may inspect every bank-backed exam. A teacher must own the exact
  -- class/portal scope checked by vm_bank_can_manage_exam; a random UUID is
  -- never sufficient to preview somebody else's exam.
  if not public.is_admin()
     and not private.vm_bank_can_manage_exam(p_exam_id) then
    raise exception 'bank_exam_preview_access_denied' using errcode='42501';
  end if;

  select count(*)::integer
  into v_question_count
  from private.vm_question_bank_exam_occurrences occurrence
  join private.vm_question_bank_items bank_item
    on bank_item.id=occurrence.item_id
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
  join private.vm_question_bank_items bank_item
    on bank_item.id=occurrence.item_id
  where occurrence.exam_id=p_exam_id;

  return jsonb_build_object(
    'title',v_exam.title,
    'question_count',v_question_count,
    'questions',v_questions
  );
end;
$function$;

revoke all on function public.vm_bank_exam_preview(uuid)
  from public, anon;
grant execute on function public.vm_bank_exam_preview(uuid)
  to authenticated, service_role;
