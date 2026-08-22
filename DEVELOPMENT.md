# Phát triển VinhMath

## Quy trình phát hành

1. Tạo nhánh `codex/<ten-thay-doi>` từ `main` mới nhất.
2. Chỉ stage file thuộc phạm vi; chạy kiểm tra tĩnh, trình duyệt desktop/mobile và secret scan.
3. Push nhánh và mở draft PR. Không merge khi chưa có kết quả kiểm tra và phê duyệt.
4. Xem local bằng `python scripts/serve.py`, rồi mở `http://127.0.0.1:8000`.
5. Khi đã được duyệt, chuyển PR sang ready, merge vào `main`, theo dõi GitHub Pages và kiểm tra production.

## Database và Supabase

- Mọi DDL đi qua file mới trong `supabase/migrations/`; không sửa lịch sử migration đã áp dụng.
- Mỗi bảng mới phải bật RLS, có policy theo vai trò, index cho khóa ngoại và truy vấn thường dùng.
- Test ít nhất: anonymous không đọc được dữ liệu riêng, người dùng chỉ đọc dữ liệu của mình, quản lý chỉ đọc đúng phạm vi được giao.
- Chạy Supabase security/performance advisors sau migration. Cảnh báo cũ ngoài phạm vi phải được ghi nhận, không sửa chen vào một release khác.
- Edge Function phải xác thực JWT bằng `auth.getUser()` hoặc gateway `verify_jwt`, kiểm tra quyền ở server và pin dependency.
- Không đưa service role, mật khẩu, secret hay dữ liệu người dùng vào repository, log hoặc PR.

## Trải nghiệm theo vai trò

- Học sinh: `Hôm nay → Lớp học → Luyện tập → Kết quả`; mục ít dùng nằm trong `Thêm`.
- Giáo viên/trợ giảng: `Hôm nay → Lớp được giao → Chấm bài → Nội dung/Lịch`.
- Phụ huynh: vào thẳng khu theo dõi con.
- Admin: thanh đầu chỉ giữ tác vụ hằng ngày; công cụ hiếm dùng nằm tại `quan-tri.html`.
- `quan-tri-lop.html` ghi nhớ lớp và tab gần nhất; URL chứa `classId`/`tab` để deep-link và hỗ trợ quay lại đúng ngữ cảnh.

## Cổng thi đối tác

Portal được tách theo ba lớp để có thể chuyển sang website riêng sau này:

- Shell độc lập: `thi.html`, `css/exam-portal.css`, `js/exam-portal.js`.
- Engine thi dùng chung: `luyen-de.html`, nhưng portal bắt buộc lọc allow-list `exam_portal_exams`.
- Dữ liệu tách biệt: `exam_portals`, `exam_portal_members`, `exam_portal_exams` và restrictive RLS.

Tên đăng nhập dạng `username@hs.<portal>` chỉ dùng để nhận diện và định tuyến. Quyền truy cập luôn dựa trên membership + RLS. Quản lý đối tác không được gán `profiles.role=teacher`.

Để tách portal thành site riêng: chuyển ba file shell sang frontend mới, giữ Supabase schema/RLS, và tái sử dụng hoặc tách engine `luyen-de` thành package. Không phụ thuộc menu chính VinhMath.

## Kiểm tra nhanh

```powershell
.tools\deno-2.9.5\deno.exe check js/vinhmath.js js/menu-v5.js js/exam-portal.js js/role-home.js
.tools\deno-2.9.5\deno.exe run --allow-read=. scripts/check_inline_html.js
.tools\deno-2.9.5\deno.exe run --unstable-detect-cjs --allow-read=. scripts/test_role_ux_portal.js
```

Các kiểm tra hồi quy khác nằm trong `scripts/test_*.js`. Những file kết thúc `_browser.js` cần chạy với browser runtime của workspace.
