# PicGo CLI verification confirmation — 2026-10-22

## Change

- Rename the test action to “验证上传配置” / “Verify upload settings”, with explicit built-in image/no file selection guidance.
- Show a prominent verified-but-unsaved state and a native modal “Save & enable” confirmation after successful verification.
- Cancel/Escape dismisses only the confirmation. It does not save; manual saving remains available within the backend verification validity window.
- Confirmation keeps verification serialized, releases the busy state before saving, and checks the original settings revision again before committing.
- Invalidating settings closes an outstanding confirmation; save failure clears the ready state without automatically repeating the upload.
- No backend upload protocol, provider credentials, automatic migration, or version number changes.

## Verification

- Frontend tests: 1,920 passed. Updated the async-settings fixture for dialog access and two pre-existing source assertions to match the current document-link signatures/delegation.
- Go tests and `go vet ./...`: passed.
- Source release safety gate: 63 passed (not a substitute for disposable Windows installer lifecycle CI).
- Browser settings regression: Chinese and English passed; covers pre-upload consent, success confirmation, Escape, explicit save, failed save, stale results, and serialized operations.
- Browser upload-failure regression: 21/21 passed across Server, Cloud and CLI, including switching documents and local fallback.
- Visually checked the success modal/status card and narrow dark-theme modal. Screenshots and logs: `D:\工作\CodexTemp\quillite-picgo-confirm-20261022`.
- Browser backend responses are controlled fixtures. No real account login, external test upload or user-document modification was performed.

## Delivery boundary

Build the Windows NSIS core and then wrap it using `scripts/build-windows-launcher.ps1`; verify the final size, timestamp, SHA-256 and `QUILLITE_PAYLOAD` footer. Do not run an installer/uninstaller lifecycle on the user's machine. No GitHub push or public release is part of this UI change.
