# Local document link routing — 2026-10-22

## Confirmed defect

`bindDocumentActions` intercepted HTTP(S) links and generated TOC links only. Ordinary relative Markdown links retained browser default navigation, resolving against the WebView origin (`wails.localhost`) instead of the current document directory. This matches the user's error-page screenshot.

## Fix

- Added a pure document-link resolver for relative/absolute local Markdown and text files, Unicode, encoded spaces, parent directories, local file URLs and fragments.
- Reader and split-preview links now prevent browser default navigation. Local targets use the existing `openRecentFile`/`OpenRecentFile` pipeline, including macOS permission recovery, unsaved-change confirmation and latest-document-request guards.
- Same-document anchors do not reload the file. Existing generated IDs, conventional heading slugs and non-heading IDs are supported. Web/email links keep the existing validated external opener.
- Missing, unsupported or cancelled targets retain the current document. Arbitrary schemes, UNC/network paths, malformed encodings and non-document files are not sent to the browser or shell. Middle clicks follow the same routing.
- Late errors from superseded requests are ignored. No source text, file relocation, deletion, new backend API or editor-inline-link interaction was introduced.

## Verification

- 1,904 frontend tests passed. Added path-resolution and asynchronous navigation tests (cancel, new input during read, changed session and missing targets).
- Existing static assertions were updated for the optional fragment parameter and shared anchor handler; no behavioral assertions were removed.
- Chromium and WebKit browser tests passed for Chinese relative paths, parent links, fragments, external links, missing/unsupported targets, split-preview unsaved cancellation and middle-click. No WebView navigation or popup occurred. File and OS-opener APIs were mocked; no user documents were touched.
- Added a Go test that opens an actual temporary Chinese/space path through `OpenRecentFile` and verifies missing targets do not pollute recent records. `go test ./...` and `go vet ./...` passed. Native macOS permission dialogs were not tested.
- Production frontend/Wails build, full Windows launcher packaging, JavaScript syntax and targeted `git diff --check` passed. No local installation/uninstallation was performed.

## Candidate

Isolated from unrelated image-upload work: committed baseline plus the earlier diagram-selection and direct-draft-save fixes, then this link fix.

- Installer: `D:\工作\CodexTemp\quillite-document-links-20261022\candidate\build\bin\quillite-markdown-3.0.1-windows-amd64.exe`
- Size: 13,269,532 bytes
- Modified: 2026-10-22T18:26:38.2450147+08:00
- SHA-256: `5DDEFB902219AB9A118C1EA1366B852C0B76083597085FC61B317EC32E70F0CE`
- Footer: `QUILLITE_PAYLOAD`; embedded NSIS core: 10,472,964 bytes. Both verified against final file length.

No GitHub push, tag update or website publication performed.
