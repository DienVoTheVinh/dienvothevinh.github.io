-- Cover the SET NULL foreign key used when an administrator profile is removed.
create index if not exists exam_portal_feature_rules_updated_by_idx
  on public.exam_portal_feature_rules (updated_by)
  where updated_by is not null;
