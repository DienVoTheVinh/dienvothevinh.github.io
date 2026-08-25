-- Secure question bank, source-exam catalogue, generated exams and adaptive recovery.
--
-- Security model:
--   * Raw TeX, provenance paths, canonical source and answer keys live only in
--     the private schema. No client role receives table privileges there.
--   * Admins import/classify and may inspect raw source through guarded RPCs.
--   * Teachers may only search sanitized items, generate an exam, or assign a
--     sanitized source exam to a class they manage.
--   * Students cannot browse the bank. They only receive sanitized questions
--     through the existing exam RPCs and sanitized recommendations after submit.
--
-- Legacy public.questions rows keep their current behaviour. Bank-backed rows
-- are deliberately answer-free snapshots; their answer and solution remain in
-- private.vm_question_bank_items and are used only by security-definer helpers.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Both extensions are relocatable. Keep their namespace deterministic even on
-- databases where an older manual install put them in `public`; every function
-- and operator class below is deliberately schema-qualified.
do $migration$
declare
  v_extension text;
begin
  foreach v_extension in array array['pgcrypto','pg_trgm'] loop
    if exists (
      select 1
      from pg_catalog.pg_extension e
      join pg_catalog.pg_namespace n on n.oid=e.extnamespace
      where e.extname=v_extension and n.nspname<>'extensions'
    ) then
      execute format('alter extension %I set schema extensions',v_extension);
    end if;
  end loop;
end;
$migration$;

alter table public.exams
  add column if not exists owner_student_id uuid references public.profiles(id) on delete cascade,
  add column if not exists source_attempt_id uuid references public.attempts(id) on delete set null,
  add column if not exists source_bank_document_id uuid,
  add column if not exists bank_generated boolean not null default false,
  add column if not exists generation_spec jsonb not null default '{}'::jsonb,
  add column if not exists generated_by uuid references public.profiles(id) on delete set null;

create index if not exists exams_owner_student_created_idx
  on public.exams(owner_student_id, created_at desc)
  where owner_student_id is not null;
create unique index if not exists exams_one_recovery_per_attempt_idx
  on public.exams(owner_student_id, source_attempt_id)
  where owner_student_id is not null and source_attempt_id is not null;
create index if not exists exams_source_bank_document_idx
  on public.exams(source_bank_document_id)
  where source_bank_document_id is not null;

-- Every student-facing exam consumer was moved to vm_exam_catalog/vm_exam_load
-- in 20260824074535. Remove the two legacy direct-read policies again here
-- because older production histories may still contain them. In particular,
-- a published owner-only recovery exam must not expose its composition through
-- public.exam_questions. Portal reads stay governed by their existing policy.
drop policy if exists s_eq on public.exam_questions;
drop policy if exists t_eq_read on public.exam_questions;

