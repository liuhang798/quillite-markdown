# Contributing

Thank you for helping improve Quillite Markdown.

## Development setup

1. Install Go 1.25, Node.js 22, Wails 2.13, and the platform dependencies required by Wails.
2. Install frontend dependencies with `npm ci` in `frontend`.
3. Run the desktop development build with `wails dev`.

## Before submitting a change

Run:

```bash
cd frontend
npm test
npm run build
cd ..
go test ./...
go vet ./...
node scripts/test-release-safety.mjs
```

Keep changes focused, update both README files when user-facing behavior changes, and include screenshots for visible interface changes. Do not commit `frontend/node_modules`, `frontend/dist`, or files under `build/bin`.

Build the frontend before Go tests: the application embeds `frontend/dist`. See [testing notes](docs/testing.md) for isolated browser regressions and [the release guide](RELEASING.md) for complete installer packaging. Never run installer lifecycle tests on a personal or self-hosted machine; they require a disposable GitHub-hosted Windows runner.

For documentation-only changes, check Markdown rendering, relative links and agreement with current code. Preserve release notes and tags unless a release change is explicitly requested. Keep unrelated local edits out of the commit.

## Issues and pull requests

- Describe the expected and actual behavior.
- Include the operating system and application version.
- Attach a minimal Markdown file when it helps reproduce a rendering or editor problem.
- Never include private documents, credentials, or personal information in an issue.
