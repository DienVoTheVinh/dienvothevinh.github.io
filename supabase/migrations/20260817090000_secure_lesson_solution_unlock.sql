-- Giữ nguồn LaTeX có lời giải ngoài bản ghi lessons mà học sinh có thể đọc.
-- Học sinh chỉ đọc được nguồn đầy đủ sau khi một bài nộp có tệp đã được tạo thành công.

create table if not exists public.lesson_latex_sources (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  kind text not null check (kind in ('homework', 'homework_bonus', 'test')),
  content text not null,
  has_solution boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (lesson_id, kind)
);

alter table public.lesson_latex_sources enable row level security;

revoke all on table public.lesson_latex_sources from public, anon, authenticated;
grant select on table public.lesson_latex_sources to authenticated;
grant all on table public.lesson_latex_sources to service_role;

drop policy if exists lesson_latex_sources_read on public.lesson_latex_sources;
create policy lesson_latex_sources_read
on public.lesson_latex_sources
for select
to authenticated
using (
  public.is_staff()
  or exists (
    select 1
    from public.submissions s
    where s.lesson_id = lesson_latex_sources.lesson_id
      and s.student_id = auth.uid()
      and s.kind = lesson_latex_sources.kind
      and s.submitted_at is not null
      and jsonb_typeof(coalesce(s.files, '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(s.files, '[]'::jsonb)) > 0
  )
);

create or replace function public.vm_remove_latex_environment(p_source text, p_environment text)
returns text
language plpgsql
immutable
set search_path = public
as $function$
declare
  v_out text := coalesce(p_source, '');
  v_lower text;
  v_begin text := lower(E'\\begin{' || p_environment || '}');
  v_end text := lower(E'\\end{' || p_environment || '}');
  v_start integer;
  v_finish_rel integer;
  v_finish integer;
begin
  loop
    v_lower := lower(v_out);
    v_start := strpos(v_lower, v_begin);
    exit when v_start = 0;
    v_finish_rel := strpos(substr(v_lower, v_start + length(v_begin)), v_end);
    if v_finish_rel = 0 then
      v_out := overlay(v_out placing '' from v_start for length(v_begin));
    else
      v_finish := v_start + length(v_begin) + v_finish_rel - 1 + length(v_end);
      v_out := overlay(v_out placing '' from v_start for v_finish - v_start);
    end if;
  end loop;
  return v_out;
end
$function$;

create or replace function public.vm_remove_latex_group_command(p_source text, p_command text)
returns text
language plpgsql
immutable
set search_path = public
as $function$
declare
  v_out text := coalesce(p_source, '');
  v_token text := E'\\' || p_command;
  v_offset integer := 1;
  v_rel integer;
  v_start integer;
  v_cursor integer;
  v_depth integer;
  v_char text;
  v_prev text;
  v_remove_to integer;
begin
  loop
    v_rel := strpos(lower(substr(v_out, v_offset)), lower(v_token));
    exit when v_rel = 0;
    v_start := v_offset + v_rel - 1;
    v_cursor := v_start + length(v_token);

    -- Không bắt nhầm tiền tố của một lệnh dài hơn.
    if substr(v_out, v_cursor, 1) ~ '[A-Za-z@]' then
      v_offset := v_cursor;
      continue;
    end if;

    while v_cursor <= length(v_out) and substr(v_out, v_cursor, 1) ~ E'\\s' loop
      v_cursor := v_cursor + 1;
    end loop;

    -- Bỏ phần tuỳ chọn [..] nếu môi trường có khai báo nhãn/tuỳ chọn.
    if substr(v_out, v_cursor, 1) = '[' then
      v_depth := 0;
      while v_cursor <= length(v_out) loop
        v_char := substr(v_out, v_cursor, 1);
        v_prev := case when v_cursor > 1 then substr(v_out, v_cursor - 1, 1) else '' end;
        if v_char = '[' and v_prev <> E'\\' then v_depth := v_depth + 1; end if;
        if v_char = ']' and v_prev <> E'\\' then
          v_depth := v_depth - 1;
          if v_depth = 0 then v_cursor := v_cursor + 1; exit; end if;
        end if;
        v_cursor := v_cursor + 1;
      end loop;
      while v_cursor <= length(v_out) and substr(v_out, v_cursor, 1) ~ E'\\s' loop
        v_cursor := v_cursor + 1;
      end loop;
    end if;

    if substr(v_out, v_cursor, 1) <> '{' then
      v_out := overlay(v_out placing '' from v_start for length(v_token));
      v_offset := greatest(1, v_start);
      continue;
    end if;

    v_depth := 0;
    v_remove_to := v_cursor;
    while v_cursor <= length(v_out) loop
      v_char := substr(v_out, v_cursor, 1);
      v_prev := case when v_cursor > 1 then substr(v_out, v_cursor - 1, 1) else '' end;
      if v_char = '{' and v_prev <> E'\\' then v_depth := v_depth + 1; end if;
      if v_char = '}' and v_prev <> E'\\' then
        v_depth := v_depth - 1;
        if v_depth = 0 then v_remove_to := v_cursor; exit; end if;
      end if;
      v_cursor := v_cursor + 1;
    end loop;

    v_out := overlay(v_out placing '' from v_start for v_remove_to - v_start + 1);
    v_offset := greatest(1, v_start);
  end loop;
  return v_out;
end
$function$;

create or replace function public.vm_strip_latex_solutions(p_source text)
returns text
language plpgsql
immutable
set search_path = public
as $function$
declare
  v_out text := coalesce(p_source, '');
begin
  v_out := public.vm_remove_latex_environment(v_out, 'loigiai');
  v_out := public.vm_remove_latex_environment(v_out, 'solution');
  v_out := public.vm_remove_latex_environment(v_out, 'answer');
  v_out := public.vm_remove_latex_environment(v_out, 'sol');
  v_out := public.vm_remove_latex_group_command(v_out, 'loigiai');
  v_out := public.vm_remove_latex_group_command(v_out, 'solution');
  v_out := public.vm_remove_latex_group_command(v_out, 'answer');
  return v_out;
end
$function$;

revoke all on function public.vm_remove_latex_environment(text, text) from public, anon, authenticated;
revoke all on function public.vm_remove_latex_group_command(text, text) from public, anon, authenticated;
revoke all on function public.vm_strip_latex_solutions(text) from public, anon, authenticated;
grant execute on function public.vm_strip_latex_solutions(text) to service_role;

-- Sao lưu nguồn hiện hữu trước khi làm sạch ba cột công khai.
insert into public.lesson_latex_sources(lesson_id, kind, content, has_solution)
select id, 'homework', homework_latex_content,
       public.vm_strip_latex_solutions(homework_latex_content) is distinct from homework_latex_content
from public.lessons
where nullif(btrim(homework_latex_content), '') is not null
on conflict (lesson_id, kind) do update
set content = excluded.content, has_solution = excluded.has_solution, updated_at = now();

insert into public.lesson_latex_sources(lesson_id, kind, content, has_solution)
select id, 'homework_bonus', homework2_latex_content,
       public.vm_strip_latex_solutions(homework2_latex_content) is distinct from homework2_latex_content
from public.lessons
where nullif(btrim(homework2_latex_content), '') is not null
on conflict (lesson_id, kind) do update
set content = excluded.content, has_solution = excluded.has_solution, updated_at = now();

insert into public.lesson_latex_sources(lesson_id, kind, content, has_solution)
select id, 'test', test_latex_content,
       public.vm_strip_latex_solutions(test_latex_content) is distinct from test_latex_content
from public.lessons
where nullif(btrim(test_latex_content), '') is not null
on conflict (lesson_id, kind) do update
set content = excluded.content, has_solution = excluded.has_solution, updated_at = now();

update public.lessons
set homework_latex_content = case when homework_latex_content is null then null else public.vm_strip_latex_solutions(homework_latex_content) end,
    homework2_latex_content = case when homework2_latex_content is null then null else public.vm_strip_latex_solutions(homework2_latex_content) end,
    test_latex_content = case when test_latex_content is null then null else public.vm_strip_latex_solutions(test_latex_content) end
where homework_latex_content is not null
   or homework2_latex_content is not null
   or test_latex_content is not null;

create or replace function public.vm_sync_lesson_latex_sources()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_hw text;
  v_bonus text;
  v_test text;
  v_changed boolean := false;
  v_hw_changed boolean := true;
  v_bonus_changed boolean := true;
  v_test_changed boolean := true;
begin
  if pg_trigger_depth() > 1 then return new; end if;

  if tg_op = 'UPDATE' then
    v_hw_changed := new.homework_latex_content is distinct from old.homework_latex_content;
    v_bonus_changed := new.homework2_latex_content is distinct from old.homework2_latex_content;
    v_test_changed := new.test_latex_content is distinct from old.test_latex_content;
  end if;

  v_hw := case when new.homework_latex_content is null then null else public.vm_strip_latex_solutions(new.homework_latex_content) end;
  v_bonus := case when new.homework2_latex_content is null then null else public.vm_strip_latex_solutions(new.homework2_latex_content) end;
  v_test := case when new.test_latex_content is null then null else public.vm_strip_latex_solutions(new.test_latex_content) end;

  if v_hw_changed then
    if nullif(btrim(coalesce(new.homework_latex_content, '')), '') is null then
      delete from public.lesson_latex_sources where lesson_id = new.id and kind = 'homework';
    else
      insert into public.lesson_latex_sources(lesson_id, kind, content, has_solution)
      values (new.id, 'homework', new.homework_latex_content, v_hw is distinct from new.homework_latex_content)
      on conflict (lesson_id, kind) do update
      set content = excluded.content, has_solution = excluded.has_solution, updated_at = now();
    end if;
  end if;

  if v_bonus_changed then
    if nullif(btrim(coalesce(new.homework2_latex_content, '')), '') is null then
      delete from public.lesson_latex_sources where lesson_id = new.id and kind = 'homework_bonus';
    else
      insert into public.lesson_latex_sources(lesson_id, kind, content, has_solution)
      values (new.id, 'homework_bonus', new.homework2_latex_content, v_bonus is distinct from new.homework2_latex_content)
      on conflict (lesson_id, kind) do update
      set content = excluded.content, has_solution = excluded.has_solution, updated_at = now();
    end if;
  end if;

  if v_test_changed then
    if nullif(btrim(coalesce(new.test_latex_content, '')), '') is null then
      delete from public.lesson_latex_sources where lesson_id = new.id and kind = 'test';
    else
      insert into public.lesson_latex_sources(lesson_id, kind, content, has_solution)
      values (new.id, 'test', new.test_latex_content, v_test is distinct from new.test_latex_content)
      on conflict (lesson_id, kind) do update
      set content = excluded.content, has_solution = excluded.has_solution, updated_at = now();
    end if;
  end if;

  v_changed := new.homework_latex_content is distinct from v_hw
    or new.homework2_latex_content is distinct from v_bonus
    or new.test_latex_content is distinct from v_test;
  if v_changed then
    update public.lessons
    set homework_latex_content = v_hw,
        homework2_latex_content = v_bonus,
        test_latex_content = v_test
    where id = new.id;
  end if;
  return new;
end
$function$;

revoke all on function public.vm_sync_lesson_latex_sources() from public, anon, authenticated;

drop trigger if exists trg_sync_lesson_latex_sources on public.lessons;
create trigger trg_sync_lesson_latex_sources
after insert or update of homework_latex_content, homework2_latex_content, test_latex_content
on public.lessons
for each row execute function public.vm_sync_lesson_latex_sources();

create unique index if not exists notifications_solution_unlock_once
on public.notifications(user_id, kind, link)
where kind = 'solution_unlocked';

create or replace function public.fn_noti_lesson_solution_unlocked()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_title text;
  v_class uuid;
  v_kind_label text;
  v_tab text;
  v_has_solution boolean;
  v_link text;
begin
  if new.lesson_id is null
     or new.kind not in ('homework', 'homework_bonus', 'test')
     or new.submitted_at is null
     or jsonb_typeof(coalesce(new.files, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(new.files, '[]'::jsonb)) = 0 then
    return new;
  end if;

  select l.title, l.class_id, s.has_solution
    into v_title, v_class, v_has_solution
  from public.lessons l
  join public.lesson_latex_sources s on s.lesson_id = l.id and s.kind = new.kind
  where l.id = new.lesson_id;
  if not coalesce(v_has_solution, false) then return new; end if;

  v_kind_label := case
    when new.kind = 'homework_bonus' then 'bài tập thưởng thêm'
    when new.kind = 'homework' then 'bài tập về nhà'
    else 'bài kiểm tra'
  end;
  v_tab := case when new.kind = 'test' then 'test' else 'btvn' end;
  v_link := '/bai-hoc?id=' || new.lesson_id || '&tab=' || v_tab || '&action=solution-unlocked&kind=' || new.kind;

  insert into public.notifications(user_id, title, body, link, kind, class_ref)
  values (
    new.student_id,
    '🔓 Đã mở lời giải',
    'Em đã nộp hoàn chỉnh ' || v_kind_label || ' “' || coalesce(v_title, 'Bài học') || '”. Lời giải đã sẵn sàng để xem lại.',
    v_link,
    'solution_unlocked',
    v_class
  )
  on conflict (user_id, kind, link) where kind = 'solution_unlocked' do nothing;
  return new;
end
$function$;

revoke all on function public.fn_noti_lesson_solution_unlocked() from public, anon, authenticated;

drop trigger if exists trg_noti_lesson_solution_unlocked on public.submissions;
create trigger trg_noti_lesson_solution_unlocked
after insert on public.submissions
for each row execute function public.fn_noti_lesson_solution_unlocked();
