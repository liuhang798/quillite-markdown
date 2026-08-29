# macOS 原生窗口按钮对齐 Design QA

- Source visual truth: `/var/folders/0g/pphyckxn6b3chq42fd4j3p3r0000gn/T/codex-clipboard-f05834fa-a78c-4826-9b28-b3561e830d0c.png`
- Installed active-window screenshot: `design-qa-artifacts/macos-titlebar-inset-active.png`
- Installed reactivated-window screenshot: `design-qa-artifacts/macos-titlebar-inset-reactivated.png`
- Side-by-side comparison: `design-qa-artifacts/macos-titlebar-inset-comparison.png`
- Source pixels: 686 × 214 px; supplied active macOS window-header crop at Retina density
- Implementation viewport: 1202 × 768 px; installed `/Applications/轻阅 Markdown.app`, macOS windowed mode, Simplified Chinese, light appearance

## Visual comparison

The comparison normalizes the installed title-bar crop to the same Retina scale as the latest supplied screenshot. In the source, the traffic-light centers sit about 7 pt above the book mark and product-name center line. In the installed build, all three native controls, the book mark, and “轻阅 Markdown” share the same horizontal center line. The controls remain genuine AppKit window buttons; no imitation controls or raster replacement was introduced.

## Required fidelity surfaces

- Alignment: The native close, minimize, and zoom controls use the same 42 pt title-bar center as the web toolbar brand.
- Spacing: The native inset adds the standard AppKit traffic-light inset while preserving the 42 pt title-bar height, book mark, and product-name spacing.
- Platform isolation: Windows and Linux retain their existing custom window controls and layout.
- Resilience: A native inset toolbar now owns the traffic-light layout; alignment is also refreshed after frontend readiness, resize, focus, and fullscreen transitions.
- Accessibility: Standard macOS buttons and their native accessibility roles/actions are preserved.

## Verification

- Compared the latest supplied screenshot and active installed-app capture together in `macos-titlebar-inset-comparison.png`.
- Moved focus to Finder and returned to the app; the reactivated-window capture retained the corrected vertical alignment.
- Verified the newly installed Universal bundle contains both `arm64` and `x86_64` architectures and passes strict code-signature validation.
- Frontend behavior suite: 201/201 passed. Frontend production build, Go tests, Go vet, and `git diff --check` passed.

## Findings

The first frame-only implementation was a P1 failure: AppKit restored its default button position when the window became active. Replacing that approach with an AppKit-owned inset title-bar region resolves the activation lifecycle issue. No actionable P0, P1, or P2 visual differences remain in the new installed build.

final result: passed

---

# 设置级联菜单 Design QA

- Source visual truth: `/var/folders/0g/pphyckxn6b3chq42fd4j3p3r0000gn/T/codex-clipboard-c6874a82-7bd3-481d-8759-7497a55ffa1a.png`
- Implementation screenshot: `design-qa-artifacts/settings-cascade-main.png`
- Full comparison: `design-qa-artifacts/settings-cascade-comparison.png`
- Focused comparison: `design-qa-artifacts/settings-cascade-focus.png`
- Source pixels: 812 × 522 px; conceptual cropped macOS cascading-menu reference
- Implementation pixels and viewport: 1202 × 768 px, 1202 × 768 CSS-equivalent app capture, normalized density 1
- State: macOS, Simplified Chinese, light appearance, Home view, More settings open; saved app font Rounded, document width Medium, dictionary Auto

## Full-view comparison evidence

The combined comparison places the supplied cascading-menu reference and the installed application capture in one image. The implementation keeps More directly below the three-dot control, replaces the three expanded option grids with compact current-value rows, and leaves all persistent actions visible in the available window height. Because the reference is a cropped Photoshop menu rather than the same application viewport, fidelity is judged on the requested hierarchy and interaction pattern rather than identical dimensions or colors.

## Focused region comparison evidence

The focused comparison shows the reference parent-row/chevron hierarchy beside the implemented settings panel at native logical scale. App font, document width, and dictionary language each display the current value and a right-pointing disclosure icon. The flyout itself is exposed as an accessible menu; direct installed-app checks confirmed all five font choices, four width choices, and three dictionary choices, with the saved item selected. At the right window edge, the flyout correctly chooses the left side instead of overflowing.

## Required fidelity surfaces

- Fonts and typography: The existing selected app-font preset continues to style the interface. Parent labels, current-value summaries, section labels, and submenu choices preserve the product's established weights, truncation, and bilingual translation system.
- Spacing and layout rhythm: The three multi-row grids are reduced to one row each. Dividers, 7 px row radii, menu padding, and the existing 42 px macOS title bar remain aligned; no persistent setting is clipped.
- Colors and visual tokens: Hover, expanded, selected, text, border, paper, and shadow treatments reuse the existing accent and surface tokens rather than imitating Photoshop's unrelated gray/blue palette.
- Image quality and asset fidelity: No raster product asset was introduced. The disclosure icon reuses the application's established chevron path and renders sharply at 13 px.
- Copy and content: Chinese and English labels remain intact. Current values accurately read 圆体, 中, and 自动 in the verified state, and every original choice remains available.
- Responsiveness and accessibility: Flyouts choose the side with sufficient viewport space and clamp vertically. Click, hover, Enter/Space, Right Arrow, Left Arrow, and Escape paths are implemented; triggers expose `aria-haspopup`/`aria-expanded` and options remain radio menu items.

## Interaction and build checks

