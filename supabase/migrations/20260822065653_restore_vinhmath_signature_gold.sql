-- Restore the brighter VinhMath gold that was active before class brand
-- templates started overriding the site's global amber palette.
-- Other built-in and custom brands are intentionally untouched.

alter table public.brand_templates
  alter column primary_color set default '#FFD21A',
  alter column secondary_color set default '#DD9400',
  alter column accent_color set default '#DD9400',
  alter column accent_soft_color set default '#FCF4E6';

update public.brand_templates
set primary_color = '#FFD21A',
    secondary_color = '#DD9400',
    accent_color = '#DD9400',
    accent_soft_color = '#FCF4E6',
    updated_at = now()
where slug = 'vinhmath'
  and preset = 'vinhmath';
