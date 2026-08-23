<div align="center">
  <img src="build/appicon.png" width="96" alt="Quillite Markdown icon">
  <h1>Quillite Markdown</h1>
  <p><strong>A fast, local-first Markdown reader, viewer and editor — about 9 MB on Windows.</strong></p>
  <p>Live preview · Syntax highlighting · Plain local files · Windows, macOS and Linux</p>
  <p><a href="README.md">简体中文</a> · <strong>English</strong></p>
  <p>
    <a href="https://github.com/liuhang798/quillite-markdown/actions/workflows/release.yml"><img src="https://github.com/liuhang798/quillite-markdown/actions/workflows/release.yml/badge.svg" alt="Build status"></a>
    <a href="https://qm.ssssa.cn/#download"><img src="https://img.shields.io/badge/download-official%20website-159A63" alt="Download from the official website"></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/liuhang798/quillite-markdown" alt="MIT License"></a>
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-526b58" alt="Windows, macOS and Linux">
  </p>
  <p>
    <a href="https://qm.ssssa.cn/"><strong>🌐 Official website: qm.ssssa.cn</strong></a>
    ·
    <a href="https://qm.ssssa.cn/#download"><strong>Download latest release</strong></a>
    · <a href="#screenshots">Screenshots</a>
    · <a href="#development">Build from source</a>
  </p>
</div>

> **Official website and downloads: <https://qm.ssssa.cn/>**
> Updates, installers for all platforms, release notes, and feedback are served only from this hostname, without relying on the apex or `www` domains.

![Quillite Markdown split-view Markdown editor with live preview and syntax highlighting](screenshots/en/03-split-editor.png)

## Why Quillite Markdown?

- **Lightweight by design:** the Windows installer is about **9 MB**, built with Go and Wails instead of Electron.
- **Local-first and private:** open and edit ordinary Markdown files on your computer—no account, proprietary vault or cloud lock-in.
- **Reading and editing together:** switch from a focused Markdown reader to split-view editing with live preview and syntax highlighting; the preview uses a clearer split-pane text size and continues to follow global text scaling.
- **Practical desktop integration:** recent files, document favorites, resource explorer, autosave, native dialogs, file associations and update notifications.
- **Cross-platform and open source:** one MIT-licensed Markdown desktop app for Windows, macOS and Linux.

It is a good fit for reading long Markdown documents, editing README files, maintaining technical notes and working with local documentation folders.

## Product improvement program

About Quillite Markdown includes a “Join the product improvement program” checkbox that controls error logs only. When enabled, sanitized software error logs, server-resolved country/region/city, coarse Windows/macOS/Linux type, and app version are submitted silently after an error. Unchecking it stops error reports.

Daily-active measurement is independent of this checkbox. Each device submits at most one anonymous active event per day containing a locally generated random install identifier, app version, coarse OS type, CPU architecture, and server-resolved country/region/city. The server stores only an irreversible hash of the identifier and never stores the source IP. Markdown content, file names, file paths, contact details, and individual actions are never uploaded. Offline, intranet, timeout, and server failures remain silent and never affect app features.

Feedback is a separate, explicit user action and is not controlled by the product-improvement switch. Users can choose a feature suggestion or functional issue and optionally provide email, phone, and screenshots. The app and system versions are included, but the current Markdown document is never uploaded. Deleting a feedback entry in the server admin console permanently deletes all of its images as well.

## Download

