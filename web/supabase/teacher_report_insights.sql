-- Nhận định giáo viên chỉnh riêng cho từng học sinh và từng kỳ báo cáo.
-- Chạy một lần trên Supabase trước khi phát hành giao diện tương ứng.

create table if not exists public.teacher_report_insights (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  period_type text not null check (period_type in ('week', 'month')),
  period_start date not null,
  period_end date not null,
  strengths text[] not null,
  limitations text[] not null,
  improvements text[] not null,
  edited_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_report_insights_period_valid check (
    (period_type = 'week' and period_end = period_start + 6)
    or
    (
      period_type = 'month'
      and period_start = date_trunc('month', period_start)::date
      and period_end = (date_trunc('month', period_start) + interval '1 month - 1 day')::date
    )
  ),
  constraint teacher_report_insights_strengths_valid check (
    cardinality(strengths) between 1 and 12 and length(array_to_string(strengths, E'\n')) <= 4000
  ),
  constraint teacher_report_insights_limitations_valid check (
    cardinality(limitations) between 1 and 12 and length(array_to_string(limitations, E'\n')) <= 4000
  ),
  constraint teacher_report_insights_improvements_valid check (
    cardinality(improvements) between 1 and 12 and length(array_to_string(improvements, E'\n')) <= 4000
  ),
  unique (student_id, class_id, period_type, period_start, period_end)
);

comment on table public.teacher_report_insights is
  'Nhận định do giáo viên điều chỉnh cho báo cáo tuần hoặc tháng của một học sinh.';

alter table public.teacher_report_insights enable row level security;

revoke all on table public.teacher_report_insights from anon;
revoke all on table public.teacher_report_insights from authenticated;
grant select, insert, update on table public.teacher_report_insights to authenticated;
grant all on table public.teacher_report_insights to service_role;

drop policy if exists teacher_report_insights_select on public.teacher_report_insights;
create policy teacher_report_insights_select
on public.teacher_report_insights
for select
to authenticated
using (
  (
    coalesce(public.is_admin(), false)
    or coalesce(public.can_manage_class(class_id), false)
  )
  and exists (
    select 1
    from public.class_students cs
    where cs.class_id = teacher_report_insights.class_id
      and cs.student_id = teacher_report_insights.student_id
  )
);

drop policy if exists teacher_report_insights_insert on public.teacher_report_insights;
create policy teacher_report_insights_insert
on public.teacher_report_insights
for insert
to authenticated
with check (
  edited_by = (select auth.uid())
  and (
    coalesce(public.is_admin(), false)
    or coalesce(public.can_manage_class(class_id), false)
  )
  and exists (
    select 1
    from public.class_students cs
    where cs.class_id = teacher_report_insights.class_id
      and cs.student_id = teacher_report_insights.student_id
  )
);

drop policy if exists teacher_report_insights_update on public.teacher_report_insights;
create policy teacher_report_insights_update
on public.teacher_report_insights
for update
to authenticated
using (
  (
    coalesce(public.is_admin(), false)
    or coalesce(public.can_manage_class(class_id), false)
  )
  and exists (
    select 1
    from public.class_students cs
    where cs.class_id = teacher_report_insights.class_id
      and cs.student_id = teacher_report_insights.student_id
  )
)
with check (
  edited_by = (select auth.uid())
  and (
    coalesce(public.is_admin(), false)
    or coalesce(public.can_manage_class(class_id), false)
  )
  and exists (
    select 1
    from public.class_students cs
    where cs.class_id = teacher_report_insights.class_id
      and cs.student_id = teacher_report_insights.student_id
  )
);