- Opened More in the installed `/Applications/轻阅 Markdown.app` build and verified the shorter panel visually.
- Opened App font, Document width, and Dictionary language flyouts in the installed app; each exposed the complete option set and selected state.
- Selected the current Rounded font and confirmed the success notification and menu dismissal.
- Frontend behavior suite: 201/201 passed. Frontend production build, Go tests, Go vet, Universal architecture check, and strict bundle signature verification passed.

## Findings

No actionable P0, P1, or P2 differences remain for the requested cascading-menu behavior. The product intentionally retains its own green theme and compact typography instead of copying Photoshop's colors and scale.

## Comparison history

- Initial state: App font, document width, and dictionary language were expanded grids inside the main panel, making the menu taller than the window and forcing scrolling (P1 usability issue).
- Fix: Converted the three groups into current-value parent rows with accessible adaptive flyouts; preserved persistence and existing option handlers.
- Post-fix evidence: `settings-cascade-main.png`, `settings-cascade-comparison.png`, and `settings-cascade-focus.png`; installed-app interaction checks verified every flyout.
- Packaging correction: The first verification exposed a stale renamed `.app` selection in the macOS wrapper. The wrapper now deletes only the previous generated normalized bundle before locating the current Wails output; a forced rebuild confirmed the new HTML and CSS are embedded.

## Follow-up polish

No P3 follow-up is required for this scope.

final result: passed

---

# Markdown 工具栏 Design QA

This report documents the version 2.3.0 release QA record. Previously verified surfaces remain: Home, reader, split editor, About and update dialogs; Simplified Chinese and English; light and dark themes; table-of-contents navigation, recent-file removal, search, print, back-to-top, editor focus, Markdown highlighting, save/save-as, unsaved-change protection, and transparent application icons. Existing evidence remains under `screenshots/` and `screenshots/en/`.

- Source visual truth: `design-qa-artifacts/toolbar-reference.png`
- Implementation screenshots: `design-qa-artifacts/toolbar-wide.png`, `design-qa-artifacts/toolbar-narrow.png`, `design-qa-artifacts/toolbar-minimum.png`, `design-qa-artifacts/toolbar-dark.png`, `design-qa-artifacts/toolbar-focus.png`
- Combined comparison: `design-qa-artifacts/toolbar-comparison.png`
- Source pixels: 1548 × 222 px
- Focused implementation pixels: 681 × 43 px at CSS pixel density 1
- Full implementation viewports: 1550 × 900, 1100 × 800, 920 × 700 CSS px at device scale factor 1
- State: Chinese interface, split Markdown editing view, light and dark modes

## Full-view comparison evidence

The supplied reference shows the editor toolbar generating a horizontal scrollbar. In the implementation, the toolbar measured `scrollWidth === clientWidth` at all three tested widths:

- 1550 px viewport: toolbar 681 / 681 px; horizontal rule, table and image moved to More Formats.
- 1100 px viewport: toolbar 443 / 443 px; nine lower-priority formats moved to More Formats.
- 920 px viewport: toolbar 347 / 347 px; twelve formats moved to More Formats while Undo, Heading, Bold, Italic and More Formats remained directly available.

Dark mode also measured 347 / 347 px with `overflow-x: hidden`. The More Formats control retained the selected accent treatment and readable contrast.

## Focused region comparison evidence

`toolbar-comparison.png` places the supplied toolbar crop and the focused implementation capture in one view. The reference scrollbar is absent in the implementation, persistent controls remain vertically aligned, and More Formats stays visible at the right edge. Existing source SVG icons were preserved; no target asset was replaced or approximated.

## Required fidelity surfaces

- Fonts and typography: Existing macOS/PingFang system typography, weights and 31 px controls are preserved. Collapsed option labels use the same bilingual translation source as tooltips.
- Spacing and layout rhythm: The 43 px toolbar height, dividers, 3 px control gap and 5 px vertical padding remain unchanged. Orphan dividers hide with their collapsed groups.
- Colors and visual tokens: Toolbar, hover/focus states and the More Formats accent surface continue to use the existing theme tokens in light and dark modes.
- Image quality and assets: All existing toolbar SVG icons remain intact and render sharply at their original size. No new raster asset is required for this behavior change.
- Copy and content: More Formats now contains the exact names of every collapsed command in toolbar order, followed by the extended-format group. Chinese and English labels are present.
- Responsiveness and accessibility: No horizontal scrollbar appears at the three tested widths. All commands remain keyboard reachable through native select controls, focus styles remain visible, and the toolbar keeps its semantic `role="toolbar"` label.

## Interaction and console checks

- Created a browser-mode Markdown document and entered editing mode.
- Inserted Autolink from More Formats and verified `<https://example.com>` in CodeMirror.
- Undid the insertion, inserted Bold Italic, and verified `***粗斜体***` plus its live preview.
- Verified collapsed option lists at 1550, 1100 and 920 px.
- Checked light and dark modes.
- Browser console errors: none.

## Findings

No actionable P0, P1 or P2 differences remain for the requested toolbar behavior. The focused implementation capture is upscaled only inside the comparison board for readability; the actual application renders icons at native scale.

## Comparison history

- Initial supplied state: horizontal scrollbar visible below the toolbar (P1 usability issue).
- Fix: replaced horizontal scrolling with measured priority-based collapsing into More Formats; added divider cleanup and a persistent More Formats control.
- Post-fix evidence: `toolbar-wide.png`, `toolbar-narrow.png`, `toolbar-minimum.png`, `toolbar-dark.png` and `toolbar-comparison.png`; all measured widths have no horizontal overflow.

## Follow-up polish

No P3 follow-up is required for the requested scope.

final result: passed
