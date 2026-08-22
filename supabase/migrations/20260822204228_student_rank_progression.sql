-- VinhMath student rank progression: 11 major ranks x 4 medals.
-- Existing XP and levels are preserved. Current students are grandfathered into
-- their present major rank; only future major-rank transitions require a test.

create or replace function public.rank_level_from_xp(p_xp integer)
returns smallint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_xp integer := greatest(coalesce(p_xp, 0), 0);
  v_level integer := 1;
begin
  while v_level < 44
    and v_xp >= (100 * v_level + 25 * v_level * (v_level - 1))
  loop
    v_level := v_level + 1;
  end loop;
  return v_level::smallint;
end;
$$;

create table if not exists public.student_rank_progress (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  unlocked_major smallint not null default 1,
  updated_at timestamptz not null default now(),
  constraint student_rank_progress_major_check check (unlocked_major between 1 and 11)
);

create table if not exists public.rank_breakthrough_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  target_major smallint not null,
  attempt_no integer not null default 1,
  status text not null default 'requested',
  score numeric(4,2),
  feedback text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  constraint rank_breakthrough_target_check check (target_major between 2 and 11),
  constraint rank_breakthrough_attempt_check check (attempt_no > 0),
  constraint rank_breakthrough_status_check check (status in ('requested', 'passed', 'failed')),
  constraint rank_breakthrough_score_check check (score is null or score between 0 and 10),
  constraint rank_breakthrough_student_target_attempt_key unique (student_id, target_major, attempt_no)
);

create index if not exists rank_breakthrough_student_idx
  on public.rank_breakthrough_attempts (student_id, target_major, requested_at desc);
create index if not exists rank_breakthrough_staff_queue_idx
  on public.rank_breakthrough_attempts (status, requested_at)
  where status = 'requested';
create index if not exists rank_breakthrough_reviewer_idx
  on public.rank_breakthrough_attempts (reviewed_by)
  where reviewed_by is not null;
create unique index if not exists rank_breakthrough_one_pending_idx
  on public.rank_breakthrough_attempts (student_id, target_major)
  where status = 'requested';

alter table public.student_rank_progress enable row level security;
alter table public.rank_breakthrough_attempts enable row level security;

drop policy if exists student_rank_progress_read on public.student_rank_progress;
create policy student_rank_progress_read
on public.student_rank_progress for select to authenticated
using (
  student_id = (select auth.uid())
  or (select public.is_staff())
  or exists (
    select 1 from public.profiles p
    where p.id = student_rank_progress.student_id
      and p.parent_id = (select auth.uid())
  )
);

drop policy if exists rank_breakthrough_attempts_read on public.rank_breakthrough_attempts;
create policy rank_breakthrough_attempts_read
on public.rank_breakthrough_attempts for select to authenticated
using (
  student_id = (select auth.uid())
  or (select public.is_staff())
  or exists (
    select 1 from public.profiles p
    where p.id = rank_breakthrough_attempts.student_id
      and p.parent_id = (select auth.uid())
  )
);

revoke all on public.student_rank_progress from anon, authenticated;
revoke all on public.rank_breakthrough_attempts from anon, authenticated;
grant select on public.student_rank_progress to authenticated;
grant select on public.rank_breakthrough_attempts to authenticated;

-- Preserve every current student's major rank during rollout.
insert into public.student_rank_progress (student_id, unlocked_major)
select p.id,
       least(11, greatest(1, ceil(least(44, greatest(1, coalesce(s.level, 1))) / 4.0)::integer))::smallint
from public.profiles p
left join public.student_stats s on s.student_id = p.id
where p.role = 'student'
on conflict (student_id) do nothing;

