# PicGo CLI preparation progress and spacing

## Changes

- Grouped prepare/detect actions with clear spacing and shorter introductory copy.
- Added a separate progress card with a stage title, runtime download percentage,
  transferred/total MiB (displayed as MB), elapsed seconds and four setup steps.
- Verification/extraction/npm installation/CLI checks are indeterminate. No
  guessed installation percentage or ETA is presented.
- Advanced executable paths are collapsed by default; preparation fills the same
  draft path and still requires explicit Save settings.
- Go emits byte counts from the actual HTTP reader and explicit stage changes.
  Event payloads contain only operation ID, phase and counts, never npm logs,
  paths, credentials or document content. Unknown-length updates are throttled.
- Each frontend subscription belongs to an operation and dialog revision. Old
  events cannot alter a different dialog/mode. Timers/subscriptions are released
  on completion/failure. Unchanged stage titles avoid repeated live announcements.

## Verification (2026-10-21)

- Real Windows official-component preparation passed and reported
  `downloading → verifying → extracting → installing → checking`, with
  35,574,076 downloaded runtime bytes.
- Chinese/English browser regressions passed: consent cancellation, mismatched
  operation, real-value binding, unknown install percentage, elapsed timer,
  integrity failure, explicit save and completion after closing the dialog.
- Inspected download and install screenshots at desktop/narrow widths, including
  dark mode. A native progress-bar width transition initially lagged its numeric
  value in captures; removed that transition so the two stay synchronized.
- Complete frontend suite: 1,910 passed. Go tests/vet and source release safety
  gate passed (63 frontend safety cases).
- Browser stages use synthetic backend events; the separate real-download test
  verifies the backend events. This does not claim a native macOS UI test or a
  real upload to the user's image-host account.
- Existing concurrent draft-save changes were left untouched; tests were rerun
  against the current workspace after those edits settled.

Screenshots and temporary components:
`D:\工作\CodexTemp\quillite-picgo-progress-20261021`.

No GitHub release or production website was changed.

## Rebuilt Windows installer

- Path: `D:\mycode\quillite-markdown\build\bin\quillite-markdown-3.0.1-windows-amd64.exe`
- Complete custom launcher + NSIS core; footer `QUILLITE_PAYLOAD` verified.
- Size: 13,208,190 bytes; modified 2026-10-21 17:56:25 (local).
- SHA-256: `0E7949A303B09BFE59A63FE6D9D2C4A2F2ECA6E3FA472D3767F5341FB645C482`.
- No installation/uninstallation was run on the user's computer.
