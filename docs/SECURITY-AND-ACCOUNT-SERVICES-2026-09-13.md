# Security follow-up and account-service form — 13 September 2026

## Owner-requested account compatibility

- Restore `VinhMath2026#` as the initial password for individual/bulk student creation, including brand students.
- A paired parent shares the student's password when the existing checkbox is enabled. A separately requested parent password remains random.
- New teacher/assistant/portal-manager defaults remain cryptographically random. Switching student to staff resets the default; staying within the same audience preserves manual input.
- No existing Auth users, passwords, profiles, memberships or subscriptions were changed. Password reset remains an explicit admin operation with an empty field.
- The shared student password is an owner-approved exception, not an admin credential. Knowing a student's login and this unchanged initial password remains a risk to that student account.

## Security fixes

### Profile fields in administrative HTML

The account list interpolated a display name into an inline delete handler and rendered usernames/classes without escaping. The student administration table rendered names, avatars and parent labels without escaping. Presentation fields are untrusted even when retrieved by an administrator.

- Escape name, username, class and parent text at the output boundary.
- Delete buttons use a validated UUID only. Names are looked up on click, never interpolated into JavaScript.
- Account errors use textContent; only explicitly constructed, escaped success messages use HTML.
- Avatar URLs allow HTTPS or same-origin HTTP development URLs, with no credentials or control/markup characters. Avatar requests carry no referrer.
- Keep account actions and legitimate avatar images working.

An isolated Chromium test against pre-fix main detected three injected image elements in the account-list/error fixture. The fixed code rejects the elements and preserves literal text. No real account/admin session was used to demonstrate the issue.

### Internal notification helpers

Live `notify_class` and `notify_staff` were SECURITY DEFINER fan-out functions without caller checks, but EXECUTE was granted to authenticated users. Their legitimate callers are four owner-owned SECURITY DEFINER triggers, not browser code.

- Revoke EXECUTE from PUBLIC, anon and authenticated; retain owner/service_role access.
- Pin search_path with pg_temp last.
- Preserve the authorized vm_notify_class_start workflow and existing triggers.

### Recipient message updates

Recipient UPDATE RLS alone does not constrain changed columns. Narrow browser UPDATE grants for messages and notifications to read_at, retaining recipient RLS. Sending new messages through the existing sender-checked INSERT policy remains unchanged.

Migration: `supabase/migrations/20260912191654_lock_internal_notification_helpers.sql`. No account/content migration or password change.

## Teacher service form

- Two matching cards: **Dịch vụ 1 · Quản lý lớp học** and **Dịch vụ 2 · VMTools**.
- Independent checkboxes, neither selected initially. Support one, both or account creation for later activation.
- Quantity only for monthly/yearly terms; date only for custom terms. Ignore stale values of disabled services.
- Disabled VMTools submits pending, no enabled channels/features, amount 0 and no confirmation. Enabled VMTools retains explicit paid/free confirmation.
- Preserve desktop/web/downloads, seven feature choices and independent terms.
- Reuse existing authenticated creation endpoint and teacherGrant/provisioning contract. No parallel service model or global entitlement-rollout change.
- These controls affect new account creation, not existing account services.

## Verification

- Node: student/staff defaults, account scopes, bulk exports, managed accounts, profile privileges, role claims, anonymous hardening, notification grants, teacher services and branded accounts.
- Isolated Chromium: hostile names/errors, avatar schemes, delete dispatch, notification menus, service request payloads checked by the actual teacherGrant function.
- Service form: all four checkbox combinations; invalid quantities/dates; disabled stale fields; light/dark at 1440/820/390px; no overflow or page exceptions.
- Rollback SQL before and after production migration: helper calls denied, service access retained, receipt columns restricted, exact production lesson/submission triggers functional, own receipt allowed and another user's denied.
- Tests roll back generated notifications and pg_net queue entries before dispatch. No new accounts, changed passwords or real test notifications sent; no leftover security-regression notices.
- Deployment pipeline includes password/service contracts and isolated-browser security/UI regressions.

## Limits

Incremental hardening does not prove every endpoint/render path safe. Shared student passwords, optional admin MFA, hosting-level security headers and broader authenticated penetration tests remain follow-ups. No forced MFA, session logout, CAPTCHA, stricter shared-school-IP limits or changed password requirements were introduced.

Reference: [Supabase pg_net transaction semantics](https://supabase.com/docs/guides/database/extensions/pg_net): queued HTTP work starts only after commit; these regression transactions explicitly roll back.