create or replace function public.ensure_student_rank_progress()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  if new.role = 'student' then
    insert into public.student_rank_progress (student_id, unlocked_major)
    values (new.id, 1)
    on conflict (student_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_ensure_student_rank_progress on public.profiles;
create trigger profiles_ensure_student_rank_progress
after insert or update of role on public.profiles
for each row execute function public.ensure_student_rank_progress();

create or replace function public.student_rank_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_xp integer := 0;
  v_raw_level smallint := 1;
  v_visible_level smallint := 1;
  v_unlocked_major smallint := 1;
  v_target_major smallint;
  v_attempt public.rank_breakthrough_attempts%rowtype;
  v_badges jsonb := '[]'::jsonb;
  v_missed integer := 0;
  v_overdue integer := 0;
  v_late integer := 0;
  v_counts jsonb := '{}'::jsonb;
  v_streak integer := 0;
  v_longest integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'student') then
    return jsonb_build_object('error', 'student_only');
  end if;

  insert into public.student_rank_progress (student_id, unlocked_major)
  values (v_uid, 1)
  on conflict (student_id) do nothing;

  select coalesce(s.xp, 0), coalesce(s.streak, 0), coalesce(s.longest_streak, 0)
    into v_xp, v_streak, v_longest
  from public.student_stats s where s.student_id = v_uid;
  v_xp := coalesce(v_xp, 0);
  v_raw_level := public.rank_level_from_xp(v_xp);

  select unlocked_major into v_unlocked_major
  from public.student_rank_progress where student_id = v_uid;
  v_unlocked_major := coalesce(v_unlocked_major, 1);
  v_visible_level := least(v_raw_level::integer, v_unlocked_major::integer * 4)::smallint;

  if v_unlocked_major < 11 and v_raw_level > v_unlocked_major * 4 then
    v_target_major := v_unlocked_major + 1;
    select * into v_attempt
    from public.rank_breakthrough_attempts
    where student_id = v_uid and target_major = v_target_major
    order by requested_at desc limit 1;
  end if;

  select jsonb_build_object(
    'btvn', count(*) filter (where kind in ('btvn', 'btvn_bonus')),
    'test', count(*) filter (where kind = 'test'),
    'lesson', count(*) filter (where kind = 'lesson'),
    'review', count(*) filter (where kind = 'review'),
    'dando', count(*) filter (where kind = 'dando')
  ) into v_counts
  from public.student_xp_ledger where student_id = v_uid;

  select count(*) into v_missed
  from public.class_sessions cs
  join public.class_students cst on cst.class_id = cs.class_id and cst.student_id = v_uid
  left join public.attendance a on a.session_id = cs.id and a.student_id = v_uid
  where cs.held_on >= current_date - 90 and cs.held_on < current_date
    and a.status = 'absent';

  select count(*) into v_overdue
  from public.lessons l
  join public.class_students cst on cst.class_id = l.class_id and cst.student_id = v_uid
  where l.published = true
    and l.created_at >= now() - interval '60 days'
    and coalesce(l.homework_bonus, false) = false
    and (l.homework_text is not null or l.homework_images is not null
      or l.homework_latex_content is not null or l.homework_document_id is not null)
    and coalesce(l.homework_due, l.created_at + interval '7 days') < now()
    and not exists (
      select 1 from public.submissions s
      where s.student_id = v_uid and s.lesson_id = l.id and s.kind = 'homework'
    );

  select count(*) into v_late
  from public.submissions s
  where s.student_id = v_uid and coalesce(s.is_late, false) = true;

  if (v_counts->>'btvn')::integer >= 10 then
    insert into public.student_badges(student_id, code) values(v_uid, 'btvn_10') on conflict do nothing;
  end if;
  if (v_counts->>'btvn')::integer >= 25 then
    insert into public.student_badges(student_id, code) values(v_uid, 'btvn_25') on conflict do nothing;
  end if;
  if (v_counts->>'test')::integer >= 10 then
    insert into public.student_badges(student_id, code) values(v_uid, 'test_10') on conflict do nothing;
  end if;
  if (v_counts->>'review')::integer >= 10 then
    insert into public.student_badges(student_id, code) values(v_uid, 'review_10') on conflict do nothing;
  end if;
  if v_streak >= 14 then
    insert into public.student_badges(student_id, code) values(v_uid, 'streak_14') on conflict do nothing;
  end if;
  if v_streak >= 30 then
    insert into public.student_badges(student_id, code) values(v_uid, 'streak_30') on conflict do nothing;
  end if;
  if v_xp >= 1000 then
    insert into public.student_badges(student_id, code) values(v_uid, 'xp_1000') on conflict do nothing;
  end if;
  if v_missed >= 3 then
    insert into public.student_badges(student_id, code) values(v_uid, 'vua_cup_hoc') on conflict do nothing;
  end if;
  if v_overdue >= 5 then
    insert into public.student_badges(student_id, code) values(v_uid, 'vua_luoi_lam_bai') on conflict do nothing;
  end if;
  if v_late >= 3 then
    insert into public.student_badges(student_id, code) values(v_uid, 'nuoc_den_chan') on conflict do nothing;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'earned_at', earned_at) order by earned_at), '[]'::jsonb)
  into v_badges from public.student_badges where student_id = v_uid;

  return jsonb_build_object(
    'xp', v_xp,
    'raw_level', v_raw_level,
    'level', v_visible_level,
    'unlocked_major', v_unlocked_major,
    'xp_floor', 100 * (v_visible_level - 1) + 25 * (v_visible_level - 1) * (v_visible_level - 2),
    'xp_next', case when v_visible_level >= 44 then null else 100 * v_visible_level + 25 * v_visible_level * (v_visible_level - 1) end,
    'streak', v_streak,
    'longest_streak', v_longest,
    'counts', v_counts,
    'badges', v_badges,
    'humor_metrics', jsonb_build_object('missed_sessions', v_missed, 'overdue_homework', v_overdue, 'late_submissions', v_late),
    'breakthrough', case when v_target_major is null then null else jsonb_build_object(
      'eligible', true,
      'target_major', v_target_major,
      'attempt_id', v_attempt.id,
      'status', v_attempt.status,
      'score', v_attempt.score,
      'feedback', v_attempt.feedback,
      'attempt_no', v_attempt.attempt_no
    ) end
  );