create table if not exists private.vm_question_bank_documents (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  content_hash text not null unique,
  source_kind text not null default 'topic_pack'
    check (source_kind in ('topic_pack','mock_exam','manual','other')),
  title text not null,
  province text,
  exam_year integer check (exam_year is null or exam_year between 1990 and 2100),
  exam_kind text,
  tags text[] not null default '{}'::text[],
  original_filename text,
  raw_tex text not null,
  metadata jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','quarantined','archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.vm_question_bank_items (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  canonical_hash text not null unique,
  client_canonical_hash text,
  legacy_code text,
  question_type text not null
    check (question_type in ('multiple_choice','true_false','short_answer','essay')),
  difficulty text not null default 'TH'
    check (difficulty in ('NB','TH','VD','VDC')),
  grade smallint check (grade is null or grade between 1 and 12),
  similarity_key text,
  taxonomy jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}'::text[],
  content_latex text not null,
  public_choices jsonb not null default '[]'::jsonb,
  answer_key jsonb not null default '{}'::jsonb,
  solution_latex text,
  raw_tex text not null,
  canonical_tex text not null,
  asset_refs jsonb not null default '[]'::jsonb,
  snapshot_question_id uuid not null unique references public.questions(id) on delete restrict,
  status text not null default 'quarantined'
    check (status in ('active','quarantined','archived')),
  quarantine_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Canonical ID catalogue used by the future admin TeX-ID wizard. Keys follow
-- the corpus convention (for example 0D8?2-1); the cognitive-level character
-- is intentionally replaced by `?` so one entry represents a skill family.
create table if not exists private.vm_question_bank_taxonomy (
  taxonomy_key text primary key,
  grade smallint not null check (grade between 10 and 12),
  grade_code text not null check (grade_code in ('0','1','2')),
  area text not null,
  chapter integer not null check (chapter >= 0),
  topic_code text not null,
  skill integer not null check (skill >= 0),
  skill_family text not null,
  variant text not null,
  -- The source catalogue stores structured labels such as
  -- {chap_name,lesson_name,type_name}. Keep that structure queryable instead
  -- of flattening it into a JSON-looking text value.
  vi_label jsonb not null default '{}'::jsonb,
  slug_label jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Forward-compatible with an unpublished/partially applied draft that used
-- text columns for labels. `to_jsonb` preserves current JSON objects and wraps
-- an old scalar label into the `type_name` field expected by the catalogue.
alter table private.vm_question_bank_taxonomy
  alter column vi_label drop default,
  alter column slug_label drop default;
alter table private.vm_question_bank_taxonomy
  alter column vi_label type jsonb using (
    case
      when pg_catalog.jsonb_typeof(pg_catalog.to_jsonb(vi_label))='object'
        then pg_catalog.to_jsonb(vi_label)
      when nullif(btrim(pg_catalog.to_jsonb(vi_label)#>>'{}'),'') is not null
        then pg_catalog.jsonb_build_object('type_name',pg_catalog.to_jsonb(vi_label)#>>'{}')
      else '{}'::jsonb
    end
  ),
  alter column slug_label type jsonb using (
    case
      when pg_catalog.jsonb_typeof(pg_catalog.to_jsonb(slug_label))='object'
        then pg_catalog.to_jsonb(slug_label)
      when nullif(btrim(pg_catalog.to_jsonb(slug_label)#>>'{}'),'') is not null
        then pg_catalog.jsonb_build_object('type_name',pg_catalog.to_jsonb(slug_label)#>>'{}')
      else '{}'::jsonb
    end
  );
alter table private.vm_question_bank_taxonomy
  alter column vi_label set default '{}'::jsonb,
  alter column slug_label set default '{}'::jsonb;

create table if not exists private.vm_question_bank_item_sources (
  document_id uuid not null references private.vm_question_bank_documents(id) on delete cascade,
  item_id uuid not null references private.vm_question_bank_items(id) on delete cascade,
  source_ordinal integer not null check (source_ordinal >= 0),
  source_legacy_code text,
  source_location text,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (document_id, source_ordinal)
);

create table if not exists private.vm_question_bank_recommendations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  source_item_id uuid not null references private.vm_question_bank_items(id) on delete cascade,
  recommended_item_id uuid not null references private.vm_question_bank_items(id) on delete cascade,
  score integer not null,
  reason text not null,
  status text not null default 'ready' check (status in ('ready','used','dismissed')),
  created_at timestamptz not null default now(),
  unique (attempt_id, source_item_id, recommended_item_id),
  check (source_item_id <> recommended_item_id)
);

create table if not exists private.vm_question_bank_exam_specs (
  exam_id uuid primary key references public.exams(id) on delete cascade,
  mode text not null check (mode in ('blueprint','clone_source','source_exam','recovery')),
  seed text,
  spec jsonb not null default '{}'::jsonb,
  source_document_id uuid references private.vm_question_bank_documents(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Re-running this migration after the earlier draft must also widen the check.
alter table private.vm_question_bank_exam_specs
  drop constraint if exists vm_question_bank_exam_specs_mode_check;
alter table private.vm_question_bank_exam_specs
  add constraint vm_question_bank_exam_specs_mode_check
  check (mode in ('blueprint','clone_source','source_exam','recovery'));

-- A source exam may intentionally contain the same canonical item more than
-- once. public.exam_questions uses (exam_id, question_id) as its primary key,
-- so repeated occurrences receive opaque per-exam question snapshots and are
-- mapped back to their single canonical private item here.
create table if not exists private.vm_question_bank_exam_occurrences (
  exam_id uuid not null references public.exams(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  item_id uuid not null references private.vm_question_bank_items(id) on delete restrict,
  sort integer not null check (sort >= 0),
  source_document_id uuid references private.vm_question_bank_documents(id) on delete set null,
  source_ordinal integer check (source_ordinal is null or source_ordinal >= 0),
  is_clone boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (exam_id, sort),
  unique (exam_id, question_id),
  foreign key (exam_id, question_id)
    references public.exam_questions(exam_id, question_id) on delete cascade
);

alter table public.exams
  drop constraint if exists exams_source_bank_document_id_fkey;
alter table public.exams
  add constraint exams_source_bank_document_id_fkey
  foreign key (source_bank_document_id)
  references private.vm_question_bank_documents(id) on delete set null;

create index if not exists vm_qb_items_filter_idx
  on private.vm_question_bank_items(status, grade, question_type, difficulty);
create index if not exists vm_qb_items_active_catalog_idx
  on private.vm_question_bank_items(legacy_code nulls last,created_at,id)
  where status='active';
create index if not exists vm_qb_taxonomy_route_idx
  on private.vm_question_bank_taxonomy(grade,area,chapter,skill,variant);
create index if not exists vm_qb_items_active_content_trgm_idx
  on private.vm_question_bank_items
  using gin (lower(content_latex) extensions.gin_trgm_ops)
  where status='active';
create index if not exists vm_qb_items_tags_idx
  on private.vm_question_bank_items using gin(tags);
create index if not exists vm_qb_items_legacy_idx
  on private.vm_question_bank_items(legacy_code text_pattern_ops)
  where legacy_code is not null;
create index if not exists vm_qb_items_similarity_idx
  on private.vm_question_bank_items(similarity_key, question_type, difficulty)
  where status = 'active';
create index if not exists vm_qb_items_skill_family_idx
  on private.vm_question_bank_items(
    (coalesce(taxonomy->>'skill_family',split_part(similarity_key,'-',1))),
    question_type,difficulty
  ) where status='active';
create index if not exists vm_qb_sources_item_idx
  on private.vm_question_bank_item_sources(item_id, document_id);
create index if not exists vm_qb_documents_catalog_idx
  on private.vm_question_bank_documents(source_kind,status,exam_year,created_at desc);
create index if not exists vm_qb_documents_tags_idx
  on private.vm_question_bank_documents using gin(tags);
create index if not exists vm_qb_recommendations_student_idx
  on private.vm_question_bank_recommendations(student_id, attempt_id, status, score desc);
create index if not exists vm_qb_recommendations_source_idx
  on private.vm_question_bank_recommendations(source_item_id);
create index if not exists vm_qb_recommendations_recommended_idx
  on private.vm_question_bank_recommendations(recommended_item_id);
create index if not exists vm_qb_exam_specs_source_idx
  on private.vm_question_bank_exam_specs(source_document_id)
  where source_document_id is not null;
create index if not exists vm_qb_exam_occurrences_item_idx
  on private.vm_question_bank_exam_occurrences(item_id, exam_id);
create index if not exists vm_qb_exam_occurrences_question_idx
  on private.vm_question_bank_exam_occurrences(question_id);
create unique index if not exists vm_qb_exam_occurrences_source_ordinal_idx
  on private.vm_question_bank_exam_occurrences(exam_id,source_document_id,source_ordinal)
  where source_document_id is not null and source_ordinal is not null;

alter table private.vm_question_bank_documents enable row level security;
alter table private.vm_question_bank_items enable row level security;
alter table private.vm_question_bank_taxonomy enable row level security;
alter table private.vm_question_bank_item_sources enable row level security;
alter table private.vm_question_bank_recommendations enable row level security;
alter table private.vm_question_bank_exam_specs enable row level security;
alter table private.vm_question_bank_exam_occurrences enable row level security;

revoke all on table
  private.vm_question_bank_documents,
  private.vm_question_bank_items,
  private.vm_question_bank_taxonomy,
  private.vm_question_bank_item_sources,
  private.vm_question_bank_recommendations,
  private.vm_question_bank_exam_specs,
  private.vm_question_bank_exam_occurrences
from public, anon, authenticated, service_role;

create or replace function private.vm_bank_target_is_manageable(
  p_class_id uuid,
  p_portal_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
  select auth.uid() is not null
    and public.is_teacher()
    and (
      (p_class_id is null and p_portal_id is null and public.is_admin())
      or (
        p_class_id is null and p_portal_id is not null
        and private.can_manage_exam_portal(p_portal_id)
      )
      or exists (
        select 1
        from public.classes c
        where c.id=p_class_id
          and (
            (
              c.portal_id is null and p_portal_id is null
              and public.can_manage_class(c.id)
            )
            or (
              c.portal_id is not null and p_portal_id=c.portal_id
              and private.can_manage_exam_portal(c.portal_id)
            )
          )
      )
    );
$function$;

create or replace function private.vm_bank_can_manage_exam(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
  select exists (
    select 1 from public.exams e
    where e.id=p_exam_id
      and private.vm_bank_target_is_manageable(e.class_id,e.portal_id)
  );
$function$;

create or replace function private.vm_bank_direct_question_allowed(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
  select public.is_admin() or not (
    exists(select 1 from private.vm_question_bank_items i where i.snapshot_question_id=p_question_id)
    or exists(select 1 from private.vm_question_bank_exam_occurrences o where o.question_id=p_question_id)
  );
$function$;

create or replace function private.vm_bank_exam_is_protected(
  p_exam_id uuid,
  p_bank_generated boolean,
  p_source_document_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $function$
  select coalesce(p_bank_generated,false)
    or p_source_document_id is not null
    or exists(select 1 from private.vm_question_bank_exam_specs s where s.exam_id=p_exam_id)
    or exists(select 1 from private.vm_question_bank_exam_occurrences o where o.exam_id=p_exam_id);
$function$;

create or replace function private.vm_bank_direct_exam_allowed(
  p_exam_id uuid,
  p_bank_generated boolean,
  p_source_document_id uuid,
  p_class_id uuid,
  p_portal_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
  select not private.vm_bank_exam_is_protected(
      p_exam_id,p_bank_generated,p_source_document_id
    )
    or private.vm_bank_target_is_manageable(p_class_id,p_portal_id);
$function$;

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
    select 1 from public.exams e
    where e.id=p_exam_id
      and case
        when private.vm_bank_exam_is_protected(
          e.id,e.bank_generated,e.source_bank_document_id
        ) then private.vm_bank_target_is_manageable(e.class_id,e.portal_id)
        when not private.vm_bank_direct_question_allowed(p_question_id) then public.is_admin()
        else true
      end
  );
$function$;

create or replace function private.vm_bank_question_item_id(
  p_exam_id uuid,
  p_question_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public, private, pg_temp
as $function$
  select coalesce(
    (select o.item_id
     from private.vm_question_bank_exam_occurrences o
     where o.exam_id=p_exam_id and o.question_id=p_question_id),
    (select i.id
     from private.vm_question_bank_items i
     where i.snapshot_question_id=p_question_id)
  );
$function$;

revoke all on function private.vm_bank_target_is_manageable(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_can_manage_exam(uuid) from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_direct_question_allowed(uuid) from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_exam_is_protected(uuid,boolean,uuid) from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_direct_exam_allowed(uuid,boolean,uuid,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_direct_exam_question_allowed(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_question_item_id(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function private.vm_bank_direct_question_allowed(uuid) to anon, authenticated;
grant execute on function private.vm_bank_direct_exam_allowed(uuid,boolean,uuid,uuid,uuid) to anon, authenticated;
grant execute on function private.vm_bank_direct_exam_question_allowed(uuid,uuid) to anon, authenticated;

-- Legacy question CRUD remains available to teachers, while every bank-backed
-- snapshot (including duplicate source-exam clones) is direct-table admin-only.
drop policy if exists questions_bank_direct_scope on public.questions;
create policy questions_bank_direct_scope
on public.questions as restrictive for all to anon, authenticated
using ((select private.vm_bank_direct_question_allowed(id)))
with check ((select private.vm_bank_direct_question_allowed(id)));

-- Preserve legacy exam rows, but require exact class/portal ownership for any
-- bank-generated row. This restrictive policy also neutralizes permissive
-- legacy policies that might still exist in a drifted production history.
drop policy if exists exams_bank_direct_scope on public.exams;
create policy exams_bank_direct_scope
on public.exams as restrictive for all to anon, authenticated
using ((select private.vm_bank_direct_exam_allowed(
  id,bank_generated,source_bank_document_id,class_id,portal_id
)))
with check ((select private.vm_bank_direct_exam_allowed(
  id,bank_generated,source_bank_document_id,class_id,portal_id
)));

drop policy if exists exam_questions_bank_direct_scope on public.exam_questions;
create policy exam_questions_bank_direct_scope
on public.exam_questions as restrictive for all to anon, authenticated
using ((select private.vm_bank_direct_exam_question_allowed(exam_id,question_id)))
with check ((select private.vm_bank_direct_exam_question_allowed(exam_id,question_id)));

drop policy if exists exam_questions_staff_read on public.exam_questions;
create policy exam_questions_staff_read
on public.exam_questions for select to authenticated
using (
  (select public.is_staff())
  and (select private.vm_bank_direct_exam_question_allowed(exam_id,question_id))
);

-- `vm_exam_save_answer` grades on the server before submission. Historical
-- permissive policies on attempt_answers (including portal-manager and
-- is_staff policies) must therefore never turn `is_correct` into an oracle.
-- Protected bank rows are RPC-only for every non-admin; legacy rows remain
-- compatible, but become directly readable only after the attempt is final.
create or replace function private.vm_bank_attempt_answer_is_protected(
  p_attempt_id uuid,
  p_question_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $function$
  select exists (
    select 1
    from public.attempts a
    join public.exams e on e.id=a.exam_id
    where a.id=p_attempt_id
      and private.vm_bank_exam_is_protected(
        e.id,e.bank_generated,e.source_bank_document_id
      )
  )
  or exists (
    select 1 from private.vm_question_bank_items i
    where i.snapshot_question_id=p_question_id
  )
  or exists (
    select 1 from private.vm_question_bank_exam_occurrences o
    where o.question_id=p_question_id
  );
$function$;

create or replace function private.vm_attempt_answer_result_read_allowed(
  p_attempt_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
  select public.is_admin() or exists (
    select 1
    from public.attempts a
    where a.id=p_attempt_id
      and a.submitted_at is not null
      and (
        a.student_id=auth.uid()
        or public.is_staff()
        or private.can_access_portal_attempt(a.id)
      )
  );
$function$;

revoke all on function private.vm_bank_attempt_answer_is_protected(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.vm_attempt_answer_result_read_allowed(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.vm_bank_attempt_answer_is_protected(uuid,uuid)
  to authenticated;
grant execute on function private.vm_attempt_answer_result_read_allowed(uuid)
  to authenticated;

drop policy if exists attempt_answers_bank_direct_scope on public.attempt_answers;
create policy attempt_answers_bank_direct_scope
on public.attempt_answers as restrictive for all to authenticated
using (
  (select public.is_admin())
  or not (select private.vm_bank_attempt_answer_is_protected(attempt_id,question_id))
)
with check (
  (select public.is_admin())
  or not (select private.vm_bank_attempt_answer_is_protected(attempt_id,question_id))
);

drop policy if exists attempt_answers_result_read_scope on public.attempt_answers;
create policy attempt_answers_result_read_scope
on public.attempt_answers as restrictive for select to authenticated
using ((select private.vm_attempt_answer_result_read_allowed(attempt_id)));

create or replace function private.vm_bank_cleanup_exam_clones()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, private, pg_temp
as $function$
begin
  delete from public.questions q
  using private.vm_question_bank_exam_occurrences o
  where o.exam_id=old.id and o.is_clone and q.id=o.question_id;
  return old;
end;
$function$;

revoke all on function private.vm_bank_cleanup_exam_clones() from public, anon, authenticated, service_role;
drop trigger if exists trg_vm_bank_cleanup_exam_clones on public.exams;
create trigger trg_vm_bank_cleanup_exam_clones
before delete on public.exams
for each row execute function private.vm_bank_cleanup_exam_clones();

create or replace function private.vm_bank_public_choices(p_type text, p_choices jsonb)
returns jsonb
language plpgsql
immutable
set search_path = private, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if p_type = 'short_answer' then
    return jsonb_build_array(jsonb_build_object('key','short','latex',''));
  end if;
  if jsonb_typeof(p_choices) <> 'array' then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key', case
      when p_type = 'true_false' then chr(96 + c.ordinality::integer)
      else coalesce(nullif(c.value->>'label',''), chr(64 + c.ordinality::integer))
    end,
    'latex', coalesce(c.value->>'tex', c.value->>'latex', '')
  ) order by c.ordinality), '[]'::jsonb)
  into v_result
  from jsonb_array_elements(p_choices) with ordinality c(value, ordinality);
  return v_result;
end;
$function$;

create or replace function private.vm_bank_answer_from_item(p_item jsonb, p_type text, p_choices jsonb)
returns jsonb
language plpgsql
immutable
set search_path = private, pg_temp
as $function$
declare
  v_answer jsonb := coalesce(p_item->'answer', '{}'::jsonb);
  v_indexes jsonb;
begin
  if p_type = 'short_answer' then
    if coalesce(v_answer->>'value','') = '' then
      v_answer := jsonb_build_object(
        'value', coalesce(p_item->>'short_answer',''),
        'option', coalesce(p_item->>'short_answer_option','')
      );
    end if;
    return v_answer;
  end if;

  if jsonb_typeof(v_answer->'correct_indexes') = 'array' then return v_answer; end if;
  if jsonb_typeof(p_item->'correct_choice_indexes') = 'array' then
    return jsonb_build_object('correct_indexes', p_item->'correct_choice_indexes');
  end if;
  select coalesce(jsonb_agg((c.ordinality - 1)::integer order by c.ordinality), '[]'::jsonb)
  into v_indexes
  from jsonb_array_elements(coalesce(p_choices,'[]'::jsonb)) with ordinality c(value, ordinality)
  where lower(coalesce(c.value->>'correct','false')) = 'true';
  return jsonb_build_object('correct_indexes', v_indexes);
end;
$function$;

-- The legacy corpus contains equivalent short answers in several TeX forms,
-- for example `$5{,}93$`, `0,813`, `142,4` and `a=1.`. Keep the raw private
-- answer intact for provenance, but compare and reveal a deterministic form.
create or replace function private.vm_bank_normalize_short_answer(p_value text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_value text := lower(coalesce(p_value,''));
begin
  v_value := replace(replace(replace(v_value,'−','-'),'–','-'),'—','-');
  v_value := replace(replace(replace(replace(v_value,E'\\(',''),E'\\)',''),E'\\[',''),E'\\]','');
  v_value := regexp_replace(
    v_value,
    E'\\\\(left|right|text|mathrm|mathbf|mathit|operatorname|boxed|ensuremath)',
    '',
    'g'
  );
  v_value := regexp_replace(v_value,E'\\\\(,|;|!|quad|qquad)','','g');
  v_value := replace(replace(replace(v_value,'$',''),'{',''),'}','');
  v_value := replace(v_value,',','.');
  v_value := regexp_replace(v_value,E'\\s+','','g');
  v_value := regexp_replace(v_value,'[.;:!?]+$','','g');
  return v_value;
end;
$function$;

-- Full pedagogical IDs are editable classifications, not immutable question
-- identities. Validate them centrally so imports, the admin wizard and later
-- API clients cannot silently create incompatible taxonomies.
create or replace function private.vm_bank_taxonomy_key_from_legacy(p_code text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $function$
declare v_parts text[];
begin
  v_parts:=regexp_match(
    upper(trim(coalesce(p_code,''))),
    '^([012])([A-Z])([0-9]+)([NBYHTVKGC])([0-9]+)-([A-Z0-9-]+)$'
  );
  if v_parts is null then return null; end if;
  return v_parts[1]||v_parts[2]||v_parts[3]||'?'||v_parts[5]||'-'||v_parts[6];
end;
$function$;

create or replace function private.vm_bank_difficulty_from_legacy(p_code text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $function$
declare v_parts text[];
begin
  v_parts:=regexp_match(
    upper(trim(coalesce(p_code,''))),
    '^([012])([A-Z])([0-9]+)([NBYHTVKGC])([0-9]+)-([A-Z0-9-]+)$'
  );
  if v_parts is null then return null; end if;
  return case
    when v_parts[4] in ('N','B','Y') then 'NB'
    when v_parts[4] in ('H','T') then 'TH'
    when v_parts[4] in ('V','K') then 'VD'
    else 'VDC'
  end;
end;
$function$;

create or replace function private.vm_bank_item_matches(
  p_item private.vm_question_bank_items,
  p_filters jsonb default '{}'::jsonb
)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $function$
  select case when coalesce(p_filters->>'grade','') ~ '^[0-9]{1,2}$'
      then (p_item).grade=(p_filters->>'grade')::smallint else true end
    and case when jsonb_typeof(p_filters->'grades')='array' and jsonb_array_length(p_filters->'grades')>0
      then (p_item).grade in (select value::smallint from jsonb_array_elements_text(p_filters->'grades') where value ~ '^[0-9]{1,2}$') else true end
    and case when jsonb_typeof(p_filters->'difficulties')='array' and jsonb_array_length(p_filters->'difficulties')>0
      then (p_item).difficulty in (select value from jsonb_array_elements_text(p_filters->'difficulties')) else true end
    and (
      nullif(p_filters->>'difficulty','') is null
      or (p_item).difficulty = p_filters->>'difficulty'
    )
    and case when jsonb_typeof(p_filters->'question_types')='array' and jsonb_array_length(p_filters->'question_types')>0
      then (p_item).question_type in (select value from jsonb_array_elements_text(p_filters->'question_types')) else true end
    and (
      nullif(p_filters->>'question_type','') is null
      or (p_item).question_type = p_filters->>'question_type'
    )
    and (
      nullif(p_filters->>'legacy_prefix','') is null
      or (p_item).legacy_code ilike replace(replace(p_filters->>'legacy_prefix','%',E'\\%'),'_',E'\\_') || '%' escape E'\\'
    )
    and case when jsonb_typeof(p_filters->'taxonomy_codes')='array' and jsonb_array_length(p_filters->'taxonomy_codes')>0 then exists (
        select 1 from jsonb_array_elements_text(p_filters->'taxonomy_codes') t(code)
        where (p_item).legacy_code ilike replace(replace(t.code,'%',E'\\%'),'_',E'\\_') || '%' escape E'\\'
           or (p_item).similarity_key = t.code
      ) else true end
    and case when jsonb_typeof(p_filters->'source_kinds')='array' and jsonb_array_length(p_filters->'source_kinds')>0 then exists (
        select 1
        from private.vm_question_bank_item_sources src
        join private.vm_question_bank_documents d on d.id = src.document_id
        where src.item_id = (p_item).id
          and d.source_kind in (select value from jsonb_array_elements_text(p_filters->'source_kinds'))
      ) else true end
    and case when jsonb_typeof(p_filters->'tags')='array' and jsonb_array_length(p_filters->'tags')>0
      then (p_item).tags && array(select value from jsonb_array_elements_text(p_filters->'tags'))
      else true end;
$function$;

revoke all on function private.vm_bank_public_choices(text,jsonb) from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_answer_from_item(jsonb,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_normalize_short_answer(text) from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_taxonomy_key_from_legacy(text) from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_difficulty_from_legacy(text) from public, anon, authenticated, service_role;
revoke all on function private.vm_bank_item_matches(private.vm_question_bank_items,jsonb) from public, anon, authenticated, service_role;

create or replace function public.vm_bank_admin_import(
  p_document jsonb,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_document_id uuid;
  v_document_raw text := coalesce(p_document->>'raw_tex','');
  v_document_hash text;
  v_document_stable text;
  v_document_metadata jsonb := coalesce(p_document->'metadata','{}'::jsonb);
  v_document_tags text[] := '{}'::text[];
  v_document_exam_year integer;
  v_source_kind text := coalesce(nullif(p_document->>'source_kind',''),'topic_pack');
  v_item jsonb;
  v_item_id uuid;
  v_snapshot_id uuid;
  v_existing boolean;
  v_type text;
  v_difficulty text;
  v_grade smallint;
  v_taxonomy jsonb;
  v_taxonomy_entry private.vm_question_bank_taxonomy%rowtype;
  v_legacy_code text;
  v_taxonomy_key text;
  v_code_difficulty text;
  v_similarity_key text;
  v_content text;
  v_choices_source jsonb;
  v_public_choices jsonb;
  v_answer jsonb;
  v_raw text;
  v_canonical text;
  v_identity_text text;
  v_client_hash text;
  v_hash text;
  v_stable text;
  v_status text;
  v_reason text;
  v_assets jsonb;
  v_tags text[];
  v_ordinal integer;
  v_offset integer := greatest(coalesce(nullif(p_document->>'ordinal_offset','')::integer,0),0);
  v_total integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_quarantined integer := 0;
  v_linked integer := 0;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' then
    raise exception 'bank_items_must_be_array' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) > 250 then
    raise exception 'bank_import_chunk_too_large' using errcode = '22023';
  end if;
  if exists (
    select 1
    from (
      select greatest(coalesce(
        case when nullif(x.value->>'source_ordinal','') ~ '^-?[0-9]+$'
          then (x.value->>'source_ordinal')::integer end,
        case when nullif(x.value->>'source_index','') ~ '^-?[0-9]+$'
          then (x.value->>'source_index')::integer end,
        v_offset+x.ordinality::integer-1
      ),0) source_ordinal
      from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
        with ordinality x(value,ordinality)
    ) ordinals
    group by source_ordinal
    having count(*) > 1
  ) then
    raise exception 'bank_duplicate_source_ordinal' using errcode='22023';
  end if;
  if length(v_document_raw) > 30000000 then
    raise exception 'bank_document_too_large' using errcode = '22023';
  end if;
  if v_source_kind='tex_upload' then
    v_source_kind:=case when coalesce(v_document_metadata->>'exam_type','')='chapter'
      then 'topic_pack' else 'mock_exam' end;
  elsif v_source_kind not in ('topic_pack','mock_exam','manual','other') then
    v_source_kind := 'other';
  end if;

  if jsonb_typeof(coalesce(p_document->'tags',v_document_metadata->'tags')) = 'array' then
    select coalesce(array_agg(distinct trim(value)) filter (where trim(value) <> ''), '{}'::text[])
    into v_document_tags
    from jsonb_array_elements_text(coalesce(p_document->'tags',v_document_metadata->'tags'));
  end if;
  begin
    v_document_exam_year := nullif(coalesce(
      p_document->>'exam_year',v_document_metadata->>'exam_year'
    ),'')::integer;
    if v_document_exam_year not between 1990 and 2100 then
      v_document_exam_year := null;
    end if;
  exception when others then
    v_document_exam_year := null;
  end;

  if nullif(p_document->>'id','') is not null and v_document_raw = '' then
    select id into v_document_id
    from private.vm_question_bank_documents
    where id = (p_document->>'id')::uuid;
    if v_document_id is null then
      raise exception 'bank_document_not_found' using errcode = 'P0002';
    end if;
  else
    if v_document_raw = '' then
      raise exception 'bank_document_raw_tex_required' using errcode = '22023';
    end if;
    v_document_hash := encode(extensions.digest(convert_to(v_document_raw,'UTF8'),'sha256'),'hex');
    v_document_stable := 'QBD-' || upper(substr(v_document_hash,1,24));
    insert into private.vm_question_bank_documents(
      stable_id,content_hash,source_kind,title,province,exam_year,exam_kind,tags,
      original_filename,raw_tex,metadata,provenance,status,created_by,updated_at
    ) values (
      v_document_stable,
      v_document_hash,
      v_source_kind,
      left(coalesce(nullif(p_document->>'title',''),nullif(v_document_metadata->>'source_title',''),nullif(p_document->>'original_filename',''),'Nguồn TeX'),240),
      left(coalesce(nullif(p_document->>'province',''),nullif(v_document_metadata->>'province',''),nullif(v_document_metadata->>'province_or_unit','')),160),
      v_document_exam_year,
      left(coalesce(nullif(p_document->>'exam_kind',''),nullif(v_document_metadata->>'exam_kind',''),nullif(v_document_metadata->>'exam_type','')),160),
      v_document_tags,
      left(nullif(p_document->>'original_filename',''),500),
      v_document_raw,
      v_document_metadata,
      coalesce(p_document->'provenance','{}'::jsonb),
      case when p_document->>'status' in ('active','quarantined','archived') then p_document->>'status' else 'active' end,
      auth.uid(),
      now()
    )
    on conflict (content_hash) do update set
      title = excluded.title,
      source_kind = excluded.source_kind,
      province = coalesce(excluded.province, private.vm_question_bank_documents.province),
      exam_year = coalesce(excluded.exam_year, private.vm_question_bank_documents.exam_year),
      exam_kind = coalesce(excluded.exam_kind, private.vm_question_bank_documents.exam_kind),
      tags = case when cardinality(excluded.tags) > 0 then excluded.tags else private.vm_question_bank_documents.tags end,
      metadata = private.vm_question_bank_documents.metadata || excluded.metadata,
      provenance = private.vm_question_bank_documents.provenance || excluded.provenance,
      updated_at = now()
    returning id into v_document_id;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_total := v_total + 1;
    v_type := coalesce(nullif(v_item->>'question_type',''),nullif(v_item->>'type',''),'essay');
    v_difficulty := upper(coalesce(nullif(v_item->>'difficulty',''),'TH'));
    v_taxonomy := coalesce(v_item->'taxonomy',v_item->'id_info','{}'::jsonb);
    v_legacy_code := nullif(upper(trim(coalesce(v_item->>'legacy_code',v_item->>'question_id',''))),'');
    v_taxonomy_key := private.vm_bank_taxonomy_key_from_legacy(v_legacy_code);
    v_code_difficulty := private.vm_bank_difficulty_from_legacy(v_legacy_code);
    v_taxonomy_entry := null;
    if v_taxonomy_key is not null then
      select * into v_taxonomy_entry
      from private.vm_question_bank_taxonomy
      where taxonomy_key=v_taxonomy_key and status='active';
    end if;
    begin
      v_grade := nullif(coalesce(v_item->>'grade',v_taxonomy->>'grade'),'')::smallint;
    exception when others then
      v_grade := null;
    end;
    if v_taxonomy_key is not null then
      v_grade := case substr(v_legacy_code,1,1) when '0' then 10 when '1' then 11 when '2' then 12 end;
      v_difficulty := v_code_difficulty;
      if v_taxonomy_entry.taxonomy_key is not null then
        v_taxonomy := v_taxonomy || jsonb_build_object(
          'key',v_taxonomy_entry.taxonomy_key,
          'taxonomy_key',v_taxonomy_entry.taxonomy_key,
          'similarity_key',v_taxonomy_entry.taxonomy_key,
          'topic_code',v_taxonomy_entry.topic_code,
          'skill_family',v_taxonomy_entry.skill_family,
          'variant',v_taxonomy_entry.variant,
          'vi',v_taxonomy_entry.vi_label,
          'slug',v_taxonomy_entry.slug_label
        );
      end if;
    end if;
    v_similarity_key := nullif(trim(coalesce(
      v_taxonomy_key,v_item->>'similarity_key',v_taxonomy->>'similarity_key',''
    )), '');
    v_content := trim(coalesce(v_item->>'content_latex',v_item->>'content_tex',''));
    v_choices_source := coalesce(v_item->'choices','[]'::jsonb);
    v_public_choices := private.vm_bank_public_choices(v_type,v_choices_source);
    v_answer := private.vm_bank_answer_from_item(v_item,v_type,v_choices_source);
    v_raw := coalesce(nullif(v_item->>'raw_tex',''),nullif(v_item->>'canonical_tex',''),v_content);
    v_canonical := coalesce(nullif(v_item->>'canonical_tex',''),v_raw);
    v_client_hash := lower(trim(coalesce(v_item->>'canonical_hash','')));
    if v_client_hash !~ '^[0-9a-f]{16}([0-9a-f]{48})?$' then
      v_client_hash := null;
    end if;
    -- Client hashes are retained only as import diagnostics. Database identity
    -- is always a server-computed SHA-256 over the ID-independent canonical TeX,
    -- so short browser hashes can never collide into an existing bank item.
    v_identity_text := regexp_replace(v_canonical,E'%\\[[^]]+\\]','','g');
    v_identity_text := regexp_replace(trim(v_identity_text),E'\\s+',' ','g');
    v_hash := encode(extensions.digest(convert_to(v_identity_text,'UTF8'),'sha256'),'hex');
    v_stable := 'QB-' || upper(substr(v_hash,1,24));
    v_assets := coalesce(v_item->'assets',v_item->'asset_refs','[]'::jsonb);
    if jsonb_typeof(v_assets) not in ('array','object') then v_assets := '[]'::jsonb; end if;
    v_tags := '{}'::text[];
    if jsonb_typeof(v_item->'tags') = 'array' then
      select coalesce(array_agg(distinct trim(value)) filter (where trim(value) <> ''), '{}'::text[])
      into v_tags from jsonb_array_elements_text(v_item->'tags');
    end if;
    v_reason := null;

    if v_type not in ('multiple_choice','true_false','short_answer','essay') then
      v_reason := concat_ws('; ',v_reason,'Loại câu hỏi không được hỗ trợ');
      v_type := 'essay';
    end if;
    if v_difficulty not in ('NB','TH','VD','VDC') then
      v_reason := concat_ws('; ',v_reason,'Mức độ không hợp lệ');
      v_difficulty := 'TH';
    end if;
    if v_grade is not null and (v_grade < 1 or v_grade > 12) then
      v_reason := concat_ws('; ',v_reason,'Khối lớp không hợp lệ');
      v_grade := null;
    end if;
    if v_legacy_code is null then
      v_reason := concat_ws('; ',v_reason,'Chưa gắn ID phân loại');
    elsif v_taxonomy_key is null then
      v_reason := concat_ws('; ',v_reason,'ID phân loại sai chuẩn');
    elsif v_taxonomy_entry.taxonomy_key is null then
      v_reason := concat_ws('; ',v_reason,'ID phân loại chưa có trong danh mục');
    end if;
    if v_content = '' then
      v_reason := concat_ws('; ',v_reason,'Thiếu nội dung câu hỏi');
    end if;
    if v_type = 'essay' then
      v_reason := concat_ws('; ',v_reason,'Câu tự luận chưa có cơ chế chấm tự động');
    elsif v_type = 'multiple_choice' and (
      jsonb_array_length(v_public_choices) <> 4
      or jsonb_typeof(v_answer->'correct_indexes') <> 'array'
      or jsonb_array_length(v_answer->'correct_indexes') <> 1
      or exists(select 1 from jsonb_array_elements_text(v_answer->'correct_indexes') x(value)
        where x.value !~ '^[0-3]$')
    ) then
      v_reason := concat_ws('; ',v_reason,'Trắc nghiệm phải có 4 lựa chọn và đúng 1 đáp án');
    elsif v_type = 'true_false' and (
      jsonb_array_length(v_public_choices) <> 4
      or jsonb_typeof(v_answer->'correct_indexes') <> 'array'
      or exists(select 1 from jsonb_array_elements_text(v_answer->'correct_indexes') x(value)
        where x.value !~ '^[0-3]$')
    ) then
      v_reason := concat_ws('; ',v_reason,'Câu đúng/sai phải có 4 ý và khóa đáp án');
    elsif v_type = 'short_answer' and nullif(trim(v_answer->>'value'),'') is null then
      v_reason := concat_ws('; ',v_reason,'Câu trả lời ngắn thiếu đáp án');
    end if;
    if nullif(v_item->>'quarantine_reason','') is not null then
      v_reason := concat_ws('; ',v_reason,v_item->>'quarantine_reason');
    end if;
    v_status := case
      when v_item->>'status' = 'archived' then 'archived'
      when v_item->>'status' = 'quarantined' or v_reason is not null then 'quarantined'
      else 'active'
    end;

    select id,snapshot_question_id into v_item_id,v_snapshot_id
    from private.vm_question_bank_items where canonical_hash = v_hash;
    v_existing := found;

    if not v_existing then
      insert into public.questions(source_id,topic_id,difficulty,content_latex,choices,solution_latex,portal_id)
      values(v_stable,null,v_difficulty,'[Nội dung ngân hàng được bảo vệ]','[]'::jsonb,null,null)
      on conflict (source_id) do update set
        difficulty = excluded.difficulty,
        content_latex = '[Nội dung ngân hàng được bảo vệ]',
        choices = '[]'::jsonb,
        solution_latex = null
      returning id into v_snapshot_id;

      insert into private.vm_question_bank_items(
        stable_id,canonical_hash,client_canonical_hash,legacy_code,question_type,difficulty,grade,
        similarity_key,taxonomy,tags,content_latex,public_choices,answer_key,solution_latex,
        raw_tex,canonical_tex,asset_refs,snapshot_question_id,status,quarantine_reason,created_by,updated_at
      ) values (
        v_stable,v_hash,nullif(v_client_hash,''),v_legacy_code,v_type,v_difficulty,v_grade,
        v_similarity_key,v_taxonomy,v_tags,v_content,v_public_choices,v_answer,
        coalesce(v_item->>'solution_latex',v_item->>'solution_tex'),v_raw,v_canonical,v_assets,
        v_snapshot_id,v_status,v_reason,auth.uid(),now()
      ) returning id into v_item_id;
      v_inserted := v_inserted + 1;
    else
      update public.questions set
        difficulty = v_difficulty,
        content_latex = '[Nội dung ngân hàng được bảo vệ]',
        choices = '[]'::jsonb,
        solution_latex = null
      where id = v_snapshot_id;
      update private.vm_question_bank_items set
        client_canonical_hash = coalesce(nullif(v_client_hash,''),client_canonical_hash),
        legacy_code = coalesce(v_legacy_code,legacy_code),
        question_type = v_type,
        difficulty = v_difficulty,
        grade = coalesce(v_grade,grade),
        similarity_key = coalesce(v_similarity_key,similarity_key),
        taxonomy = taxonomy || v_taxonomy,
        tags = case when cardinality(v_tags) > 0 then v_tags else tags end,
        content_latex = v_content,
        public_choices = v_public_choices,
        answer_key = v_answer,
        solution_latex = coalesce(v_item->>'solution_latex',v_item->>'solution_tex'),
        raw_tex = v_raw,
        canonical_tex = v_canonical,
        asset_refs = v_assets,
        status = v_status,
        quarantine_reason = v_reason,
        updated_at = now()
      where id = v_item_id;
      v_updated := v_updated + 1;
    end if;

    begin
      v_ordinal := coalesce(
        nullif(v_item->>'source_ordinal','')::integer,
        nullif(v_item->>'source_index','')::integer,
        v_offset + v_total - 1
      );
    exception when others then
      v_ordinal := v_offset + v_total - 1;
    end;
    insert into private.vm_question_bank_item_sources(
      document_id,item_id,source_ordinal,source_legacy_code,source_location,source_metadata
    ) values (
      v_document_id,v_item_id,greatest(v_ordinal,0),v_legacy_code,
      left(coalesce(v_item->>'source_location',v_item->>'source_path'),1000),
      coalesce(v_item->'source_metadata','{}'::jsonb)
    )
    on conflict (document_id,source_ordinal) do update set
      item_id = excluded.item_id,
      source_legacy_code = excluded.source_legacy_code,
      source_location = excluded.source_location,
      source_metadata = excluded.source_metadata;
    v_linked := v_linked + 1;
    if v_status = 'quarantined' then v_quarantined := v_quarantined + 1; end if;
  end loop;

  update private.vm_question_bank_documents
  set updated_at = now(),
      status = case
        when exists (
          select 1 from private.vm_question_bank_item_sources s
          join private.vm_question_bank_items i on i.id=s.item_id
          where s.document_id=v_document_id and i.status='active'
        ) then status else 'quarantined' end
  where id=v_document_id;

  return jsonb_build_object(
    'document_id',v_document_id,'inserted',v_inserted,'updated',v_updated,
    'quarantined',v_quarantined,'linked',v_linked,'total',v_total
  );
end;
$function$;

revoke all on function public.vm_bank_admin_import(jsonb,jsonb) from public, anon;
grant execute on function public.vm_bank_admin_import(jsonb,jsonb) to authenticated, service_role;

create or replace function public.vm_bank_admin_stats()
returns jsonb
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
  select case when auth.uid() is null or not public.is_admin() then
    jsonb_build_object('error','bank_admin_required')
  else jsonb_build_object(
    'documents',(select count(*) from private.vm_question_bank_documents),
    'source_exams',(select count(*) from private.vm_question_bank_documents where source_kind='mock_exam'),
    'taxonomy_entries',(select count(*) from private.vm_question_bank_taxonomy),
    'items',(select count(*) from private.vm_question_bank_items),
    'active',(select count(*) from private.vm_question_bank_items where status='active'),
    'quarantined',(select count(*) from private.vm_question_bank_items where status='quarantined'),
    'by_type',coalesce((select jsonb_object_agg(question_type,n) from (
      select question_type,count(*) n from private.vm_question_bank_items group by question_type
    ) x),'{}'::jsonb),
    'by_grade',coalesce((select jsonb_object_agg(coalesce(grade::text,'unknown'),n) from (
      select grade,count(*) n from private.vm_question_bank_items group by grade
    ) x),'{}'::jsonb)
  ) end;
$function$;

revoke all on function public.vm_bank_admin_stats() from public, anon;
grant execute on function public.vm_bank_admin_stats() to authenticated, service_role;

create or replace function public.vm_bank_admin_import_taxonomy(
  p_entries jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_entry jsonb;
  v_key text;
  v_parts text[];
  v_grade smallint;
  v_topic_code text;
  v_skill_family text;
  v_vi_label jsonb;
  v_slug_label jsonb;
  v_total integer:=0;
  v_upserted integer:=0;
  v_failed jsonb:='[]'::jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array'
    or jsonb_array_length(p_entries)>10000 then
    raise exception 'bank_taxonomy_entries_invalid' using errcode='22023';
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_total:=v_total+1;
    v_key:=upper(trim(coalesce(v_entry->>'key',v_entry->>'taxonomy_key','')));
    v_parts:=regexp_match(v_key,'^([012])([A-Z])([0-9]+)\?([0-9]+)-([A-Z0-9-]+)$');
    if v_parts is null then
      v_failed:=v_failed||jsonb_build_array(jsonb_build_object(
        'key',v_key,'reason','taxonomy_key_invalid'
      ));
      continue;
    end if;
    v_grade:=case v_parts[1] when '0' then 10 when '1' then 11 else 12 end;
    v_topic_code:=v_parts[1]||v_parts[2]||v_parts[3];
    v_skill_family:=v_topic_code||'?'||v_parts[4];
    v_vi_label:=case
      when jsonb_typeof(v_entry->'vi')='object' then v_entry->'vi'
      when jsonb_typeof(v_entry->'vi_label')='object' then v_entry->'vi_label'
      when jsonb_typeof(v_entry->'vi')='string' then jsonb_build_object('type_name',v_entry->>'vi')
      when nullif(trim(v_entry->>'vi_label'),'') is not null then jsonb_build_object('type_name',v_entry->>'vi_label')
      else '{}'::jsonb
    end;
    v_slug_label:=case
      when jsonb_typeof(v_entry->'slug')='object' then v_entry->'slug'
      when jsonb_typeof(v_entry->'slug_label')='object' then v_entry->'slug_label'
      when jsonb_typeof(v_entry->'slug')='string' then jsonb_build_object('type_name',v_entry->>'slug')
      when nullif(trim(v_entry->>'slug_label'),'') is not null then jsonb_build_object('type_name',v_entry->>'slug_label')
      else '{}'::jsonb
    end;
    insert into private.vm_question_bank_taxonomy(
      taxonomy_key,grade,grade_code,area,chapter,topic_code,skill,skill_family,
      variant,vi_label,slug_label,metadata,status,created_by,updated_at
    ) values (
      v_key,v_grade,v_parts[1],v_parts[2],v_parts[3]::integer,v_topic_code,
      v_parts[4]::integer,v_skill_family,v_parts[5],
      v_vi_label,
      v_slug_label,
      coalesce(v_entry->'metadata','{}'::jsonb),
      case when v_entry->>'status'='archived' then 'archived' else 'active' end,
      auth.uid(),now()
    )
    on conflict (taxonomy_key) do update set
      grade=excluded.grade,
      grade_code=excluded.grade_code,
      area=excluded.area,
      chapter=excluded.chapter,
      topic_code=excluded.topic_code,
      skill=excluded.skill,
      skill_family=excluded.skill_family,
      variant=excluded.variant,
      vi_label=case when excluded.vi_label<>'{}'::jsonb then excluded.vi_label
        else private.vm_question_bank_taxonomy.vi_label end,
      slug_label=case when excluded.slug_label<>'{}'::jsonb then excluded.slug_label
        else private.vm_question_bank_taxonomy.slug_label end,
      metadata=private.vm_question_bank_taxonomy.metadata||excluded.metadata,
      status=excluded.status,
      updated_at=now();
    v_upserted:=v_upserted+1;
  end loop;
  return jsonb_build_object(
    'total',v_total,'upserted',v_upserted,'failed',v_failed
  );
end;
$function$;

revoke all on function public.vm_bank_admin_import_taxonomy(jsonb) from public, anon;
grant execute on function public.vm_bank_admin_import_taxonomy(jsonb) to authenticated, service_role;

create or replace function public.vm_bank_admin_taxonomy_catalog(
  p_query text default null,
  p_limit integer default 600,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_query text:=lower(trim(coalesce(p_query,'')));
  v_limit integer:=least(greatest(coalesce(p_limit,600),1),1000);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_total bigint;
  v_items jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;
  select count(*) into v_total
  from private.vm_question_bank_taxonomy t
  where v_query=''
    or lower(t.taxonomy_key||' '||t.vi_label::text||' '||t.slug_label::text)
      like '%'||v_query||'%';
  select coalesce(jsonb_agg(jsonb_build_object(
    'key',t.taxonomy_key,'grade',t.grade,'grade_code',t.grade_code,
    'area',t.area,'chapter',t.chapter,'topic_code',t.topic_code,
    'skill',t.skill,'skill_family',t.skill_family,'variant',t.variant,
    'label',coalesce(
      nullif(concat_ws(' · ',nullif(t.vi_label->>'lesson_name',''),nullif(t.vi_label->>'type_name','')),''),
      nullif(t.vi_label->>'chap_name',''),t.taxonomy_key
    ),
    'area_label',case t.area when 'C' then 'Chuyên đề' when 'D' then 'Đại số và Giải tích'
      when 'H' then 'Hình học' else t.area end,
    'chapter_label',coalesce(nullif(t.vi_label->>'chap_name',''),'Chương '||t.chapter::text),
    'skill_label',coalesce(nullif(t.vi_label->>'lesson_name',''),'Kỹ năng '||t.skill::text),
    'variant_label',coalesce(nullif(t.vi_label->>'type_name',''),'Dạng '||t.variant),
    'vi',t.vi_label,'slug',t.slug_label,'status',t.status
  ) order by t.grade,t.area,t.chapter,t.skill,t.variant),'[]'::jsonb)
  into v_items
  from (
    select * from private.vm_question_bank_taxonomy t
    where v_query=''
      or lower(t.taxonomy_key||' '||t.vi_label::text||' '||t.slug_label::text)
        like '%'||v_query||'%'
    order by t.grade,t.area,t.chapter,t.skill,t.variant
    limit v_limit offset v_offset
  ) t;
  return jsonb_build_object(
    'total',v_total,'items',v_items,'limit',v_limit,'offset',v_offset
  );
end;
$function$;

revoke all on function public.vm_bank_admin_taxonomy_catalog(text,integer,integer) from public, anon;
grant execute on function public.vm_bank_admin_taxonomy_catalog(text,integer,integer) to authenticated, service_role;

create or replace function public.vm_bank_admin_document(p_document_id uuid)
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
    'id',d.id,'stable_id',d.stable_id,'title',d.title,'source_kind',d.source_kind,
    'province',d.province,'exam_year',d.exam_year,'exam_kind',d.exam_kind,'tags',d.tags,
    'original_filename',d.original_filename,'raw_tex',d.raw_tex,'metadata',d.metadata,
    'provenance',d.provenance,'status',d.status,'created_at',d.created_at,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'stable_id',i.stable_id,'legacy_code',i.legacy_code,
      'source_legacy_code',s.source_legacy_code,'source_ordinal',s.source_ordinal,
      'source_location',s.source_location,'question_type',i.question_type,
      'difficulty',i.difficulty,'grade',i.grade,'taxonomy',i.taxonomy,'tags',i.tags,
      'raw_tex',i.raw_tex,'canonical_tex',i.canonical_tex,'answer',i.answer_key,
      'solution_latex',i.solution_latex,'assets',i.asset_refs,'status',i.status,
      'quarantine_reason',i.quarantine_reason
    ) order by s.source_ordinal)
    from private.vm_question_bank_item_sources s
    join private.vm_question_bank_items i on i.id=s.item_id
    where s.document_id=d.id),'[]'::jsonb)
  ) into v_result
  from private.vm_question_bank_documents d where d.id=p_document_id;
  if v_result is null then raise exception 'bank_document_not_found' using errcode='P0002'; end if;
  return v_result;
end;
$function$;

revoke all on function public.vm_bank_admin_document(uuid) from public, anon;
grant execute on function public.vm_bank_admin_document(uuid) to authenticated, service_role;

create or replace function public.vm_bank_admin_patch_item(p_item_id uuid,p_patch jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_item private.vm_question_bank_items%rowtype;
  v_status text;
  v_legacy_code text;
  v_taxonomy_key text;
  v_code_difficulty text;
  v_taxonomy_entry private.vm_question_bank_taxonomy%rowtype;
  v_canonical text;
  v_source_document_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;
  select * into v_item from private.vm_question_bank_items where id=p_item_id for update;
  if v_item.id is null then raise exception 'bank_item_not_found' using errcode='P0002'; end if;
  v_status := coalesce(nullif(p_patch->>'status',''),v_item.status);
  v_legacy_code := coalesce(nullif(upper(trim(p_patch->>'legacy_code')),''),v_item.legacy_code);
  if v_status not in ('active','quarantined','archived') then
    raise exception 'bank_status_invalid' using errcode='22023';
  end if;
  if v_status='active' and v_legacy_code is null then
    raise exception 'bank_item_id_required' using errcode='22023';
  end if;
  if v_legacy_code is not null then
    v_taxonomy_key:=private.vm_bank_taxonomy_key_from_legacy(v_legacy_code);
    v_code_difficulty:=private.vm_bank_difficulty_from_legacy(v_legacy_code);
    if v_taxonomy_key is null then
      if v_status='active' or nullif(trim(p_patch->>'legacy_code'),'') is not null then
        raise exception 'bank_item_id_invalid' using errcode='22023';
      end if;
    else
      select * into v_taxonomy_entry
      from private.vm_question_bank_taxonomy
      where taxonomy_key=v_taxonomy_key and status='active';
      if v_taxonomy_entry.taxonomy_key is null
        and (v_status='active' or nullif(trim(p_patch->>'legacy_code'),'') is not null) then
        raise exception 'bank_item_taxonomy_unknown' using errcode='22023';
      end if;
    end if;
  end if;
  v_canonical := v_item.canonical_tex;
  if nullif(trim(p_patch->>'legacy_code'),'') is not null then
    if v_canonical ~ E'(\\\\begin\\{ex\\}|\\\\begin\\{bt\\})\\s*%\\[[^]]*\\]' then
      v_canonical := regexp_replace(
        v_canonical,
        E'(\\\\begin\\{ex\\}|\\\\begin\\{bt\\})\\s*%\\[[^]]*\\]',
        E'\\1%['||v_legacy_code||']','i'
      );
    else
      v_canonical := regexp_replace(
        v_canonical,E'(\\\\begin\\{ex\\}|\\\\begin\\{bt\\})',E'\\1%['||v_legacy_code||']','i'
      );
    end if;
  end if;
  update private.vm_question_bank_items set
    legacy_code=v_legacy_code,
    grade=case when v_taxonomy_entry.taxonomy_key is not null then v_taxonomy_entry.grade
      else coalesce(nullif(p_patch->>'grade','')::smallint,grade) end,
    difficulty=coalesce(v_code_difficulty,nullif(p_patch->>'difficulty',''),difficulty),
    similarity_key=coalesce(v_taxonomy_key,nullif(p_patch->>'similarity_key',''),similarity_key),
    taxonomy=taxonomy || coalesce(p_patch->'taxonomy','{}'::jsonb)
      || case when v_taxonomy_entry.taxonomy_key is null then '{}'::jsonb else jsonb_build_object(
        'key',v_taxonomy_entry.taxonomy_key,
        'taxonomy_key',v_taxonomy_entry.taxonomy_key,
        'similarity_key',v_taxonomy_entry.taxonomy_key,
        'topic_code',v_taxonomy_entry.topic_code,
        'skill_family',v_taxonomy_entry.skill_family,
        'variant',v_taxonomy_entry.variant,
        'vi',v_taxonomy_entry.vi_label,
        'slug',v_taxonomy_entry.slug_label
      ) end,
    canonical_tex=v_canonical,
    status=v_status,
    quarantine_reason=case when v_status='active' then null else coalesce(p_patch->>'quarantine_reason',quarantine_reason) end,
    updated_at=now()
  where id=p_item_id returning * into v_item;
  begin v_source_document_id:=nullif(p_patch->>'source_document_id','')::uuid;
  exception when others then v_source_document_id:=null; end;
  if nullif(trim(p_patch->>'legacy_code'),'') is not null then
    update private.vm_question_bank_item_sources
    set source_legacy_code=v_legacy_code
    where item_id=p_item_id and (v_source_document_id is null or document_id=v_source_document_id);
  end if;
  update public.questions set difficulty=v_item.difficulty where id=v_item.snapshot_question_id;
  return jsonb_build_object('id',v_item.id,'stable_id',v_item.stable_id,'legacy_code',v_item.legacy_code,'status',v_item.status);
end;
$function$;

revoke all on function public.vm_bank_admin_patch_item(uuid,jsonb) from public, anon;
grant execute on function public.vm_bank_admin_patch_item(uuid,jsonb) to authenticated, service_role;

create or replace function public.vm_bank_admin_assign_ids(p_document_id uuid,p_assignments jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_assignment jsonb;
  v_item_id uuid;
  v_total integer:=0;
  v_updated integer:=0;
  v_failed jsonb:='[]'::jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;
  if not exists(select 1 from private.vm_question_bank_documents where id=p_document_id) then
    raise exception 'bank_document_not_found' using errcode='P0002';
  end if;
  if jsonb_typeof(p_assignments) is distinct from 'array' then
    raise exception 'bank_id_assignments_invalid' using errcode='22023';
  end if;
  if jsonb_array_length(p_assignments)>500 then
    raise exception 'bank_id_assignments_invalid' using errcode='22023';
  end if;
  for v_assignment in select value from jsonb_array_elements(p_assignments) loop
    v_total:=v_total+1;
    begin
      v_item_id:=nullif(v_assignment->>'item_id','')::uuid;
    exception when others then v_item_id:=null; end;
    if v_item_id is null and nullif(v_assignment->>'source_ordinal','') is not null then
      select item_id into v_item_id from private.vm_question_bank_item_sources
      where document_id=p_document_id and source_ordinal=(v_assignment->>'source_ordinal')::integer;
    end if;
    if v_item_id is null or nullif(trim(v_assignment->>'legacy_code'),'') is null then
      v_failed:=v_failed||jsonb_build_array(jsonb_build_object(
        'source_ordinal',v_assignment->>'source_ordinal','reason','Thiếu câu hỏi hoặc ID'
      ));
      continue;
    end if;
    if not exists(select 1 from private.vm_question_bank_item_sources
      where document_id=p_document_id and item_id=v_item_id) then
      v_failed:=v_failed||jsonb_build_array(jsonb_build_object(
        'source_ordinal',v_assignment->>'source_ordinal','reason','Câu hỏi không thuộc đề nguồn'
      ));
      continue;
    end if;
    perform public.vm_bank_admin_patch_item(v_item_id,
      v_assignment||jsonb_build_object('source_document_id',p_document_id));
    v_updated:=v_updated+1;
  end loop;
  return jsonb_build_object('document_id',p_document_id,'total',v_total,'updated',v_updated,'failed',v_failed);
end;
$function$;

revoke all on function public.vm_bank_admin_assign_ids(uuid,jsonb) from public, anon;
grant execute on function public.vm_bank_admin_assign_ids(uuid,jsonb) to authenticated, service_role;

create or replace function public.vm_bank_search(
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
  v_is_admin boolean;
  v_effective_filters jsonb;
  v_limit integer := least(greatest(coalesce(p_limit,50),1),100);
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_query text := lower(trim(coalesce(p_filters->>'query','')));
  v_status text;
  v_total bigint;
  v_items jsonb;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'bank_teacher_required' using errcode='42501';
  end if;
  v_is_admin := public.is_admin();
  v_effective_filters := coalesce(p_filters,'{}'::jsonb);
  if not v_is_admin then
    -- Teachers can search usable question content by pedagogical attributes,
    -- but cannot probe the private ID/taxonomy/source structure.
    v_effective_filters := v_effective_filters
      - 'legacy_prefix' - 'taxonomy_codes' - 'source_kinds' - 'tags' - 'status';
  end if;
  v_status := case
    when v_is_admin and p_filters->>'status' in ('active','quarantined','archived') then p_filters->>'status'
    else 'active'
  end;

  select count(*) into v_total
  from private.vm_question_bank_items i
  where i.status=v_status
    -- Keep the common single-value predicates visible to the planner so the
    -- composite filter index is usable. The helper handles arrays/admin-only
    -- filters without doing a second item-table lookup.
    and case when coalesce(v_effective_filters->>'grade','') ~ '^[0-9]{1,2}$'
      then i.grade=(v_effective_filters->>'grade')::smallint else true end
    and (nullif(v_effective_filters->>'question_type','') is null
      or i.question_type=v_effective_filters->>'question_type')
    and (nullif(v_effective_filters->>'difficulty','') is null
      or i.difficulty=v_effective_filters->>'difficulty')
    and private.vm_bank_item_matches(i,v_effective_filters)
    and (
      v_query=''
      or lower(i.content_latex) like '%'||v_query||'%'
      or (v_is_admin and lower(coalesce(i.legacy_code,'')||' '||coalesce(i.taxonomy::text,'')) like '%'||v_query||'%')
    );

  select coalesce(jsonb_agg(row_data order by row_no),'[]'::jsonb) into v_items
  from (
    select row_number() over(order by i.legacy_code nulls last,i.created_at,i.id) row_no,
      case when v_is_admin then
        jsonb_build_object(
          'id',i.id,'stable_id',i.stable_id,'legacy_code',i.legacy_code,
          'question_type',i.question_type,'difficulty',i.difficulty,'grade',i.grade,
          'taxonomy',i.taxonomy,'tags',i.tags,'content_latex',i.content_latex,
          'choices',i.public_choices,'status',i.status,
          'source_label',coalesce((select string_agg(distinct d.title,' · ' order by d.title)
            from private.vm_question_bank_item_sources s
            join private.vm_question_bank_documents d on d.id=s.document_id
            where s.item_id=i.id),'Ngân hàng VinhMath')
        )
      else
        jsonb_build_object(
          'question_type',i.question_type,'difficulty',i.difficulty,'grade',i.grade,
          'content_latex',i.content_latex,'choices',i.public_choices
        )
      end row_data
    from private.vm_question_bank_items i
    where i.status=v_status
      and case when coalesce(v_effective_filters->>'grade','') ~ '^[0-9]{1,2}$'
        then i.grade=(v_effective_filters->>'grade')::smallint else true end
      and (nullif(v_effective_filters->>'question_type','') is null
        or i.question_type=v_effective_filters->>'question_type')
      and (nullif(v_effective_filters->>'difficulty','') is null
        or i.difficulty=v_effective_filters->>'difficulty')
      and private.vm_bank_item_matches(i,v_effective_filters)
      and (
        v_query=''
        or lower(i.content_latex) like '%'||v_query||'%'
        or (v_is_admin and lower(coalesce(i.legacy_code,'')||' '||coalesce(i.taxonomy::text,'')) like '%'||v_query||'%')
      )
    order by i.legacy_code nulls last,i.created_at,i.id
    limit v_limit offset v_offset
  ) rows;
  return jsonb_build_object('total',v_total,'items',v_items,'limit',v_limit,'offset',v_offset);
end;
$function$;

revoke all on function public.vm_bank_search(jsonb,integer,integer) from public, anon;
grant execute on function public.vm_bank_search(jsonb,integer,integer) to authenticated, service_role;

create or replace function public.vm_bank_source_exam_catalog(
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
  v_is_admin boolean;
  v_exam_year_filter integer;
  v_question_count_filter integer;
  v_min_questions integer;
  v_max_questions integer;
  v_limit integer := least(greatest(coalesce(p_limit,50),1),100);
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_query text := lower(trim(coalesce(p_filters->>'query','')));
  v_total bigint;
  v_items jsonb;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'bank_teacher_required' using errcode='42501';
  end if;
  v_is_admin := public.is_admin();
  begin
    v_exam_year_filter:=nullif(p_filters->>'exam_year','')::integer;
  exception when others then
    v_exam_year_filter:=null;
  end;
  begin
    v_question_count_filter:=nullif(coalesce(
      p_filters->>'question_count',p_filters->>'count'
    ),'')::integer;
  exception when others then
    v_question_count_filter:=null;
  end;
  begin
    v_min_questions:=nullif(coalesce(
      p_filters->>'min_questions',p_filters->>'min_count'
    ),'')::integer;
  exception when others then
    v_min_questions:=null;
  end;
  begin
    v_max_questions:=nullif(coalesce(
      p_filters->>'max_questions',p_filters->>'max_count'
    ),'')::integer;
  exception when others then
    v_max_questions:=null;
  end;
  if v_question_count_filter is not null and v_question_count_filter>=0 then
    v_min_questions:=v_question_count_filter;
    v_max_questions:=v_question_count_filter;
  else
    if v_min_questions<0 then v_min_questions:=null; end if;
    if v_max_questions<0 then v_max_questions:=null; end if;
  end if;
  select count(*) into v_total
  from private.vm_question_bank_documents d
  cross join lateral (
    select count(*)::integer question_count
    from private.vm_question_bank_item_sources s
    join private.vm_question_bank_items i on i.id=s.item_id and i.status='active'
    where s.document_id=d.id
  ) counts
  where d.source_kind='mock_exam' and d.status='active'
    and (v_query='' or lower(d.title||' '||coalesce(d.province,'')||' '||coalesce(d.exam_kind,'')) like '%'||v_query||'%')
    and (nullif(coalesce(p_filters->>'province',p_filters->>'province_or_unit'),'') is null
      or lower(coalesce(d.province,''))=lower(coalesce(p_filters->>'province',p_filters->>'province_or_unit')))
    and (v_exam_year_filter is null or d.exam_year=v_exam_year_filter)
    and (nullif(coalesce(p_filters->>'exam_kind',p_filters->>'exam_type'),'') is null
      or lower(coalesce(d.exam_kind,''))=lower(coalesce(p_filters->>'exam_kind',p_filters->>'exam_type')))
    and (v_min_questions is null or counts.question_count>=v_min_questions)
    and (v_max_questions is null or counts.question_count<=v_max_questions)
    and case when jsonb_typeof(p_filters->'tags')='array' and jsonb_array_length(p_filters->'tags')>0
      then d.tags && array(select value from jsonb_array_elements_text(p_filters->'tags')) else true end;

  select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb) into v_items
  from (
    select d.created_at,
      case when v_is_admin then
        jsonb_build_object(
          'id',d.id,'stable_id',d.stable_id,'title',d.title,'province',d.province,
          'exam_year',d.exam_year,'exam_kind',d.exam_kind,'tags',d.tags,
          'question_count',counts.question_count,
          'quarantined_count',(select count(*) from private.vm_question_bank_item_sources s
            join private.vm_question_bank_items i on i.id=s.item_id
            where s.document_id=d.id and i.status='quarantined'),
          'created_at',d.created_at
        )
      else
        jsonb_build_object(
          'id',d.id,'title',d.title,'province',d.province,
          'exam_year',d.exam_year,'exam_kind',d.exam_kind,'tags',d.tags,
          'question_count',counts.question_count,
          'created_at',d.created_at
        )
      end item
    from private.vm_question_bank_documents d
    cross join lateral (
      select count(*)::integer question_count
      from private.vm_question_bank_item_sources s
      join private.vm_question_bank_items i on i.id=s.item_id and i.status='active'
      where s.document_id=d.id
    ) counts
    where d.source_kind='mock_exam' and d.status='active'
      and (v_query='' or lower(d.title||' '||coalesce(d.province,'')||' '||coalesce(d.exam_kind,'')) like '%'||v_query||'%')
      and (nullif(coalesce(p_filters->>'province',p_filters->>'province_or_unit'),'') is null
        or lower(coalesce(d.province,''))=lower(coalesce(p_filters->>'province',p_filters->>'province_or_unit')))
      and (v_exam_year_filter is null or d.exam_year=v_exam_year_filter)
      and (nullif(coalesce(p_filters->>'exam_kind',p_filters->>'exam_type'),'') is null
        or lower(coalesce(d.exam_kind,''))=lower(coalesce(p_filters->>'exam_kind',p_filters->>'exam_type')))
      and (v_min_questions is null or counts.question_count>=v_min_questions)
      and (v_max_questions is null or counts.question_count<=v_max_questions)
      and case when jsonb_typeof(p_filters->'tags')='array' and jsonb_array_length(p_filters->'tags')>0
        then d.tags && array(select value from jsonb_array_elements_text(p_filters->'tags')) else true end
    order by d.created_at desc
    limit v_limit offset v_offset
  ) rows;
  return jsonb_build_object('total',v_total,'items',v_items,'limit',v_limit,'offset',v_offset);
end;
$function$;

revoke all on function public.vm_bank_source_exam_catalog(jsonb,integer,integer) from public, anon;
grant execute on function public.vm_bank_source_exam_catalog(jsonb,integer,integer) to authenticated, service_role;

create or replace function private.vm_bank_assert_exam_target(p_class_id uuid,p_portal_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
begin
  if not private.vm_bank_target_is_manageable(p_class_id,p_portal_id) then
    raise exception 'bank_exam_target_access_denied' using errcode='42501';
  end if;
end;
$function$;

revoke all on function private.vm_bank_assert_exam_target(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function public.vm_bank_generate_exam(p_spec jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_class_id uuid := nullif(p_spec->>'class_id','')::uuid;
  v_portal_id uuid := nullif(p_spec->>'portal_id','')::uuid;
  v_exam_id uuid;
  v_seed text := left(coalesce(nullif(p_spec->>'seed',''),encode(extensions.gen_random_bytes(12),'hex')),100);
  v_title text := left(coalesce(nullif(trim(p_spec->>'title'),''),'Đề tạo tự động từ ngân hàng'),240);
  v_blueprint jsonb := p_spec->'blueprint';
  v_segment jsonb;
  v_segment_filters jsonb;
  v_base_filters jsonb;
  v_filters jsonb;
  v_is_admin boolean;
  v_needed integer;
  v_default_count integer;
  v_picked uuid[];
  v_selected uuid[] := '{}'::uuid[];
  v_warnings jsonb := '[]'::jsonb;
  v_count integer;
  v_requested_total integer := 0;
begin
  perform private.vm_bank_assert_exam_target(v_class_id,v_portal_id);
  v_is_admin := public.is_admin();
  v_base_filters := case when jsonb_typeof(p_spec->'filters')='object'
    then p_spec->'filters' else '{}'::jsonb end;
  if not v_is_admin then
    -- Teachers select only pedagogical attributes. Taxonomy/legacy/source IDs
    -- and explicit bank item IDs remain an admin-only implementation detail.
    v_base_filters := jsonb_strip_nulls(jsonb_build_object(
      'grade',v_base_filters->'grade',
      'grades',v_base_filters->'grades',
      'difficulty',v_base_filters->'difficulty',
      'difficulties',v_base_filters->'difficulties',
      'question_type',v_base_filters->'question_type',
      'question_types',v_base_filters->'question_types'
    ));
  end if;
  if jsonb_typeof(v_blueprint) is distinct from 'array' then
    v_blueprint := null;
  elsif jsonb_array_length(v_blueprint)=0 then
    v_blueprint := null;
  end if;
  if v_blueprint is null then
    begin
      v_default_count:=coalesce(nullif(p_spec->>'count','')::integer,20);
    exception when others then
      raise exception 'bank_blueprint_count_invalid' using errcode='22023';
    end;
    if v_default_count<1 then
      raise exception 'bank_blueprint_count_invalid' using errcode='22023';
    elsif v_default_count>200 then
      raise exception 'bank_blueprint_question_limit_exceeded' using errcode='22023';
    elsif v_default_count>100 then
      -- Keep each query bounded while honoring a legitimate total up to 200.
      v_blueprint:=jsonb_build_array(
        v_base_filters||jsonb_build_object('count',100),
        v_base_filters||jsonb_build_object('count',v_default_count-100)
      );
    else
      v_blueprint:=jsonb_build_array(
        v_base_filters||jsonb_build_object('count',v_default_count)
      );
    end if;
  end if;
  if jsonb_array_length(v_blueprint)>30 then
    raise exception 'bank_blueprint_too_large' using errcode='22023';
  end if;

  for v_segment in select value from jsonb_array_elements(v_blueprint) loop
    begin
      v_needed := coalesce(nullif(v_segment->>'count','')::integer,0);
    exception when others then
      raise exception 'bank_blueprint_count_invalid' using errcode='22023';
    end;
    if v_needed<0 or v_needed>100 then
      raise exception 'bank_blueprint_count_invalid' using errcode='22023';
    end if;
    if v_needed=0 then continue; end if;
    v_requested_total := v_requested_total + v_needed;
    if v_requested_total>200 then
      raise exception 'bank_blueprint_question_limit_exceeded' using errcode='22023';
    end if;
    v_segment_filters := case when jsonb_typeof(v_segment)='object'
      then v_segment-'count' else '{}'::jsonb end;
    if not v_is_admin then
      v_segment_filters := jsonb_strip_nulls(jsonb_build_object(
        'grade',v_segment_filters->'grade',
        'grades',v_segment_filters->'grades',
        'difficulty',v_segment_filters->'difficulty',
        'difficulties',v_segment_filters->'difficulties',
        'question_type',v_segment_filters->'question_type',
        'question_types',v_segment_filters->'question_types'
      ));
    end if;
    v_filters := v_base_filters || v_segment_filters;
    select coalesce(array_agg(id order by order_key),'{}'::uuid[]) into v_picked
    from (
      select i.id,md5(v_seed||':'||i.stable_id||':'||coalesce(v_filters::text,'')) order_key
      from private.vm_question_bank_items i
      where i.status='active'
        and not (i.id=any(v_selected))
        and case when coalesce(v_filters->>'grade','') ~ '^[0-9]{1,2}$'
          then i.grade=(v_filters->>'grade')::smallint else true end
        and (nullif(v_filters->>'question_type','') is null
          or i.question_type=v_filters->>'question_type')
        and (nullif(v_filters->>'difficulty','') is null
          or i.difficulty=v_filters->>'difficulty')
        and private.vm_bank_item_matches(i,v_filters)
        and case when v_is_admin and jsonb_typeof(p_spec->'exclude_question_ids')='array' then not exists(
          select 1 from jsonb_array_elements_text(p_spec->'exclude_question_ids') excluded(value)
          where excluded.value in (i.id::text,i.stable_id,i.snapshot_question_id::text)
        ) else true end
      order by order_key
      limit v_needed
    ) candidates;
    v_selected := v_selected || v_picked;
    if cardinality(v_picked)<v_needed then
      v_warnings := v_warnings || jsonb_build_array(
        jsonb_build_object('requested',v_needed,'selected',cardinality(v_picked))
        || case when v_is_admin then jsonb_build_object('filters',v_filters) else '{}'::jsonb end
      );
    end if;
  end loop;
  v_count := cardinality(v_selected);
  if v_count=0 then raise exception 'bank_no_matching_questions' using errcode='P0002'; end if;

  insert into public.exams(
    class_id,title,duration_minutes,opens_at,closes_at,shuffle,published,de_type,
    template_key,allow_solution_pdf,portal_id,bank_generated,generation_spec,generated_by
  ) values (
    v_class_id,v_title,least(greatest(coalesce(nullif(p_spec->>'duration_minutes','')::integer,90),1),600),
    nullif(p_spec->>'opens_at','')::timestamptz,nullif(p_spec->>'closes_at','')::timestamptz,
    coalesce(nullif(p_spec->>'shuffle','')::boolean,true),coalesce(nullif(p_spec->>'published','')::boolean,false),
    'mc','bank-generated',coalesce(nullif(p_spec->>'allow_solution_pdf','')::boolean,false),v_portal_id,
    true,jsonb_build_object('mode','blueprint','question_count',v_count),auth.uid()
  ) returning id into v_exam_id;

  insert into private.vm_question_bank_exam_specs(exam_id,mode,seed,spec,created_by)
  values(v_exam_id,'blueprint',v_seed,p_spec,auth.uid());

  insert into public.exam_questions(exam_id,question_id,sort)
  select v_exam_id,i.snapshot_question_id,(selected.ordinality-1)::integer
  from unnest(v_selected) with ordinality selected(item_id,ordinality)
  join private.vm_question_bank_items i on i.id=selected.item_id
  order by selected.ordinality;

  insert into private.vm_question_bank_exam_occurrences(exam_id,question_id,item_id,sort)
  select v_exam_id,i.snapshot_question_id,i.id,(selected.ordinality-1)::integer
  from unnest(v_selected) with ordinality selected(item_id,ordinality)
  join private.vm_question_bank_items i on i.id=selected.item_id
  order by selected.ordinality;

  return jsonb_build_object(
    'exam_id',v_exam_id,'title',v_title,'question_count',v_count,
    'seed',v_seed,'warnings',v_warnings
  );
end;
$function$;

revoke all on function public.vm_bank_generate_exam(jsonb) from public, anon;
grant execute on function public.vm_bank_generate_exam(jsonb) to authenticated, service_role;

-- Build a fresh exam with the same ordered pedagogical structure as a source
-- exam, without exposing IDs/taxonomy/raw TeX/answers to the caller. Exact
-- taxonomy variants are preferred; the bounded fallback stays in the same
-- skill family at the same or one-lower cognitive level.
create or replace function public.vm_bank_clone_source_structure(
  p_document_id uuid,
  p_spec jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_document private.vm_question_bank_documents%rowtype;
  v_source record;
  v_candidate_id uuid;
  v_class_id uuid := nullif(p_spec->>'class_id','')::uuid;
  v_portal_id uuid := nullif(p_spec->>'portal_id','')::uuid;
  v_exam_id uuid;
  v_seed text := left(coalesce(
    nullif(p_spec->>'seed',''),encode(extensions.gen_random_bytes(12),'hex')
  ),100);
  v_title text;
  v_selected uuid[] := '{}'::uuid[];
  v_picks jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_source_count integer;
  v_count integer:=0;
begin
  perform private.vm_bank_assert_exam_target(v_class_id,v_portal_id);
  select * into v_document
  from private.vm_question_bank_documents
  where id=p_document_id and source_kind='mock_exam' and status='active';
  if v_document.id is null then
    raise exception 'bank_source_exam_not_found' using errcode='P0002';
  end if;
  select count(*)::integer into v_source_count
  from private.vm_question_bank_item_sources s
  join private.vm_question_bank_items i on i.id=s.item_id and i.status='active'
  where s.document_id=p_document_id;
  if v_source_count=0 then
    raise exception 'bank_source_exam_empty' using errcode='P0002';
  elsif v_source_count>200 then
    raise exception 'bank_source_exam_question_limit_exceeded' using errcode='22023';
  end if;

  for v_source in
    select
      s.source_ordinal,
      i.id item_id,
      i.question_type,
      i.difficulty,
      coalesce(i.similarity_key,i.taxonomy->>'taxonomy_key',i.taxonomy->>'key') taxonomy_key,
      coalesce(
        i.taxonomy->>'skill_family',
        split_part(coalesce(i.similarity_key,i.taxonomy->>'taxonomy_key',i.taxonomy->>'key'),'-',1)
      ) skill_family,
      case i.difficulty when 'NB' then 1 when 'TH' then 2 when 'VD' then 3 else 4 end difficulty_rank
    from private.vm_question_bank_item_sources s
    join private.vm_question_bank_items i on i.id=s.item_id and i.status='active'
    where s.document_id=p_document_id
    order by s.source_ordinal
  loop
    v_candidate_id:=null;
    select c.id into v_candidate_id
    from private.vm_question_bank_items c
    cross join lateral (values (
      case c.difficulty when 'NB' then 1 when 'TH' then 2 when 'VD' then 3 else 4 end
    )) candidate_rank(value)
    where c.status='active'
      and c.question_type=v_source.question_type
      and c.id<>v_source.item_id
      and not (c.id=any(v_selected))
      -- A clone is genuinely new: do not recycle another question from the
      -- same source exam into a different position.
      and not exists (
        select 1 from private.vm_question_bank_item_sources original
        where original.document_id=p_document_id and original.item_id=c.id
      )
      and candidate_rank.value between greatest(v_source.difficulty_rank-1,1)
        and v_source.difficulty_rank
      and (
        (v_source.taxonomy_key is not null and c.similarity_key=v_source.taxonomy_key)
        or (
          v_source.skill_family is not null
          and coalesce(c.taxonomy->>'skill_family',split_part(c.similarity_key,'-',1))=v_source.skill_family
        )
      )
    order by
      case when c.similarity_key=v_source.taxonomy_key then 0 else 1 end,
      case when candidate_rank.value=v_source.difficulty_rank then 0 else 1 end,
      md5(v_seed||':'||v_source.source_ordinal::text||':'||c.stable_id)
    limit 1;

    if v_candidate_id is null then
      v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object(
        'position',v_source.source_ordinal+1,'code','no_compatible_question'
      ));
      continue;
    end if;
    v_selected:=array_append(v_selected,v_candidate_id);
    v_picks:=v_picks||jsonb_build_array(jsonb_build_object(
      'item_id',v_candidate_id,'sort',v_source.source_ordinal
    ));
  end loop;

  v_count:=jsonb_array_length(v_picks);
  if v_count=0 then
    raise exception 'bank_no_matching_questions' using errcode='P0002';
  end if;
  v_title:=left(coalesce(
    nullif(trim(p_spec->>'title'),''),'Đề mới theo cấu trúc '||v_document.title
  ),240);

  insert into public.exams(
    class_id,title,duration_minutes,opens_at,closes_at,shuffle,published,de_type,
    template_key,allow_solution_pdf,portal_id,bank_generated,generation_spec,generated_by
  ) values (
    v_class_id,v_title,
    least(greatest(coalesce(nullif(p_spec->>'duration_minutes','')::integer,90),1),600),
    nullif(p_spec->>'opens_at','')::timestamptz,
    nullif(p_spec->>'closes_at','')::timestamptz,
    coalesce(nullif(p_spec->>'shuffle','')::boolean,true),
    coalesce(nullif(p_spec->>'published','')::boolean,false),
    'mc','bank-generated',
    coalesce(nullif(p_spec->>'allow_solution_pdf','')::boolean,false),
    v_portal_id,true,
    jsonb_build_object('mode','clone_source','question_count',v_count),auth.uid()
  ) returning id into v_exam_id;

  insert into private.vm_question_bank_exam_specs(
    exam_id,mode,seed,spec,source_document_id,created_by
  ) values (
    v_exam_id,'clone_source',v_seed,p_spec,p_document_id,auth.uid()
  );

  insert into public.exam_questions(exam_id,question_id,sort)
  select v_exam_id,i.snapshot_question_id,(picked.value->>'sort')::integer
  from jsonb_array_elements(v_picks) picked(value)
  join private.vm_question_bank_items i on i.id=(picked.value->>'item_id')::uuid
  order by (picked.value->>'sort')::integer;

  insert into private.vm_question_bank_exam_occurrences(
    exam_id,question_id,item_id,sort,source_document_id,source_ordinal
  )
  select
    v_exam_id,i.snapshot_question_id,i.id,(picked.value->>'sort')::integer,
    p_document_id,(picked.value->>'sort')::integer
  from jsonb_array_elements(v_picks) picked(value)
  join private.vm_question_bank_items i on i.id=(picked.value->>'item_id')::uuid
  order by (picked.value->>'sort')::integer;

  return jsonb_build_object(
    'exam_id',v_exam_id,'title',v_title,'question_count',v_count,
    'source_question_count',v_source_count,'seed',v_seed,'warnings',v_warnings
  );
end;
$function$;

revoke all on function public.vm_bank_clone_source_structure(uuid,jsonb) from public, anon;
grant execute on function public.vm_bank_clone_source_structure(uuid,jsonb) to authenticated, service_role;

create or replace function public.vm_bank_assign_source_exam(p_document_id uuid,p_spec jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_document private.vm_question_bank_documents%rowtype;
  v_source record;
  v_class_id uuid := nullif(p_spec->>'class_id','')::uuid;
  v_portal_id uuid := nullif(p_spec->>'portal_id','')::uuid;
  v_exam_id uuid;
  v_title text;
  v_count integer:=0;
  v_total integer;
  v_occurrence_question_id uuid;
  v_seen_items uuid[]:='{}'::uuid[];
begin
  perform private.vm_bank_assert_exam_target(v_class_id,v_portal_id);
  select * into v_document from private.vm_question_bank_documents
  where id=p_document_id and source_kind='mock_exam' and status='active';
  if v_document.id is null then raise exception 'bank_source_exam_not_found' using errcode='P0002'; end if;
  v_title := left(coalesce(nullif(trim(p_spec->>'title'),''),v_document.title),240);
  select count(*) into v_total from private.vm_question_bank_item_sources where document_id=p_document_id;

  insert into public.exams(
    class_id,title,duration_minutes,opens_at,closes_at,shuffle,published,de_type,
    template_key,allow_solution_pdf,portal_id,source_bank_document_id,bank_generated,generation_spec,generated_by
  ) values (
    v_class_id,v_title,least(greatest(coalesce(nullif(p_spec->>'duration_minutes','')::integer,90),1),600),
    nullif(p_spec->>'opens_at','')::timestamptz,nullif(p_spec->>'closes_at','')::timestamptz,
    coalesce(nullif(p_spec->>'shuffle','')::boolean,true),coalesce(nullif(p_spec->>'published','')::boolean,false),
    'mc','bank-source-exam',coalesce(nullif(p_spec->>'allow_solution_pdf','')::boolean,false),v_portal_id,
    p_document_id,true,jsonb_build_object('mode','source_exam'),auth.uid()
  ) returning id into v_exam_id;

  for v_source in
    select s.source_ordinal,i.id item_id,i.snapshot_question_id,i.stable_id,i.difficulty
    from private.vm_question_bank_item_sources s
    join private.vm_question_bank_items i on i.id=s.item_id and i.status='active'
    where s.document_id=p_document_id
    order by s.source_ordinal
  loop
    if v_source.item_id=any(v_seen_items) then
      insert into public.questions(
        source_id,topic_id,difficulty,content_latex,choices,solution_latex,portal_id
      ) values (
        'QBO-'||replace(v_exam_id::text,'-','')||'-'||v_source.source_ordinal::text,
        null,v_source.difficulty,'[Nội dung ngân hàng được bảo vệ]','[]'::jsonb,null,null
      ) returning id into v_occurrence_question_id;
    else
      v_occurrence_question_id:=v_source.snapshot_question_id;
      v_seen_items:=array_append(v_seen_items,v_source.item_id);
    end if;

    insert into public.exam_questions(exam_id,question_id,sort)
    values(v_exam_id,v_occurrence_question_id,v_source.source_ordinal);
    insert into private.vm_question_bank_exam_occurrences(
      exam_id,question_id,item_id,sort,source_document_id,source_ordinal,is_clone
    ) values (
      v_exam_id,v_occurrence_question_id,v_source.item_id,v_source.source_ordinal,
      p_document_id,v_source.source_ordinal,v_occurrence_question_id<>v_source.snapshot_question_id
    );
    v_count:=v_count+1;
  end loop;
  if v_count=0 then
    delete from public.exams where id=v_exam_id;
    raise exception 'bank_source_exam_has_no_active_questions' using errcode='P0002';
  end if;
  update public.exams set generation_spec=jsonb_build_object('mode','source_exam','question_count',v_count)
  where id=v_exam_id;
  insert into private.vm_question_bank_exam_specs(exam_id,mode,spec,source_document_id,created_by)
  values(v_exam_id,'source_exam',p_spec,p_document_id,auth.uid());
  return jsonb_build_object(
    'exam_id',v_exam_id,'title',v_title,'question_count',v_count,
    'count',v_count,'skipped',greatest(v_total-v_count,0),'source_document_id',p_document_id
  );
end;
$function$;

revoke all on function public.vm_bank_assign_source_exam(uuid,jsonb) from public, anon;
grant execute on function public.vm_bank_assign_source_exam(uuid,jsonb) to authenticated, service_role;

create or replace function private.vm_bank_reveal_choices(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $function$
declare
  v_item private.vm_question_bank_items%rowtype;
  v_result jsonb;
begin
  select * into v_item from private.vm_question_bank_items where id=p_item_id;
  if v_item.id is null then return null; end if;
  if v_item.question_type='short_answer' then
    return jsonb_build_array(jsonb_build_object(
      'key','short',
      'latex',private.vm_bank_normalize_short_answer(v_item.answer_key->>'value')
    ));
  end if;
  select coalesce(jsonb_agg(c.value || jsonb_build_object(
    'correct',exists(select 1 from jsonb_array_elements_text(coalesce(v_item.answer_key->'correct_indexes','[]'::jsonb)) x(value)
      where x.value::integer=(c.ordinality-1)::integer)
  ) order by c.ordinality),'[]'::jsonb)
  into v_result
  from jsonb_array_elements(v_item.public_choices) with ordinality c(value,ordinality);
  return v_result;
end;
$function$;

revoke all on function private.vm_bank_reveal_choices(uuid) from public, anon, authenticated, service_role;

create or replace function private.vm_can_access_exam(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.exams e
    where e.id=p_exam_id
      and (
        public.is_admin()
        or (
          private.vm_bank_exam_is_protected(
            e.id,e.bank_generated,e.source_bank_document_id
          )
          and private.vm_bank_can_manage_exam(e.id)
        )
        or (
          not private.vm_bank_exam_is_protected(
            e.id,e.bank_generated,e.source_bank_document_id
          )
          and public.is_staff()
        )
        or (
          not public.is_staff()
          and (
            (e.published and e.owner_student_id=auth.uid())
            or (
              e.owner_student_id is null and e.published and (
                (
                  e.portal_id is null and (
                    e.class_id is null
                    or exists(select 1 from public.class_students cs where cs.class_id=e.class_id and cs.student_id=auth.uid())
                  )
                )
                or (e.portal_id is not null and private.can_access_portal_exam(e.id))
              )
            )
          )
        )
      )
  );
$function$;

revoke all on function private.vm_can_access_exam(uuid) from public, anon, authenticated;
grant execute on function private.vm_can_access_exam(uuid) to service_role;

create or replace function public.vm_exam_load(p_exam_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_exam public.exams%rowtype;
  v_reveal boolean := false;
  v_questions jsonb := '[]'::jsonb;
  v_essay text;
  v_protected boolean := false;
  v_staff_preview boolean := false;
begin
  if not private.vm_can_access_exam(p_exam_id) then
    raise exception 'exam_access_denied' using errcode='42501';
  end if;
  select * into v_exam from public.exams where id=p_exam_id;
  v_protected := private.vm_bank_exam_is_protected(
    v_exam.id,v_exam.bank_generated,v_exam.source_bank_document_id
  );
  -- Teachers may preview a protected exam in their managed scope, but the
  -- private bank answer/solution layer remains administrator-only. Students
  -- receive that layer only for their own submitted attempt below.
  v_staff_preview := public.is_admin()
    or (v_protected and private.vm_bank_can_manage_exam(p_exam_id))
    or (not v_protected and public.is_staff());
  v_reveal := public.is_admin()
    or (not v_protected and public.is_staff())
    or (
      not public.is_staff()
      and exists (
        select 1 from public.attempts a
        where a.exam_id=p_exam_id
          and a.student_id=auth.uid()
          and a.submitted_at is not null
      )
    );
  if not v_reveal and not v_staff_preview and (
    (v_exam.opens_at is not null and now()<v_exam.opens_at)
    or (v_exam.closes_at is not null and now()>v_exam.closes_at)
  ) then raise exception 'exam_not_open' using errcode='42501'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sort',eq.sort,
    'questions',jsonb_build_object(
      'id',q.id,
      'content_latex',coalesce(bank_item.content_latex,q.content_latex),
      'choices',case
        when bank_item.id is not null
          then case when v_reveal then private.vm_bank_reveal_choices(bank_item.id)
            else bank_item.public_choices end
        when v_reveal then q.choices
        -- Legacy short-answer rows store the answer itself in choices[0].latex.
        -- Returning that field before submit would reveal the key even after
        -- removing the usual `correct` flag.
        when jsonb_typeof(q.choices)='array'
          and jsonb_array_length(q.choices)=1
          and lower(coalesce(q.choices->0->>'key',''))='short'
          then jsonb_build_array(
            ((q.choices->0)-array['correct','is_correct','answer','solution'])
            || jsonb_build_object('latex','')
          )
        else coalesce((select jsonb_agg(choice_value-array['correct','is_correct','answer','solution'])
          from jsonb_array_elements(q.choices) choice_value),'[]'::jsonb)
        end,
      'solution_latex',case when v_reveal
        then coalesce(bank_item.solution_latex,q.solution_latex) else null end
    )
  ) order by eq.sort),'[]'::jsonb)
  into v_questions
  from public.exam_questions eq
  join public.questions q on q.id=eq.question_id
  left join private.vm_question_bank_items bank_item
    on bank_item.id=private.vm_bank_question_item_id(eq.exam_id,q.id)
  where eq.exam_id=p_exam_id;

  v_essay := case when v_reveal then coalesce(v_exam.essay_prompt,v_exam.latex_source,'')
    else public.vm_strip_latex_solutions(coalesce(v_exam.essay_prompt,v_exam.latex_source,'')) end;
  return jsonb_build_object(
    'exam',jsonb_build_object(
      'id',v_exam.id,'class_id',v_exam.class_id,'title',v_exam.title,
      'duration_minutes',v_exam.duration_minutes,'opens_at',v_exam.opens_at,'closes_at',v_exam.closes_at,
      'de_type',v_exam.de_type,'allow_solution_pdf',v_exam.allow_solution_pdf,'essay_prompt',v_essay
    ),
    'questions',v_questions,'solutions_unlocked',v_reveal
  );
end;
$function$;

revoke all on function public.vm_exam_load(uuid) from public, anon;
grant execute on function public.vm_exam_load(uuid) to authenticated, service_role;

create or replace function private.vm_exam_grade_answer(p_question_id uuid,p_chosen_key text)
returns table(is_correct boolean,earned numeric,maximum numeric)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_item private.vm_question_bank_items%rowtype;
  v_choices jsonb;
  v_first_key text;
  v_selected jsonb;
  v_matches integer := 0;
  v_total integer := 0;
  v_correct_key text;
  v_correct_index integer;
  v_expected text;
  v_actual text;
begin
  select * into v_item
  from private.vm_question_bank_items i
  where i.id=coalesce(
    (select o.item_id
     from private.vm_question_bank_exam_occurrences o
     where o.question_id=p_question_id
     limit 1),
    (select direct_item.id
     from private.vm_question_bank_items direct_item
     where direct_item.snapshot_question_id=p_question_id)
  );
  if v_item.id is not null then
    if v_item.question_type='multiple_choice' then
      select value::integer into v_correct_index
      from jsonb_array_elements_text(coalesce(v_item.answer_key->'correct_indexes','[]'::jsonb)) limit 1;
      v_correct_key := chr(65+coalesce(v_correct_index,-100));
      return query select coalesce(upper(trim(p_chosen_key))=v_correct_key,false),
        case when upper(trim(coalesce(p_chosen_key,'')))=v_correct_key then 0.25 else 0 end::numeric,
        0.25::numeric;
      return;
    elsif v_item.question_type='true_false' then
      begin v_selected:=coalesce(nullif(p_chosen_key,''),'{}')::jsonb;
      exception when others then v_selected:='{}'::jsonb; end;
      for v_correct_index in 0..3 loop
        v_expected := case when exists(
          select 1 from jsonb_array_elements_text(coalesce(v_item.answer_key->'correct_indexes','[]'::jsonb)) x(value)
          where x.value::integer=v_correct_index
        ) then 'D' else 'S' end;
        v_actual := upper(coalesce(v_selected->>chr(97+v_correct_index),''));
        v_total:=v_total+1;
        if v_actual=v_expected then v_matches:=v_matches+1; end if;
      end loop;
      return query select v_matches=v_total,
        case v_matches when 1 then 0.1 when 2 then 0.25 when 3 then 0.5 when 4 then 1.0 else 0 end::numeric,
        1.0::numeric;
      return;
    elsif v_item.question_type='short_answer' then
      v_expected:=private.vm_bank_normalize_short_answer(v_item.answer_key->>'value');
      v_actual:=private.vm_bank_normalize_short_answer(p_chosen_key);
      return query select v_actual=v_expected,
        case when v_actual=v_expected then 0.5 else 0 end::numeric,0.5::numeric;
      return;
    end if;
    return query select false,0::numeric,0::numeric;
    return;
  end if;

  -- Legacy questions continue to use their existing public.questions answer format.
  select q.choices into v_choices from public.questions q where q.id=p_question_id;
  if v_choices is null or jsonb_typeof(v_choices)<>'array' or jsonb_array_length(v_choices)=0 then
    return query select false,0::numeric,0::numeric; return;
  end if;
  v_first_key:=v_choices->0->>'key';
  if v_first_key in ('A','B','C','D') then
    select choice->>'key' into v_correct_key from jsonb_array_elements(v_choices) choice
    where coalesce((choice->>'correct')::boolean,false) limit 1;
    return query select coalesce(v_correct_key=p_chosen_key,false),
      case when v_correct_key=p_chosen_key then 0.25 else 0 end::numeric,0.25::numeric; return;
  end if;
  if lower(v_first_key) in ('a','b','c','d') and jsonb_array_length(v_choices)=4 then
    begin v_selected:=coalesce(nullif(p_chosen_key,''),'{}')::jsonb;
    exception when others then v_selected:='{}'::jsonb; end;
    select count(*),count(*) filter(where coalesce(v_selected->>(choice->>'key'),'')=
      case when coalesce((choice->>'correct')::boolean,false) then 'D' else 'S' end)
    into v_total,v_matches from jsonb_array_elements(v_choices) choice;
    return query select v_matches=v_total,
      case v_matches when 1 then 0.1 when 2 then 0.25 when 3 then 0.5 when 4 then 1.0 else 0 end::numeric,
      1.0::numeric; return;
  end if;
  v_correct_key:=coalesce(v_choices->0->>'latex','');
  return query select
    private.vm_bank_normalize_short_answer(p_chosen_key)=
      private.vm_bank_normalize_short_answer(v_correct_key),
    case when private.vm_bank_normalize_short_answer(p_chosen_key)=
      private.vm_bank_normalize_short_answer(v_correct_key) then 0.5 else 0 end::numeric,
    0.5::numeric;
end;
$function$;

revoke all on function private.vm_exam_grade_answer(uuid,text) from public, anon, authenticated;
grant execute on function private.vm_exam_grade_answer(uuid,text) to service_role;

create or replace function private.vm_bank_build_recommendations(p_attempt_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_attempt public.attempts%rowtype;
  v_source private.vm_question_bank_items%rowtype;
  v_inserted integer := 0;
  v_rows integer;
begin
  select * into v_attempt from public.attempts where id=p_attempt_id;
  if v_attempt.id is null or v_attempt.submitted_at is null then return 0; end if;
  delete from private.vm_question_bank_recommendations where attempt_id=p_attempt_id and status='ready';

  for v_source in
    select i.*
    from public.exam_questions eq
    join private.vm_question_bank_items i
      on i.id=private.vm_bank_question_item_id(eq.exam_id,eq.question_id)
    left join public.attempt_answers aa on aa.attempt_id=p_attempt_id and aa.question_id=eq.question_id
    where eq.exam_id=v_attempt.exam_id and coalesce(aa.is_correct,false)=false and i.status='active'
  loop
    insert into private.vm_question_bank_recommendations(
      student_id,attempt_id,source_item_id,recommended_item_id,score,reason
    )
    select v_attempt.student_id,p_attempt_id,v_source.id,c.id,
      (case
        when c.similarity_key is not null and c.similarity_key=v_source.similarity_key then 100
        when c.legacy_code is not null and c.legacy_code=v_source.legacy_code then 95
        when coalesce(c.taxonomy->>'skill_family',c.taxonomy->>'skill_code','')<>''
          and coalesce(c.taxonomy->>'skill_family',c.taxonomy->>'skill_code')=
            coalesce(v_source.taxonomy->>'skill_family',v_source.taxonomy->>'skill_code') then 85
        when coalesce(c.taxonomy->>'topic_code',c.taxonomy->>'chapter_code','')<>''
          and coalesce(c.taxonomy->>'topic_code',c.taxonomy->>'chapter_code')=
            coalesce(v_source.taxonomy->>'topic_code',v_source.taxonomy->>'chapter_code') then 70
        else 50 end
        - 5*abs(
          case c.difficulty when 'NB' then 1 when 'TH' then 2 when 'VD' then 3 else 4 end
          - case v_source.difficulty when 'NB' then 1 when 'TH' then 2 when 'VD' then 3 else 4 end
        ))::integer,
      case
        when c.similarity_key is not null and c.similarity_key=v_source.similarity_key then 'Cùng kỹ năng'
        when c.legacy_code is not null and c.legacy_code=v_source.legacy_code then 'Cùng ID phân loại'
        when coalesce(c.taxonomy->>'skill_family',c.taxonomy->>'skill_code','')<>''
          and coalesce(c.taxonomy->>'skill_family',c.taxonomy->>'skill_code')=
            coalesce(v_source.taxonomy->>'skill_family',v_source.taxonomy->>'skill_code') then 'Cùng dạng toán'
        when coalesce(c.taxonomy->>'topic_code',c.taxonomy->>'chapter_code','')<>''
          and coalesce(c.taxonomy->>'topic_code',c.taxonomy->>'chapter_code')=
            coalesce(v_source.taxonomy->>'topic_code',v_source.taxonomy->>'chapter_code') then 'Cùng chương'
        else 'Cùng khối và loại câu hỏi' end
    from private.vm_question_bank_items c
    where c.status='active' and c.id<>v_source.id
      and c.question_type=v_source.question_type
      and (v_source.grade is null or c.grade=v_source.grade)
      and not exists(
        select 1 from private.vm_question_bank_exam_occurrences current_q
        where current_q.exam_id=v_attempt.exam_id and current_q.item_id=c.id
      )
      and not exists(
        select 1 from public.attempts old_attempt
        join public.attempt_answers old_answer on old_answer.attempt_id=old_attempt.id
        join private.vm_question_bank_exam_occurrences old_occurrence
          on old_occurrence.exam_id=old_attempt.exam_id
         and old_occurrence.question_id=old_answer.question_id
         and old_occurrence.item_id=c.id
        where old_attempt.student_id=v_attempt.student_id
          and old_attempt.submitted_at is not null
      )
    order by
      case
        when c.similarity_key is not null and c.similarity_key=v_source.similarity_key then 100
        when c.legacy_code is not null and c.legacy_code=v_source.legacy_code then 95
        when coalesce(c.taxonomy->>'skill_family',c.taxonomy->>'skill_code','')<>''
          and coalesce(c.taxonomy->>'skill_family',c.taxonomy->>'skill_code')=
            coalesce(v_source.taxonomy->>'skill_family',v_source.taxonomy->>'skill_code') then 85
        when coalesce(c.taxonomy->>'topic_code',c.taxonomy->>'chapter_code','')<>''
          and coalesce(c.taxonomy->>'topic_code',c.taxonomy->>'chapter_code')=
            coalesce(v_source.taxonomy->>'topic_code',v_source.taxonomy->>'chapter_code') then 70
        else 50 end desc,
      abs(
        case c.difficulty when 'NB' then 1 when 'TH' then 2 when 'VD' then 3 else 4 end
        - case v_source.difficulty when 'NB' then 1 when 'TH' then 2 when 'VD' then 3 else 4 end
      ),
      md5(p_attempt_id::text||c.stable_id)
    limit 4
    on conflict (attempt_id,source_item_id,recommended_item_id) do nothing;
    get diagnostics v_rows=row_count;
    v_inserted:=v_inserted+v_rows;
  end loop;
  return v_inserted;
end;
$function$;

revoke all on function private.vm_bank_build_recommendations(uuid) from public, anon, authenticated, service_role;

create or replace function public.vm_exam_recommendations(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare v_attempt public.attempts%rowtype; v_items jsonb;
begin
  select * into v_attempt from public.attempts where id=p_attempt_id;
  if v_attempt.id is null or v_attempt.submitted_at is null
    or not (
      (v_attempt.student_id=auth.uid() and not public.is_staff())
      or public.is_admin()
      or private.vm_bank_can_manage_exam(v_attempt.exam_id)
    ) then
    raise exception 'attempt_access_denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(item order by score desc,sort_key),'[]'::jsonb) into v_items
  from (
    select distinct on (r.recommended_item_id)
      r.score,i.stable_id sort_key,
      jsonb_build_object(
        'question_type',i.question_type,'difficulty',i.difficulty,'grade',i.grade,
        'reason',r.reason,'score',r.score
      ) item
    from private.vm_question_bank_recommendations r
    join private.vm_question_bank_items i on i.id=r.recommended_item_id and i.status='active'
    where r.attempt_id=p_attempt_id and r.student_id=v_attempt.student_id and r.status in ('ready','used')
    order by r.recommended_item_id,r.score desc
  ) rows;
  return jsonb_build_object('count',jsonb_array_length(v_items),'items',v_items);
end;
$function$;

revoke all on function public.vm_exam_recommendations(uuid) from public, anon;
grant execute on function public.vm_exam_recommendations(uuid) to authenticated, service_role;

create or replace function public.vm_exam_create_recovery(p_attempt_id uuid,p_limit integer default 8)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_attempt public.attempts%rowtype;
  v_exam_id uuid;
  v_existing public.exams%rowtype;
  v_items uuid[];
  v_limit integer:=least(greatest(coalesce(p_limit,8),1),20);
  v_count integer;
  v_title text;
begin
  select * into v_attempt from public.attempts where id=p_attempt_id for update;
  if v_attempt.id is null
    or v_attempt.student_id<>auth.uid()
    or v_attempt.submitted_at is null
    or public.is_staff() then
    raise exception 'attempt_access_denied' using errcode='42501';
  end if;
  select * into v_existing from public.exams
  where owner_student_id=auth.uid() and source_attempt_id=p_attempt_id limit 1;
  if v_existing.id is not null then
    select count(*) into v_count from public.exam_questions where exam_id=v_existing.id;
    return jsonb_build_object('exam_id',v_existing.id,'title',v_existing.title,'count',v_count,'question_count',v_count,'existing',true);
  end if;

  if not exists(select 1 from private.vm_question_bank_recommendations where attempt_id=p_attempt_id and status='ready') then
    perform private.vm_bank_build_recommendations(p_attempt_id);
  end if;
  select coalesce(array_agg(recommended_item_id order by best_score desc,stable_id),'{}'::uuid[]) into v_items
  from (
    select r.recommended_item_id,max(r.score) best_score,min(i.stable_id) stable_id
    from private.vm_question_bank_recommendations r
    join private.vm_question_bank_items i on i.id=r.recommended_item_id and i.status='active'
    where r.attempt_id=p_attempt_id and r.student_id=auth.uid() and r.status='ready'
    group by r.recommended_item_id
    order by best_score desc,stable_id
    limit v_limit
  ) picked;
  v_count:=cardinality(v_items);
  if v_count=0 then raise exception 'bank_no_recovery_questions' using errcode='P0002'; end if;
  v_title:='Luyện lại câu tương tự · '||to_char(now(),'DD/MM/YYYY');
  insert into public.exams(
    class_id,title,duration_minutes,shuffle,published,de_type,template_key,allow_solution_pdf,
    owner_student_id,source_attempt_id,bank_generated,generation_spec,generated_by
  ) values (
    null,v_title,least(greatest(v_count*5,15),90),true,true,'mc','bank-recovery',false,
    auth.uid(),p_attempt_id,true,jsonb_build_object('mode','recovery','question_count',v_count),auth.uid()
  ) returning id into v_exam_id;
  insert into private.vm_question_bank_exam_specs(exam_id,mode,spec,created_by)
  values(v_exam_id,'recovery',jsonb_build_object('attempt_id',p_attempt_id,'limit',v_limit),auth.uid());
  insert into public.exam_questions(exam_id,question_id,sort)
  select v_exam_id,i.snapshot_question_id,(picked.ordinality-1)::integer
  from unnest(v_items) with ordinality picked(item_id,ordinality)
  join private.vm_question_bank_items i on i.id=picked.item_id
  order by picked.ordinality;
  insert into private.vm_question_bank_exam_occurrences(exam_id,question_id,item_id,sort)
  select v_exam_id,i.snapshot_question_id,i.id,(picked.ordinality-1)::integer
  from unnest(v_items) with ordinality picked(item_id,ordinality)
  join private.vm_question_bank_items i on i.id=picked.item_id
  order by picked.ordinality;
  update private.vm_question_bank_recommendations
  set status='used'
  where attempt_id=p_attempt_id and student_id=auth.uid() and recommended_item_id=any(v_items);
  return jsonb_build_object('exam_id',v_exam_id,'title',v_title,'count',v_count,'question_count',v_count,'existing',false);
end;
$function$;

revoke all on function public.vm_exam_create_recovery(uuid,integer) from public, anon;
grant execute on function public.vm_exam_create_recovery(uuid,integer) to authenticated, service_role;

create or replace function public.vm_exam_submit(p_attempt_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_attempt public.attempts%rowtype;
  v_exam_type text;
  v_earned numeric:=0;
  v_maximum numeric:=0;
  v_correct integer:=0;
  v_total integer:=0;
  v_score numeric(4,2):=0;
begin
  select * into v_attempt from public.attempts where id=p_attempt_id for update;
  if v_attempt.id is null or v_attempt.student_id<>auth.uid() then
    raise exception 'attempt_access_denied' using errcode='42501';
  end if;
  if v_attempt.submitted_at is not null then
    perform private.vm_bank_build_recommendations(v_attempt.id);
    return jsonb_build_object('id',v_attempt.id,'score',v_attempt.score,'correct_n',v_attempt.correct_n,
      'total_n',v_attempt.total_n,'submitted_at',v_attempt.submitted_at);
  end if;
  if not private.vm_can_access_exam(v_attempt.exam_id) then
    raise exception 'exam_access_denied' using errcode='42501';
  end if;
  select de_type into v_exam_type from public.exams where id=v_attempt.exam_id;
  if v_exam_type='essay' then
    update public.attempts set submitted_at=now(),score=null,correct_n=null,total_n=null
    where id=v_attempt.id returning * into v_attempt;
    return jsonb_build_object('id',v_attempt.id,'exam_id',v_attempt.exam_id,'score',v_attempt.score,
      'correct_n',v_attempt.correct_n,'total_n',v_attempt.total_n,'submitted_at',v_attempt.submitted_at);
  end if;
  select coalesce(sum(g.earned),0),coalesce(sum(g.maximum),0),
    count(*) filter(where g.is_correct),count(*)
  into v_earned,v_maximum,v_correct,v_total
  from public.exam_questions eq
  left join public.attempt_answers aa on aa.attempt_id=v_attempt.id and aa.question_id=eq.question_id
  cross join lateral private.vm_exam_grade_answer(eq.question_id,aa.chosen_key) g
  where eq.exam_id=v_attempt.exam_id;
  if v_maximum>0 then v_score:=round((v_earned/v_maximum)*10,2); end if;
  update public.attempts set score=v_score,correct_n=v_correct,total_n=v_total,submitted_at=now()
  where id=v_attempt.id returning * into v_attempt;
  perform private.vm_bank_build_recommendations(v_attempt.id);
  return jsonb_build_object('id',v_attempt.id,'exam_id',v_attempt.exam_id,'score',v_attempt.score,
    'correct_n',v_attempt.correct_n,'total_n',v_attempt.total_n,'submitted_at',v_attempt.submitted_at);
end;
$function$;

revoke all on function public.vm_exam_submit(uuid) from public, anon;
grant execute on function public.vm_exam_submit(uuid) to authenticated, service_role;
