from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
lesson = (ROOT / "bai-hoc.html").read_text(encoding="utf-8")
classroom = (ROOT / "quan-tri-lop.html").read_text(encoding="utf-8")
common = (ROOT / "js" / "vinhmath.js").read_text(encoding="utf-8")
edge = (ROOT / "web" / "supabase" / "function-nop-bai.ts").read_text(encoding="utf-8")


def require(source: str, fragment: str, message: str) -> None:
    if fragment not in source:
        raise AssertionError(message)


require(common, "async function vmGoiHamFormData", "Thiếu helper đọc lỗi thật từ Edge Function")
require(common, "controller.abort()", "Client chưa có giới hạn thời gian chờ")

require(lesson, 'id="hnopLoai"', "Hub bài học chưa bắt buộc chọn loại bài")
require(lesson, "fd.append('phanloai',loai)", "Hub bài học chưa gửi loại bài lên máy chủ")
require(lesson, 'id="hnopDich"', "Hub bài học chưa hiển thị đích ghi nhận")
require(lesson, 'id="hnopTestBtn"', "Hub bài học chưa có nút kiểm tra tải an toàn")
require(lesson, "fd.append('dry_run','1')", "Nút kiểm tra chưa gọi chế độ không ghi bài")

require(classroom, 'id="nbhLoaiSelect"', "Màn hình lớp chưa có bước chọn loại bài")
require(classroom, 'id="nbhDichLuu"', "Màn hình lớp chưa hiển thị đích ghi nhận")
require(classroom, "fd.append('phanloai', phanloai)", "Màn hình lớp chưa gửi loại bài lên máy chủ")
require(classroom, "function nbhLessonCoLoai", "Danh sách bài chưa lọc theo loại")

require(edge, "const UPLOAD_CONCURRENCY = 3", "Backend chưa giới hạn tải song song")
require(edge, "await Promise.all(Array.from", "Backend vẫn tải từng tệp nối tiếp")
require(edge, "if (!LOAI_HOP_LE.has(phanloai))", "Backend chưa từ chối loại bài mơ hồ")
require(edge, "coMang(lesson.homework_images)", "Backend vẫn coi mảng ảnh rỗng là có BTVN")
require(edge, "await xacNhanHocSinhTrongLop", "Backend chưa xác nhận học sinh thuộc lớp")
require(edge, "dry_run", "Backend chưa có phép thử tải và dọn tệp an toàn")

print("PASS proxy submission routing and timeout regression checks")
