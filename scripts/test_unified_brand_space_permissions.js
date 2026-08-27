const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const hub = read('quan-tri.html');
const builder = read('quan-tri-khong-gian.html');
const brand = read('quan-tri-thuong-hieu.html');
const legacyPortal = read('quan-tri-portal-thi.html');
const menu = read('js/menu-v5.js');
const migration = read('supabase/migrations/20260828143000_unify_admin_brand_theme_feature_access.sql');

assert((hub.match(/href="quan-tri-khong-gian"/g) || []).length === 1,
  'Trung tâm quản trị phải chỉ có một lối vào thương hiệu/không gian.');
assert(!/href="quan-tri-thuong-hieu"/.test(hub),
  'Không được giữ phím tắt Tạo thương hiệu tách rời.');
assert(!/href="quan-tri-portal-thi"/.test(hub),
  'Không được giữ phím tắt Cổng thi tách rời.');

assert(builder.includes('Thương hiệu lớp') && builder.includes('Không gian riêng toàn hệ thống'),
  'Trang hợp nhất phải giải thích rõ hai cơ chế độc lập.');
assert(builder.includes('phù hợp với M.A.P'),
  'M.A.P phải được ghi nhận là trường hợp chỉ dùng thương hiệu lớp.');
assert(builder.includes('quan-tri-thuong-hieu?embed=1'),
  'Kho thương hiệu lớp phải nằm trong trang hợp nhất.');
assert(builder.includes("event.data.type!=='vm-brand-space'") && builder.includes('openBuilder(event.data.brandId)'),
  'Trang hợp nhất phải nối thương hiệu lớp với tùy chọn tạo không gian riêng mà không tự động ép tạo tenant.');
assert(builder.includes('quan-tri-portal-thi?embed=1'),
  'Cổng thi cũ phải tiếp tục được hỗ trợ tương thích.');
assert(builder.includes('vm_admin_deploy_tenant') && builder.includes('vm_admin_update_tenant_lifecycle'),
  'Trang hợp nhất phải có vòng đời triển khai/cập nhật/tạm ẩn.');
assert(builder.includes("{key:'question_bank',label:'Ngân hàng đề'"),
  'Thanh công cụ không gian phải hỗ trợ Ngân hàng đề.');
assert(builder.includes('quan-tri-quyen-tinh-nang?embed=1'),
  'Quản lý quyền tính năng phải được tích hợp trong trang hợp nhất.');

assert(brand.includes("panel=brands") && brand.includes("get('embed')==='1'"),
  'Route thương hiệu cũ phải chuyển về panel hợp nhất nhưng vẫn nhúng được.');
assert(brand.includes('Chỉ trong lớp') && brand.includes('Lớp + toàn hệ thống') && brand.includes('moKhongGianRieng'),
  'Mỗi thương hiệu phải thể hiện rõ phạm vi độc lập và chỉ tạo không gian khi admin chủ động chọn.');
const saveBrandBody = (brand.match(/async function luuThuongHieu\(\)[\s\S]*?\nasync function nhanAnh/) || [])[0] || '';
assert(saveBrandBody.includes("from('brand_templates')") && !saveBrandBody.includes("from('exam_portals')"),
  'Lưu thương hiệu lớp không được tự tạo hoặc cập nhật không gian toàn hệ thống.');
assert(legacyPortal.includes("panel=exam&legacy=1") && legacyPortal.includes("get('embed')==='1'"),
  'Route portal cũ phải chuyển về panel hợp nhất nhưng vẫn nhúng được.');

assert(migration.includes('exam_focus_mode boolean not null default false'),
  'Migration phải tách trạng thái tập trung thi khỏi experience_mode.');
assert(migration.includes('create table if not exists private.vm_feature_user_rules'),
  'Migration phải có chính sách theo từng tài khoản.');
assert(migration.includes("'question_bank.import_tex'") && migration.includes("'question_bank.download_tex'"),
  'Phân tầng ngân hàng đề phải có quyền nạp và tải TeX riêng.');
assert(migration.includes("'question_bank.manage','question_bank','capability','Quản lý kho','Duyệt, sửa và quản lý nguồn; chỉ quản trị viên','question_bank',250,'hidden',false"),
  'Quản lý kho phải là quyền máy chủ dành riêng cho admin, không được ủy quyền cho giáo viên.');
assert(!migration.includes("private.vm_effective_feature_state(p_user_id,'question_bank.manage')='shown' then true"),
  'Quyền quản lý kho không được tự mở các quyền nạp/tải đã bị khóa riêng.');
assert(migration.includes('vm_bank_delegate_upload_tex') && migration.includes("'quarantined'"),
  'Nguồn TeX do giáo viên được ủy quyền nạp phải vào hàng chờ duyệt.');
assert(migration.includes("jsonb_typeof(p_rules) is distinct from 'array'") && migration.includes("bank_daily_upload_limit"),
  'RPC quyền và nạp TeX phải chặn JSON null/sai kiểu và giới hạn lạm dụng theo ngày.');
assert(migration.includes("select * into v_portal from public.exam_portals where id=p_portal_id and experience_mode='full_site' for update")
  && migration.includes("deployed_at=case when coalesce(p_is_active,false) then coalesce(deployed_at,now()) else deployed_at end"),
  'Cập nhật lifecycle phải khóa bản ghi, kiểm tra tenant và ghi nhận lần triển khai an toàn.');
assert(migration.includes("'can_manage_id_schema',private.vm_has_feature"),
  'Quyền quản lý hệ ID phải được trả tách biệt trong capability ngân hàng đề.');
assert(menu.includes('vm_my_feature_access') && menu.includes('vmMenuTenantExamFocus'),
  'Menu phải dùng quyền hiệu lực và trạng thái tập trung thi.');

console.log('PASS unified brand/space/permissions contracts');