end;
$$;

create or replace function public.request_rank_breakthrough()
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_xp integer := 0;
  v_raw_level smallint;
  v_unlocked smallint;
  v_target smallint;
  v_attempt_no integer;
  v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'message', 'Chưa đăng nhập'); end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'student') then
    return jsonb_build_object('ok', false, 'message', 'Chỉ học sinh được gửi yêu cầu');
  end if;

  select coalesce(xp, 0) into v_xp from public.student_stats where student_id = v_uid;
  v_raw_level := public.rank_level_from_xp(v_xp);
  select unlocked_major into v_unlocked from public.student_rank_progress where student_id = v_uid;
  v_unlocked := coalesce(v_unlocked, 1);
  if v_unlocked >= 11 or v_raw_level <= v_unlocked * 4 then
    return jsonb_build_object('ok', false, 'message', 'Em chưa ở cột mốc đột phá');
  end if;
  v_target := v_unlocked + 1;

  select id into v_id from public.rank_breakthrough_attempts
  where student_id = v_uid and target_major = v_target and status = 'requested'
  limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'attempt_id', v_id, 'status', 'requested', 'message', 'Yêu cầu đã được gửi trước đó');
  end if;

  select coalesce(max(attempt_no), 0) + 1 into v_attempt_no
  from public.rank_breakthrough_attempts where student_id = v_uid and target_major = v_target;
  insert into public.rank_breakthrough_attempts(student_id, target_major, attempt_no)
  values(v_uid, v_target, v_attempt_no) returning id into v_id;

  insert into public.notifications(user_id, title, body, kind, link)
  select distinct staff_id, '⚡ Học sinh xin kiểm tra đột phá',
         p.full_name || ' đã đủ XP và xin nhận bài kiểm tra đột phá cấp bậc.',
         'rank_breakthrough', 'quan-tri-cham-bai.html#rank-breakthrough'
  from public.profiles p
  cross join lateral (
    select a.id staff_id from public.profiles a where a.role = 'admin'
    union
    select c.teacher_id from public.class_students cs join public.classes c on c.id = cs.class_id
      where cs.student_id = v_uid and c.teacher_id is not null
    union
    select c.co_teacher_id from public.class_students cs join public.classes c on c.id = cs.class_id
      where cs.student_id = v_uid and c.co_teacher_id is not null
  ) staff
  where p.id = v_uid;

  return jsonb_build_object('ok', true, 'attempt_id', v_id, 'status', 'requested', 'message', 'Đã báo thầy/cô. Em hãy chuẩn bị cho bài kiểm tra đột phá!');
