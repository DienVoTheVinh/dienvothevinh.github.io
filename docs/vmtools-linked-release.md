# VMTools linked account release — 2026-09-09

VMTools runs from the dedicated `/vmtools/` directory. `/vmtool` is the teacher entry page. Other VinhMath pages and existing lesson/class records are retained. The deployment workflow copies the added directory explicitly; source folders and server keys are not published by Pages.

New general teacher accounts use real email and retain one Auth ID across VinhMath and VMTools. Existing teacher aliases and branded full-site/exam-only authorization are preserved. Existing teachers need a verified email onboarding step; this release does not guess addresses or rewrite identities.

`quan-tri-dich-vu` is an admin-only service dashboard. Classroom administration and VMTools have independent statuses, expiry dates and manual confirmation records. Classroom records do not yet enforce automatic class lockout. No online payment gateway or public pricing is enabled. Teacher-facing activation/renewal text directs users to contact thầy Vinh.

VMTools leases use signed, device-bound grants, configurable offline duration (default 48h) capped by the entitlement deadline. Native private device keys are protected by the operating system. New devices require approval; admin browser devices may be approved from the owner's PC. Server authorization does not rely on renderer role flags.

Full installers plus signed update manifests support direct jumps from older versions with the updater. A build that predates the updater requires a manual full installer once. Release download links remain unavailable until both platform packages are explicitly published by the owner. No release was uploaded to Google Drive in this change.

## Validation

- VMTools: 188 tests passed; native account/admin UI; web account gate; signed browser grant persistence and account separation.
- Live backend: teacher login, first grant, device approval/limit/revocation, idempotent renewal, reduced feature/offline allowance, private table access denial.
- VinhMath: branded account/migration regressions, real-email login normalization, server-verified roles, service authorization/routing, desktop/tablet service UI, all root HTML inline scripts.
- Database: classroom renewal retry does not double extend; changing classroom status preserves VMTools and teacher identity.
- Advisors: VMTools private tables intentionally have RLS without client policies and client grants revoked; new foreign-key indexes are initially unused. Existing unrelated advisories were not changed.

## Remaining rollout boundaries

Google Drive lesson synchronization and verified-email onboarding for existing aliases remain separate work; this deployment does not claim they are finished. macOS certification and a tested licensed Mac release are still required before advertising a Mac installer. Keep installer links unpublished until platform verification passes. Existing unrestricted legacy executables cannot be retroactively locked.

## Rollback

Revert the scoped Pages commit to restore the prior VMTools entry; do not delete user data, Auth users or licensing tables. The previous teacher-creation Edge body is retained in repository history before this change. The native PC files have a timestamped backup outside the website checkout. New database records are isolated, so a frontend rollback does not require destructive schema reversal.
