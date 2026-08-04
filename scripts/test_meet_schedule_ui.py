from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
common = (ROOT / "js" / "vinhmath.js").read_text(encoding="utf-8")
home = (ROOT / "trang-chu.html").read_text(encoding="utf-8")
class_page = (ROOT / "lop-hoc.html").read_text(encoding="utf-8")
online = (ROOT / "lop-online.html").read_text(encoding="utf-8")
schedule = (ROOT / "lich-hoc.html").read_text(encoding="utf-8")
sql = (ROOT / "web" / "supabase" / "fix_sunday_math9_meet_visibility.sql").read_text(encoding="utf-8")


def require(source: str, fragment: str, message: str) -> None:
    if fragment not in source:
        raise AssertionError(message)


require(common, "function vmChonBuoiMeetTheoGio", "Thiếu bộ chọn ca theo giờ")
require(common, "function vmLichDienRaNgay", "Thiếu kiểm tra lịch có diễn ra đúng ngày")
require(home, "vmChonBuoiMeetTheoGio(todayOcc", "Trang chủ vẫn chọn ca đầu tiên trong ngày")
require(home, "start_time: o.new_start", "Buổi dời chưa truyền giờ hiệu lực cho bộ chọn")
for page, name in ((class_page, "lớp học"), (online, "lớp online")):
    require(page, "vmChonBuoiMeetTheoGio(todayRows", f"Trang {name} chưa chọn Meet theo giờ")
    require(page, "vmLichDienRaNgay", f"Trang {name} chưa lọc đúng ngày hiệu lực")
    require(page, "end_time, meet_link", f"Trang {name} chưa tải giờ kết thúc và link từng ca")
    require(page, "js/vinhmath.js?v=7.3", f"Trang {name} chưa làm mới bộ nhớ đệm")
    if "todayRows.find(function (s) { return s.meet_link; })" in page:
        raise AssertionError(f"Trang {name} vẫn có thể lấy link của ca khác trong cùng ngày")
require(schedule, "s.meet_link || meetLinkGlobal", "Thời khóa biểu vẫn dùng một link chung cho mọi ca")
require(schedule, "vmChonBuoiMeetTheoGio(todaySchedulesForMeet", "Nút Meet trên thời khóa biểu chưa chọn theo giờ")
require(sql, "set visible = true", "Chưa bật lại ca sáng cho học sinh")
require(sql, "s.weekday = 7", "Bản sửa dữ liệu chưa giới hạn Chủ nhật")
require(sql, "s.start_time = time '09:00:00'", "Bản sửa dữ liệu chưa giới hạn ca sáng")
if "9085c1dd-89b2-4ead-af0d-defe53473993" in sql:
    raise AssertionError("Không được hard-code UUID lịch production trong migration")

print("PASS Meet schedule UI regression checks")
