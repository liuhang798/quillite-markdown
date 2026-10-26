# Large documents: restore normal mode

Supersedes the product behavior in `2026-10-23-large-document-safe-reader.md`.
The user rejected size-triggered read-only source pagination. No publishing was requested.

## Changes

- Removed the 512 Ki UTF-16 safe-reader module, CSS, tests and all edit/search/print/export restrictions. Original read-only reference-document permissions remain intact.
- Preserved full document state, source-image folding, revision checks, save paths and isolated undo histories. Existing backend size limits are unchanged.
- Retained formula-free Marked start-hook and table-metadata fast paths. Added a bounded five-character formula tokenizer prefix check: WebKit was repeatedly processing whole remaining strings even when ordinary prose could not start a formula.
- Skip structural TOC parsing when no `[toc]` marker exists.
- Defer offscreen prose layout as well as code/table layout; explicit navigation/search/export still uses the existing full-layout completion path.
- Avoid duplicating Base64 URLs in a second rendered HTML attribute. Generated images use lazy loading and async decoding; explicit print/export switches image loading to eager and preserves resource readiness checks.
- No source truncation, image rewriting, remote document transfer or new dependencies.

## Verification

- Shared workspace JavaScript unit tests: 1,928 passed; isolated candidate: 1,908 passed (unrelated ongoing PicGo CLI work excluded).
- Candidate `go test ./...`, `go vet ./...`, production frontend build: passed. An initial Go invocation ran before `frontend/dist` existed and was rerun successfully after the frontend build.
- Source-level release safety gate: passed, including 63 JavaScript tests. No installer lifecycle actions were run on the user's machine.
- Chromium and WebKit synthetic regression: 1,518,047-byte prose, approximately 2.9 MB embedded PNG document, and 12,650,047-byte prose. Complete final marker, normal edit availability, full editor source, append/save equality and complete HTML export all passed. Embedded PNG decoded at its original 800×800 dimensions.
- Existing reader-performance regression passed: deferred highlighting, TOC navigation, search, complete export/print, cache invalidation and document-switch cancellation.
- Existing resource-lifecycle regression passed: chart disposal, bounded image reads, queued-image print readiness, missing-image rejection, export wait cleanup, image deduplication and light/dark transitions.
- Production-bundle public OpenFile/edit smoke test passed against the previously delivered exact 1,500,000-byte Chinese fixture. Full final marker present; normal reading screenshot at `D:\工作\CodexTemp\quillite-normal-large-documents-20261023\normal-reader.png`.
- `git diff --check` passed (existing line-ending warnings only).

## Performance observations and limits

The 12,770,403-byte plain-prose WebKit diagnostic initially exceeded 30 seconds. With the bounded tokenizer and offscreen prose layout, it completed and painted in about 2.3 seconds in an isolated run. The mixed Chinese/Latin 12,650,047-byte regression painted in about 2.7 seconds in Chromium and 5.0 seconds in WebKit while other verification tasks were running. These are local observations, not guarantees or native Linux Mint measurements. Very large documents and complex diagrams can still take time to enter editing, render or export; this work does not introduce worker-based parsing or fully virtualized reading.

The pre-existing large-formula editor scroll-end regression documented in the earlier audit was not claimed fixed or included among passing browser checks here.

## Windows test installer

Isolated from the previous validated document-links candidate; excludes unrelated PicGo CLI work. No Go API changes; bindings checked and frontend production bundle built before Wails `-s -skipbindings`.

- Path: `D:\工作\CodexTemp\quillite-normal-large-documents-20261023\candidate\build\bin\quillite-markdown-3.0.1-windows-amd64.exe`
- Modified: 2026-10-23 14:26:02 +08:00
- Bytes: 13,268,260
- SHA-256: `6C4C8E752753EFA25620BB99822BAA66BA57521432B2E85802221EA6A90C13A3`
- Full custom launcher wrapper verified; footer `QUILLITE_PAYLOAD`, embedded core length 10,471,692 bytes.
- Not installed on the host; not pushed to GitHub or the website.
