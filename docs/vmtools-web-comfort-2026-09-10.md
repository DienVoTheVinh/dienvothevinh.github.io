# VMTools web comfort fix — 2026-09-10

- Apply saved dark/light colors before CSS, modules, fonts and account checks arrive. Keep the embedded document invisible until its load event.
- Use a fresh web-entry.html launch path outside the offline asset allow-list. This opens the latest build without forcibly reloading existing lessons. Keep historical hashed assets for already-open tabs.
- Compact workspace header to 40 px desktop / 44 px mobile. Hide/show keeps the same iframe and its contents; preference lasts for the browser tab session.
- Give the web experience button a filled blue treatment and promote the modest author credit on the homepage and download portal.
- Preserve server access checks and published 0.5.1 installer/update artifacts.

Validation: scripts/test_vmtools_web_comfort.cjs covers initial dark/light paint with styles/modules blocked, desktop/mobile layout, same-frame lesson preservation, and guest access gates on/off. Desktop/mobile screenshots reviewed. Inline HTML and JavaScript syntax checks passed.

Rollback: revert this web commit and redeploy Pages. Do not delete retained hashed assets or reset user storage.
