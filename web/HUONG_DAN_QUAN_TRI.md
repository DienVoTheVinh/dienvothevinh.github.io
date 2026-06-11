# HƯỚNG DẪN QUẢN TRỊ HỆ THỐNG VINHMATH

Chào thầy Vinh! Tài liệu này được biên soạn chi tiết giúp thầy làm chủ hoàn toàn dự án website **VinhMath**, từ việc chỉnh sửa giao diện, quản lý tài khoản học sinh, tải tài liệu cho đến cách cập nhật web lên Internet.

---

## 1. TỔNG QUAN HỆ THỐNG
Hệ thống học tập của thầy hoạt động dựa trên sự kết hợp của 3 nền tảng hoàn toàn miễn phí:
1.  **Giao diện web (Frontend):** Chạy bằng mã HTML/CSS/JS tĩnh, được lưu trữ và chạy trên **GitHub Pages** tại địa chỉ: [https://dienvothevinh.github.io](https://dienvothevinh.github.io).
2.  **Cơ sở dữ liệu & Đăng nhập (Backend):** Lưu trữ trên **Supabase** (`https://nrnokgciogxqzjqjeuwi.supabase.co`). Supabase chịu trách nhiệm xác thực tài khoản đăng nhập và lưu điểm số, chuyên cần, tài liệu của học sinh.
3.  **Trình biên dịch LaTeX:** Web kết nối với API miễn phí của **texlive.net** để tự động dịch code LaTeX của thầy thành PDF và lưu trực tiếp vào Supabase Storage.

---

## 2. PHÂN QUYỀN TÀI KHOẢN (4 CẤP VAI TRÒ)
Trong cơ sở dữ liệu của VinhMath, mỗi tài khoản đăng nhập được phân vào một trong 4 vai trò (`role`) trong bảng `profiles`:
1.  `admin` (Thầy Vinh - Quản trị tối cao): Có toàn quyền quản trị hệ thống, cấp tài khoản, xếp lớp, và xem dữ liệu giám sát truy cập.
2.  `teacher` (Giáo viên đồng nghiệp): Có toàn quyền quản lý chuyên môn (tạo bài giảng, đề thi, soạn tài liệu, câu hỏi), xem bảng điểm học sinh nhưng không được phép quản lý tài khoản, thêm học sinh hay xem dữ liệu giám sát.
3.  `assistant` (Trợ giảng / TA): Được xem bảng điểm học sinh, quản lý chuyên cần và điểm danh, xem bài học/đề thi nhưng không được quyền tự ý tạo/sửa/xóa bài giảng hoặc đề thi mới.
4.  `student` (Học sinh): Chỉ có quyền đăng nhập, học bài giảng có sẵn, tải tài liệu được giao cho lớp mình và làm bài thi trực tuyến.

### Cách chuyển đổi hoặc nâng quyền cho một tài khoản:
Nếu thầy muốn thay đổi vai trò của một tài khoản nào đó, thầy chỉ cần:
1.  Vào trang **Supabase** -> Chọn **SQL Editor** ở thanh công cụ bên trái -> Chọn **New query**.
2.  Chạy câu lệnh SQL sau (thay đổi `ten_dang_nhap` và `vai_tro` mới: `admin`, `teacher`, `assistant`, hoặc `student`):
    ```sql
    -- Thay đổi vai trò tài khoản
    update public.profiles 
    set role = 'vai_tro' 
    where username = 'ten_dang_nhap';
    ```
3.  Bấm **Run**. Tài khoản đó lập tức được thay đổi quyền hạn.

---

## 3. CÁCH CẤP TÀI KHOẢN MỚI CHO HỌC SINH
Nhờ trigger tự động xếp lớp đã cài đặt thành công, quy trình tạo tài khoản mới cực kỳ đơn giản:

1.  Vào **Supabase** -> **Authentication** (Hình chiếc khóa) -> **Users** -> Bấm **Add user** -> **Create user**.
2.  Nhập thông tin:
    *   **Email address:** Phải có dạng `tên_đăng_nhập.tên_lớp@hs.vinhmath.app`.
        *   *Ví dụ:* `nguyenvana.12a1@hs.vinhmath.app` (học sinh tên đăng nhập là `nguyenvana.12a1`, học lớp `12A1`).
        *   *Lưu ý:* Tên lớp ở đuôi email (ví dụ: `12a1`) phải viết giống tên lớp đã tạo trong CSDL ở bước chuẩn bị (ví dụ: `12A1`).
    *   **User Password:** Nhập mật khẩu cấp cho học sinh (ví dụ: `12345678`).
    *   **User Metadata (Để hiện tên tiếng Việt đẹp):** Bấm mở phần Metadata dưới ô mật khẩu và dán dòng này vào (nhớ đổi tên học sinh tương ứng):
        ```json
        { "full_name": "Nguyễn Văn A" }
        ```
3.  Bấm **Create user** để hoàn tất.
4.  **Cách học sinh đăng nhập:** Truy cập web của thầy, chỉ cần gõ tên đăng nhập là `nguyenvana.12a1` (không cần gõ phần đuôi email) và mật khẩu thầy đã cấp.

---

## 4. CÁCH CHỈNH SỬA GIAO DIỆN & THÊM ẢNH

Thư mục chính chứa code trang web của thầy là [trang-web](file:///Users/thiendi/DAY%20HOC/web/trang-web/).

### 4.1. Thay đổi thông tin chữ hiển thị trên web
Thầy có thể sửa các nội dung chữ (như slogan, địa chỉ liên hệ, bằng cấp, triết lý giảng dạy) bằng cách mở trực tiếp các file HTML bằng phần mềm soạn thảo (ví dụ: Visual Studio Code, Cursor, hoặc sử dụng chính tôi qua Antigravity):
*   [index.html](file:///Users/thiendi/DAY%20HOC/web/trang-web/index.html): Trang chủ của hệ thống.
*   [dang-nhap.html](file:///Users/thiendi/DAY%20HOC/web/trang-web/dang-nhap.html): Trang đăng nhập.
*   [hoc-tap.html](file:///Users/thiendi/DAY%20HOC/web/trang-web/hoc-tap.html): Trang bảng điều khiển của học sinh.
*   [tai-lieu.html](file:///Users/thiendi/DAY%20HOC/web/trang-web/tai-lieu.html): Trang xem tài liệu.

### 4.2. Chỉnh sửa Màu sắc và Font chữ
Hệ thống sử dụng bộ biến giao diện tập trung để đảm bảo tính đồng bộ:
*   Mở file [tokens.css](file:///Users/thiendi/DAY%20HOC/web/trang-web/tokens.css): Thầy sẽ thấy các thông số màu sắc (màu nền giấy washi `--bg`, màu mực `--ink`, màu điểm nhấn đỏ son `--accent`...). 
*   Nếu thầy đổi màu tại đây, toàn bộ các trang web (trang chủ, đăng nhập, học tập, tài liệu) sẽ tự động thay đổi theo.

### 4.3. Thêm ảnh cá nhân và ảnh lớp học
Trang chủ hiện đang để ảnh mẫu. Để thay bằng ảnh thật của thầy:
1.  Chuẩn bị 2 bức ảnh:
    *   Ảnh chân dung của thầy: đổi tên file thành `anh-thay.jpg`.
    *   Ảnh lớp học của thầy: đổi tên file thành `anh-lop.jpg`.
2.  Sao chép và dán 2 file ảnh này vào thư mục [trang-web](file:///Users/thiendi/DAY%20HOC/web/trang-web/) (ở cùng cấp với file `index.html`).
3.  Khi thầy tải lên GitHub (xem mục 5), trang chủ của thầy sẽ tự động hiển thị ảnh thật.

---

## 5. CÁCH CẬP NHẬT LÊN WEB (DEPLOY LÊN GITHUB PAGES)
Mỗi khi thầy chỉnh sửa code HTML, CSS hoặc thêm ảnh trên máy tính, thầy cần đẩy các thay đổi đó lên GitHub để cập nhật trang web online. 

Vì thầy đã đăng nhập sẵn GitHub trên trình duyệt, thầy có thể thực hiện cực kỳ đơn giản theo các bước sau:
1.  Mở trình duyệt Chrome, truy cập vào link kho lưu trữ của thầy: 
    [https://github.com/DienVoTheVinh/dienvothevinh.github.io](https://github.com/DienVoTheVinh/dienvothevinh.github.io)
2.  Bấm vào nút **Add file** (ở phía trên bên phải danh sách file) -> Chọn **Upload files**.
3.  Mở thư mục [trang-web](file:///Users/thiendi/DAY%20HOC/web/trang-web/) trên máy tính của thầy.
4.  **Kéo thả** các file thầy vừa chỉnh sửa (hoặc toàn bộ file trong thư mục đó, bao gồm cả các file ảnh mới) vào khung tải lên của trình duyệt.
5.  Cuộn xuống dưới cùng, bấm nút xanh **Commit changes** (Xác nhận thay đổi).
6.  Chờ khoảng **1 - 2 phút** để máy chủ GitHub xử lý. Sau đó thầy tải lại trang web `https://dienvothevinh.github.io` để thấy giao diện mới.

---

## 6. CÁCH ĐĂNG TÀI LIỆU (PDF) CHO HỌC SINH
Đây là tính năng cực kỳ tiện lợi dành riêng cho tài khoản giáo viên:
1.  Truy cập vào trang web của thầy và đăng nhập bằng tài khoản `thayvinh`.
2.  Vào mục **Tài liệu** trên thanh điều hướng, thầy sẽ thấy xuất hiện nút màu đỏ **"+ Soạn tài liệu"** (chỉ tài khoản giáo viên mới thấy). Thầy cũng có thể truy cập trực tiếp bằng cách mở file [quan-tri-tai-lieu.html](file:///Users/thiendi/DAY%20HOC/web/trang-web/quan-tri-tai-lieu.html).
3.  Tại trang soạn thảo:
    *   Nhập **Tiêu đề tài liệu** (ví dụ: *Bài tập Đạo hàm buổi 1*).
    *   Chọn **Lớp được xem** (chọn lớp cụ thể hoặc để "Mọi lớp").
    *   Chọn **Trình biên dịch** (mặc định là `pdflatex`, nếu thầy dùng font tiếng Việt nâng cao bằng XeLaTeX thì chọn `xelatex`).
    *   Chọn file `.tex` từ máy tính hoặc **dán trực tiếp code LaTeX** vào khung soạn thảo.
4.  Bấm nút **▶ Biên dịch PDF**. Web sẽ tự động gửi code lên máy chủ biên dịch `texlive.net` và hiển thị bản PDF xem trước ở khung bên phải sau vài giây.
5.  Nếu bản xem trước đã ưng ý, thầy bấm nút **💾 Lưu vào kho**. Hệ thống sẽ tự động tải file PDF lên kho lưu trữ và ghi nhận vào CSDL. Học sinh thuộc lớp được chọn khi đăng nhập vào sẽ lập tức thấy tài liệu để xem hoặc tải về.

---

## 7. ĐỊNH HƯỚNG PHÁT TRIỂN TIẾP THEO
Do Claude Desktop của thầy đã hết lượt dùng (token), từ bây giờ thầy có thể đồng hành cùng tôi (Gemini tích hợp sẵn trong trình soạn thảo Antigravity này) để hoàn thiện các tính năng còn lại. 

Tôi có đầy đủ năng lực lập trình, đọc hiểu mã nguồn và sẽ không bị giới hạn lượt dùng như Claude. Thầy chỉ cần yêu cầu, tôi sẽ hướng dẫn thầy làm hoặc tự tay viết code thay thầy các nhiệm vụ tiếp theo:
*   **Xây dựng bộ đọc đề LaTeX trắc nghiệm (Nhiệm vụ 3):** Thầy chỉ cần bỏ 1 file đề `.tex` mẫu của thầy vào thư mục `DAY HOC/web` và nhắn tôi viết bộ parser tự động tách câu hỏi.
*   **Hoàn thiện luồng Làm bài & Chấm điểm (Nhiệm vụ 4):** Xây dựng trang làm bài luyện đề trực tuyến cho học sinh.
*   **Hoàn thiện tính năng Điểm danh bằng QR (Nhiệm vụ 6):** Tự sinh mã QR trên màn hình của thầy để học sinh quét bằng điện thoại và lưu chuyên cần tự động.

---

## 8. HỆ THỐNG GIÁM SÁT TRUY CẬP (WEB ANALYTICS)
Hệ thống đo lường được tích hợp sẵn để phục vụ nhu cầu kiểm tra và thu thập dữ liệu học tập của thầy:
1.  **Dữ liệu thu thập:** Loại thiết bị sử dụng (Desktop/Mobile/Tablet), Hệ điều hành (Windows/macOS/iOS/Android), Trình duyệt (Chrome/Safari/Firefox), trang web cụ thể học sinh đã mở, và tổng thời lượng từ lúc đăng nhập/truy cập đến lúc đóng tab trình duyệt (chấp nhận treo máy).
2.  **Cơ chế hoạt động:** Sử dụng file JavaScript [analytics.js](file:///Users/thiendi/DAY%20HOC/web/trang-web/analytics.js) để gửi tín hiệu nhịp tim (Heartbeat) tự động mỗi 15 giây lên bảng `analytics_sessions` và `analytics_page_views`.
3.  **Xem dữ liệu:** Ràng buộc bảo mật RLS được cài đặt để **chỉ duy nhất tài khoản `admin` (Thầy Vinh)** mới có quyền đọc dữ liệu này từ Supabase, học sinh và các giáo viên/trợ giảng khác hoàn toàn không thể xem được.

Chúc thầy Vinh vận hành hệ thống suôn sẻ! Thầy cần triển khai tiếp tính năng nào hoặc có câu hỏi gì, xin hãy nhắn cho tôi biết ngay nhé.
