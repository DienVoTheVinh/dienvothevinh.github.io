// ============================================================
// VINHMATH — HỆ THỐNG GIÁM SÁT TRUY CẬP (WEB ANALYTICS)
// Đo lường lượt truy cập, thiết bị, và tổng thời lượng học tập.
// ============================================================

(function () {
  // Đợi cho đến khi Supabase và vinhmath.js tải xong
  window.addEventListener('load', function () {
    // Chờ 1 giây để đảm bảo kết nối Supabase 'sb' đã được khởi tạo
    setTimeout(initAnalytics, 1000);
  });

  async function initAnalytics() {
    // 1. Kiểm tra kết nối Supabase
    if (typeof daKetNoi !== 'function' || !daKetNoi()) {
      return; // Chế độ xem thử: không ghi nhận analytics
    }

    // 2. Thu thập thông tin thiết bị, HĐH, Trình duyệt
    var ua = navigator.userAgent.toLowerCase();
    
    // Loại thiết bị
    var deviceType = 'Desktop';
    if (/tablet|ipad|playbook|silk/i.test(ua)) {
      deviceType = 'Tablet';
    } else if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)) {
      deviceType = 'Mobile';
    }

    // Hệ điều hành (OS)
    var os = 'Unknown OS';
    if (ua.indexOf('win') !== -1) os = 'Windows';
    else if (ua.indexOf('mac') !== -1 && ua.indexOf('iphone') === -1 && ua.indexOf('ipad') === -1) os = 'macOS';
    else if (ua.indexOf('linux') !== -1) os = 'Linux';
    else if (ua.indexOf('iphone') !== -1 || ua.indexOf('ipad') !== -1) os = 'iOS';
    else if (ua.indexOf('android') !== -1) os = 'Android';

    // Trình duyệt (Browser)
    var browser = 'Unknown Browser';
    if (ua.indexOf('chrome') !== -1 && ua.indexOf('safari') !== -1 && ua.indexOf('edge') === -1 && ua.indexOf('edg/') === -1 && ua.indexOf('opr') === -1) {
      browser = 'Chrome';
    } else if (ua.indexOf('safari') !== -1 && ua.indexOf('chrome') === -1) {
      browser = 'Safari';
    } else if (ua.indexOf('firefox') !== -1) {
      browser = 'Firefox';
    } else if (ua.indexOf('edge') !== -1 || ua.indexOf('edg/') !== -1) {
      browser = 'Edge';
    } else if (ua.indexOf('opr') !== -1 || ua.indexOf('opera') !== -1) {
      browser = 'Opera';
    }

    // 3. Khởi tạo session_key và session_start (Lưu trong sessionStorage của tab hiện tại)
    var sessionKey = sessionStorage.getItem('vm-session-key');
    var sessionStart = sessionStorage.getItem('vm-session-start');
    if (!sessionKey) {
      sessionKey = 'vm-sess-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      sessionStart = Date.now().toString();
      sessionStorage.setItem('vm-session-key', sessionKey);
      sessionStorage.setItem('vm-session-start', sessionStart);
    }

    var sessionDbId = sessionStorage.getItem('vm-session-db-id');
    var profileId = null;

    // Lấy thông tin tài khoản nếu đã đăng nhập
    if (typeof layHoSo === 'function') {
      var hoSo = await layHoSo();
      if (hoSo) profileId = hoSo.id;
    }

    // 4. Đồng bộ hoặc tạo mới phiên truy cập trong CSDL
    if (!sessionDbId) {
      // Phiên mới hoàn toàn (sử dụng upsert để tránh lỗi 409 Conflict)
      var insertRes = await sb.from('analytics_sessions').upsert({
        profile_id: profileId,
        session_key: sessionKey,
        device_type: deviceType,
        os: os,
        browser: browser,
        user_agent: navigator.userAgent
      }, { onConflict: 'session_key' }).select('id').single();

      if (insertRes.data) {
        sessionDbId = insertRes.data.id;
        sessionStorage.setItem('vm-session-db-id', sessionDbId);
      }
    } else {
      // Phiên đã có (từ trang trước đó chuyển sang), cập nhật profile_id nếu vừa đăng nhập
      if (profileId) {
        await sb.from('analytics_sessions')
          .update({ profile_id: profileId })
          .eq('id', sessionDbId);
      }
    }

    // 5. Ghi nhận chi tiết lượt xem trang (page view)
    if (sessionDbId) {
      var path = window.location.pathname;
      var pageName = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
      
      await sb.from('analytics_page_views').insert({
        session_id: sessionDbId,
        page_path: pageName,
        referrer: document.referrer || null
      });

      // 6. Nhịp tim cập nhật thời gian hoạt động (Heartbeat - 15 giây một lần)
      setInterval(async function () {
        var startTs = parseInt(sessionStorage.getItem('vm-session-start') || Date.now());
        var duration = Math.round((Date.now() - startTs) / 1000);

        await sb.from('analytics_sessions')
          .update({
            last_active_at: new Date().toISOString(),
            duration_seconds: duration
          })
          .eq('id', sessionDbId);
      }, 15000);
    }
  }
})();
