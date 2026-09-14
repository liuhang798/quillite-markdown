# Release Guide

## 1. Update the version

Keep the version synchronized in:

- `app.go` (`appVersion`)
- `wails.json` (`info.productVersion`)
- `frontend/package.json` and `frontend/package-lock.json`
- visible version labels in `frontend/index.html`, `frontend/src/main.js`, and `frontend/src/renderer.js`
- `build/windows/installer/project.nsi`

Update `CHANGELOG.md` and both README files for user-visible changes.

Every release must have a matching `## [version]` section in `CHANGELOG.md`. The release workflow uses that section for the GitHub source-code release and synchronizes it to the official website, which is the only update and binary-download channel used by the app.

## 2. Verify locally

```bash
go test ./...
cd frontend
npm install
npm run build
```

On Windows, build the installer with:

```powershell
$version = (Get-Content wails.json | ConvertFrom-Json).info.productVersion
$installer = "build/bin/quillite-markdown-$version-windows-amd64.exe"
wails build -clean -platform windows/amd64 -nsis -installscope user -webview2 embed -trimpath
./scripts/build-windows-launcher.ps1 -CoreInstaller $installer -Output $installer
```

The raw NSIS output is only the internal installer core. A Windows release is complete only after `build-windows-launcher.ps1` adds the custom launcher and validates the final `QUILLITE_PAYLOAD` marker.

On macOS, use the repository wrapper so both the bundle filename and display name are `轻阅 Markdown`:

```bash
bash scripts/build-macos.sh darwin/universal
```

## 3. Publish

### 推送代码

双击 `push-to-github.bat`，它会提交改动并推送 GitHub（带 3 次重试），或手动执行：

```bash
git push origin main
```

### 打 tag 触发构建

创建与 `wails.json` 完全一致的 tag 并推送到 GitHub（`release.yml` 由 push tag 自动触发）：

```bash
git tag -a v2.7.3 -m "Quillite Markdown v2.7.3"
git push origin v2.7.3
```

The `Build and Release` workflow validates the tag/version match, builds Windows, macOS, and Linux packages, uploads them to GitHub Release, then synchronizes the version and all platform assets to the official website. The Windows installer is published directly as an `.exe`; it is not wrapped in a ZIP. The Windows in-app asset is a standalone `.bin`, while the macOS in-app asset is a ZIP containing the complete verified `轻阅 Markdown.app`. Never publish a raw macOS executable for in-app updates: replacing only `Contents/MacOS/QuilliteMarkdown` breaks the application code seal and macOS terminates the next launch with `CODESIGNING / Invalid Page`.

首次启用官网同步时，在官网服务器运行最新版部署脚本并保存其输出的发布令牌，然后到仓库 **Settings → Secrets and variables → Actions** 新建 Secret：

- `QUILLITE_RELEASE_API_TOKEN`：服务器生成的 64 位十六进制令牌。

接口地址默认是 `https://qm.ssssa.cn/api/v1/releases`。只有迁移服务器时才需要在 Actions Variables 中配置 `QUILLITE_RELEASE_API_BASE_URL`。软件端只允许使用 `qm.ssssa.cn`，不要配置根域名或 `www` 子域名。工作流会先写入草稿、上传六类文件，再公开版本；官网是软件唯一的更新与下载通道，因此缺少令牌或官网同步失败时，整个发布任务会失败，不能形成半发布状态。

### Rebuild an existing Release

If a platform build fails after the tag and Release have already been created:

1. Fix and push the workflow or source changes to `main`.
2. Open **Actions → Build and Release → Run workflow**.
3. The workflow checks out the exact release tag, not the dispatch branch. If rebuilding changed source under the same version, explicitly update that tag to the tested commit first (preserve its previous object ID and use a lease-protected push), then keep the dispatch branch set to `main` and enter the existing tag, such as `v2.7.4`.
4. Run the workflow. Successful assets are uploaded to the existing Release and files with the same names are replaced.

The manual tag must exactly match the version in `wails.json`.

## 4. Verify the release

- Confirm all platform assets are present.
- Confirm `https://qm.ssssa.cn/#download` displays the new version and all official platform download links.
- Install the Windows package and check the desktop icon and Markdown file association.
- Select a non-empty folder containing a disposable sentinel file during a Windows custom install. Confirm Quillite uses its own child directory, create a test Markdown document inside that directory, then uninstall and verify both the document and sentinel remain untouched. The NSIS script must never recursively remove `$INSTDIR` or wildcard-delete documents.
- Mount the macOS DMG, confirm it contains exactly one `轻阅 Markdown.app` plus the hidden `.metadata_never_index` marker, copy the app into `/Applications`, launch it, and verify the installer image is ejected without leaving a second icon in Spotlight/Launchpad.
- Verify the macOS update asset is a `.zip` containing exactly one complete `轻阅 Markdown.app`; run `codesign --verify --deep --strict` against the extracted bundle and confirm no `*-macos-universal.bin` asset is published.
- Verify the in-app updater downloads the platform-specific asset, replaces the application, and relaunches successfully. Existing macOS clients that still expect the retired raw `.bin` format require one manual DMG installation before they can use future full-bundle updates.
- Confirm the website admin release list contains the new published version and six platform assets, and that the homepage shows it in the latest three entries.
