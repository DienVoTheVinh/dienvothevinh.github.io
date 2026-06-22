-- ============================================================
-- VINHMATH — THÊM CỘT LƯU TRỮ CODE LATEX CỦA ĐỀ KIỂM TRA CUỐI GIỜ
-- ============================================================

alter table public.lessons add column if not exists test_latex_content text;
