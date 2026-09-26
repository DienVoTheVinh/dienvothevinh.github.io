# Lesson submission upgrade — 2026-09-27

## Student uploads

- 1–30 JPG/PNG/WebP/GIF/PDF files, at most 30 MiB per original file and 600 MiB total after optional image optimization.
- JPEG/PNG/WebP over 2 MiB are processed one at a time, long edge at most 3200 px, JPEG quality 0.92. Keep the original upload if conversion fails or saves less than 15%; local originals are never modified. HEIC must be exported to JPG.
- A server receipt binds actor, student, target, kind, exact SHA-256 manifest, and submission time. Each file uploads independently. Two workers for small files; one when any prepared file exceeds 8 MiB.
- Retry skips accepted files. Same-tab reload and reselecting the same files resumes the receipt for up to 30 minutes. Finalization is idempotent and only succeeds after every registered file is present.
- Student files continue to use the existing Google Drive integration, not Supabase Storage. No plan, billing setting, or bucket limit was increased. Storage quota and network conditions still apply.

## Lessons, grading, and reports

- Teacher Storage uploads use 6 MiB TUS chunks with offset recovery and visible progress. Existing document bucket limit remains 50,000,000 bytes per file.
- Test PDFs generated from images are serialized and image dimensions bounded. Superseded builds cannot overwrite the next lesson; save waits for the active build and prevents duplicate clicks.
- New tests support scheduled opening/closing or persistent per-student flexible sessions. Old tests retain legacy mode. Server checks admission and scores lesson quizzes; quiz finalization is idempotent.
- An upload registered before test expiry can finish within its receipt window, but file contents cannot be changed after registration. Proxy test submissions require an on-time/late choice.
- Shared answer images render vertically. Student navigation uses “Lớp học”; result scores/assessment badges and home task colors are separated clearly.
- Report v2 includes actual test submissions and lesson quiz results within the Vietnamese-local reporting interval, plus missing planned tests due in that interval. Archived lessons retain their actual result history.
- Service-worker updates no longer force navigation of open work.

## Backend deployment and verification

- Production migrations: `20260926182907_lesson_submission_upgrade`, `20260926183457_report_test_history_preservation`.
- Production `nop-bai` Edge Function: version 20, JWT verification enabled; legacy actions remain supported.
- `scripts/test_submission_upgrade.sql` uses a transaction rolled back in full. It verifies persistent timers, scheduled boundaries, outsider rejection, server quiz scoring, 30-file receipt finalization, idempotency, report inclusion and grants.
- Browser regression covers 30-file retries, per-file/total limits, bounded upload concurrency, editor modes, simulated lost TUS responses, vertical answers, and inline script syntax. Existing submission, results, report, PDF-layout, date, paste and security tests also pass.
- No real student account/password was changed and no 600 MiB production load test was run. TUS network recovery was tested with a controlled browser server fixture, not a real teacher's upload. Monitor the first real large-file submission for network/provider-specific behavior.

## Compatibility

Deploy backend migrations and Edge Function before the root-site HTML/JS/CSS. Old clients keep their old single-request limits until a normal page refresh. Do not publish the stale `web/trang-web` mirror. Keep `output/` artifacts out of the release commit.
