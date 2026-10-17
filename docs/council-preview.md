# Hội đồng Tri thức — isolated interface prototype

Entry point: `assets/council-preview/index.html` (no existing teaching-page links changed).

This is an interactive **2.5D vector scaffold**, not a navigable 3D game, not animated character models, and not the completed approved anime-art treatment. All SVGs are original code-native artwork. No third-party game assets, UI copies, student data, authentication, analytics, CDN, production scripts, or database calls are used.

## Run and review

From the repository root:

```sh
python scripts/serve.py --port 8765
```

Open `http://127.0.0.1:8765/assets/council-preview/`.

- Explore eight cultural concepts: Vietnam, US, China, Japan, Korea, France, Britain, and an explicitly exploratory Nordic direction.
- Select/reselect ten fictional scholar concepts, invite up to four to the council, and remove members.
- Construct three sample buildings with a mock 1,200-point budget. Each construction is charged once.
- Select destinations on a conceptual connection map or accessible select control, travel, and try one illustrative question per region. There is no ranking, timer, army, conquest, or settled game mechanic.
- Use browser back/forward, Escape to close dialogs, keyboard navigation, effect quality, and motion controls. Device reduced-motion preferences override animation. Effects pause when the document is hidden.
- Settings can reset only the prototype's data. Local state uses `vinhmath-council-preview-v1`; invalid IDs, duplicates, and unavailable storage are handled.

All names, roles, costs, questions, and progress are provisional mock data. The map is explicitly fictional and is not a geographic map. Several regions share the basic island geometry with different roof, tree, color, and particle treatments; these are placeholders for the intended regional art direction.

## Approved art integration is blocked

The current Library skill was read. `prepare_materialize` resolved all 12 records, with a consumer-local destination under this task's Windows workspace. The official unchanged `library_file_transfer.py` downloads bytes but fails before installation because Windows Python does not implement `os.setxattr`:

```
AttributeError: module 'os' has no attribute 'setxattr'
```

One bounded retry with the explicit Windows destination still returned signed transfers and no local `workspace_path`. WSL is not installed. No alternate storage URL, manual metadata bypass, or guessed filename was used. Therefore the approved images have **not** been visually inspected, integrated, or claimed as delivered. Scholar cards explicitly use temporary symbols. Complete the supported transfer, inspect actual pixels, and adapt/optimize assets before calling this the approved anime preview.

Authoritative resolved names (Library identities remain in the task-local handoff record):

| Role | Resolved filename |
| --- | --- |
| Kingdom | `01-kingdom.png` |
| Academy | `02-academy.png` |
| Geometry scholar | `03-male-geometry.png` |
| Arithmetic scholar | `04-female-arithmetic.png` |
| Vietnam | `01-vietnam-female-surveyor.png` |
| Japan | `02-japan-male-geometry-architect.png` |
| China | `03-china-male-algebra-strategist.png` |
| Korea | `04-korea-female-combinatorics-explorer.png` |
| France | `01-french-female-astronomer.png` |
| Britain | `02-british-male-geometry-engineer.png` |
| US | `03-us-female-probability-explorer.png` |
| Nordic | `04-nordic-male-cartographer.png` |

## Deployment boundary

At inspection, the repository has only `.github/workflows/deploy-pages.yml`. It deploys the whole production site to `https://vinhmath.com/` using the `github-pages` environment on `main` push or manual dispatch. There is no supported independent preview deployment. The workflow has not been run and this branch has not been merged. A draft PR is reviewable source, **not a published preview URL**. Publishing requires a separately approved isolated hosting path or a later approved production change. Existing teaching pages and deployment configuration remain untouched.

## Validation

```sh
node --check assets/council-preview/preview.js
node scripts/check_secret_indicators.js
node scripts/test_council_preview_browser.cjs
```

The browser script uses Playwright and an installed Chromium browser supplied through `VM_CHROME_PATH`; `VM_BASE_URL` defaults to `http://127.0.0.1:8765`. Set `VM_PREVIEW_QA_DIR` to write screenshots. Playwright is test-only and not a runtime dependency. On this Windows executor it was installed in a separate task-local `.qa-tools` directory and made available through `NODE_PATH`.

Coverage: 8 region choices; 10 scholar choices and repeated selection; council capacity/removal; construction cost/idempotency and reload; travel/back; correct/incorrect answer and retry; motion/quality persistence; OS reduced motion; reset/cancel; all four screens at 320, 390, 768, 1440 pixels; storage denial and malformed state; page errors and off-origin requests. Desktop and mobile screenshots require human visual inspection in addition to automated overflow checks.
