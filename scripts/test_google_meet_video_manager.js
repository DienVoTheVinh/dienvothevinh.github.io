const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const page = read('quan-tri-video-meet.html');
const manager = read('supabase/functions/google-drive-video-manager/index.ts');
const oauthShared = read('supabase/functions/_shared/google_oauth.ts');
const callback = read('supabase/functions/google-drive-oauth-callback/index.ts');
const migration = read('web/supabase/google_meet_video_manager.sql');
const home = read('trang-chu.html');
const checks = [
  [page.includes("['admin','teacher']"), 'Trang quản trị phải giới hạn admin/teacher'],
  [page.includes("sb.functions.invoke('google-drive-video-manager'"), 'Trang phải gọi Edge Function'],
  [page.includes('Không sao chép video') || page.includes('không sao chép video'), 'Trang phải nói rõ chế độ metadata-only'],
  [oauthShared.includes('drive.meet.readonly'), 'OAuth phải dùng scope Meet hẹp'],
  [oauthShared.includes('drive.metadata.readonly'), 'OAuth chỉ được bổ sung quyền đọc metadata để tìm video cũ'],
  [!manager.includes('auth/drive"') && !manager.includes('auth/drive.readonly'), 'Không được xin quyền đọc/sửa toàn Drive'],
  [manager.includes('VIDEO_EXISTS'), 'Phải chống ghi đè link video ngoài ý muốn'],
  [manager.includes('accessibleClassIds') && manager.includes('class_assistants'), 'Giáo viên chỉ được đồng bộ lớp đang phụ trách hoặc trợ giảng'],
  [manager.includes("createdTime >= '${since}'"), 'Drive API phải lọc theo ngày ngay từ truy vấn để không quét toàn bộ kho video'],
  [manager.includes('Không có quyền gắn video') || manager.includes('KhÃ´ng cÃ³ quyá»n gáº¯n video'), 'Phải chặn giáo viên gắn video vào lớp ngoài phạm vi'],
  [callback.includes('state_hash') && callback.includes('used_at'), 'Callback phải xác minh state một lần'],
  [callback.includes('encryptSecret'), 'Refresh token phải được mã hóa'],
  [migration.includes('revoke all on public.google_drive_connections'), 'Bảng token phải bị chặn khỏi client'],
  [migration.includes('enable row level security'), 'Các bảng phải bật RLS'],
  [home.includes('quan-tri-video-meet'), 'Trang chủ phải có lối vào tính năng'],
];
let failed = 0;
for (const [ok, label] of checks) { console.log(`${ok ? 'OK' : 'FAIL'} ${label}`); if (!ok) failed++; }
if (failed) process.exit(1);
