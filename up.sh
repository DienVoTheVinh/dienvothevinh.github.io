#!/bin/bash
# ============================================================
# VINHMATH — TỰ ĐỘNG ĐẨY MÃ NGUỒN LÊN GITHUB
# Cách dùng: mở Terminal tại "/Users/thiendi/DAY HOC" và chạy:
# ./up.sh
# ============================================================

# Chuyển đến thư mục chứa script này
cd "$(dirname "$0")"

echo "=========================================="
echo "⚡ VINHMATH AUTO-UPLOAD GITHUB ⚡"
echo "=========================================="

echo "👉 Bước 1: Thêm các file thay đổi..."
# Thêm các file thuộc thư mục web/trang-web, web/supabase và các file cốt lõi ở root
git add web/trang-web/
git add web/supabase/
git add *.html css/ js/ img/ assets/ CNAME sitemap.xml robots.txt favicon.png 2>/dev/null || true

# Kiểm tra xem có file nào thay đổi không
if git diff --cached --quiet; then
    echo "ℹ️ Không có file nào thay đổi cần cập nhật."
    exit 0
fi

echo "👉 Bước 2: Tạo bản lưu thay đổi (Commit)..."
commit_msg="Cập nhật VinhMath - $(date '+%Y-%m-%d %H:%M:%S')"
git commit -m "$commit_msg"

echo "👉 Bước 3: Đẩy dữ liệu lên GitHub (Git Push)..."
git push origin main

if [ $? -eq 0 ]; then
    echo "=========================================="
    echo "🎉 ĐÃ CẬP NHẬT LÊN GITHUB THÀNH CÔNG!"
    echo "=========================================="
else
    echo "=========================================="
    echo "❌ LỖI: Không thể đẩy dữ liệu lên GitHub."
    echo "Vui lòng kiểm tra kết nối mạng hoặc quyền truy cập của thầy."
    echo "=========================================="
    exit 1
fi
