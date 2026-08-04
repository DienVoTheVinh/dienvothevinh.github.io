-- Bật lại ca Toán 9 chuyên sáng Chủ nhật để học sinh được RLS trả lịch và link Meet đúng buổi.
-- Điều kiện dùng dữ liệu nghiệp vụ ổn định, không hard-code UUID sinh tự động.

update public.schedules s
set visible = true
from public.classes c, public.profiles p
where c.id = s.class_id
  and p.id = s.teacher_id
  and c.grade = 9
  and coalesce(c.is_specialized, false)
  and c.mode = 'online'
  and s.weekday = 7
  and s.start_time = time '09:00:00'
  and p.full_name = 'Thầy Đậu Văn Huy Hoàng'
  and s.visible is distinct from true;
