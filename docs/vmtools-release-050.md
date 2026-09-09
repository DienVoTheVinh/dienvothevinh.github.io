# VMTools 0.5.0 — Không gian dạy học

## Release scope

Public VMTools landing and homepage showcase use eight real isolated VMTools captures, in original dark/light themes. Capture data is a generated teaching sample; no desktop, other apps or user lessons are included. Responsive gallery, download cards and update guidance share the same component.

Teacher grants independently control classroom access and VMTools desktop, web, download and seven tools. Existing teacher classroom grants were preserved (10 active lifetime records); Auth identities/passwords/classes were not migrated. Legacy real-email linkage is explicit, owner-only and collision-checked. Public copy directs activation/renewal to thầy Vinh.

Installers are stored in private Supabase Storage. Download authorization checks verified live session, teacher/admin role, activation, expiry and download permission, returning a 90-second signed URL. Owner-only draft/upload/publish administration appears in quan-tri-dich-vu. Publishing rejects older/equal versions and missing update manifests. Both web and desktop discover the latest published release. The full installer supports direct upgrade without intermediate versions.

## Verification

- VMTools unit suite: 227 passed; production bundle built.
- Windows installer: 0.3.2 → 0.5.0, launch, reinstall, lesson/settings preservation passed in isolated QA profile. Existing uninstall registration restored after test.
- macOS arm64 workflow 34393822186: unit tests, native geometry/storage/clipboard checks, ad-hoc signature verification, first launch and relaunch passed. Fresh-install PDF use correctly blocked until account activation. Finder/quarantine and upgrade from a previous Mac release were not tested. This is explicitly an unnotarized test build; Intel Mac uses web/Chrome.
- Edge handler tests: account branding/full-site versus exam-only roles, collisions and rollback; independent service renewal and permission updates; role/activation/expiry matrix; release owner/session checks and downgrade prevention.
- Database rollback probes: active/blocked/expired classroom access, write trigger enforcement, owner access and independent provisioning passed. No persistent test identity/entitlement changes.
- Browser: desktop 1440 and mobile 390, original dark/light palette, screenshot gallery, no horizontal overflow or JS errors, guest download redirect passed.
- 46 HTML inline scripts checked; Deno Edge checks; diff whitespace and private-key/secret pattern scan passed.

Migration: 20260909184535_vmtools_launch_access.sql. Custom-auth Edge functions use auth.getUser plus role/session checks with gateway verify_jwt disabled intentionally. New release-file table has RLS and no client policy by design. Existing unrelated security/performance advisor warnings were retained (including pg_net/public, legacy RPCs, unused indexes and leaked-password protection disabled); this release does not claim to resolve those pre-existing findings.

## Artifacts

- Windows x64 installer: 122982278 bytes, SHA256 624fff633b701a4dc77af6e25fecb2b7142c951e38eb9999b8eb649af673b3c4.
- macOS arm64 test DMG: 166254671 bytes, SHA256 2b841680de4acb09009af873db29cb8c5678fb069c81f35ab2415fca37376922.
- Both have signed .vmupdate.json companions. Signing private key stays outside repositories.

Rollback: prior web VMTools bundle retained outside repo in F:/GSP/VMTools/qa/web-before-050; deploy commit may be reverted. Database migration is additive; do not delete teacher identities or lesson data when rolling back UI.
