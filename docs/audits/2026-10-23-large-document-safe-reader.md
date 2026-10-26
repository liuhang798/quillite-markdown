# Multi-megabyte document safe reader — 2026-10-23

## Scope and behavior

Fix the reported v3.0.1 large Markdown opening stall. No publishing, native
installation, user-document writes or external uploads were performed.

- At 512 Ki UTF-16 code units, open a bounded, read-only source view instead of
  parsing/rendering the entire document. The limit is based on actual content,
  not potentially stale `Document.size` metadata. It also covers `.txt` files.
- Each page is at most 16 Ki code units plus one boundary unit. Surrogate pairs
  and CRLF sequences remain intact. Concatenated pages reproduce the exact source.
- The complete document and disk revision remain in document state. Save As uses
  that complete source, never the visible page. Original files are not altered
  by opening/searching/paging. A pre-existing hidden editor is reset to empty so
  its parser/folding extensions cannot process the large buffer.
- Full-source, case-insensitive literal search scans 128 Ki-unit chunks and
  yields between them. Cross-chunk matches work. Results are capped at 1,000,
  with an explicit limit notice. New queries, cancellation, rerender, document
  replacement and close retire the old search. No document content is uploaded.
- Safe mode explicitly does not provide editing, rich rendering, printing or
  formatted export. Guards cover keyboard edit/print, the Export Center,
  formatted HTML generation and image export, so a page cannot silently become
  a partial document export. Ordinary documents retain the existing experience.
- Formula-free mapped parsing omits the math-block start hook, which otherwise
  scans every remaining document suffix. Defaults are not mutated. Table scans
  skip pipe-free prose, and width-metadata removal bypasses parsing/allocation
  when no case-insensitive metadata marker exists.

This is a safety fallback, not background rich rendering of a multi-megabyte
document. No claim is made that arbitrary large Markdown can now be richly
edited or exported without additional work.

## Evidence

Synthetic fixtures only, Windows host, isolated Playwright profiles. Native
Linux Mint / WebKitGTK was not available, so Windows WebKit results are not a
Linux-native verification or a guarantee for the reporter's original file.

Before: 1,064,709-byte ordinary prose blocked Chromium for about 1.96 seconds;
12,770,403-byte ordinary prose exceeded the 30-second cutoff in Chromium and
WebKit. A 13,182,157-byte single code fence displayed after about 4.16 seconds.
This demonstrates that source structure matters, not only file size. Timeouts
establish long stalls, not a proven permanent deadlock.

After: the 12,600,077-byte prose/HTML-literal fixture displayed in 36 ms
(Chromium, synchronous open 28 ms) and 90 ms (WebKit, synchronous open 53 ms).
Heartbeat, last-page search, cancellation, complete Save As, disabled editing,
blocked partial printing/export, hidden-editor isolation, and returning to
ordinary formula/table rendering passed. Only one source page is in the DOM.
These timings exclude native file-dialog/disk/Go-to-WebView transport overhead.

Production-bundle smoke through the public OpenFile bridge displayed an
approximately 11.66 MB Chinese fixture in 54 ms and found its final marker.
The smoke test awaits the entry module before clicking (the API object exists
before lazy renderer initialization). Screenshot inspected at:
`D:\工作\CodexTemp\quillite-large-reader-fix-20261023\safe-reader.png`.

## Validation

- Working-tree frontend tests: 1,931 passed.
- Isolated candidate frontend tests: 1,911 passed (unrelated PicGo CLI work is
  excluded from this candidate).
- Candidate `go test ./...`, `go vet ./...`, syntax checks and production build
  passed. The Go test verifies complete multi-megabyte source, size, revision,
  and unchanged file bytes.
- New browser regression passed in Chromium and WebKit; candidate WebKit also
  passed. Development candidate font requests through its dependency junction
  hit Vite's allow-list; the production bundle has local hashed fonts and its
  public-route smoke/screenshot passed.
- Existing reader-performance browser regression passed (TOC, complete search,
  code deferral, export/print completeness, cache invalidation and switching).
- Source-level release-safety gate: 63 frontend checks and targeted Go checks
  passed. Native installation lifecycle was not run on this user's machine.
- Existing `browser-formula-large.mjs` passed its normal/nested/CRLF/300k-source
  formula cases but timed out at the final 320-formula scroll-to-end assertion.
  The unchanged 2026-10-22 candidate reproduces the same timeout at line 77;
  it is not attributed to this change and is not reported as a passing suite.

## Local test installer

Based on the previous validated document-link candidate plus only this task's
changes; preserves the earlier local fixes and omits ongoing PicGo CLI changes.
No version bump, GitHub push, release/tag overwrite or website update.

Production frontend was built first; existing Go API/bindings were unchanged.
Wails then built the NSIS core with user scope and embedded WebView2 bootstrapper,
and `build-windows-launcher.ps1` wrapped the custom installer UI.

- Path: `D:\工作\CodexTemp\quillite-large-reader-fix-20261023\candidate\build\bin\quillite-markdown-3.0.1-windows-amd64.exe`
- Bytes: 13,272,499; modified: 2026-10-23 13:56:06 +08:00.
- SHA-256: `8FE8DF00B53E468D4AE18128E3D410E9CCEFB8BC39AD4E43F86F11B26E46B9A0`.
- Verified final `QUILLITE_PAYLOAD` footer and embedded core length 10,475,931.
