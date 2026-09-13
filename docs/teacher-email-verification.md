# Liên kết email giáo viên có xác nhận

Email này là địa chỉ liên kết của VMTools. Luồng giữ nguyên ID Auth, tên đăng nhập cũ, mật khẩu, lớp học và quyền dịch vụ; xác nhận không tự cấp gói trả phí.

Quản trị gửi yêu cầu → Resend gửi thư → người nhận mở trang và bấm xác nhận → giao dịch tạo liên kết và cập nhật email hồ sơ. Đọc trang (GET/preview) không kích hoạt tài khoản, tránh trình quét liên kết tự xác nhận.

## Cấu hình gửi thư

Chưa cấu hình thì chức năng dừng trước khi tạo yêu cầu, báo rõ chưa gửi được. Không có cơ chế bỏ qua xác minh.

1. Dùng tài khoản Resend do chủ sở hữu quản lý; xác minh tên miền gửi thư trong Resend. Giữ nguyên bản ghi MX nhận thư hiện có, thêm đúng bản ghi DNS Resend yêu cầu.
2. Tạo khóa chỉ có quyền gửi cho tên miền đã xác minh. Trong Supabase → Edge Functions → Secrets, đặt `RESEND_API_KEY` và `VINHMATH_EMAIL_FROM` (ví dụ `VinhMath <xac-nhan@ten-mien-da-xac-minh>`). Không đưa khóa vào Git, giao diện công khai hoặc tin nhắn.
3. Gửi thử tới hộp thư do chủ sở hữu kiểm soát; kiểm tra thư thật tới nơi rồi mới sử dụng với giáo viên. Không bật theo dõi đường dẫn của nhà cung cấp.

Luồng dùng API chính thức: https://resend.com/docs/api-reference/emails/send-email

## Kiểm tra

- `node scripts/test_teacher_services.js`
- `node scripts/test_teacher_email_verification.cjs`
- Giao dịch SQL thử yêu cầu/xác nhận ở quyền service_role và ROLLBACK; tài khoản thật không bị sửa bởi kiểm thử.
- Mã xác nhận ngẫu nhiên 256 bit, chỉ lưu SHA-256, hết hạn 30 phút. Gửi lại vô hiệu hóa mã cũ; giới hạn 1 lần/phút và 5 lần/giờ/giáo viên.
- Bảng yêu cầu RLS, chỉ service_role truy cập; danh sách quản trị không trả token_hash. RPC cũ bị vô hiệu hóa, không cấp quyền đọc auth.users.
- Kiểm tra trùng Auth qua Admin API ở server, trùng hồ sơ/VMTools trong giao dịch. Xác nhận kiểm tra lại quyền chủ sở hữu. Hủy/gửi lại/xác nhận khóa theo tài khoản.
- Tối đa một dòng yêu cầu cho mỗi giáo viên; không tích lũy ảnh, tệp hay thư trong Git hoặc cơ sở dữ liệu.

## Triển khai

Áp dụng migration `teacher_email_verification`, triển khai `vinhmath-email-confirm` và `vinhmath-services-admin`, sau đó phát hành trang quản trị và `xac-nhan-email.html`. Endpoint xác nhận không yêu cầu JWT vì dùng mã bí mật có hạn từ email; endpoint quản trị vẫn kiểm tra JWT, phiên còn hiệu lực và quyền chủ sở hữu.

Nếu dịch vụ thư lỗi, giữ luồng ở trạng thái chưa kích hoạt; không khôi phục RPC liên kết bỏ qua xác nhận.
