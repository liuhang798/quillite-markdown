# PicGo CLI hosting setup and verification

## Finding

The selected mode and installed CLI were correct, but the default CLI selected PicGo Cloud without usable authorization. `TestPicGoCLI --version` and component installation incorrectly enabled Save. The real upload then failed and correctly preserved `assets`, making the installation appear ineffective.

## Repair

- Version detection/preparation no longer marks hosting ready.
- CLI-only browser login invokes `picgo --config <new private profile> login`, then checks `cloud auth status --format json`. No direct Cloud upload API or background Server is used by this mode.
- Profiles are created under the application configuration directory. Existing CLI configuration is never overwritten by login. Credentials stay in the CLI configuration, not UI responses/preferences. Profiles are retained on failure because browser approval may already have written credentials.
- Existing trusted CLI JSON configurations can be chosen, including non-Cloud providers; blank preserves the default `~/.picgo/config.json` behavior. This change does not implement provider-specific credential forms.
- Explicitly confirmed test upload sends only a built-in one-pixel PNG via the same `upload` subprocess and HTTPS result parser as real image insertion. No clipboard or document image is read by this test. No automatic retries; test images remain remotely until the user removes them.
- Save requires a successful test within 10 minutes, bound to CLI executable identity and configuration contents. Changed configuration, expired verification, version-only detection and login alone cannot enable uploading.
- PicGo can log `[PicGo ERROR]` yet exit zero; stdout/stderr error markers now fail closed. Only fixed error codes leave the process wrapper. Authentication/quota issues are explained without showing credentials or raw CLI output.
- Existing local images are not bulk-uploaded. Successful future uploads use HTTPS while retaining local backups; failures retain local references.

## Verification

- Go unit/integration tests cover explicit confirmation, CLI argument boundaries, private PNG snapshots, configuration/executable binding, expiry, preserved original files/configurations, isolated login profiles and zero-exit errors on both output streams.
- The installed official PicGo 3.2.0 package was tested with an isolated unconfigured Cloud profile: it returned the expected actionable authentication error, without credentials or a successful upload.
- Frontend: 1,914 tests passed; production build passed (existing large-chunk warning remains).
- Isolated browser tests pass in Chinese and English: detection cannot enable Save, cancelled test sends nothing, failed auth remains actionable, login fills a separate profile but cannot enable, successful upload test enables, busy state protects fields, stale responses cannot enable after closing. Download progress, narrow layout and dark theme regressions remain covered.
- Go full suite and vet passed. Source release-safety gate passed (63 frontend checks).
- All 21 synthetic UI upload failure/fallback/manual-retry scenarios passed for Server, direct Cloud and CLI, including document switches and Cloud re-login. The CLI fixture now performs the explicit upload verification step before enabling, rather than relying on the obsolete version-only gate.
- No real account login or authenticated remote upload was performed by the agent. The user must authorize their own provider and run the built-in test after installation. Native macOS/Linux and installer lifecycle were not exercised on this Windows workstation.

Official CLI semantics checked against https://docs.picgo.app/core/guide/commands and the pinned installed package. Test evidence and screenshots: `D:\工作\CodexTemp\quillite-picgo-hosting-20261021`.

## Windows candidate

- Full NSIS core + custom installer launcher: `D:\mycode\quillite-markdown\build\bin\quillite-markdown-3.0.1-windows-amd64.exe`.
- Modified: 2026-10-21 18:22:37; total 13,215,370 bytes; embedded core 10,516,594 bytes; launcher 2,698,752 bytes; trailer 24 bytes.
- SHA-256: `0568BF2A5FA85122C64B36A54EE14340D9E1A1AA6FAEEF8F56A4ED6F98075BB2`.
- `QUILLITE_PAYLOAD` marker and payload size validated. No production release, website deployment or Git push was performed in this task.
