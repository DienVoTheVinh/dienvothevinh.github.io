# VMGame

Public entry points: `/vmgame.html` and `/vmgame-proof.html`. The homepage introduces VMGame immediately before the Biên soạn section. The native VinhMath role menu includes VMGame; partner portal and tenant menus keep their existing scope.

The council world is layered **2.5D concept art**, not a navigable 3D game. Ten scholars and eight fictional regions support character selection, a council, reversible construction choices, travel, regional particles, clouds and water lighting. Region architecture currently shares the approved landscape. Motion can be disabled; OS reduced-motion preferences take priority. Low quality reduces effects, and hidden tabs pause them.

All gameplay data is illustrative and saved only in localStorage. These pages make no student, database, multiplayer, account or payment calls. Character selection does not assign power based on region. The setting concerns collaboration, infrastructure and mathematical competitions. Competitive scoring and rewards remain undecided.

## Art provenance

The approved original landscape, academy and ten character WebPs were recovered through the supported Sites source workflow from source revision `9c762fb316ba286fe363c5ab4af7acadc93974f1`. All twelve images were inspected locally, including the revised Maya portrait and delta landscape. Only static runtime files were imported, with no source credentials or hosting configuration. Assets are under `assets/vmgame/art/` and total approximately 2.2 MB. No branded game assets are used.

## Backward proof exercise

The independent Thales exercise checks six statement/theorem pairs, explains incorrect choices, offers hints, and unlocks the forward proof after all six are correct. Native selects, tap-to-place and mouse pointer dragging are available. Changing an answer invalidates that step. Reset requires an explicit confirmation; progress persists locally with storage-denial fallback.

Geometry uses A=(0,2.8), B=(-1.6,0.8), C=(1.6,0.8), with factor `1 + BC/AC` for E and K. G is strictly inside AB. F is GE intersect BC; H is GC intersect the internal bisector from B. The auxiliary construction gives BK=CE=BC and hence GH/HC=GF/FE=GB/BK. Converse Thales yields HF parallel AC. The equivalent GH/GC=GF/GE condition is also accepted. Decimal measurements aid exploration, not proof. SVG coordinates retain the computed precision; G endpoints are excluded because the configuration degenerates.

## Checks

- `node scripts/test_vmgame_geometry.cjs`: 91 interior G positions, exact construction, ray order, intersections, ratios, parallelism, invalid endpoints and proof rules.
- `node scripts/test_vmgame_browser.cjs`: serves against `VM_BASE_URL` (default `http://127.0.0.1:8765`), uses Playwright and optional `VM_CHROME_PATH`. Covers repeated character selection, eight regions, construction, history/close, motion, persistence, touch/keyboard/drag, proof validation, reset, storage denial and widths 320/390/768/1440. Optional `VM_GAME_QA_DIR` saves screenshots.
- Existing production security, public-home, blog/menu and isolated-browser checks remain required.

Known pre-existing check: `scripts/test_role_ux_portal.js` fails at line 46 with “Teacher/student home priorities are incomplete” on clean base revision `bb5b072e48640001cd8dbcd4cca02465fc78f0cd`, as well as this branch. The unchanged role-home module is outside this release; this test is not a production deployment gate.

Deployment follows the repository's normal draft PR, review-ready, merge and GitHub Pages workflow. No database migrations are needed.

## Registered scene and visible motion revision

The public homepage now places the animated VMGame promotion immediately before the Biên soạn section, preserving the teaching-platform hero as the first section, with a direct Thales CTA. The world has a 3.6-second skippable/replayable entrance, always-visible motion and day/night controls, fixed-frame illustrated scholar idle/greeting, and one original SVG icon set across navigation, buildings, travel and proof controls.

Three reconstructed registered layers were recovered from Sites source `284cea067b7927ad96319cdfc5e1f8d569adee90`: opaque sky/water, alpha architecture/islands, and alpha terrace/foliage. Each remains 1672x941 with identical full-canvas fit, a shared 1.05 edge allowance and bounded independent depth motion. Source art has small local reconstruction variance; this is not pixel-perfect extraction, native 4K, rigged characters or navigable 3D. WebP quality 98 retains every alpha value and reduces the three PNGs from 5.33 MB to 1.77 MB. Production's PNG downsampling is avoided.

Water texture refraction and stream glints render behind architecture and foreground. The painted sky strip drifts independently. Warm facade windows, bridge lanterns, clipped moving reflections, moonlight and stars form separate night illumination. The previous continuous whole-painting zoom and broad water gradient were removed. Native resolution still limits fine detail on large screens; no extra detail is claimed from display scaling.

Existing explicit `motion:false` preferences are preserved and explained on screen. New preference defaults are independent of the OS: effective motion additionally honors `prefers-reduced-motion`, and the OS preference is not accidentally saved as a permanent user opt-out. Hidden/offscreen environments pause; low quality reduces render frequency and glint count. Scenes still show their day/night composition when motion is paused.

Additional QA commands: `node scripts/test_vmgame_motion_browser.cjs` compares rendered pixels over time at 390, 1440 and 2560 pixels, checks water pixel changes, cloud/portrait motion, night emissive pixels, entrance/skip, stored pause, OS reduced motion and homepage placement. `node scripts/test_vmgame_layers_browser.cjs` validates shared registration, independent depth and atomic fallback for an invalid bundle. Both use the same browser environment variables documented above.

The homepage alone uses `assets/vmgame/art/an-nhien-home.webp`, a transparent An Nhiên cutout from approved source `79757552173ac7707df69c2cad3c09938093ecd4`. Its 1024×1536 WebP preserves every alpha value from the supplied PNG. The promotional portrait uses contain sizing and silhouette shadow without a card border/background; in-game portraits remain unchanged.
