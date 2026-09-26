# Vietnamese dates and independent grading attachments

## Scope of this release

- Grading: clicking the paste target only focuses it. A separate explicit file-picker button handles image/PDF selection. Both personal feedback and shared lesson answers use this behavior. Existing paste handlers, ordered staging, preview and saving are retained.
- Date controls: shared `vm-date-inputs.js` adapter displays `dd/mm/yyyy`, plus `HH:mm` for local datetimes, independently of native browser/OS locale. A calendar and clear action are provided. The original date/datetime input remains the canonical ISO field for existing readers, handlers and FormData. No timezone conversions or database changes are introduced.
- Integration: classroom/lesson editors, schedules, exam editor, reports, account/service expiry, appearance schedules, dashboard rescheduling and self-study dates. Dynamically inserted fields are enhanced too.
- Invalid dates (including non-leap-year 29 February), incomplete datetimes and min/max violations block form submission. Non-form save paths validate explicitly. Existing ISO values are not overwritten by partially typed input.

## Verification

- `scripts/test_vietnamese_dates_browser.cjs`: Chromium with en-US, vi-VN and en-GB locales; display and ISO payload round-trip, programmatic updates, leap years, invalid input, calendar selection, disable/reset, dynamically added controls and 360px layout.
- `scripts/test_grading_paste_browser.cjs`: real production markup and paste handlers, two different submission targets and shared answers; no picker on paste focus; separate picker selection reaches the intended submission.
- Both added to Pages CI. Locale simulation is not a physical macOS device test.

This release does not claim completion of the separate submission-capacity, per-student timer, PDF upload or periodic-report enhancements still being investigated.
