-- PostgreSQL standard strings preserve backslashes. Use escape strings so the
-- parser searches for one LaTeX backslash rather than two literal backslashes.
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
    if substr(v_out, v_cursor, 1) ~ '[A-Za-z@]' then
      v_offset := v_cursor;
      continue;
    end if;
    while v_cursor <= length(v_out) and substr(v_out, v_cursor, 1) ~ E'\\s' loop
      v_cursor := v_cursor + 1;
    end loop;
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

revoke all on function public.vm_remove_latex_environment(text, text) from public, anon, authenticated;
revoke all on function public.vm_remove_latex_group_command(text, text) from public, anon, authenticated;

update public.lesson_latex_sources
set has_solution = public.vm_strip_latex_solutions(content) is distinct from content,
    updated_at = now();

alter table public.lessons disable trigger trg_sync_lesson_latex_sources;

update public.lessons l
set homework_latex_content = public.vm_strip_latex_solutions(s.content)
from public.lesson_latex_sources s
where s.lesson_id = l.id and s.kind = 'homework';

update public.lessons l
set homework2_latex_content = public.vm_strip_latex_solutions(s.content)
from public.lesson_latex_sources s
where s.lesson_id = l.id and s.kind = 'homework_bonus';

update public.lessons l
set test_latex_content = public.vm_strip_latex_solutions(s.content)
from public.lesson_latex_sources s
where s.lesson_id = l.id and s.kind = 'test';

alter table public.lessons enable trigger trg_sync_lesson_latex_sources;
