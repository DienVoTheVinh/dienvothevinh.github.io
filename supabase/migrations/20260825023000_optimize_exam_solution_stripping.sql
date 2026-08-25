-- Keep exam answers server-side without timing out on long THPTQG sources.
-- The previous implementation restarted its search after every removal, making
-- documents with many \loigiai commands quadratic in size. This version only
-- moves forward and joins the retained chunks once.
create or replace function public.vm_remove_latex_group_command(p_source text, p_command text)
returns text
language plpgsql
immutable
set search_path = public
as $function$
declare
  v_source text := coalesce(p_source, '');
  v_lower text := lower(coalesce(p_source, ''));
  v_token text := E'\\' || p_command;
  v_token_lower text := lower(E'\\' || p_command);
  v_parts text[] := array[]::text[];
  v_scan integer := 1;
  v_rel integer;
  v_start integer;
  v_cursor integer;
  v_depth integer;
  v_char text;
  v_prev text;
  v_remove_to integer;
  v_limit integer := length(coalesce(p_source, ''));
begin
  if v_source = '' or coalesce(p_command, '') = '' then
    return v_source;
  end if;

  loop
    v_rel := strpos(substr(v_lower, v_scan), v_token_lower);
    exit when v_rel = 0;
    v_start := v_scan + v_rel - 1;
    v_cursor := v_start + length(v_token);

    -- Do not treat a longer command such as \loigiaiExtra as \loigiai.
    if substr(v_source, v_cursor, 1) ~ '[A-Za-z@]' then
      v_parts := array_append(v_parts, substr(v_source, v_scan, v_cursor - v_scan));
      v_scan := v_cursor;
      continue;
    end if;

    v_parts := array_append(v_parts, substr(v_source, v_scan, v_start - v_scan));
    while v_cursor <= v_limit and substr(v_source, v_cursor, 1) ~ E'\\s' loop
      v_cursor := v_cursor + 1;
    end loop;

    -- Optional argument: \loigiai[title]{...}
    if substr(v_source, v_cursor, 1) = '[' then
      v_depth := 0;
      loop
        exit when v_cursor > v_limit;
        v_char := substr(v_source, v_cursor, 1);
        v_prev := case when v_cursor > 1 then substr(v_source, v_cursor - 1, 1) else '' end;
        if v_char = '[' and v_prev <> E'\\' then v_depth := v_depth + 1; end if;
        if v_char = ']' and v_prev <> E'\\' then
          v_depth := v_depth - 1;
          if v_depth = 0 then v_cursor := v_cursor + 1; exit; end if;
        end if;
        v_cursor := v_cursor + 1;
      end loop;
      while v_cursor <= v_limit and substr(v_source, v_cursor, 1) ~ E'\\s' loop
        v_cursor := v_cursor + 1;
      end loop;
    end if;

    if substr(v_source, v_cursor, 1) <> '{' then
      -- Preserve the old behavior for command declarations: remove the token
      -- itself, then continue strictly after it.
      v_scan := v_start + length(v_token);
      continue;
    end if;

    v_depth := 0;
    v_remove_to := v_limit;
    loop
      exit when v_cursor > v_limit;
      v_char := substr(v_source, v_cursor, 1);
      v_prev := case when v_cursor > 1 then substr(v_source, v_cursor - 1, 1) else '' end;
      if v_char = '{' and v_prev <> E'\\' then v_depth := v_depth + 1; end if;
      if v_char = '}' and v_prev <> E'\\' then
        v_depth := v_depth - 1;
        if v_depth = 0 then v_remove_to := v_cursor; exit; end if;
      end if;
      v_cursor := v_cursor + 1;
    end loop;
    v_scan := v_remove_to + 1;
  end loop;

  v_parts := array_append(v_parts, substr(v_source, v_scan));
  return array_to_string(v_parts, '');
end
$function$;

comment on function public.vm_remove_latex_group_command(text, text) is
  'Linear-time LaTeX answer-command stripper used before exam content is returned to students.';
