-- Recover only IDs that are still present as one unambiguous, valid token on
-- the question environment's opening comment line.  This covers a few legacy
-- authoring variants such as %[author][ID], %[[ID]], and %[ID without a final
-- bracket.  Malformed codes, missing codes, and multi-ID true/false headers are
-- intentionally left in the review queue.
create temporary table vm_bank_embedded_id_recovery
on commit drop
as
with candidate_tokens as (
  select item.id,
         upper((token.match)[1]) candidate
  from private.vm_question_bank_items item
  cross join lateral regexp_matches(
    substring(
      split_part(item.raw_tex,E'\n',1)
      from position('%' in split_part(item.raw_tex,E'\n',1)) + 1
    ),
    E'\\[\\s*([012][A-Za-z][0-9]+[A-Za-z][0-9]+-[A-Za-z0-9-]+)\\s*(\\]|%|$)',
    'g'
  ) token(match)
  where item.status='quarantined'
    and nullif(btrim(item.legacy_code),'') is null
    and position('%' in split_part(item.raw_tex,E'\n',1))>0
), unique_tokens as (
  -- Count every structurally valid token before taxonomy lookup.  A second
  -- unmapped token is still ambiguity and must remain in the review queue.
  select id,min(candidate) candidate
  from candidate_tokens
  group by id
  having count(distinct candidate)=1
), valid_candidates as (
  select distinct token.id,token.candidate,taxonomy.taxonomy_key,
         taxonomy.grade,taxonomy.topic_code,taxonomy.skill_family,
         taxonomy.variant,taxonomy.vi_label,taxonomy.slug_label,
         private.vm_bank_difficulty_from_legacy(token.candidate) difficulty
  from unique_tokens token
  join private.vm_question_bank_taxonomy taxonomy
    on taxonomy.taxonomy_key=private.vm_bank_taxonomy_key_from_legacy(token.candidate)
   and taxonomy.status='active'
  where private.vm_bank_difficulty_from_legacy(token.candidate) is not null
)
select candidate.id,candidate.candidate,candidate.taxonomy_key,
       candidate.grade,candidate.topic_code,candidate.skill_family,
       candidate.variant,candidate.vi_label,candidate.slug_label,
       candidate.difficulty,
       nullif((
         select string_agg(part.value,'; ' order by part.ordinality)
         from unnest(string_to_array(coalesce(item.quarantine_reason,''),';'))
           with ordinality part(value,ordinality)
         where btrim(part.value)<>''
           and lower(btrim(part.value)) not in (
             lower('Chưa gắn ID phân loại'),
             'missing_or_invalid_id'
           )
       ),'') remaining_reason
from valid_candidates candidate
join private.vm_question_bank_items item on item.id=candidate.id;

update private.vm_question_bank_items item
set legacy_code=recovery.candidate,
    grade=recovery.grade,
    difficulty=recovery.difficulty,
    similarity_key=recovery.taxonomy_key,
    taxonomy=item.taxonomy || jsonb_build_object(
      'key',recovery.taxonomy_key,
      'taxonomy_key',recovery.taxonomy_key,
      'similarity_key',recovery.taxonomy_key,
      'topic_code',recovery.topic_code,
      'skill_family',recovery.skill_family,
      'variant',recovery.variant,
      'vi',recovery.vi_label,
      'slug',recovery.slug_label,
      'id_recovery',jsonb_build_object(
        'method','unique_opening_comment_token',
        'source','legacy_tex'
      )
    ),
    canonical_tex=case
      when item.canonical_tex ~ E'(\\\\begin\\{ex\\}|\\\\begin\\{bt\\})\\s*%\\[[^]]*\\]'
        then regexp_replace(
          item.canonical_tex,
          E'(\\\\begin\\{ex\\}|\\\\begin\\{bt\\})\\s*%\\[[^]]*\\]',
          E'\\1%['||recovery.candidate||']','i'
        )
      else regexp_replace(
        item.canonical_tex,
        E'(\\\\begin\\{ex\\}|\\\\begin\\{bt\\})',
        E'\\1%['||recovery.candidate||']','i'
      )
    end,
    quarantine_reason=recovery.remaining_reason,
    updated_at=now()
from vm_bank_embedded_id_recovery recovery
where item.id=recovery.id
  and item.status='quarantined'
  and nullif(btrim(item.legacy_code),'') is null;

update private.vm_question_bank_item_sources source
set source_legacy_code=recovery.candidate,
    source_metadata=source.source_metadata || jsonb_build_object(
      'id_recovery',jsonb_build_object(
        'method','unique_opening_comment_token',
        'source','legacy_tex'
      )
    )
from vm_bank_embedded_id_recovery recovery
where source.item_id=recovery.id
  and nullif(btrim(source.source_legacy_code),'') is null;

update public.questions question
set difficulty=item.difficulty
from vm_bank_embedded_id_recovery recovery
join private.vm_question_bank_items item on item.id=recovery.id
where question.id=item.snapshot_question_id;

-- Promote only rows whose sole quarantine reason was the missing ID and whose
-- answer shape already satisfies the student-facing guard.  Essay rows keep
-- their recovered ID but remain quarantined for manual/unsupported handling.
update private.vm_question_bank_items item
set status='active',quarantine_reason=null,updated_at=now()
from vm_bank_embedded_id_recovery recovery
where item.id=recovery.id
  and recovery.remaining_reason is null
  and nullif(btrim(item.content_latex),'') is not null
  and (
    (
      item.question_type='multiple_choice'
      and jsonb_typeof(item.public_choices)='array'
      and jsonb_array_length(item.public_choices)=4
      and jsonb_typeof(item.answer_key->'correct_indexes')='array'
      and jsonb_array_length(item.answer_key->'correct_indexes')=1
      and not exists (
        select 1
        from jsonb_array_elements_text(item.answer_key->'correct_indexes') answer(value)
        where answer.value !~ '^[0-3]$'
      )
    )
    or (
      item.question_type='true_false'
      and jsonb_typeof(item.public_choices)='array'
      and jsonb_array_length(item.public_choices)=4
      and jsonb_typeof(item.answer_key->'correct_indexes')='array'
      and not exists (
        select 1
        from jsonb_array_elements_text(item.answer_key->'correct_indexes') answer(value)
        where answer.value !~ '^[0-3]$'
      )
      and (
        select count(*)=count(distinct answer.value)
        from jsonb_array_elements_text(item.answer_key->'correct_indexes') answer(value)
      )
    )
    or (
      item.question_type='short_answer'
      and nullif(btrim(item.answer_key->>'value'),'') is not null
    )
  );
