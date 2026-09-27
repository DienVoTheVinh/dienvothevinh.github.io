# Public homepage showcase — 27 September 2026

## Sources and privacy

- Usage is an aggregate snapshot queried from analytics_sessions joined to profile roles, 24 August through 27 September 2026 at 11:31 ICT. Include student/teacher/parent only. Exclude administrator/assistant. It measures accounts and sessions, not independent people, satisfaction, or endorsements. Weekly sessions: 304, 186, 311, 378, 196; weekly distinct students: 46, 39, 59, 60, 36. Period active accounts: 76 students, 6 teachers, 7 parents. Final week is incomplete. No raw analytics is published or made anonymously queryable.
- LaTeX and bank images are deterministic crops of the screenshots supplied for this request. Only the expressly approved sample title appears. The bank crop contains generic creation/filter controls, not an exam inventory, teacher names or private source titles.
- Student screenshots omit greeting, teacher names, online-room links and profile identity. They show UI and progress on the user-supplied demonstration account, not a student's record.
- Monthly report is rendered from the existing report UI with explicitly fictional numbers and neutral identity, labeled on the image and its caption. The supplied identifiable weekly student report is NOT copied, embedded, or committed.
- Assets are flattened WebP images without metadata; original screenshots remain outside the repository. Click images for an enlarged view.

## Timetable

Anonymous clients read public_home_schedule, a curated projection of explicitly visible schedules in the main portal. No new anonymous access to classes, schedules, profiles, meeting links, notes or locations. Internal definer trigger has an empty search path and no public/anon/authenticated execution privilege; it serializes refreshes. Changes to schedule visibility, class fields or deletion refresh the projection.

The shipped 27 September safe snapshot renders synchronously before network work. Refresh uses the public key independently of authentication and the Supabase client CDN; 8-second timeout, manual retry and online retry. Last successful safe response is cached. A stale/offline fallback is visibly labeled with its date; future/current rows retain date filtering. A successful empty response clears old rows. This is availability fallback, not a promise that offline data is current.

## Motion and presentation

Möbius uses the standard radius-1, half-width-0.38 parametrization, 128×16 quads, 256 rigid 2×4 patches, reversed seam and one boundary. Scroll changes patch separation, never surface type. Rigid rotation preserves geometry; tilt remains oblique to keep the hole legible. Depth sorting hides rear faces; reduced-motion and background-tab behavior retained. UI remains isolated to the public home.

Hero copy/secondary labels shortened, duplicate VMTools copy hidden on homepage only, compact content-sized buttons and consistent stroked SVG arrows. Named rail includes new sections; mobile uses horizontal section navigation. Chart methodology remains in a disclosure rather than dense inline microcopy.

## Checks

- node scripts/test_public_home.cjs
- node scripts/test_home_showcase.cjs
- node scripts/test_blog_editorial.cjs
- node scripts/test_anonymous_security_hardening.cjs
- node scripts/check_secret_indicators.js
- Anonymous REST: 33 safe schedule records; raw classes remains blocked (401).
- Desktop/mobile UI and deployed assets must be checked before reporting production success.
