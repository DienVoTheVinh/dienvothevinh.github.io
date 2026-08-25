-- The first issue-report release is already live. Keep its implementation as
-- a non-client internal function, then place a small fail-closed wrapper in
-- front of it. This prevents a teacher from using a guessed private item UUID
-- (item_id/target_id) as a match/no-match oracle while preserving admin repair
-- tooling and the public RPC signature.

alter function public.vm_bank_report_issue(text,jsonb,text,text)
  rename to vm_bank_report_issue_internal;

revoke all on function public.vm_bank_report_issue_internal(text,jsonb,text,text)
  from public, anon, authenticated, service_role;

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
  v_target_type text:=lower(trim(coalesce(p_target_type,'')));
  v_target jsonb:=coalesce(p_target,'{}'::jsonb);
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'bank_teacher_required' using errcode='42501';
  end if;
  if not public.is_admin() and (
    v_target ? 'item_id'
    or (v_target_type='question' and v_target ? 'target_id')
  ) then
    raise exception 'bank_issue_locator_invalid' using errcode='22023';
  end if;

  return public.vm_bank_report_issue_internal(
    p_target_type,p_target,p_issue_type,p_description
  );
end;
$function$;

revoke all on function public.vm_bank_report_issue(text,jsonb,text,text)
  from public, anon;
grant execute on function public.vm_bank_report_issue(text,jsonb,text,text)
  to authenticated;