end;
$$;

create or replace function public.staff_rank_breakthrough_queue()
returns table(
  attempt_id uuid,
  student_id uuid,
  student_name text,
  class_names text,
  target_major smallint,
  attempt_no integer,
  status text,
  score numeric,
  feedback text,
  requested_at timestamptz,
  reviewed_at timestamptz
)
language sql
security definer
set search_path = 'public', 'pg_temp'
as $$
  select a.id, a.student_id, p.full_name,
         coalesce(string_agg(distinct c.name, ', '), 'Chưa xếp lớp'),
         a.target_major, a.attempt_no, a.status, a.score, a.feedback,
         a.requested_at, a.reviewed_at
  from public.rank_breakthrough_attempts a
  join public.profiles p on p.id = a.student_id
  left join public.class_students cs on cs.student_id = a.student_id
  left join public.classes c on c.id = cs.class_id
  where (select public.is_staff())
    and (
      exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.role = 'admin')
      or exists (
        select 1 from public.class_students cs2
        where cs2.student_id = a.student_id and public.can_manage_class(cs2.class_id)
      )
    )
    and (a.status = 'requested' or a.reviewed_at >= now() - interval '30 days')
  group by a.id, p.full_name
  order by (a.status = 'requested') desc, a.requested_at desc;
$$;

