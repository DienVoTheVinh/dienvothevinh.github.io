create index if not exists rank_breakthrough_reviewer_idx
  on public.rank_breakthrough_attempts (reviewed_by)
  where reviewed_by is not null;
