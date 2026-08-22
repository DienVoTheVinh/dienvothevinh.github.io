-- Keep the randomly assigned starter species secret until the egg hatches.
-- Direct table reads are already revoked; this closes the RPC response path.
create or replace function public.companion_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_state public.student_companion_state%rowtype;
  v_xp integer := 0;
  v_level smallint := 1;
  v_unlocked smallint := 1;
  v_owned jsonb := '[]'::jsonb;
  v_coins integer := 0;
begin
  if v_uid is null then return jsonb_build_object('error','not_authenticated'); end if;
  select * into v_state from public.student_companion_state where student_id=v_uid;
  select coalesce(xp,0) into v_xp from public.student_stats where student_id=v_uid;
  select coalesce(unlocked_major,1) into v_unlocked from public.student_rank_progress where student_id=v_uid;
  v_level := least(public.rank_level_from_xp(v_xp)::integer, v_unlocked::integer*4)::smallint;
  select coalesce(jsonb_agg(companion_code order by unlocked_at),'[]'::jsonb) into v_owned
  from public.student_companions where student_id=v_uid;
  select coalesce(sum(coins),0) into v_coins from public.student_coin_ledger where student_id=v_uid;

  return jsonb_build_object(
    'chosen', v_state.student_id is not null,
    'egg_slot', v_state.egg_slot,
    'hatched', v_level >= 5,
    'incubation_stage', least(4, greatest(1, v_level)),
    'active_code', case when v_level >= 5 then v_state.active_code else null end,
    'evolution_major', greatest(1, ceil(v_level / 4.0)::integer),
    'owned', case when v_level >= 5 then v_owned else '[]'::jsonb end,
    'coins', v_coins,
    'shop', jsonb_build_array(
      jsonb_build_object('code','kim_ho','price',300),
      jsonb_build_object('code','lam_long','price',300),
      jsonb_build_object('code','van_mieu','price',300)
    )
  );
end;
$$;

revoke execute on function public.companion_snapshot() from public, anon;
grant execute on function public.companion_snapshot() to authenticated;
