# PicGo CLI official preparation — 2026-10-21

## Scope

- Added explicit one-click preparation to the existing PicGo CLI mode.
- Node 22.23.3 comes from nodejs.org with compiled SHA-256 checksums for Windows
  x64, macOS x64/arm64 and Linux x64. PicGo 3.2.0 and its dependencies come from
  registry.npmjs.org using an embedded reviewed lockfile and npm integrity checks.
- No server, global Node/npm installation, website hosting, release publication,
  or actual image upload is performed during preparation.
- Existing CLI hosting configuration is reused at upload time. This change does
  not yet add visual provider credential forms or verify real hosting permission.

## Boundaries

- Preparation requires explicit confirmation, runs once at a time, and is bounded
  by a five-minute timeout. Runtime download is bounded to 100 MiB.
- Archive extraction is create-only, checks path traversal and duplicate files,
  does not materialize links, and limits file count and extracted byte size.
- npm runs directly via private Node with lifecycle scripts, bin links, audit,
  funding requests and fetch retries disabled. npm config/cache are private;
  inherited Node/npm options, tokens and registry settings are not used.
- Runtime smoke check uses a private temporary PicGo config. It does not inspect
  the clipboard or read a document. Success only fills the draft CLI path; saving
  upload settings is a separate user action.
- Only freshly created, unexposed private temporary trees are recursively cleaned
  up. Regression tests preserve pre-existing sibling documents and completed
  components. Failed preparation does not replace an existing component.
- Managed uploads resolve the adjacent private Node, not a system Node. Original
  image snapshots, HTTPS URL validation and local-asset fallback remain unchanged.

## Verification

- Real official download/install/CLI startup on Windows: passed, about 17 seconds
  in this environment (not a promised download duration).
- Real macOS Intel/Apple Silicon and Linux x64 archive download, checksum and
  extraction: passed. Native execution on those operating systems is not claimed.
- Go unit tests cover confirmation, official source allowlist, reviewed lockfile,
  unsafe paths, duplicate entries, links, digest mismatch, create-only writes,
  isolated environment, private Node resolution and cleanup ownership.
- Browser tests in Chinese and English cover confirmation cancellation, integrity
  failure, draft-only completion, explicit save, and late response after closing.
- Frontend suite: 1,900 tests passed. Source-level release safety gate: passed.
- Upload failure/fallback browser suite: 21/21 synthetic-service cases passed.
- Artifacts/screenshots are isolated under
  `D:\工作\CodexTemp\quillite-picgo-wizard-20261021` and
  `D:\工作\CodexTemp\quillite-picgo-official-20261021`.

Real image hosting requires the user's provider configuration and is not tested
against their account. No production website or GitHub release was changed.

## Local Windows installer

Complete custom-launcher installer (not merely the NSIS core):
`D:\mycode\quillite-markdown\build\bin\quillite-markdown-3.0.1-windows-amd64.exe`.

- Size: 13,203,058 bytes; modified: 2026-10-21 17:34:13 (local).
- SHA-256: `E2F9446145B6280F8199E9BE4F44403598BA04FBEA84DC05007EACFDA9CD1098`.
- Footer: `QUILLITE_PAYLOAD`; core: 10,504,282 bytes; launcher: 2,698,752 bytes.
- No application installation, upgrade or uninstall was performed on the user's
  computer. Installer lifecycle acceptance still requires disposable Windows CI
  before a formal release.
