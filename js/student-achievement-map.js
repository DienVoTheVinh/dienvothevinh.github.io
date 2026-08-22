(function () {
  'use strict';

  var regions = [
    {icon:'🌱', name:'Miền Khởi Hành', subtitle:'Xây nền nếp và bắt đầu tích lũy XP'},
    {icon:'🧭', name:'Thung Lũng Đại Số', subtitle:'Luyện bài đều đặn và làm chủ biến đổi'},
    {icon:'🏰', name:'Thành Trì Hình Học', subtitle:'Kiên trì lập luận và trình bày chặt chẽ'},
    {icon:'⛰️', name:'Đỉnh Cao Hàm Số', subtitle:'Vượt thử thách và nâng độ chính xác'},
    {icon:'🌌', name:'Thiên Hà Tư Duy', subtitle:'Kết nối kiến thức và tự học chủ động'},
    {icon:'👑', name:'Vương Miện Toán Học', subtitle:'Bản lĩnh, bền bỉ và sẵn sàng dẫn đầu'}
  ];
  var milestoneIcons = ['📖','✍️','🎯','🧠','⚡','🏆'];
  var milestoneNames = ['Mở khóa kiến thức','Rèn luyện bền bỉ','Chinh phục thử thách','Tư duy sắc bén','Bứt phá giới hạn','Cột mốc danh dự'];
  var badgeCatalog = [
    ['first_btvn','🎬','Bài nộp đầu tiên'],['no_debt','✅','Không nợ bài tập'],['streak_3','🔥','Chuỗi 3 ngày'],['streak_7','⚡','Chuỗi 7 ngày'],
    ['test_5','🛡️','Chiến binh kiểm tra'],['explorer_10','🧭','Nhà thám hiểm'],['level_5','⭐','Ngôi sao Lv.5'],['level_10','🌟','Bậc thầy Lv.10'],
    ['diligent','📚','Siêng năng chăm chỉ'],['score_80','🏆','Học lực giỏi'],['coin_300','💰','Nhà sưu tập xu'],['perfect10','💯','Điểm 10 tuyệt đối']
  ];
  var currentStats = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }

  function xpFloor(level) {
    var l = Math.max(1, Number(level) || 1);
    return 100 * (l - 1) + 25 * (l - 1) * (l - 2);
  }

  function demoStats() {
    return {xp:485,level:4,tier:'Học Trò Chăm',tier_icon:'📗',xp_floor:450,xp_next:700,streak:4,longest_streak:7,coins:85,counts:{lesson:8,btvn:5,test:2,review:3,dando:4},badges:[{code:'first_btvn'},{code:'streak_3'}]};
  }

  function statusFor(level) {
    if (level < currentStats.level) return 'completed';
    if (level === currentStats.level) return 'current';
    return 'locked';
  }

  function renderSummary() {
    var c = currentStats.counts || {};
    document.getElementById('achievementSummary').innerHTML =
      '<div><b>' + Number(c.lesson || 0) + '</b><small>Bài học đã mở</small></div>' +
      '<div><b>' + Number(c.btvn || 0) + '</b><small>Bài tập đã nộp</small></div>' +
      '<div><b>' + Number(c.test || 0) + '</b><small>Bài kiểm tra</small></div>' +
      '<div><b>🔥 ' + Number(currentStats.streak || 0) + '</b><small>Chuỗi ngày hiện tại</small></div>';
    var floor = Number(currentStats.xp_floor == null ? xpFloor(currentStats.level) : currentStats.xp_floor);
    var next = Number(currentStats.xp_next == null ? xpFloor(currentStats.level + 1) : currentStats.xp_next);
    var xp = Number(currentStats.xp || 0);
    var progress = Math.max(0, Math.min(100, Math.round((xp - floor) / Math.max(1, next - floor) * 100)));
    var card = document.getElementById('achievementLevelCard');
    card.style.setProperty('--level-progress', progress + '%');
    card.innerHTML = '<div class="achievement-level-orb"><span>Lv.' + Number(currentStats.level || 1) + '</span></div><h2>' + esc((currentStats.tier_icon || '🌱') + ' ' + (currentStats.tier || 'Tân Binh')) + '</h2>' +
      '<p>' + xp + ' XP · còn ' + Math.max(0, next - xp) + ' XP tới cấp tiếp theo</p><div class="achievement-progress"><i></i></div>';
  }

  function renderMap() {
    var html = regions.map(function (region, regionIndex) {
      var start = regionIndex * 6 + 1;
      var nodes = [];
      for (var offset = 0; offset < 6; offset++) {
        var level = start + offset;
        var status = statusFor(level);
        var icon = status === 'locked' ? '🔒' : status === 'completed' ? '✓' : milestoneIcons[offset];
        nodes.push('<button type="button" class="achievement-node ' + status + '" data-achievement-level="' + level + '"><span class="achievement-node-orb">' + icon + '</span><b>Level ' + level + '</b><small>' + esc(milestoneNames[offset]) + '</small></button>');
      }
      return '<article class="achievement-region"><div class="achievement-region-head"><span class="achievement-region-icon">' + region.icon + '</span><span><b>Chương ' + (regionIndex + 1) + ' · ' + esc(region.name) + '</b><small>' + esc(region.subtitle) + ' · Level ' + start + '–' + (start + 5) + '</small></span></div><div class="achievement-track">' + nodes.join('') + '</div></article>';
    }).join('');
    document.getElementById('achievementMap').innerHTML = html;
  }

  function renderBadges() {
    var earned = {};
    (currentStats.badges || []).forEach(function (badge) { earned[badge.code] = true; });
    document.getElementById('achievementBadges').innerHTML = badgeCatalog.map(function (badge) {
      var unlocked = !!earned[badge[0]];
      return '<div class="achievement-badge' + (unlocked ? '' : ' locked') + '"><span>' + (unlocked ? badge[1] : '🔒') + '</span><b>' + esc(badge[2]) + '</b><small>' + (unlocked ? 'Đã đạt' : 'Chưa mở') + '</small></div>';
    }).join('');
  }

  function openLevel(level) {
    var status = statusFor(level);
    var region = regions[Math.min(regions.length - 1, Math.floor((level - 1) / 6))];
    var needed = xpFloor(level);
    var statusText = status === 'completed' ? '✓ Em đã chinh phục cột mốc này.' : status === 'current' ? '◉ Đây là cột mốc hiện tại của em.' : '🔒 Cần thêm ' + Math.max(0, needed - Number(currentStats.xp || 0)) + ' XP để mở cột mốc này.';
    var dialog = document.getElementById('achievementDialog');
    document.getElementById('achievementDialogBody').innerHTML = '<div class="achievement-dialog-head"><span>' + (status === 'locked' ? '🔒' : region.icon) + '</span><button class="achievement-dialog-close" type="button" aria-label="Đóng">✕</button></div>' +
      '<h3 id="achievementDialogTitle">Level ' + level + ' · ' + esc(milestoneNames[(level - 1) % 6]) + '</h3><p>Thuộc <b>' + esc(region.name) + '</b>. Cột mốc mở ở ' + needed + ' XP. Em nhận XP khi mở bài học, nộp bài tập, hoàn thành kiểm tra và xem lại bài giáo viên đã sửa.</p><div class="achievement-dialog-status">' + esc(statusText) + '</div>';
    dialog.querySelector('.achievement-dialog-close').addEventListener('click', function () { dialog.close(); });
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
  }

  async function load() {
    if (!daKetNoi()) return;
    var profile = await yeuCauDangNhap();
    if (!profile) return;
    if (profile.role !== 'student') { window.location.replace('ca-nhan'); return; }
    if (sessionStorage.getItem('vm-guest-mode') === 'true') currentStats = demoStats();
    else {
      var response = await sb.rpc('hs_ho_so');
      if (response.error || !response.data || response.data.error) {
        document.getElementById('achievementMap').innerHTML = '<div class="student-results-error"><span>⚠️</span><b>Chưa tải được bản đồ thành tựu</b><p>Vui lòng thử lại khi kết nối ổn định.</p></div>';
        return;
      }
      currentStats = response.data;
    }
    renderSummary();
    renderMap();
    renderBadges();
  }

  document.addEventListener('click', function (event) {
    var node = event.target.closest('[data-achievement-level]');
    if (node && currentStats) openLevel(Number(node.getAttribute('data-achievement-level')));
  });
  document.getElementById('achievementDialog').addEventListener('click', function (event) { if (event.target === this) this.close(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
