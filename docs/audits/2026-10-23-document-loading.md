# Document opening feedback

## Scope and behavior

- Show a centered, non-modal loading card in the reading pane after 300 ms; add a longer-wait hint at 3 seconds. No fabricated percentages. English/Chinese labels report opening, processing and displaying.
- Preserve the previous page and file list until the new document is prepared. No blank page, source truncation or size-based restrictions.
- The card is initially transparent and uses a CSS delayed opacity animation, painted before synchronous work; its transform spinner can be composited while a parser call runs. JavaScript updates stages and the long-wait text at scheduling opportunities. Reduced-motion disables rotation; pending cards are hidden from accessibility announcements until shown.
- Separate table discovery, preparation, Markdown parsing, sanitization and final display. Opening yields between preparation stages; existing synchronous preview/export callers retain their API. Individual parser calls and final DOM insertion remain synchronous, not a full worker-based renderer.
- Owner-scoped cleanup prevents stale requests from hiding a newer indicator. New requests/closed previews invalidate old results. Read/parse failures release the indicator and retain the old document.
- Recheck content and editor mutation revision immediately before committing. The revision check protects edits whose large CodeMirror document has not yet been synchronized to the full string. Language/theme changes invalidate prepared HTML instead of committing outdated presentation.
- Covered open paths: recent/files/linked documents, file picker, first folder file, references, startup and file association events. Existing blank-document creation and background refresh are unchanged.

## Verification

- Shared checkout unit suite passed 1,933 tests before the final deferred-editor regression was added. Final isolated candidate passed all 1,914 tests (unrelated ongoing PicGo CLI work intentionally excluded).
- Chromium and WebKit loading browser regressions passed: initial opacity, spinner movement, long-wait text, previous-page retention, full large-document final marker, latest-request ordering, close/failure/cancel cleanup, English/Chinese and reduced-motion behavior.
- Chromium additionally verified actual CodeMirror input during a pending document read: cancelling the discard confirmation preserves the newly typed text, even with deferred content synchronization.
- Existing reader-performance and resource-lifecycle browser regressions passed: TOC, search, cache invalidation, complete printing/export, chart disposal and bounded/failed image reads. The reader test now waits for the async opening to finish before asserting the new heading, rather than mistaking the retained old heading for completion.
- Production-bundle public OpenFile smoke passed using the original exact 1,500,000-byte Chinese fixture plus a synthetic delayed bridge read. The 3-second hint, complete final marker and subsequent normal editor entry passed.
- Candidate Go tests, go vet, production build, source-level release-safety gate (including 63 JavaScript tests), and git diff whitespace checks passed. No native installer lifecycle ran on the user's machine.
- Native Linux Mint/macOS application behavior was not directly tested; browser coverage used Chromium and Playwright WebKit on Windows.

## Delivery

Built from the previous normal-large-document candidate, carrying only this task's source/test/documentation changes. No Go API change; frontend was built before Wails used skip-bindings/skip-frontend flags. No commit, GitHub push or website deployment.

- Installer: `D:\工作\CodexTemp\quillite-document-loading-20261023\candidate\build\bin\quillite-markdown-3.0.1-windows-amd64.exe`
- Modified: 2026-10-23 16:27:06 +08:00
- Size: 13,270,209 bytes
- SHA-256: `B85A0EBC50642A6B35931736BFF51DE6C87A4A32EC9CE406EDA972CED0328D90`
- Complete custom launcher wrapper verified: `QUILLITE_PAYLOAD`, embedded core 10,473,641 bytes.
- UI screenshots: `D:\工作\CodexTemp\quillite-document-loading-20261023\loading.png` and `production-loading.png`.
