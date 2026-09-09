# VMTools 0.5.1 — Không gian dạy học · Giao diện mới

Approved Graphite/Porcelain calculator design, with original rounded line MENU icons and unchanged numeric shortcuts/key positions. Source, browser bundle and Windows/macOS installers share this design. New calculator gallery captures are isolated application renders without personal data.

Homepage introduction, portraits and actions are compact on desktop; VMTools begins at about 554px in tested 1366/1440/1920 viewports. Showcase corners are rounded and the author credit is modest. Mobile 390px has no horizontal overflow.

Owner web-experience controls support closed, all teachers, or teachers and guests, with five independent tool switches. Trial starts closed. Server signs 90-second trial leases; client refreshes every 30 seconds and locks after expiry without connectivity. Trial does not grant downloads or desktop entitlements. Normal individual grants remain separate.

Teacher web Drive UI supports connect, list, save a new version, open with replacement guard, and disconnect. Encrypted credentials use a separate server-only table from Meet. OAuth requests drive.file and reuses the existing callback with single-use purpose-scoped states. Server verifies user/session/teacher entitlement and file ownership; 20MB lesson limit. Actual Google consent/round-trip still requires a teacher to link their Google account; no existing Drive connection was silently reused.

## Validation

- App: 227 existing tests plus 3 new trial deadline tests passed; renderer build passed.
- Calculator: dark/light MENU icons and vector/calculus screens checked; mode 5 navigation preserved.
- Windows: isolated 0.3.2 to 0.5.1 upgrade, launch, reinstall, lesson/settings preservation passed. Existing uninstall registration restored.
- macOS: native arm64 workflow 34399507129 succeeded, including launch/relaunch, signature and mounted-DMG verification. Ad-hoc test build, not notarized; Finder/quarantine/previous Mac upgrade not verified.
- Server tests: role/trial matrices, independent service rights, owner/session release gate, downgrade/manifest checks passed. Four Edge entrypoints passed Deno check. Production guest catalog 200, unauthenticated download and Drive denied.
- New migration 20260909195116_vmtools_web_experience_drive.sql applied. Both new tables have RLS and no anon/authenticated SELECT privilege; server-only access is intentional. Advisors show expected no-policy/unused-new-index notices, plus pre-existing project findings outside this release (see prior release audit). No user identities, classroom records or existing grants changed.
- Browser desktop/mobile gallery and guest-download gate passed; 47 inline HTML scripts checked. SW cache v74; generated bundle cache f2f150227419. Prior web bundle backed up outside repository at F:/GSP/VMTools/qa/web-before-051.

Security advisor reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy — intentional for tables restricted to service-role handlers.

- Additional browser checks: guest trial routing when enabled/disabled; Drive UI local-save ordering, escaped filenames and validated workspace opening passed against isolated mocks.
- Signed update manifests verified against both final installers (size, SHA256 and Ed25519 signature).
