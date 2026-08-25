-- Preserve the last known-good lifecycle and occurrence map when a complete
-- source is retried in chunks.  A fresh upload of the same raw TeX resolves to
-- the same content_hash; without this guard its first (staged) chunk could
-- overwrite import_state=complete and leave a previously assignable source
-- unavailable if a later chunk failed.

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
  v_result jsonb;
  v_preserved integer;
  v_quarantined integer;
  v_document_raw text:=coalesce(p_document->>'raw_tex','');
  v_document_hash text;
  v_existing_source_kind text;
  v_requested_source_kind text:=coalesce(
    nullif(p_document->>'source_kind',''),'topic_pack'
  );
  v_existing private.vm_question_bank_documents%rowtype;
  v_existing_ready boolean:=false;
  v_existing_linked integer:=0;
  v_existing_active integer:=0;
  v_existing_quarantined integer:=0;
  v_existing_expected integer;
  v_existing_map jsonb:='[]'::jsonb;
  v_requested_expected integer;
  v_result_document_id uuid;
  v_after_linked integer:=0;
  v_after_active integer:=0;
  v_after_quarantined integer:=0;
  v_after_map jsonb:='[]'::jsonb;
  v_ready_lifecycle jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'bank_admin_required' using errcode='42501';
  end if;

  -- Resolve and lock the same document row that the import core will use.
  -- This serializes concurrent retries before either can alter occurrences.
  if v_document_raw<>'' then
    if v_requested_source_kind='tex_upload' then
      v_requested_source_kind:=case
        when coalesce(p_document->'metadata'->>'exam_type','')='chapter'
          then 'topic_pack' else 'mock_exam' end;
    elsif v_requested_source_kind not in (
      'topic_pack','mock_exam','manual','other'
    ) then
      v_requested_source_kind:='other';
    end if;
    v_document_hash:=encode(
      extensions.digest(convert_to(v_document_raw,'UTF8'),'sha256'),'hex'
    );
    select * into v_existing
    from private.vm_question_bank_documents
    where content_hash=v_document_hash
    for update;
    if v_existing.id is not null then
      v_existing_source_kind:=v_existing.source_kind;
      if v_existing_source_kind<>v_requested_source_kind then
        raise exception 'bank_document_kind_conflict existing %, requested %',
          v_existing_source_kind,v_requested_source_kind using errcode='22023';
      end if;
    end if;
  elsif nullif(p_document->>'id','') is not null then
    select * into v_existing
    from private.vm_question_bank_documents
    where id=(p_document->>'id')::uuid
    for update;
  end if;

  -- Only explicit complete sources receive this invariant.  Legacy sources
  -- remain governed by the compatibility readiness rule from the prior
  -- migration, while incomplete sources remain repairable through finalize.
  if v_existing.id is not null
    and v_existing.status='active'
    and lower(coalesce(v_existing.metadata->>'import_state',''))='complete'
  then
    select
      count(*)::integer,
      count(*) filter (where item.status='active')::integer,
      count(*) filter (where item.status='quarantined')::integer,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'ordinal',source.source_ordinal,
            'item_id',source.item_id
          ) order by source.source_ordinal
        ),
        '[]'::jsonb
      )
    into v_existing_linked,v_existing_active,v_existing_quarantined,
      v_existing_map
    from private.vm_question_bank_item_sources source
    join private.vm_question_bank_items item on item.id=source.item_id
    where source.document_id=v_existing.id;

    v_existing_ready:=private.vm_bank_document_is_ready(
      v_existing.metadata,v_existing_linked,v_existing_active,
      v_existing_quarantined
    );
    if v_existing_ready then
      v_existing_expected:=(v_existing.metadata->>'expected_count')::integer;
      if coalesce(
        p_document->'metadata'->>'expected_count',
        p_document->>'expected_count',''
      ) ~ '^[1-9][0-9]*$' then
        v_requested_expected:=coalesce(
          p_document->'metadata'->>'expected_count',
          p_document->>'expected_count'
        )::integer;
      end if;
      if v_requested_expected is not null
        and v_requested_expected<>v_existing_expected then
        raise exception
          'bank_ready_source_expected_mismatch existing %, requested %',
          v_existing_expected,v_requested_expected using errcode='22023';
      end if;
    end if;
  end if;

  perform set_config('vm.bank_import_guard','on',true);
  perform set_config('vm.bank_import_preserved','0',true);
  v_result:=private.vm_bank_admin_import_core(p_document,p_items);
  v_preserved:=coalesce(nullif(
    current_setting('vm.bank_import_preserved',true),''
  )::integer,0);
  v_quarantined:=greatest(
    coalesce((v_result->>'quarantined')::integer,0)-v_preserved,0
  );

  if v_existing_ready then
    v_result_document_id:=nullif(v_result->>'document_id','')::uuid;
    if v_result_document_id is distinct from v_existing.id then
      raise exception 'bank_ready_source_document_changed'
        using errcode='55000';
    end if;

    select
      count(*)::integer,
      count(*) filter (where item.status='active')::integer,
      count(*) filter (where item.status='quarantined')::integer,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'ordinal',source.source_ordinal,
            'item_id',source.item_id
          ) order by source.source_ordinal
        ),
        '[]'::jsonb
      )
    into v_after_linked,v_after_active,v_after_quarantined,v_after_map
    from private.vm_question_bank_item_sources source
    join private.vm_question_bank_items item on item.id=source.item_id
    where source.document_id=v_existing.id;

    -- Fail closed.  Raising here rolls back the entire chunk, including the
    -- document metadata merge and any ordinal relink performed by the core.
    if v_after_linked<>v_existing_linked
      or v_after_active<>v_after_linked
      or v_after_quarantined<>0
      or v_after_map is distinct from v_existing_map then
      raise exception 'bank_ready_source_reimport_changed_integrity'
        using errcode='55000';
    end if;

    v_ready_lifecycle:=jsonb_build_object(
      'import_state','complete',
      'expected_count',v_existing_expected
    );
    if v_existing.metadata ? 'finalized_at' then
      v_ready_lifecycle:=v_ready_lifecycle||jsonb_build_object(
        'finalized_at',v_existing.metadata->'finalized_at'
      );
    end if;
    update private.vm_question_bank_documents
    set metadata=(
          coalesce(metadata,'{}'::jsonb)
          - 'import_state' - 'expected_count' - 'finalized_at'
        )||v_ready_lifecycle,
        status=v_existing.status,
        updated_at=now()
    where id=v_existing.id;

    v_result:=v_result||jsonb_build_object(
      'ready_source_preserved',true,
      'ready_source_expected_count',v_existing_expected
    );
  end if;

  perform set_config('vm.bank_import_guard','off',true);
  return v_result||jsonb_build_object(
    'quarantined',v_quarantined,'protected_active',v_preserved
  );
exception when others then
  perform set_config('vm.bank_import_guard','off',true);
  raise;
end;
$function$;

revoke all on function public.vm_bank_admin_import(jsonb,jsonb)
  from public, anon;
grant execute on function public.vm_bank_admin_import(jsonb,jsonb)
  to authenticated, service_role;
