alter table public.brand_templates
  add column wordmark_primary_text text,
  add column wordmark_secondary_text text,
  add column wordmark_primary_color text,
  add column wordmark_secondary_color text;

alter table public.brand_templates
  add constraint brand_templates_wordmark_primary_text_length
    check (wordmark_primary_text is null or char_length(btrim(wordmark_primary_text)) between 1 and 32),
  add constraint brand_templates_wordmark_secondary_text_length
    check (wordmark_secondary_text is null or char_length(btrim(wordmark_secondary_text)) <= 32),
  add constraint brand_templates_wordmark_primary_color_hex
    check (wordmark_primary_color is null or wordmark_primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint brand_templates_wordmark_secondary_color_hex
    check (wordmark_secondary_color is null or wordmark_secondary_color ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.brand_templates.wordmark_primary_text is
  'First independently styled part of the navigation wordmark, for example VINH or UYEN.';
comment on column public.brand_templates.wordmark_secondary_text is
  'Optional second independently styled part of the navigation wordmark, for example MATH.';
comment on column public.brand_templates.wordmark_primary_color is
  'Hex color for the first wordmark part.';
comment on column public.brand_templates.wordmark_secondary_color is
  'Hex color for the optional second wordmark part.';

update public.brand_templates
set wordmark_primary_text = 'Vinh',
    wordmark_secondary_text = 'Math',
    wordmark_primary_color = '#DD9400',
    wordmark_secondary_color = '#111111'
where slug = 'vinhmath';

update public.brand_templates
set wordmark_primary_text = 'M.A.P',
    wordmark_secondary_text = '',
    wordmark_primary_color = '#1B2644',
    wordmark_secondary_color = '#1B2644'
where slug = 'map';

update public.brand_templates
set wordmark_primary_text = 'DUY',
    wordmark_secondary_text = 'MINH',
    wordmark_primary_color = '#C81E27',
    wordmark_secondary_color = '#1A1A1A'
where slug = 'duyminh';
