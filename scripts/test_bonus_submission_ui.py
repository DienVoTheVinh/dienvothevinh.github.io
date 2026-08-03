from pathlib import Path


SOURCE = Path(__file__).resolve().parents[1] / "bai-hoc.html"
html = SOURCE.read_text(encoding="utf-8")


def require(fragment: str, message: str) -> None:
    if fragment not in html:
        raise AssertionError(message)


require("class=\"btvn-action-panel", "Thiếu thanh hành động nộp bài")
require("btvn-submit-btn", "Thiếu nút nộp bài responsive")
require("latePolicy: details.homework2_late_policy || 'late'", "Bài thưởng chưa dùng chính sách quá hạn")
require("window._vmNopBaiKhoaHan = khoa", "Modal chưa lưu trạng thái khóa theo hạn")
require("gui.style.display = ''", "Modal chưa khôi phục nút gửi giữa các loại bài")
require("vmDanhDauDaXem(lessonId, laBtvn ? 'btvn' : 'test')", "Bài thưởng đang bị ghi nhận nhầm thành bài kiểm tra")
require("#modalNopBai { align-items:flex-end !important", "Modal di động chưa dùng bottom sheet")
require(".btvn-submit-btn { width:100%; min-height:48px", "Nút di động chưa đủ rộng/cao")

render_start = html.index("async function renderBTVN")
render_end = html.index("function renderLatex", render_start)
render = html[render_start:render_end]
return_line = next(line for line in render.splitlines() if "return '<section class=\"btvn-block" in line)
if return_line.index("actionHtml") > return_line.index("deInner"):
    raise AssertionError("Nút nộp vẫn nằm sau nội dung bài dài")

print("PASS bonus submission UI regression checks")
