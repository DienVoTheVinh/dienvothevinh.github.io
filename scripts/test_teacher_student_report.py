from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
report = (ROOT / "quan-tri-bao-cao-hoc-sinh.html").read_text(encoding="utf-8")
students = (ROOT / "quan-tri-hoc-sinh.html").read_text(encoding="utf-8")
sql = (ROOT / "web" / "supabase" / "teacher_student_period_report.sql").read_text(encoding="utf-8")


def require(source: str, fragment: str, message: str) -> None:
    if fragment not in source:
        raise AssertionError(message)


require(students, "quan-tri-bao-cao-hoc-sinh?studentId=", "Danh sách học sinh chưa dẫn tới báo cáo mới")
require(report, "gv_bao_cao_hs", "Báo cáo chưa kiểm tra quyền quản lý học sinh")
require(report, "gv_bao_cao_hoc_tap", "Báo cáo chưa dùng truy vấn tổng hợp có phân quyền")
require(report, "['admin','teacher']", "Báo cáo chưa giới hạn đúng tài khoản giáo viên/quản trị viên")
require(report, "data-days=\"7\"", "Thiếu báo cáo 7 ngày")
require(report, "data-days=\"30\"", "Thiếu báo cáo 30 ngày")
require(sql, "lesson_item_progress", "Thiếu chỉ số xem bài")
require(sql, "homework_due", "Bài nộp chưa dùng hạn BTVN thực tế")
require(sql, "homework2_due", "Bài thưởng chưa được phân luồng riêng")
require(sql, "test_deadline", "Bài kiểm tra chưa dùng hạn thực tế")
require(sql, "linked_exam_id", "Báo cáo chưa tính bài luyện đề được liên kết")
require(sql, "is_late", "Thiếu chỉ số nộp đúng hạn")
require(sql, "analytics_sessions", "Thiếu thời gian hoạt động web")
require(sql, "study_sessions", "Thiếu thời gian tự học có chủ đích")
require(sql, "s.submitted_at < v_end_at", "Báo cáo cũ vẫn có thể bị thay đổi bởi bài nộp sau kỳ")
require(sql, "a.submitted_at < v_end_at", "Lượt làm bài sau kỳ vẫn có thể bị tính vào báo cáo")
require(report, "html2canvas", "Thiếu chức năng xuất ảnh")
require(report, "navigator.share", "Thiếu chức năng chia sẻ ảnh trên điện thoại")
require(report, "@media(max-width:620px)", "Báo cáo chưa tối ưu giao diện điện thoại")
require(sql, "security definer", "RPC báo cáo chưa khai báo ngữ cảnh bảo mật")
require(sql, "set search_path = ''", "RPC báo cáo chưa khóa search_path")
require(sql, "auth.uid()", "RPC báo cáo chưa xác thực người gọi")
require(sql, "v_role is null", "RPC báo cáo chưa chặn tài khoản thiếu hồ sơ/quyền")
require(sql, "can_manage_class", "RPC báo cáo chưa giới hạn lớp giáo viên quản lý")
require(sql, "coalesce(public.can_manage_class", "RPC báo cáo có thể bỏ lọt kết quả quyền NULL")
require(sql, "student_not_in_class", "RPC báo cáo chưa xác nhận học sinh thuộc lớp")
require(sql, "revoke all", "RPC báo cáo chưa thu hồi quyền gọi mặc định")
require(sql, "grant execute", "RPC báo cáo chưa cấp quyền rõ cho authenticated")

print("PASS teacher student period report regression checks")