create or replace function public.review_rank_breakthrough(
  p_attempt_id uuid,
  p_score numeric,
  p_feedback text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_attempt public.rank_breakthrough_attempts%rowtype;
  v_passed boolean;
  v_allowed boolean;
begin
  if auth.uid() is null or not public.is_staff() then
    return jsonb_build_object('ok', false, 'message', 'Bạn không có quyền chấm bài đột phá');
  end if;
  if p_score is null or p_score < 0 or p_score > 10 then
    return jsonb_build_object('ok', false, 'message', 'Điểm phải nằm trong khoảng 0–10');
  end if;

  select * into v_attempt from public.rank_breakthrough_attempts where id = p_attempt_id for update;
  if v_attempt.id is null then return jsonb_build_object('ok', false, 'message', 'Không tìm thấy lượt kiểm tra'); end if;
  if v_attempt.status <> 'requested' then return jsonb_build_object('ok', false, 'message', 'Lượt kiểm tra này đã được chấm'); end if;

  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
    or exists(
      select 1 from public.class_students cs
      where cs.student_id = v_attempt.student_id and public.can_manage_class(cs.class_id)
    ) into v_allowed;
  if not v_allowed then return jsonb_build_object('ok', false, 'message', 'Học sinh không thuộc lớp bạn quản lý'); end if;

  v_passed := p_score >= 8;
  update public.rank_breakthrough_attempts
  set score = p_score,
      feedback = nullif(btrim(coalesce(p_feedback, '')), ''),
      status = case when v_passed then 'passed' else 'failed' end,
      reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_attempt_id;

  if v_passed then
    update public.student_rank_progress
    set unlocked_major = greatest(unlocked_major, v_attempt.target_major), updated_at = now()
    where student_id = v_attempt.student_id;
  end if;

  insert into public.notifications(user_id, title, body, kind, link)
  values(
    v_attempt.student_id,
    case when v_passed then '🎉 Đột phá cấp bậc thành công!' else '💪 Chưa đột phá lần này' end,
    case when v_passed
      then 'Em đạt ' || p_score || '/10 và đã mở khóa đại cấp mới. Chúc mừng em!'
      else 'Em đạt ' || p_score || '/10. Hãy ôn luyện thêm rồi xin kiểm tra lại ở lần sau.' end,
    'rank_breakthrough', 'thanh-tuu.html'
  );

  return jsonb_build_object('ok', true, 'passed', v_passed,
    'message', case when v_passed then 'Đã duyệt đột phá cấp bậc' else 'Đã ghi nhận: học sinh cần ôn luyện thêm' end);
end;
$$;

create or replace function public.get_ranked_leaderboard(p_class_id uuid default null)
returns table(
  student_id uuid,
  full_name text,
  avatar_url text,
  class_names text,
  score numeric,
  xp integer,
  rank_level smallint
)
language sql
security definer
set search_path = 'public', 'pg_temp'
as $$
  select l.id, l.full_name, l.avatar_url, l.class_names, l.score,
         coalesce(s.xp, 0),
         least(
           public.rank_level_from_xp(coalesce(s.xp, 0))::integer,
           coalesce(r.unlocked_major, 1)::integer * 4
         )::smallint
  from public.get_leaderboard(p_class_id) l
  left join public.student_stats s on s.student_id = l.id
  left join public.student_rank_progress r on r.student_id = l.id
  order by l.score desc;
$$;

revoke execute on function public.rank_level_from_xp(integer) from public, anon;
revoke execute on function public.ensure_student_rank_progress() from public, anon, authenticated;
revoke execute on function public.student_rank_snapshot() from public, anon;
revoke execute on function public.request_rank_breakthrough() from public, anon;
revoke execute on function public.staff_rank_breakthrough_queue() from public, anon;
revoke execute on function public.review_rank_breakthrough(uuid, numeric, text) from public, anon;
revoke execute on function public.get_ranked_leaderboard(uuid) from public, anon;
grant execute on function public.rank_level_from_xp(integer) to authenticated;
grant execute on function public.student_rank_snapshot() to authenticated;
grant execute on function public.request_rank_breakthrough() to authenticated;
grant execute on function public.staff_rank_breakthrough_queue() to authenticated;
grant execute on function public.review_rank_breakthrough(uuid, numeric, text) to authenticated;
grant execute on function public.get_ranked_leaderboard(uuid) to authenticated;

comment on table public.student_rank_progress is 'Unlocked major rank for the 44-level VinhMath progression.';
comment on table public.rank_breakthrough_attempts is 'Teacher-reviewed major-rank breakthrough tests; passing score is 8/10.';

-- Learning companions. Students choose an identical white egg; the species is
-- assigned server-side and stays hidden until the first major-rank breakthrough.
create table if not exists public.student_companion_state (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  egg_slot smallint not null,
  starter_code text not null,
  active_code text not null,
  chosen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_companion_egg_slot_check check (egg_slot between 1 and 3),
  constraint student_companion_starter_check check (starter_code in ('kim_ho', 'lam_long', 'van_mieu')),
  constraint student_companion_active_check check (active_code in ('kim_ho', 'lam_long', 'van_mieu'))
);

create table if not exists public.student_companions (
  student_id uuid not null references public.profiles(id) on delete cascade,
  companion_code text not null,
  source text not null default 'starter',
  unlocked_at timestamptz not null default now(),
  primary key (student_id, companion_code),
  constraint student_companions_code_check check (companion_code in ('kim_ho', 'lam_long', 'van_mieu')),
  constraint student_companions_source_check check (source in ('starter', 'shop', 'gift'))
);

create index if not exists student_companions_code_idx on public.student_companions(companion_code);
alter table public.student_companion_state enable row level security;
alter table public.student_companions enable row level security;

drop policy if exists student_companion_state_read on public.student_companion_state;
create policy student_companion_state_read on public.student_companion_state
for select to authenticated using (
  student_id = (select auth.uid()) or (select public.is_staff())
  or exists(select 1 from public.profiles p where p.id = student_id and p.parent_id = (select auth.uid()))
);
drop policy if exists student_companions_read on public.student_companions;
create policy student_companions_read on public.student_companions
for select to authenticated using (
  student_id = (select auth.uid()) or (select public.is_staff())
  or exists(select 1 from public.profiles p where p.id = student_id and p.parent_id = (select auth.uid()))
);

revoke all on public.student_companion_state from anon, authenticated;
revoke all on public.student_companions from anon, authenticated;

create or replace function public.choose_companion_egg(p_egg_slot smallint)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and role='student') then
    return jsonb_build_object('ok', false, 'message', 'Chỉ học sinh được chọn trứng');
  end if;
  if p_egg_slot not between 1 and 3 then
    return jsonb_build_object('ok', false, 'message', 'Quả trứng không hợp lệ');
  end if;
  if exists(select 1 from public.student_companion_state where student_id=v_uid) then
    return jsonb_build_object('ok', false, 'message', 'Em đã chọn trứng rồi');
  end if;

  v_code := (array['kim_ho','lam_long','van_mieu'])[1 + floor(random()*3)::integer];
  insert into public.student_companion_state(student_id, egg_slot, starter_code, active_code)
  values(v_uid, p_egg_slot, v_code, v_code);
  insert into public.student_companions(student_id, companion_code, source)
  values(v_uid, v_code, 'starter') on conflict do nothing;
  return jsonb_build_object('ok', true, 'message', 'Trứng đã chọn! Hãy học tập để cùng ấp trứng nhé.');
