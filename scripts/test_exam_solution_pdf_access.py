from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / "web" / "supabase" / "exam_solution_pdf_access.sql").read_text(encoding="utf-8")
ADMIN_JS = (ROOT / "js" / "exam-admin.js").read_text(encoding="utf-8")


def assert_contains(text: str, needle: str, label: str) -> None:
    if needle not in text:
        raise AssertionError(f"Missing {label}: {needle}")


assert_contains(SQL, "allow_solution_pdf boolean not null default false", "safe default")
assert_contains(SQL, "public.can_download_exam_solution", "permission RPC")
assert_contains(SQL, "e.allow_solution_pdf is true", "teacher approval check")
assert_contains(SQL, "a.student_id = auth.uid()", "student ownership check")
assert_contains(SQL, "a.submitted_at is not null", "first submitted attempt check")
assert_contains(SQL, "security invoker", "RLS-preserving function")
assert_contains(SQL, "from public, anon", "anonymous RPC revocation")

assert_contains(ADMIN_JS, "allow_solution_pdf: !!el('exAllowSolutionPdf').checked", "admin save toggle")
assert_contains(ADMIN_JS, "el('exAllowSolutionPdf').checked = !!data.allow_solution_pdf", "admin edit toggle")

for relative in ("luyen-de.html", "web/trang-web/luyen-de.html"):
    page = (ROOT / relative).read_text(encoding="utf-8")
    assert_contains(page, "can_download_exam_solution", f"server guard in {relative}")
    assert_contains(page, "await vmKiemTraQuyenPdfLoiGiai", f"async guard in {relative}")
    assert_contains(page, "allow_solution_pdf", f"exam flag in {relative}")
    assert page.count("pdfCompileMode === 'solution'") >= 2, f"Expected repeated download guards in {relative}"

print("OK: exam solution PDF access is server-gated in SQL and both student bundles")
