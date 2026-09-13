# Lesson PDF layout repair

## Cause and scope

The production `bai-hoc.html` reader put PDF canvases in a height-constrained
flex column with the default `flex-shrink: 1`. After rendering cleared the
placeholder minimum height, loaded pages could collapse to zero content height.
The browser regression reproduced a page measuring 800 x 0 pixels before repair.
Lazy rendering also reset individual pages to 100% after a zoom selection.

## Repair

- Scope fixed-page layout to `.vm-pdf-pages`; do not change HTML/LaTeX reflow.
- Keep canvas pages non-shrinking, with automatic height from intrinsic dimensions.
- Reserve portrait placeholders without allocating full-size page bitmaps.
- Center fitted pages with auto margins; enlarged pages retain reachable left/right edges.
- Apply zoom through a viewer-local CSS variable, relative to the fitted width.
  Resizing and late rendering preserve zoom, and fit clears horizontal scrolling.
- Keep lazy rendering and existing bitmap density/memory limits.
- Keep toolbar outside the shrinking scroll area and fix the mobile selector for
  uniquely numbered PDF viewers.

No original PDFs, lesson records, permissions, accounts or database schema changed.
Only the root production lesson page is modified; `web/trang-web` is a legacy
snapshot not included in the Pages artifact.

## Verification

`scripts/test_lesson_pdf_layout_browser.cjs` exercises 24 portrait/landscape pages
at 1920, 820 and 390px, actual browser layout and IntersectionObserver, zoom,
lazy rendering, page spacing, resize, fit and both horizontal scroll edges.
The default deterministic test is included in Pages CI.

With `VM_PDF_REAL=1`, it additionally uses the deployed PDF.js version 2.16.105
and Mozilla's public 14-page sample PDF in a dark preview. All pages were
rendered and checked. Screenshots of desktop/mobile fixtures and the real PDF
were visually reviewed. This is isolated reader verification, not a claim to
have accessed the user's private lesson PDF.

Existing native LaTeX reader, reader controls and answer-PDF access-control
regressions also passed. To test published reader source after deployment, set
`VM_PDF_SOURCE_URL` to the production lesson URL with a cache-busting query.
