# Anonymous access review — 13 September 2026 (Vietnam time)

Follow-up: the owner subsequently requested keeping the shared initial student
password. This exception and additional security/service-form changes are tracked
in [the follow-up report](SECURITY-AND-ACCOUNT-SERVICES-2026-09-13.md).

## Scope and safety

Reviewed public VinhMath pages, public configuration, selected REST/RPC/Edge
endpoints, storage listings, live database grants/policies and account creation.
HTTP checks use only the publishable key downloaded from the website, no cookies
or user/admin tokens. Responses are reported as status/count/field names, not
student records, credentials or meeting URLs. No password guessing, load test,
notifications, account creation/deletion or changes to real coursework occurred.
Synthetic telemetry was tested inside rollback-only database transactions.

This is a bounded security review, not a certification or a complete penetration
test. No evidence was found that merely opening DevTools gives a visitor the
administrator password. Access to an already signed-in admin browser is a
different threat: its session credentials must remain private.

## Findings and remediation

| Finding | Evidence | Change |
| --- | --- | --- |
| Untrusted telemetry can reach an HTML sink (high) | Anonymous INSERT grant plus unconditional telemetry insert policy; rollback canary accepted. Student history concatenated `device_type` as HTML. Full session theft was not attempted. | Anonymous writes revoked; signed-in telemetry bound to `auth.uid()`; device values restricted; history renders escaped text. |
| Public fixed initial password (high for accounts still using that default) | Account creation page shipped a fixed default. No attempt was made to determine which existing accounts still use it. | Random per-account initialization; bulk creation generates a distinct password per student unless admin deliberately supplies a shared password; exports use actual per-account credentials. Existing passwords remain unchanged. |
| All application settings anonymously readable | Public SELECT policy included a meeting-link setting and any future settings. | Anonymous reads limited to an explicit presentation/theme allowlist; signed-in behavior retained. |
| Excess database privileges (defense in depth) | Client roles had TRUNCATE and other unnecessary privileges; RLS does not protect TRUNCATE. No destructive operation was attempted and no REST TRUNCATE route was demonstrated. | Remove anonymous DML and client TRUNCATE/REFERENCES/TRIGGER; harden default grants for future tables created by postgres. |

Anonymous telemetry is intentionally no longer collected. Existing telemetry is
preserved. Signed-in user history, teacher/admin reporting and parent access to
their child remain supported. Account switches start a fresh telemetry session;
logout stops the old heartbeat. Referrers no longer store queries or fragments.

## Verification

- Production outsider smoke: 47 bounded requests covering selected static paths,
  sensitive tables, administrative Edge functions, RPCs, protected storage,
  meeting setting, public theme and public Auth configuration.
- Profiles, classes, lessons, submissions, exams, questions, Google credentials,
  VMTools signing keys and payment tables denied anonymous reads in tested paths.
- Administrative Edge calls without authentication returned 401.
- A fabricated administrator JWT is rejected; no real session was used.
- Private storage listing returned no objects; this does not by itself test
  every possible object-download path.
- Public signup and anonymous Auth users are disabled.
- 83 public tables had RLS enabled; no public views found in the catalog review.
- Rollback database checks: own telemetry/page view/heartbeat works; anonymous,
  cross-account writes, profile reassignment, HTML device value and self-promotion
  fail; admin reads and guest theme work. Test records do not persist.
- Source regression tests cover random credentials, per-student exports,
  escaping, session reset/logout, account creation/brand flows and role guards.
- Secret indicator scan found no privileged-key indicators in its scanned files.

Intentional public data includes topic metadata, branding/theme configuration
and a limited public tenant-context RPC. A SECURITY DEFINER advisor notice does
not alone prove a vulnerability; application RPCs need individual gate review.

## Remaining work / decisions

1. Rotate old shared/default passwords in a coordinated rollout; do not lock
   existing students/parents out without notifying them. Never reuse that default
   for administrator or teacher accounts.
2. Enroll administrator MFA before enforcing it. No automatic MFA enforcement
   or password changes were made in this review.
3. Supabase reports leaked-password protection disabled. Enable and verify it
   through Auth configuration; this review did not change that setting.
4. Sampled GitHub Pages HTML lacks CSP/frame-ancestors, HSTS and related HTTP
   security headers. A proper header deployment requires a hosting/edge setup
   decision and compatibility testing for current inline code, embeds and
   VMTools. No hosting migration or paid service was enabled.
5. The public blog currently returned a permission error in the anonymous smoke;
   this was observed before hardening and was not opened up as part of this fix.
6. No complete authenticated teacher-to-teacher isolation review, dependency
   supply-chain assessment, phishing test, DDoS test or incident-history audit was
   performed. Historical access logs cannot be used here to claim no prior abuse.

Database migration: `20260912184636_anonymous_surface_hardening`.
Tests: `scripts/audit_anonymous_surface.mjs`,
`scripts/test_anonymous_security_hardening.cjs`, and rollback-only
`scripts/verify_anonymous_security_hardening.sql`.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
