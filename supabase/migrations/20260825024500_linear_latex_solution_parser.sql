-- PostgreSQL text character lookup is not constant-time for UTF-8. Parse the
-- source through a character array so long Vietnamese THPTQG documents remain
-- linear while nested LaTeX groups are still removed safely.
create or replace function public.vm_remove_latex_group_command(p_source text, p_command text)
returns text
language plpgsql
immutable
set search_path = public
as $function$
declare
  v_source text := coalesce(p_source, '');
  v_command text := lower(coalesce(p_command, ''));
  v_chars text[];
  v_output text[];
  v_limit integer;
  v_command_length integer;
  v_read integer := 1;
  v_write integer := 0;
  v_cursor integer;
  v_depth integer;
  v_next text;
  v_candidate text;
  v_closed boolean;
begin
  if v_source = '' or v_command = '' then
    return v_source;
  end if;

  v_chars := string_to_array(v_source, null);
  v_limit := coalesce(array_length(v_chars, 1), 0);
  v_command_length := length(v_command);
  v_output := array_fill(null::text, array[greatest(v_limit, 1)]);

  while v_read <= v_limit loop
    if v_chars[v_read] = E'\\' and v_read + v_command_length <= v_limit then
      v_candidate := lower(array_to_string(v_chars[(v_read + 1):(v_read + v_command_length)], ''));
      v_next := case
        when v_read + v_command_length + 1 <= v_limit then v_chars[v_read + v_command_length + 1]
        else ''
      end;

      if v_candidate = v_command and v_next !~ '[A-Za-z@]' then
        v_cursor := v_read + v_command_length + 1;
        while v_cursor <= v_limit and v_chars[v_cursor] ~ '\s' loop
          v_cursor := v_cursor + 1;
        end loop;

        if v_cursor <= v_limit and v_chars[v_cursor] = '[' then
          v_depth := 0;
          v_closed := false;
          while v_cursor <= v_limit loop
            if v_chars[v_cursor] = '[' and (v_cursor = 1 or v_chars[v_cursor - 1] <> E'\\') then
              v_depth := v_depth + 1;
            elsif v_chars[v_cursor] = ']' and (v_cursor = 1 or v_chars[v_cursor - 1] <> E'\\') then
              v_depth := v_depth - 1;
              if v_depth = 0 then
                v_cursor := v_cursor + 1;
                v_closed := true;
                exit;
              end if;
            end if;
            v_cursor := v_cursor + 1;
          end loop;
          if not v_closed then
            exit;
          end if;
          while v_cursor <= v_limit and v_chars[v_cursor] ~ '\s' loop
            v_cursor := v_cursor + 1;
          end loop;
        end if;

        if v_cursor <= v_limit and v_chars[v_cursor] = '{' then
          v_depth := 0;
          v_closed := false;
          while v_cursor <= v_limit loop
            if v_chars[v_cursor] = '{' and (v_cursor = 1 or v_chars[v_cursor - 1] <> E'\\') then
              v_depth := v_depth + 1;
            elsif v_chars[v_cursor] = '}' and (v_cursor = 1 or v_chars[v_cursor - 1] <> E'\\') then
              v_depth := v_depth - 1;
              if v_depth = 0 then
                v_cursor := v_cursor + 1;
                v_closed := true;
                exit;
              end if;
            end if;
            v_cursor := v_cursor + 1;
          end loop;
          if not v_closed then
            exit;
          end if;
          v_read := v_cursor;
          continue;
        end if;

        -- A declaration such as \newcommand{\loigiai} has no argument here:
        -- remove the solution token only, preserving the surrounding source.
        v_read := v_read + v_command_length + 1;
        continue;
      end if;
    end if;

    v_write := v_write + 1;
    v_output[v_write] := v_chars[v_read];
    v_read := v_read + 1;
  end loop;

  return case when v_write = 0 then '' else array_to_string(v_output[1:v_write], '') end;
end
$function$;

comment on function public.vm_remove_latex_group_command(text, text) is
  'Single-pass UTF-8-safe LaTeX answer-command stripper used before exam content is returned to students.';