| Platform | Package | Download |
|---|---|---|
| Windows x64 | Step-by-step installer (`.exe`) | [Official download](https://qm.ssssa.cn/#download) |
| macOS | Universal Intel + Apple Silicon (`.dmg`) | [Official download](https://qm.ssssa.cn/#download) |
| Linux x64 | Debian package + portable AppImage | [Official download](https://qm.ssssa.cn/#download) |

On Windows, run `quillite-markdown-version-windows-amd64.exe` and follow the setup wizard. The installer can create a desktop shortcut, register Markdown file associations, automatically reuse the previous installation directory during an upgrade, and launch the app after setup. The Windows install, upgrade, and uninstall flow is presented entirely in Simplified Chinese. A fresh installation starts the app in Chinese, while the app interface can still be switched to English afterward.

The macOS build follows the computer's light/dark appearance automatically while still allowing a temporary manual switch. The temporary choice stays active until the system next changes between light and dark, then automatic following resumes. The interface and native title bar update together whenever the system mode changes. It centers native left-side window controls vertically within a slim title bar, and the controls stay stable during tiling and resizing. In fullscreen, the Logo and application name move left automatically, then restore the traffic-light safe area immediately on exit without briefly overlapping. Standard Command shortcuts remain available: `Command + W` closes the window while keeping the app in the background, and `Command + Q` quits the app. Closing from fullscreen exits fullscreen before hiding in the background; lazy editor loading and deferred explorer restoration reduce cold-start work.

The macOS installer image carries a metadata no-index marker. On launch, the installed app also verifies the installer layout and Bundle Identifier before safely ejecting a still-mounted official DMG, preventing its bundled copy from appearing as a second Quillite Markdown icon.

Documents and folders opened through macOS system panels, Finder, or file associations are persisted as native security-scoped bookmarks. Recent, Favorites, and Explorer silently restore read and edit access after relaunch and refresh stale bookmarks automatically. A preselected system panel is needed only for legacy records or when an unsigned update changes the app identity.

## What's new in 2.5.2

> **macOS 2.5.0 migration:** Version 2.5.0 used the retired raw-executable updater and cannot safely upgrade itself to a complete application bundle. Install 2.5.1 or later once from the [official website](https://qm.ssssa.cn/#download); normal in-app updates resume after that one-time migration.

- Fixed the 1–2 second delay when opening More Formats on macOS by replacing the native WebKit selector with an immediate in-app menu.
- More Formats retains collapsed toolbar commands, Academic Formulas, Diagram Builder, and every extended format, with Arrow, Home/End, and Escape keyboard support.
- Fixed security-bookmark decoding and release crashes with newer macOS SDKs so Recent, Favorites, and Explorer can continue restoring access reliably.
- Fixed an application link failure caused by a missing system framework on newer macOS SDKs, restoring Apple Silicon and Universal release builds.
- Preserved the user's original document path after resolving a security bookmark, preventing path changes or duplicate Recent entries.

## What's new in 2.4.8

- The right-side document outline now scales its typography and default width continuously across 1080p, 2K, and 4K displays while preserving manually chosen widths.
- Recent supports multiple persistent pins with drag-handle and keyboard reordering; pinned documents do not consume the ten ordinary Recent slots.
- Fixed full-capacity draft Save As potentially evicting an ordinary recent entry, with draft paths, pins, favorites, and recent records now migrated consistently.

## What's new in 2.4.7

- Removed the `GitHub` suffix from Check for Updates for a cleaner menu that accurately reflects the official website update channel.
- Update checks, installer-free in-app updates, and package downloads continue to use the single official host `qm.ssssa.cn`.

## What's new in 2.4.6

- Moved the official website, updates, downloads, telemetry, and feedback to the single hostname `qm.ssssa.cn`, with no dependency on the apex or `www` domains.
- Restored direct EXE delivery for the Windows installer on the website and GitHub Release; installer-free Windows updates use a dedicated BIN asset. macOS updates must download and atomically replace a signature-verified complete `.app` ZIP, never overwrite the bundle with a raw executable, which would trigger `Code Signature Invalid` at launch.
- Added aggregate update-check and actual-download metrics by release, platform, and source without uploading documents, paths, or device identity.

## What's new in 2.4.5

- Added website-backed feedback for feature suggestions and functional issues, with optional contact details and screenshots plus automatic app/system version information.
- Added Word/PDF export, reader Save As, Save Copy & Edit for read-only documents, and refinements for high-resolution displays, outline trees, notifications, and source navigation.

## What's new in 2.4.4

- Fine-tuned the title-bar book mark downward for a more natural visual baseline with the “Quillite Markdown” label.
- Removed the trailing hover trash icon from Recent, giving long document names more horizontal space.
- Recent records can still be removed from the document context menu without deleting the original file.

## What's new in 2.4.3

- Unified the default brand green at the exact `#159A63`; primary controls are no longer automatically darkened to `#10744A`, keeping buttons, selections, accent text, and application icons on the same green.
- Replaced the top-left brand tile with a transparent open-book mark whose strokes follow the selected accent, with no square plate, border, or shadow.
- Aligned the title-bar book mark and “Quillite Markdown” label to the same visual height, with dedicated sizing for the compact macOS title bar.
- Removed drop shadows from accent-colored buttons (New Document, back-to-top, home leaf icon) for a cleaner look; selected states keep their theme-colored outline.
- The Windows install, upgrade, and uninstall wizard is now Simplified Chinese only, with no setup-language dialog; compatibility messages, WebView2 progress text, and file-open actions are localized as well.
- Text zoom now applies globally: the reading content, the recent/explorer sidebar, and the table of contents all scale together.
- The sidebar and table-of-contents dividers no longer have a maximum width; they can be dragged freely and the width is remembered.

## What's new in 2.4.2

- The editor split panes (live preview / editor) now have a draggable divider with no maximum width limit; the width is remembered and restored on the next launch.
- Added a "format painter" to the editor: select text with formatting (bold, italic, strikethrough, highlight, inline code, heading, quote, or list), click the painter button to copy the format, then select the target text to apply it automatically. Press Esc to cancel.

## What's new in 2.4.1

- The live preview now follows the cursor while editing: wherever the caret moves, the preview scrolls to the matching section or paragraph.
- An “Exit editing” button in the editor header returns you to the immersive reading view in one click.
- Inserting a code block lets you pick from 19 common programming languages (JavaScript, Python, Go, Java, C/C++, Rust, HTML, SQL, and more); the language-tagged fence is written and highlighted automatically.

## What's new in 2.4.0

- Fixed the Windows in-app updater's executable-locking issue by running its helper from a separate temporary executable instead of the installed application file.
- After download and verification, the app can close the old version, replace it, and reopen automatically without another installer wizard.
- Update failures now include an explicit reason in `轻阅 Markdown/update/apply-update.log` under the user's configuration directory.
- Older clients cannot repair their own updater, so 2.3.12 or later must be installed manually once; future releases can then use installer-free in-app updates.

## What's new in 2.3.5

- Plain-text `.txt` files are fully supported: the reader and the live editor preview render them as-is (no Markdown parsing), the editor uses plain text mode, and files open from the dialog, drag-in, or folder explorer. The installer registers the `.txt` association for double-click opening.
- Insert images either from local files or by pasting an `http/https` online link with an optional description.
- Before editing attachments opened from WeChat, WeCom, or other app caches, write access is checked. Read-only, locked, or restricted files stay in the reader and ask to be saved as a writable copy, without administrator privileges or deleting the original.
- Added in-app automatic updates: the update dialog can download and apply the new version directly with a progress bar and integrity check, then restart automatically — no manual download, installer wizard, or macOS Gatekeeper approval needed. Supported on macOS and Windows; Linux keeps the manual download flow.

## What's new in 2.3.4

- Returning to Quillite Markdown now reloads the active document after another application changes it, while local unsaved edits remain protected from replacement.
- The More menu now offers document width presets — narrow, medium, wide, and full width — applied to both the reader and the live editor preview and remembered across sessions.
- Fixed reader search skipping Markdown inline code and fenced code blocks; code text is now counted, highlighted, and navigated correctly.

## What's new in 2.3.3

- Preview text can be zoomed with `Ctrl + wheel` on Windows/Linux or `Command + wheel` on macOS, and the selected size is remembered in both reader and live-preview modes.
- Fixed Windows upgrades being interrupted when Explorer locked an old shortcut or Markdown association icon; the installer can now offer to close a running older version and continue.
- Added a persistent Favorites view. Right-click documents in Recent or Explorer to add or remove them from Favorites.
- Favorited documents display a filled accent-colored star in Recent, Favorites, and Explorer for quick recognition.
- Favorites survive restarts and remain independent from Recent; removing a favorite never deletes the original document.
- Moved, deleted, or temporarily unavailable favorites remain visible as unavailable records so they can still be cleaned up.

## Highlights

- Read and edit Markdown with the same calm, polished interface.
- Open, read, and edit plain-text `.txt` files too: the reader renders them as-is (no Markdown parsing), the editor uses plain text mode, and the `.txt` file association can be registered for double-click opening.
- Insert images either from local files or by pasting an `http/https` online link with an optional description.
- Split editing mode: live preview on the left, syntax-highlighted editor on the right.
- The formatting toolbar covers H1–H6, bold, italic, strikethrough, highlight, text color, links, inline/fenced code, quotes, lists, tasks, horizontal rules, tables and images. The text-color control sits directly after Highlight and offers a complete 48-color square palette with the default color, seven grayscale steps and 40 spectrum shades. Changes preview live, can be recolored or reset, and remain fully undoable. When space runs out, controls move into the immediately responsive in-app More Formats menu instead of creating a horizontal scrollbar. More Formats also adds bold italic, underline, superscript, subscript, Academic Formulas, hard breaks, footnotes, reference links, autolinks, syntax escaping, HTML/collapsible blocks, keyboard keys and comments. Common actions support `Ctrl/Cmd + B`, `Ctrl/Cmd + I`, `Ctrl/Cmd + K`, `Ctrl/Cmd + Shift + X` and `Ctrl/Cmd + Shift + H`.
- Built-in Academic Formulas, KaTeX typesetting, and mhchem chemistry support: one unified entry groups 79 templates by mathematics, algebra and functions, geometry, calculus, linear algebra, probability and statistics, physics, chemistry, and chemical reactions. Fill in values, choose inline/display/numbered output, and insert ready-to-use Markdown; the guide is available directly inside the dialog. Raw `$…$` / `\(…\)` inline math, `$$…$$` / `\[…\]` display math, `\ce{…}` chemistry, and `\tag{…}` numbering remain fully supported. [Open the formula and chemistry guide](https://qm.ssssa.cn/guides/formulas/).
- Typora-style Mermaid diagrams render directly from fenced ` ```mermaid ` blocks. More Formats → Diagram Builder offers 22 common templates grouped by use case, with descriptions, fully editable source, live preview, and one-click insertion. Invalid syntax stays isolated to an inline error, Word/HTML exports embed a high-resolution image, and system PDF printing preserves the preview. [Open the Mermaid examples](docs/Mermaid-图表完整案例.md).
- Diagram Builder also includes 15 offline data charts: bar, line, stacked bar, area, scatter, diverging comparison, bar-and-line combo, funnel, heatmap, box plot, bubble, gauge, doughnut, waterfall, and word cloud. Editable fenced `echarts` JSON stays in the Markdown file, renders locally as SVG, and exports consistently to Word, HTML, and PDF. [Open the data-chart examples](docs/ECharts-数据图表案例.md).
- Three built-in reference shortcuts—Charts, Formulas, and Formatting—cover all 37 diagram templates, all 79 Academic Formula templates, and the Markdown/HTML formats supported by the editor. Opening a reference does not add it to Recent Reading.
- Close Preview returns from the reading screen to Home without removing the document from Recent. Home now provides the three complete examples together with a comprehensive shortcut guide for files, reading, editing, and text formatting.
- Inserting a code block lets you pick a common programming language (JavaScript, Python, Go, Java, C/C++, Rust, HTML, SQL, and more) and writes a language-tagged fenced block with highlighting. An “Exit editing” button in the editor header returns you to the immersive reading view at any time.
- Undo from the toolbar or with `Ctrl/Cmd + Z`; each document has isolated history that stops at the originally loaded content.
- `Ctrl/Cmd + F` searches Markdown source in place, highlights matches and scrolls to the selected result; the polished find-and-replace panel follows the selected Chinese or English interface language.
- Create a Markdown file and begin editing immediately, with autosave every 10 seconds while editing.
- Export Word, HTML, and PDF documents. Go generates standard DOCX files locally and converts LaTeX and mhchem Academic Formulas into native Word equations. HTML export creates a safe standalone page preserving the current color mode, accent, formulas, code, and images. PDF export uses the system print panel to preserve preview styling.
- Built-in feedback for feature suggestions and functional issues, with optional contact details, up to five screenshots, and automatic app/system version information. Administrators can review, resolve, or delete feedback together with all attached images.
- A collapsible hierarchical outline with clickable navigation, active section tracking and per-document folding memory. Its typography and default width adapt continuously across 1080p, 2K and 4K displays while remaining manually resizable. Document search, printing and back-to-top navigation remain available.
- Recent documents update immediately and show their source directory below the filename, with the full path available on hover for distinguishing duplicate names. Right-click to pin, unpin, edit, save as, favorite, reveal or remove a record. Multiple pins persist above up to ten ordinary recent entries and can be reordered with the drag handle or keyboard arrow keys. Deleted, moved or temporarily unavailable pinned files can still be unpinned or removed from the menu.
- Favorite documents from Recent or Explorer and manage them in a dedicated persistent Favorites view with Open, Edit, Show in Folder, and Remove from Favorites actions.
- On macOS, closing the main window leaves the app running in the background. Clicking the Dock icon again restores and foregrounds the window, and Markdown files opened from Finder display directly.
- Simplified Chinese and English interface with persistent language selection.
- Accent color and light/dark mode are independent: choose Fresh Green, Clear Blue, Vivid Orange, Vivid Violet, Coral Red, Lake Cyan, Mist Slate or Clay Brown, then pair it with either color mode. Both choices are restored across launches.
- Synchronized reading/editor text zoom up to 200%. On first use or without a manual preference, physical resolution and OS DPI are considered together: low-scaling 2K/4K displays start near 115%/130%, while displays already using high-DPI scaling are not enlarged twice. The More menu also offers automatic mode and 100%–200% presets, with remembered manual choices taking priority.
- Switch the left sidebar among Recent, Favorites, and a refreshable resource explorer for Markdown folders.
- Drag the library and document-outline dividers to customize panel widths; the layout is remembered locally.
- The resource explorer remembers its selected folder and active view across launches; click the active Explorer tab again to choose another folder.
- Native file open/save dialogs and `.md`, `.markdown`, `.mdown`, `.mkd` associations.
- Single-instance file opening and unsaved-change protection.
- A new split reading/editing brand icon with transparent rounded corners and no white square canvas. In-app Logos follow the selected accent while native system icons stay green; the About screen includes the author email and a direct repository link.
- Automatic checks use only the official website release catalog, with localized notes, official-host downloads, manual checks, and a 30-day reminder pause.

## Markdown format support

| Category | Editable and previewable formats |
|---|---|
| Text | Bold, italic, bold italic, strikethrough, highlight, text color, underline, superscript, subscript, inline code, keyboard keys and Markdown escaping |
| Structure | H1–H6, paragraphs, quotes, horizontal rules, hard breaks, fenced code, HTML/collapsible blocks and HTML comments |
| Lists and data | Bulleted lists, numbered lists, task lists and tables |
| References | Inline links, reference links, autolinks, images and footnotes |
| Scientific notation | Inline and display LaTeX, mhchem chemistry expressions, and `\tag{…}` equation numbers |

Preview is based on CommonMark/GFM. Highlight uses `==text==`; footnotes use `[^1]` and `[^1]: Content`. Formula rendering is local through KaTeX; for example, chemistry can be written as `$\ce{2H2 + O2 -> 2H2O}$`, while a numbered display equation can use `$$ E=mc^2 \tag{1} $$`. Underline, superscript, subscript, collapsible sections and keyboard keys use portable safe HTML tags that are sanitized by DOMPurify before display.

## Screenshots

| Home | Reader |
|---|---|
| ![Home](screenshots/en/01-home.png) | ![Reader](screenshots/en/02-reader.png) |

![Split editing with live preview](screenshots/en/03-split-editor.png)

## Go + Wails v2

Version 2.0 and later replace Electron with Go and Wails while retaining the existing HTML/CSS interface and CodeMirror editor. The current Windows installer is about **9 MB**, compared with about 90 MB for the previous Electron build.

- Backend: Go 1.23+
- Desktop framework: Wails 2.13
- Frontend: HTML, CSS, JavaScript and Vite
- Markdown: marked, DOMPurify and highlight.js
- Editor: CodeMirror 6
- Windows installer: NSIS

## Project structure

- `main.go`: Wails startup and window configuration.
- `app.go`: documents, folders, recent files, preferences, and desktop integration.
- `updates.go`: official-only release-catalog checks, platform package mapping, and version comparison.
- `frontend/`: Markdown reader, CodeMirror editor, and bilingual interface.
- `build/`: application icons and platform build configuration.
- `packaging/`: Linux desktop integration and package metadata.
- `scripts/`: repeatable project asset-maintenance scripts.

New Markdown documents do not require a location prompt. On macOS they are always stored in the user's `Documents/Quillite Markdown` folder so application upgrades cannot overwrite them. Portable Windows and Linux builds retain the application-directory preference with a Documents fallback. Saving a new document under another name removes its auto-created draft and duplicate Recent entry. Local images referenced by absolute or relative paths are loaded securely through the Go backend for reliable previewing.

## Downloads

Tagged releases are built automatically for:

- Windows x64: step-by-step NSIS installer
- macOS Universal: Intel and Apple Silicon DMG
- Linux x64: DEB and AppImage

Unsigned development builds may trigger Windows SmartScreen or macOS Gatekeeper warnings on first install. Production signing certificates are not included in this repository. In-app updates are unaffected: the new version is downloaded and applied by the app itself, so no repeated authorization is required.

## Development

Requirements: Go 1.23+, Node.js 22+, Wails 2.13 and the platform dependencies listed by Wails.

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.13.0
wails dev
```

Run tests:

```bash
go test ./...
cd frontend
npm install
npm run build
```

Build on the current platform:

```bash
wails build -clean -trimpath
```

On macOS, use the wrapper to produce a consistently named `轻阅 Markdown.app` bundle:

```bash
bash scripts/build-macos.sh darwin/universal
```

Build the Windows installer:

```bash
wails build -clean -platform windows/amd64 -nsis -installscope user -webview2 embed -trimpath
```

Push a version tag to run the Windows, macOS and Linux workflow in `.github/workflows/release.yml`, keep the GitHub source release record, and require the localized notes and all packages to be synchronized to the official website catalog. The app checks and downloads only from the official website. On macOS and Windows it can download, verify, apply, and restart in-app.

## Project documentation

- [Official website](https://qm.ssssa.cn/)
- [Official website source](https://github.com/liuhang798/quillite-markdown-website)
- [Changelog](CHANGELOG.md)
- [AI project technical guide](AGENTS.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Release guide](RELEASING.md)
- [Design QA](design-qa.md)

## License

[MIT](LICENSE)