end;
$$;

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

create or replace function public.purchase_companion(p_companion_code text)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_price integer := 300;
  v_balance integer := 0;
  v_ref uuid := gen_random_uuid();
begin
  if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and role='student') then
    return jsonb_build_object('ok',false,'message','Chỉ học sinh được mở khóa linh thú');
  end if;
  if p_companion_code not in ('kim_ho','lam_long','van_mieu') then
    return jsonb_build_object('ok',false,'message','Linh thú không hợp lệ');
  end if;
  if exists(select 1 from public.student_companions where student_id=v_uid and companion_code=p_companion_code) then
    return jsonb_build_object('ok',false,'message','Em đã sở hữu linh thú này');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  select coalesce(sum(coins),0) into v_balance from public.student_coin_ledger where student_id=v_uid;
  if v_balance < v_price then
    return jsonb_build_object('ok',false,'message','Em chưa đủ xu để mở khóa linh thú này');
  end if;
  insert into public.student_coin_ledger(student_id,source,ref_id,coins)
  values(v_uid,'companion_purchase',v_ref,-v_price);
  insert into public.student_companions(student_id,companion_code,source)
  values(v_uid,p_companion_code,'shop');
  update public.student_stats set coins=v_balance-v_price,updated_at=now() where student_id=v_uid;
  return jsonb_build_object('ok',true,'message','Đã mở khóa linh thú mới!','coins',v_balance-v_price);
end;
$$;

create or replace function public.select_companion(p_companion_code text)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare v_uid uuid := auth.uid();
begin
  if not exists(select 1 from public.student_companions where student_id=v_uid and companion_code=p_companion_code) then
    return jsonb_build_object('ok',false,'message','Em chưa sở hữu linh thú này');
  end if;
  update public.student_companion_state set active_code=p_companion_code,updated_at=now() where student_id=v_uid;
  return jsonb_build_object('ok',true,'message','Đã chọn linh thú đồng hành');
end;
$$;

revoke execute on function public.choose_companion_egg(smallint) from public,anon;
revoke execute on function public.companion_snapshot() from public,anon;
revoke execute on function public.purchase_companion(text) from public,anon;
revoke execute on function public.select_companion(text) from public,anon;
grant execute on function public.choose_companion_egg(smallint) to authenticated;
grant execute on function public.companion_snapshot() to authenticated;
grant execute on function public.purchase_companion(text) to authenticated;
grant execute on function public.select_companion(text) to authenticated;

comment on table public.student_companion_state is 'Selected white egg and active learning companion.';
comment on table public.student_companions is 'Companions owned by a student; starter species is random.';
