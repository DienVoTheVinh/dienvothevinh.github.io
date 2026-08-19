const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const page = read('quan-tri-video-meet.html');
const manager = read('supabase/functions/google-drive-video-manager/index.ts');
const oauthShared = read('supabase/functions/_shared/google_oauth.ts');
const callback = read('supabase/functions/google-drive-oauth-callback/index.ts');
const migration = read('web/supabase/google_meet_video_manager.sql');
const smartMigration = read('supabase/migrations/20260819194826_smart_meet_video_sync.sql');
const home = read('trang-chu.html');
const menu = read('js/menu-v5.js');
const checks = [
  [page.includes("['admin','teacher']"), 'Trang quản trị phải giới hạn admin/teacher'],
  [page.includes("sb.functions.invoke('google-drive-video-manager'"), 'Trang phải gọi Edge Function'],
  [page.includes('Không sao chép video') || page.includes('không sao chép video'), 'Trang phải nói rõ chế độ metadata-only'],
  [oauthShared.includes('drive.meet.readonly'), 'OAuth phải dùng scope Meet hẹp'],
  [oauthShared.includes('drive.metadata.readonly'), 'OAuth chỉ được bổ sung quyền đọc metadata để tìm video cũ'],
  [oauthShared.includes('meetings.space.readonly'), 'OAuth phải có quyền chỉ đọc trạng thái bản ghi từ Meet API'],
  [!manager.includes('auth/drive"') && !manager.includes('auth/drive.readonly'), 'Không được xin quyền đọc/sửa toàn Drive'],
  [manager.includes('VIDEO_EXISTS'), 'Phải chống ghi đè link video ngoài ý muốn'],
  [manager.includes('accessibleClassIds') && manager.includes('class_assistants'), 'Giáo viên chỉ được đồng bộ lớp đang phụ trách hoặc trợ giảng'],
  [manager.includes("createdTime >= '${since}'") && manager.includes("modifiedTime >= '${changedSince}'"), 'Drive API phải bắt cả video mới tạo và video vừa render xong'],
  [manager.includes('meet.googleapis.com/v2/conferenceRecords') && manager.includes('recording_state'), 'Phải đọc trạng thái render trực tiếp từ Meet API'],
  [manager.includes('likelyMeetFile') && manager.includes('is_meet_recording'), 'Phải loại video Drive không phải bản ghi Meet khỏi giao diện'],
  [manager.includes('Không có quyền gắn video') || manager.includes('KhÃ´ng cÃ³ quyá»n gáº¯n video'), 'Phải chặn giáo viên gắn video vào lớp ngoài phạm vi'],
  [callback.includes('state_hash') && callback.includes('used_at'), 'Callback phải xác minh state một lần'],
  [callback.includes('encryptSecret'), 'Refresh token phải được mã hóa'],
  [migration.includes('revoke all on public.google_drive_connections'), 'Bảng token phải bị chặn khỏi client'],
  [migration.includes('enable row level security'), 'Các bảng phải bật RLS'],
  [menu.includes("path: 'quan-tri-video-meet'") && menu.includes("label: 'Video Google Meet'"), 'Video Meet phải nằm trong menu Quản trị'],
  [!home.includes('vmVideoShortcut') && !home.includes('staffChecklistContainer'), 'Trang chủ không còn shortcut và khối lưu ý cũ'],
  [page.includes('meetCalendar') && page.includes('gradeFilter'), 'Trang video phải có lịch và bộ lọc khối'],
  [page.includes('togglePreview') && page.includes('/preview'), 'Video chỉ tải khung xem nhanh khi người dùng yêu cầu'],
  [manager.includes('Math.min(days || 90, 3650)') && manager.includes('scanned >= 5000'), 'Đồng bộ toàn bộ phải phân trang và có giới hạn an toàn rõ ràng'],
  [page.includes("goi('catalog')") && !page.includes("sb.from('meet_recordings')"), 'Client nhận danh mục đã lọc quyền từ Edge Function'],
  [manager.includes('action === "catalog"') && manager.includes('catalogFor(profile)'), 'Edge Function phải cấp catalog riêng cho từng giáo viên'],
  [manager.includes('.eq("owner_user_id", profile.id)'), 'Catalog chỉ trả video của tài khoản Google đang kết nối'],
  [manager.includes('classesQuery.in("id", classIds)') && manager.includes('lessonsQuery.in("class_id", classIds)'), 'Catalog giáo viên chỉ chứa lớp và bài đang phụ trách'],
  [page.includes('Mỗi giáo viên dùng Drive riêng'), 'Giao diện phải giải thích rõ kết nối Drive riêng theo giáo viên'],
  [page.includes("goi('assign-best'") && page.includes('Gắn đề xuất'), 'Giao diện phải hỗ trợ gắn gợi ý tốt nhất bằng một chạm'],
  [page.includes('Bao phủ video theo lớp') && page.includes('coverage-class'), 'Giao diện phải chỉ rõ lớp và bài nào còn thiếu video'],
  [page.includes('connection.stale') && page.includes('dongBo(true)'), 'Trang phải tự đồng bộ khi dữ liệu đã cũ'],
  [manager.includes('rankCandidates') && manager.includes('suggestions'), 'Máy chủ phải xếp hạng nhiều gợi ý thay vì chọn bài đầu tiên'],
  [page.includes('background:#fff0c7') && page.includes('color:#6f4300'), 'Nhãn số video phải đủ tương phản trên nền sáng'],
  [migration.includes('(select auth.uid()) = owner_user_id'), 'RLS chỉ cho chủ kết nối đọc danh mục video của mình'],
  [smartMigration.includes('is_meet_recording boolean') && smartMigration.includes('google_recording_name'), 'Migration phải theo dõi đúng nguồn Meet và bản ghi đang render'],
  [smartMigration.includes('last_sync_status') && smartMigration.includes('last_sync_scanned'), 'Migration phải lưu trạng thái và số liệu đồng bộ để chẩn đoán'],
];
let failed = 0;
for (const [ok, label] of checks) { console.log(`${ok ? 'OK' : 'FAIL'} ${label}`); if (!ok) failed++; }
if (failed) process.exit(1);
