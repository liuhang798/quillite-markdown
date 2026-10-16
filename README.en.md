<div align="center">
  <img src="build/appicon.png" width="96" alt="Quillite Markdown icon">
  <h1>Quillite Markdown</h1>
  <p>Image layout fixes preserve quote/list containers, soft-break rows and Word rows inside lists, with regression coverage for special paths and cross-directory Save As loading.</p>
  <p><strong>A fast, local-first Markdown reader, viewer and editor — about 12 MB on Windows.</strong></p>
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

All four image-storage modes show save failures, preserve your selection for retry, and leave the current document unchanged.

You can close image settings or change your selection while a save or sign-in is pending. Late responses do not close a reopened dialog or replace newer choices. Settings writes and sign-in operations are serialized, and connection checks never delete credentials.

While image selection, paste or upload is pending, insertion follows its original text location rather than a newly moved caret. Switching documents or leaving edit mode cancels pending insertions; changed selections are never overwritten. Captions and widths retain their original values, and image insertion is independently undoable.

Image completion does not steal typing focus from Find/Replace fields. Cancelled operations remain silent after leaving and re-entering edit mode.

Concurrent uploads have isolated progress identities: older requests cannot overwrite newer progress, and changing storage settings does not relabel an upload already in progress.

Failed PicGo Cloud uploads, including delayed authentication errors, never clear a newer login. Images fall back to the saved local asset without automatic retries; you can explicitly sign in again and insert another image.

Renaming keeps equations, diagrams, tables and footnotes editable in place without losing unsaved text or undo history. Footnote editing also follows the new file after Save As.

Version history honors the latest selection: old responses cannot replace the preview after closing, reopening or switching documents. Restore stays disabled while loading or after failure. Restoring changes only the editor, supports undo, and writes to the document only when saved.

New and Open remain safe during startup: delayed restoration does not replace the active document or newly typed text, and new recent and pinned entries remain visible.

Folder restoration and explorer refresh honor the latest action: delayed responses do not override a newly chosen folder (including reopening the same path), newer file lists, or the current sidebar tab.

Older recovery drafts live in `recovery-archives` under the user configuration directory, separate from the active editor snapshot. Recover draft opens manually without stealing typing focus; save current edits before restoring, and Later keeps the backup. More → Document tools → Safety lets you inspect and save preserved drafts separately. Archives are create-only, capped at 64 entries / 256 MiB, and never automatically removed. Preservation failures retain original material and prompt manual saving. To free space, save needed drafts first, then organize this directory yourself.

The recovery dialog keeps Tab focus inside, closes with Escape, and blocks background document shortcuts. Pending recovery can be cancelled without late results replacing subsequent input. If the source cannot be read, recovery creates a separate new draft without a false source-conflict warning; its first save still asks for a name and location. Cancelling an already-started creation request does not delete any empty draft it may have created.

Inside live code blocks, Tab indents the current or selected lines and Shift+Tab unindents them, including multiple carets and shared document undo/redo. Escape returns to the document without changing code; Tab navigation between table cells is unchanged. Pasted code retains tabs, empty lines and spaces without automatic reformatting.

Entering a newline or pasting text with a trailing newline into an empty code block retains a separate closing-fence separator. Subsequent typing cannot join the closing fence and absorb following prose. Quotes, lists, details and footnotes preserve the same behavior, undo/redo and follow-up caret position.

Live tables accept tab-separated grids (TSV) and rectangular HTML text tables, starting at the current cell or the top-left cell of a dragged range. They expand up to 20 rows (including the header) and 12 columns; existing larger tables can be filled within their current bounds. Empty cells, untouched content, alignment and existing column widths are preserved, with one-step undo/redo and the caret restored to the last pasted cell. A paste is limited to 500,000 characters. Merged cells, irregular grids, images or other media, and prose mixed outside an HTML table are rejected without changing the document. A successful retry clears the earlier paste warning without dismissing unrelated notifications. Ordinary non-grid text keeps the existing single-cell newline handling.

Opening the table designer or adding rows/columns focuses the intended cell immediately. Selecting another cell afterward is not overridden by a delayed focus, including after cancelling and reopening the dialog.

Opening the image dialog, adding chart data rows and adding mindmap nodes also focus their input immediately. Later clicks into the image caption, another data cell or search field are not overridden by a stale delayed focus.

New flowchart and state-diagram nodes follow the same focus rule. Isolated mouse/keyboard regression for all three canvases covers nodes and edges, dragging, zoom, structural changes and save/undo.

Select an entire formatted span and click its inline-format button again to remove that format. Bold and italic toggle independently, and each formatting action can be undone separately.

The link tool exposes text, destination and tooltip fields. Press Ctrl/⌘+K inside an existing link to edit it; reference links retain their shared definition with an explicit warning. Cancel preserves the document and Apply is one undo step. Footnotes append their definition at the document end without absorbing following paragraph text.

New reference links use unique names and append their definitions to the document end. Autolinks provide an address-only field, require complete HTTP/HTTPS URLs, and keep displayed text synchronized when the address changes.

Toolbar-generated collapsible sections support direct title/body editing, collapse/expand, and returning from source to rendered editing. HTML blocks preserve paragraph boundaries for Markdown content. Images, equations and diagrams inside the body render in the inner editor, with resizing, in-place editing and the main document's undo/redo, without duplicate previews. Display modes and themes stay synchronized. Standalone HTML comments have a labeled editable area while remaining hidden in reading mode. HTML with complex attributes or incomplete structure currently retains source editing without rewriting its structure.

When code, tables, collapsible content or footnote blocks show their source, a fixed Return to rendered view action stays above the editor scroller, including nested source views. Returning preserves text carets and selections, brings the current caret into view and adds no undo step. Switching documents or editing modes clears stale controls.

The editor header reflows to fit its pane: document details and actions move onto separate rows when needed, while status and button labels stay horizontal in both languages. All actions remain available; long names are truncated visually but still open the full rename field.

Dragging the preview divider or library boundary keeps usable space for editing. Both pane orientations and arrow-key resizing share the same limits. Smaller windows temporarily constrain the split; enlarging the window restores the saved width preference without changing text, selection or undo history.

Tables with trailing spaces or tabs on delimiter rows remain editable and render correctly. Recognition preserves original source whitespace, code examples and prose hard breaks.

Column-width metadata belongs to its table: partial cross-block deletion retains widths, while whole-block moves, copies and deletion include the matching settings and support exact undo.

Nested tables and code share the main document's undo/redo and formatting shortcuts. Tables open the visual designer in place, and nested controls inherit the interface language. Internal table-width comments stay hidden. If the document changes while the table dialog is open, saving is blocked without discarding the dialog input.

At the text boundaries of code, comments and collapsible content, arrow keys move into adjacent editing areas. Table boundary navigation follows cell order horizontally and the same column vertically. Navigation never rewrites Markdown; entering hidden content from its section title expands it.

Shift + arrow keys extend a selection beyond an inner text boundary into adjacent areas. Cross-block deletion or replacement retains required delimiters in partially selected code, tables, collapsible sections and comments; fully selected blocks can still be removed. Changes share the main document's single-step undo and return the caret to the corresponding inner text.

Shift-click and continuous mouse dragging can extend selections across code, tables and nested content in either direction while preserving the original anchor. Inner and outer editing areas share a consistent selection highlight; dragging within one editor retains its native behavior.

Cross-block dragging continuously scrolls near the editor's top or bottom edge. Moving back to the middle, releasing the mouse or pressing Escape stops scrolling; document changes cancel pending dragging so an outdated selection cannot keep moving.

Selected text can move between code, prose, table cells and nested editing areas in one undoable transaction. Hold Ctrl to copy instead (Option on macOS). Partial cross-block moves retain required source structure, stale drops are rejected after document switching, and text dragging no longer opens the file-import overlay.
Selections containing complete code, table or details blocks preserve paragraph boundaries when dropped into prose. Starting a drag inside a selected block retains the complete selection instead of narrowing it to the active field.
Drops into quote or list prose retain the actual container prefix or continuation indentation, including nested, ordered and task lists, without detaching remaining text or following items. Complete fenced code in these containers supports live editing, newlines, line joining, source round-trips and cross-block selection/dragging. Hidden prefixes map to source positions while sharing undo history. Space/tab-indented code also supports direct editing, cross-block selection, source return and undo. Trailing newlines retain indentation, and clearing a block keeps the caret ready to type at the original position. Regular GFM tables support direct cell editing inside quotes, lists and details sections. Structure edits retain container prefixes, column widths and alignment; wide tables scroll within their own area. Source round-trips and adding, removing or reordering rows/columns share undo history. Complex tables with irregular rows or unsupported structure retain source.

Multiline pastes over cross-block selections retain code-container prefixes. Reverse selections remove selected prose while keeping the list markers, task checks and fences needed by retained code. Literal closing fences cannot truncate the code, and each replacement is undoable in one step.

Rich clipboard content follows the actual editable field: ordinary/nested prose and table cells retain Markdown formatting; code, inline code, comments and section titles use plain text. Cross-block selections starting in code do not introduce bold/italic markers, and nested edits share the main document's undo history.
Typing, pasting or dropping a matching closing fence into a live code editor widens the outer fence without changing the literal code or swallowing following prose. Source mode still allows direct fence editing.

Heading, quote and list actions exclude the next line when a selection ends at its start. Format painter recognizes combined bold/italic, highlighting, underline, super/subscript and keyboard styles without duplicating existing styles; inline and block changes undo together.

List conversion replaces previous markers and preserves child indentation; reapplying task-list formatting retains existing checks. Format painter supports palette text colors, including recoloring part of colored text while retaining surrounding color and inline styles.

ATX heading changes inside lists and quotes retain their containers. Explicitly converting a task to a heading keeps its list position and removes its checkbox, recoverable in one undo step. Format painter detects nested heading/list syntax and does not add another quote level to existing quotes. Heading/quote actions leave code blocks, HTML blocks and table source intact.

Changing a Setext (underlined) heading level converts the whole heading without leaving its underline or splitting off another heading. Soft line breaks join with spaces; explicit breaks remain as `<br>`. Converting to prose preserves original text line breaks and neighboring paragraph boundaries, with single-step undo. Safe inline `<br>` tags display as line breaks in live editing, with directly editable text on both sides.

Converting an underlined heading to a quote or ordinary list retains the whole heading; task conversion keeps its text with a checkbox. In live editing, Enter at the heading end starts a line after its hidden underline, while Backspace at the heading start returns it to prose, retaining quote/list containers and single-step undo.

With live cursors across headings, quotes, lists and prose, Enter and Backspace handle each context independently, retaining list continuation and numbering, atomic deletion of hidden markers and single-step undo.

Enter inside heading text retains the first part as a heading and moves the remainder to prose; underlined headings normalize to equivalent ATX headings before splitting. Bold, italic, strike, highlight, color and common inline tags close and reopen at the split, retaining the insertion point and single-step undo.

Splitting a link inside a heading preserves its destination, tooltip and nested styles. Shorthand references become explicit references without changing their definitions; split autolinks keep the original full destination. URL-looking display text is not mistaken for the actual target.

Bold, highlight, color and underline around inline equations survive live editing and heading splits; equations inherit the surrounding text size and color. Highlights can wrap image tags containing attribute equals signs without interpreting image attributes as prose formatting.

Live footnote references use the same first-appearance numbering as reading, including tables and collapsible sections. Click a number or press Enter while it is focused to edit the note. Arrow keys return to adjacent text; Delete/Backspace removes only that reference, preserving the definition and undo history. The dialog supports multiline Markdown, keeps identifiers unchanged, cancels without edits, and rejects stale document snapshots.

Footnote definitions appear as directly editable numbered blocks at their source positions, hiding markers and continuation indentation. Multiline input and paste share the document's undo history. Cross-definition selection and cutting preserve markers of partially selected blocks. View Source / Return to Rendered View round-trips without rewriting definition order or existing indentation.

Footnote bodies render full Markdown, including tables, lists, fenced code, display equations and diagrams. Formula/diagram edits retain enclosing indentation. Replacing a selection from an inner table or code block to text outside the footnote preserves partially selected structures and supports undo.

The Edit Table action on a footnote table opens that existing table for structural changes, retaining footnote, quote and collapsible containers, column widths and single-step undo. Saving an unchanged table again does not add an undo step.

Full, collapsed and shortcut reference images/links in footnotes inherit document definitions. Editing or removing a definition updates both panes and supports undo. Click within a footnote link and press Ctrl/⌘+K to edit its destination and title while preserving its reference relationship.

Definitions may also live inside a footnote and be shared by the main text or other notes. The first definition in source order wins regardless of footnote citation/display order. Reference links in footnote tables and collapsible bodies use the same target lookup and editing rules.

With the caret inside a footnote table, the toolbar Table button and its More Formats entry edit that table instead of inserting a blank one. Quotes, lists and collapsible containers retain column widths, enclosing indentation and undo. Source mode uses the same lookup.

New tables inserted into quotes, lists, collapsible bodies or footnotes retain the surrounding indentation, width metadata and following text. Insertion at paragraph text boundaries, mid-text, blank lines or over selected text supports single-step undo. The dialog uses the selection and document snapshot captured when opened, avoiding focus-driven insertion drift.

Portable Markdown export and cross-directory Save As also process images inside footnotes, including quotes, lists, tables and collapsible bodies. Shared definitions stay unchanged; only image occurrences are converted. Remote, missing or complex images in footnotes block incomplete portable copies, while image examples in code, formulas and comments are ignored. Switching or reopening documents during image reads cancels subsequent actions from the old export session.

Opening an existing diagram moves keyboard focus into a visible editing control. Deferred focus restoration does not steal focus from a newer control or document. Large Mermaid diagrams retain their readable width inside a scrolling editor viewport instead of being squeezed into a fixed-height thumbnail.

Reliability fixes: Windows cloud-folder saves no longer create hard links, while failed saves restore the original or retain recovery material. Diagram/formula scanning handles very long lines without whole-line regular expressions that can exhaust the WebView stack. AI operations support up to 2,000,000 Unicode characters and explain size, empty-answer, truncation and provider-filter errors before applying output. Responses exceeding 8 MiB, unterminated SSE or provider errors stop processing; partial output cannot be applied. Diagnostics hide complete paths and retain only fixed safe error categories. File opening remains limited to 64 MiB. For occupied or unwritable export targets, close the occupying app or select a writable folder and a new filename.

Conflict recovery retains the original revision and paused state across restarts. Legacy snapshots require comparison before saving. Backups remain intact while conflicts are unresolved, and outdated merge drafts cannot be applied to newer edits without restarting the merge explicitly.

Reliability protection: virtual dropped files without disk paths receive save-first guidance; missing startup files do not block opening another document. Display-extension `isEmpty` failures fall back to source editing for the current session with text, save and undo retained; other initialization failures can be retried. Timed-out updates offer retry/full-installer guidance and never apply incomplete downloads.

Opt-in error logs include the frontend asset fingerprint, editor failure stage and source-fallback mode, with explicit truncation markers. No document content, paths, credentials or activity history are added.

New diagrams appear rendered with source collapsed and the caret on the following blank line. Show source remains available, and an explicitly selected global source mode is respected.

Mermaid/ECharts inside blockquotes and lists also render, edit in place and return from source. Saving retains container prefixes without replacing identical neighboring diagrams. Subgraphs, custom styles and complex data mappings remain in lossless source mode instead of being forced through simplified templates.

After deleting a nested diagram, the caret stays at the deletion point and scrolls into the main editor's viewport for continued typing. Deletion and subsequent typing undo separately. Lossy-visual-conversion warnings clear when saving or cancelling the dialog without dismissing newer unrelated notifications.

Diagrams support compact blockquotes without a space after `>`, mixed quote prefixes, and tab-indented lists. In-place saves retain existing line prefixes; new lines use the container's continuation prefix. Pressing Enter in exposed diagram source preserves quote/list nesting and code indentation and can be undone separately, without splitting the diagram.

Exposed diagram source uses normal-weight, upright monospace text and shows complete quote/list prefixes without inheriting prose emphasis or quote borders. Syntax colors and the active-line cue remain; returning to the rendered view restores container styling without rewriting Markdown.

Mermaid flowchart nodes with a custom opaque solid background and no explicit text color receive a black or white foreground when contrast is insufficient. Backgrounds and Markdown remain unchanged; explicit foregrounds, transparent backgrounds and complex paints are not forcibly overridden.

Diagram types come from Mermaid's render result, so leading comments, init directives or YAML frontmatter no longer bypass type-specific layout and readability handling. Configured foreground colors and custom theme CSS opt out of automatic flowchart recoloring.

C4 diagrams compact excessive empty space between the title and drawing to bring primary nodes into the initial view without changing source. Nested boundaries and multirow layouts cap the vertical spacing base at 32, preserving smaller custom margins and original horizontal spacing; the engine recalculates connector endpoints. Wide and multirow diagrams remain scrollable instead of shrinking their text to fit the viewport.

C4Dynamic preserves repeated interactions between the same nodes in source order, separating curves and labels for repeated and reverse relationships while retaining arrow directions, technology labels and source. Other C4 types retain Mermaid's relationship-update semantics; `UpdateRelStyle` currently retains upstream first-match behavior.

When a C4 connector or caption covers a node, the renderer searches for an orthogonal route outside node bounds while preserving original ports and arrows. Captions move with the route and retain explicit offsets. Unobstructed relationships stay unchanged. Routing work is bounded; if no safe route is found, the original relation remains rather than being discarded.

Repeated long relationships use separate outer channels spaced for the widest caption in the pair. Crossing captions try other positions along their original paths, and long captions no longer seal port exits. Person heads and bodies are treated separately, alongside database and queue boundaries. Self-relationships display loops retaining valid ports, forward/reverse/bidirectional arrows and source; person self-ports incorrectly placed inside the head are corrected to the outer body boundary. Searches are bounded and dense relationships may still cross; this is not a global crossing-free layout guarantee.

C4 live cards and in-place editors distinguish context, container, component, dynamic and deployment diagrams in both languages without changing template identity or source. Captions across C4 types default to connection centers while retaining explicit horizontal offsets; canvas-colored backgrounds mask lines beneath the text. Automatic node text improves contrast on opaque fills, using the actual painted body for people rather than their wrapper's inherited color. Default boundaries and connectors follow the theme. Explicit node, boundary text and connector colors remain unchanged, including black and white. In normal color mode, arrowheads follow their own connectors while preserving forward, reverse and bidirectional geometry; explicit global foreground themes are not forcibly restyled.

Set `themeVariables.primaryTextColor` in Mermaid init directives or YAML frontmatter to customize theme text colors. Omitting `theme` inherits the application's base theme and correctly derives node text colors; explicit `theme: base` also works. Colors survive appearance changes and source round trips without leaking into subsequent ordinary diagrams. Theme configuration cannot disable security filtering.

Diagram source supports mid-line Enter, replacing selected code with a newline, and consecutive blank lines. Forward and backward selections preserve quote/list prefixes and code indentation from the selection start, with independently undoable newlines. Structural selections crossing fence or container markers remain handled by normal editing commands.

Flowchart, state and mind-map canvases support keyboard control: arrows navigate nodes/edges, Enter selects or connects, F2 edits labels, Shift+arrows moves, Alt+arrows pans, Delete removes and Ctrl/Command+A selects all. Mind maps retain their root; state initial/final markers cannot be renamed. Position changes affect the current canvas only and are not serialized into standard Mermaid source.

Mind maps resolve hierarchy from relative indentation rather than requiring two spaces per level. Square, rounded and circular node IDs and shapes survive edits. Sources with comments, icons, classes, Markdown strings or unsupported shapes stay in source mode rather than undergoing a lossy conversion.

Mind-map labels preserve literal parentheses, quotes, Markdown markers and HTML-like text instead of changing punctuation or breaking diagram syntax. Generated Mermaid text escapes decode when reopening the canvas and display as text in SVG previews and exports.

Save protection: final publication never overwrites a concurrently recreated destination. Windows exclusively verifies the original; unavailable protection is treated as a conflict. Failed saves restore the original or retain recovery material. macOS/Linux retain hidden `.quillite-save-recovery-*` original-file backups beside the document to preserve late writes through other applications' open handles. These consume disk space and are not automatically cleaned. Unsupported filesystem operations fail closed; save a new copy instead.

More → Document tools includes basic Markdown checks, folder text search, batch replacement previews, a safety center, templates and diagnostic export. Checks never edit text; templates create new documents; recovery/history inspection is read-only and exports new copies. Diagnostics contain version, platform, status flags and session error-category counts, never content, paths or keys, and are not uploaded.

Search is case-sensitive literal disk search with relative-path and file-type filters, excluding the open document. Limits: 800 files, five directory levels, 32 MiB total, 2 MiB per file and 500 matching lines. Batch replacement is limited to 40 files and 256 KiB per file; previews expire after ten minutes and require explicit selection and confirmation. History failures, changed links or revision conflicts skip the affected file without automatic retries. Up to 20 custom templates (64 KiB each) support `{{title}}` and `{{date}}`.

Save receipts reflect only the bytes written by that operation, so later external changes still require comparison rather than being acknowledged by the next autosave. Manual merges in reading mode also update recovery backups without requiring an initialized editor.

saving conflicts display disk and editor versions side by side. Keeping edits pauses autosave; using the disk version updates only the editor and can be undone. Save Copy requires a new filename. Manual merges are applied to the editor first, then explicitly confirmed on the next save with disk revision revalidation. Deleted or unreadable disk files never replace the current buffer with empty text.

AI settings use consistent cross-platform provider and model pickers in provider/endpoint, API key, then model order. Entering an endpoint and API key automatically discovers account models without requiring the key to be saved first; the draft key is used only for that request and is not written to preferences. Alibaba Cloud workspace endpoints are translated to their dedicated model-list API automatically. Connection diagnostics report endpoint, credential, model-list, and real model-request results separately. Successful model lists are cached for seven days and shown with a timestamp during temporary API failures. Before a DeepSeek key is saved, built-in candidates are shown without claiming account access. Custom OpenAI-compatible endpoints do not assume a default model: users choose a discovered model or enter the service's actual model ID. The reading view can generate a closable AI brief in place beneath the document actions, showing live progress before a one-sentence overview and three to five key points designed for a 5–10 second read; long documents are summarized by section and consolidated. The editor AI menu provides generate, edit, proofread, continue, translate, condense, expand, and custom workflows. Every workflow has a task-specific prompt; Continue and Expand optionally accept a target length, and Condense optionally accepts a retention ratio or target size. Leaving this field blank applies no limit. Translation supports the same 30 targets in both the interface and backend, each shown as its native label followed by a Chinese-language annotation. AI Edit streams generated text as it arrives and offers per-change acceptance or original-text retention before applying once; closing an active AI operation also cancels its network request.

On Windows, the startup window adapts to its monitor's available work area and DPI scaling so the title bar stays visible on smaller or mixed-DPI displays.

Saves and AI edits are scoped to their document session. Late results cannot change another document, and typing during a save keeps newer content marked unsaved. Saved copies of built-in examples become ordinary editable files.

Isolated AI interaction regression covers all eight toolbar entries, seven nested editing contexts, partial acceptance, redaction restoration, and cancellation guards. Responses are mocked; this is not a real-provider or native-credential test. Scope and screenshots: [AI editing audit](docs/audits/2026-10-15-ai-edit.md).

AI edits and review fixes preserve live containers: table cells and collapsible titles use the existing single-line newline normalization, pipes in cells are escaped, and footnote/quote/list continuation prefixes are retained without adding duplicates already present in a reply. Source mode still writes literal Markdown. Switching documents while review settings are pending discards the old entry request. See the [multiline AI and session audit](docs/audits/2026-10-15-ai-context.md).

Cross-block AI replacements also retain only one outer footnote/quoted-code prefix without removing deeper indentation. Literal code fences widen the existing wrapper; fully selected blocks remain replaceable. See the isolated [AI boundary audit](docs/audits/2026-10-15-ai-boundaries.md).

Ordinary document saves stage and sync a temporary file before replacement, preserving the original if writing fails. History pruning only touches verified snapshots. Windows installation and removal recheck directory ownership and do not overwrite or delete shortcuts based solely on their names; macOS updates retain the previous app bundle for recovery.

Chart security checks distinguish raw data from executable options, preserving legitimate column names and dimension mappings. Large arrays are traversed incrementally to avoid argument-count errors.

Close the live preview to enter full-width **Editor only**. Click **Restore preview** after Save As to restore the previous split orientation, or choose **More → Editor layout** to select either orientation. Your choice is remembered. Press `Ctrl + E` (`⌘ + E` on Mac) to switch to the full reading preview and back. Hidden live previews stop automatic rendering and release chart instances; restoring split view renders the latest text. Saving and on-demand exports remain available.

> **Official website and downloads: <https://qm.ssssa.cn/>**
> Updates, installers for all platforms, release notes, and feedback are served only from this hostname, without relying on the apex or `www` domains.

![Quillite Markdown split-view Markdown editor with live preview and syntax highlighting](screenshots/en/03-split-editor.png)

The editor defaults to **Live editing**: headings, emphasis, strikethrough, highlights, links, lists, tasks, quotes, fenced code, tables, rules and `[TOC]` render directly in the editing area. Prose formatting stays hidden during caret placement. Table cells and code are editable in place with character-level clicking and drag selection, without expanding entire blocks into source. Tab / Shift+Tab moves between cells, Enter advances, and Escape returns to the document; pasted newlines become spaces and pipes are escaped. Edits immediately update the original Markdown and share the main document's save/undo history. Tables retain the visual structure designer; tables and code offer an explicit **View source** action. Task checkboxes are directly editable and undoable. The **Live editing / Source** switch remembers its setting without changing Markdown, selection, undo history or split-layout preferences. Existing image, equation and diagram previews remain available. Plain text, incomplete/complex mixed syntax and prose over 300,000 characters retain source; embedded image payloads do not count toward that prose limit. Native IME composition is preserved until commit.

## Why Quillite Markdown?

In the main editor, select repeated text with Ctrl/⌘+D to apply inline formatting, colors, headings, quotes and lists to all selections, preserving direction and single-step undo. Block markers are added only once per line. The format painter supports multiple targets and waits while a selection modifier or pointer is held. In live editing, Enter after inline formatting keeps the text and inserts each newline after its closing markers. Nested-cell and complex cross-container multi-selection remain under audit.

Image rows share one wrapping action panel. Choose the target by image number/description, or hover a card; focus a card and press Enter for actions, Escape to return. The panel stays within the editor viewport and outside the image when space permits, with an always-available source-return control. Images wrap in narrow cells while remaining in the same group.

Image actions fade in without sliding, keeping button edges stationary for immediate clicks. The return control remains visible while image source is expanded.

Nested footnote, collapsible-section, code and table editors share the document history. Undo preserves keyboard focus when an inner editor is rebuilt, so redo remains available without stealing focus from another control.

Whole-block drops into footnotes preserve paragraph separation and nested indentation, keeping code and tables inside their quote/list container. Standard collapsible and HTML content blocks inside quotes support live editing, retaining quote/footnote prefixes for title, prose newline, code and table edits, with source round-trips and shared undo. Literal closing tags in code examples do not truncate the enclosing block.

Reading and styled HTML use stable columns for tables containing images, preventing neighboring text from collapsing into a single-character column. Explicit column widths still take precedence. Image groups wrap inside cells and text aligns at the top without rewriting Markdown.

Image-only table cells use the same row layout in editing and reading. Alignment and size changes survive source round-trips without losing editable cells. Images can be separated/rejoined within a cell with stepwise undo; mixed prose and image links retain their content.

Regular GFM tables render inline equations, direct image URLs and embedded images in their cells, with in-place editing, image sizing/alignment, undo and source-return controls. The formula dialog preserves drafts and rejects block output or unescaped pipes that would split a cell. Full, collapsed and shortcut image references share document definitions across table cells and collapsible bodies. Target/title edits refresh all uses; removing a definition retains editable source, and undo restores the images.

Live edits forward only changed characters and retain measured heights of unchanged tables and code blocks, avoiding jump-and-return scrolling in long documents. Regression tests check both animation-frame positions and scroll writes.

Visible text in headings, prose and tables supports precise mouse placement without inserting into hidden line-prefix/suffix markers. Vertical spacing for tables, code, block formulas and diagrams is included in editor height measurements. Browser audits verify clicked positions, actual insertions and exact undo, with real documents tested only in isolated memory.

In live editing, Enter at the visible end of a line of strikethrough, bold or other formatted text preserves the previous line's complete formatting instead of splitting hidden closing markers. Lists and quotes continue normally, with single-step undo. Source mode still inserts a newline at the literal cursor position.

After selecting text and applying highlight, bold or a text color, press Enter directly to finish formatting and start a new line without first clicking at the end. Stacked formats are supported. Manually reselecting text keeps normal Enter-to-replace behavior, and placeholders inserted without a selection remain replaceable by typing.

Toolbar text colors render directly in live editing with the same palette as the reading preview, hiding their `data-md-color` tags. Colors combine with bold and highlights, while editing and newline preserve the wrappers. Source mode shows the original tags.

Task-list text also renders highlights, underline, superscript/subscript, keyboard keys and text colors, including completed, quoted and nested tasks. Enter at the end of formatted text preserves its wrappers and continues the next task; checkbox and text changes remain undoable.

Checkboxes (including empty tasks), bullets and decoded entities stay rendered during caret movement and selection. Arrow navigation crosses complete source markers, while copying preserves Markdown. The main editor and nested table/code editors support `Ctrl/Command+Shift+Z` redo.

After choosing **Show source** on an image, **Hide source** stays visible above it even when the pointer leaves, allowing an immediate return to the preview without changing image content or undo history.
Single-image source, alignment and size controls share one wrapping overlay so they do not cover each other in narrow split panes. Controls remain hidden until hover or keyboard focus.

Canvas auto layout spaces nodes using their actual sizes; larger diagrams remain navigable by zooming and panning. State transitions expose supported label editing, not unsaved line-style choices. Mind maps preserve hierarchies deeper than five levels. Deleting a topic moves its surviving children to its parent, keeps the root, and selecting a connection offers an explicit **Move to root** action. Edits save as standard Mermaid; manually dragged coordinates are transient canvas layout, not encoded in the standard source.

Invalid chart numbers, empty rows or duplicate series names disable insert/save until corrected. Renaming a series updates column headers, accessible cell names and validation labels without interrupting typing.

Sequence visual editing keeps request/response arrows separate from participant IDs when changing messages or arrow types. Unsupported activation and other syntax remains in source mode.

Timeline edits preserve grouped events under each period, while keeping explicitly separate same-name periods distinct.

- **Lightweight by design:** the Windows installer is about **12 MB**, built with Go and Wails instead of Electron.
- **Local-first and private:** open and edit ordinary Markdown files on your computer—no account, proprietary vault or cloud lock-in.
- **Reading and editing together:** switch from a focused Markdown reader to split-view editing with live preview and syntax highlighting; the preview uses a clearer split-pane text size and continues to follow global text scaling.
- **Practical desktop integration:** recent files, document favorites, resource explorer, autosave, crash recovery, native dialogs, file associations and update notifications.
- **Cross-platform and open source:** one MIT-licensed Markdown desktop app for Windows, macOS and Linux.

It is a good fit for reading long Markdown documents, editing README files, maintaining technical notes and working with local documentation folders.

## Product improvement program

In V2.7.5, legacy-uninstaller remediation requires both an audited SHA-256 risk allowlist and matching uninstall registration. Unknown files and registrations are preserved. The production list is currently empty pending verified historical specimens, so unmarked files are not automatically deleted or renamed. Unconfirmed safety blocks in-app updates and recommends backup followed by a fresh installation directory.

> V2.7.5 adds document tools, safe batch replacement, side-by-side conflict comparison, and a full-width Editor only layout with one-click preview restoration. The normal Windows uninstall entry now runs in place under strict ownership validation, while release CI verifies document preservation across installation, upgrade, and uninstall. Production code signing is still not configured.

About Quillite Markdown includes a “Join the product improvement program” checkbox that controls error logs only. When enabled, sanitized software error logs, server-resolved country/region/city, coarse Windows/macOS/Linux type, and app version are submitted silently after an error. Unchecking it stops error reports.

Daily-active measurement is independent of this checkbox. Each device submits at most one anonymous active event per day containing a locally generated random install identifier, app version, coarse OS type, CPU architecture, and server-resolved country/region/city. The server stores only an irreversible hash of the identifier and never stores the source IP. Markdown content, file names, file paths, contact details, and individual actions are never uploaded. Offline, intranet, timeout, and server failures remain silent and never affect app features.

Feedback is a separate, explicit user action and is not controlled by the product-improvement switch. Users can choose a feature suggestion or functional issue and optionally provide email, phone, and screenshots. The app and system versions are included, but the current Markdown document is never uploaded. Deleting a feedback entry in the server admin console permanently deletes all of its images as well.

## Download

| Platform | Package | Download |
|---|---|---|
| Windows x64 | Step-by-step installer (`.exe`) | [Official download](https://qm.ssssa.cn/#download) |
| macOS | Universal Intel + Apple Silicon (`.dmg`) | [Official download](https://qm.ssssa.cn/#download) |
| Linux x64 | Debian package + portable AppImage | [Official download](https://qm.ssssa.cn/#download) |

On Windows, run `quillite-markdown-version-windows-amd64.exe`. The ready, destination-confirmation, installing, and completed screens share one background and a top-right close icon; every interactive target shows a hand cursor on hover. The installer starts in Simplified Chinese and offers an always-available English／中文 switch in the bottom-right corner. Ready, confirmation, installing, completed, and failed states—including actions, animated status text, errors, and the folder-picker prompt—change immediately without resetting progress. A fresh install carries the current installer language into the app: installing through the English flow starts Quillite in English, while the Chinese flow starts it in Simplified Chinese. Upgrades keep the user's existing language preference. Clicking Continue on the ready screen or choosing a Custom installation folder opens a confirmation screen showing the final installation path; users can go back or change the location, and installation begins only after Confirm and install is clicked. During installation, the numeric percentage keeps increasing and the action cycles through `Installing.`, `Installing..`, and `Installing...`, without a progress bar or layered animation; 100% appears only after the core succeeds. The completed action says Finish installation and closes the installer, which also closes automatically after three seconds when left untouched. Fresh installs default to the current-user Programs folder; upgrades retain the previous directory only when both the executable and a valid dedicated ownership token are present. An ordinary folder selected through Custom installation is treated as a parent and receives a dedicated `Quillite Markdown` child directory. Selecting a verified previous installation reuses that exact folder without nesting another product directory; the confirmation screen always shows the final destination, so application files never mix with existing data. Installation, upgrade, and uninstall use neither wildcard deletion nor recursive directory removal. Cross-drive installs preserve the previous location for manual review, and uninstall deletes exact program filenames only after validating the dedicated directory ownership token; unrelated files, documents Quillite created inside the install directory, and non-empty parent folders are always preserved. Desktop shortcuts and Markdown file associations are retained. The background, icon, and all visual/text source files are guarded by an 800 KB build-time limit, with no bundled video, browser, or large animation runtime.

The confirmation screen uses a compact single-line card for ordinary paths and expands only for long paths. When the installer runs again, it checks valid per-user, machine-wide, and legacy installation records for the previous destination; it uses a recorded folder only when both the app executable and dedicated ownership marker pass validation, otherwise it falls back to the safe default. Custom installation opens the picker directly at that verified previous installation folder.

The installer window uses per-pixel transparent antialiasing for its rounded corners, while the primary action uses a solid green outline without a white rim, keeping both edges clean on light and dark desktops.
The icon, text, and buttons are rendered directly at the final 640 × 427 display size: transparent icon edges are de-matted before high-quality resizing, while buttons use 8 × 8 subpixel coverage. Titles, supporting copy, and button labels use standard Microsoft YaHei UI weights with native ClearType Natural rendering, avoiding double-scaling roughness while retaining the balanced appearance of normal Windows text.

The macOS build follows the computer's light/dark appearance automatically while still allowing a temporary manual switch. The temporary choice stays active until the system next changes between light and dark, then automatic following resumes. The interface and native title bar update together whenever the system mode changes. It centers native left-side window controls vertically within a slim title bar, and the controls stay stable during tiling and resizing. In fullscreen, the Logo and application name move left automatically, then restore the traffic-light safe area immediately on exit without briefly overlapping. Standard Command shortcuts remain available: `Command + W` closes the window while keeping the app in the background, and `Command + Q` quits the app. Closing from fullscreen exits fullscreen before hiding in the background; lazy editor loading and deferred explorer restoration reduce cold-start work.

The macOS installer image carries a metadata no-index marker. On launch, the installed app also verifies the installer layout and Bundle Identifier before safely ejecting a still-mounted official DMG, preventing its bundled copy from appearing as a second Quillite Markdown icon.

Documents and folders opened through macOS system panels, Finder, or file associations are persisted as native security-scoped bookmarks. Recent, Favorites, and Explorer silently restore read and edit access after relaunch and refresh stale bookmarks automatically. A preselected system panel is needed only for legacy records or when an unsigned update changes the app identity.

## Diagrams inside the editor

Statistical chart editing preserves zero values and identifies invalid numeric fields by row, retaining the draft and last valid preview until corrected. Category/series renames synchronize legends and selection state; waterfall examples use consistent running totals. Saving renders the exact draft first and retains the original if validation fails or the document/draft changes during the check.

Render Mermaid/ECharts diagrams directly in the editor. Selection, hover or keyboard focus exposes local Edit/Show source actions; double-click or Enter opens in-place editing. Pie and other supported diagrams prioritize title/category/value fields, while complex syntax retains source editing. Source toggles preserve text, copy retains Markdown, and deletion/changes are individually undoable. Cancel, unchanged saves and stale-document checks preserve source and drafts. More → Editor layout remembers rendered/source display, including editor-only mode. Render only mounted near-visible diagrams, capped at 64 diagrams and 20,000 characters each; documents over 300,000 characters and ambiguous quote/list containers retain source. Rendering failures show guidance and original source. File-save, installer and uninstaller logic remain unchanged.

## What's new in 2.7.8

- Render Mermaid / ECharts diagrams inside the editor and collapse source after insertion, with local editing, source controls, undo/redo and editor-only mode.
- Preserve zero values, validate chart data, synchronize legends and render before saving; invalid or stale drafts never replace the original.
- Explain Windows virtual-file drops and missing startup files. Add source-editing recovery for display-extension initialization failures while root-cause diagnosis continues.
- Improve update-timeout guidance, download flush checks and opt-in diagnostics without weakening save, install or uninstall safety boundaries.

## What's new in 2.7.7

- Offline visual equation editing, mouse caret placement, matrix row/column operations and search across 95 templates, including trigonometry, sets, logic, aligned derivations and statistics; complex equations retain source editing.
- Bilingual search across 41 chart templates, including histograms, 100% stacked bars, horizontal rankings and calendar heatmaps. Histograms distinguish adjacent bins with theme-aware thin outlines and offer editable horizontal-axis labels/units. Common statistics charts offer data tables, multi-series editing and Excel/TSV/CSV paste; basic class/ER diagrams offer field/relation forms. Advanced configurations remain in source mode when they cannot be parsed losslessly.
- Calendar heatmaps display recorded values above the date grid and leave missing dates empty. Cells and legends remain visible in light/dark mode without overwriting custom value ranges.
- Automatic calendar color scales grow and shrink with the current data: changing the maximum from 50 to 30 updates the legend to 30. Disable auto-scaling to keep a fixed domain; existing custom domains remain fixed by default.
- The diagram catalog search field, category buttons and template list share aligned horizontal edges.
- Render equations in the editor, with Normal/Large inline layout and shared final Markdown validation for preview and saving. Invalid drafts stay intact without document writes.
- Compact equation dialogs and editor toolbars; custom image dimensions, original-size reset and overlay controls without reflow.
- Add equation-session, export, delimiter and large-image regressions while preserving source, undo history and file-safety boundaries.

## What's new in 2.7.6

- Eleven automatic bilingual body styles with synchronized editor/preview, live document preview and cancel restoration; independent math fonts and monospaced code.
- Visual previews, alignment and rows for supported image forms, with quote/list, special-path, Save As session and Word export regressions.
- First-save name/location choice, safe rename, embedded images and Portable Markdown create-only copies.
- Cloud-save, long-line parsing, compatible AI responses and diagnostic privacy fixes retain document/attachment safety boundaries.

## What's new in 2.7.5

- Added document tools for Markdown checks, folder search, explicitly selected batch-replacement previews, safety inspection, custom templates, and privacy-safe diagnostics.
- Save conflicts now compare Disk version and Current edits side by side, with keep, use disk, save copy, and manual merge actions—never an automatic overwrite.
- Added persistent full-width Editor only layout. Hidden previews stop live rendering; `Ctrl/⌘ + E` toggles the full preview and Restore preview returns to the previous split direction.
- Strengthened Windows install/upgrade/uninstall gates around the real registered uninstall command and user-file preservation. Unknown legacy uninstallers are neither deleted nor renamed.

## What's new in 2.7.2

- Every Mermaid/ECharts fence offers Edit this diagram, opening its canvas, structured table, or source preview. Sankey gains Source/Target/Value rows and Unicode labels; in-place edits preserve styling and support undo.
- Swap editor and preview sides with a persistent preference. Windows startup fits the monitor work area and DPI to avoid clipped controls on mixed-resolution displays.
- Document-session guards protect asynchronous opening, saving, Save As, and AI edits from cross-document overwrites. Failed file replacements preserve the original file.
- Updated chart/security dependencies, fixed large arrays, data-field filtering and word-cloud sizing, and removed duplicate formula fonts without losing glyphs or the lightweight custom installer.

## What's new in 2.7.1

- Narrow and portrait layouts retain the on-page outline as a collapsed overlay drawer that never squeezes the document. Opening no longer triggers a page-wide focus shift, and headings, backdrop, edge arrow, or `Escape` can close it.
- Wide layouts now give the outline the same collapsible controls as Recent Reading, retain a right-edge restore button, and remember the choice. Full width also uses the complete available reading width on portrait displays.
- Fixed macOS PDF exports being falsely reported as timed out after the headless browser had already written a complete file; valid PDFs now save immediately and the temporary process is stopped safely.
- Windows release builds now require and validate the current custom installer launcher, preventing the internal NSIS core from being delivered with the legacy installer UI.

## What's new in 2.7.0

- Added a complete AI Assistant for DeepSeek, Zhipu GLM, Qwen, OpenAI, Kimi, Alibaba Cloud Model Studio, SiliconFlow, OpenRouter, and custom OpenAI-compatible endpoints, including automatic model discovery after an endpoint and key are entered and a default provider-and-model choice. Draft keys do not need to be saved for discovery; provider API keys are written to the native credential vault only when explicitly saved and never appear in preferences, logs, or feedback data.
- AI Edit supports polishing, rewriting, shortening, expanding, summarizing, translating, and custom instructions with progress feedback, result review, and undoable replacement. AI Check reviews an entire Markdown document and applies selected grammar, spelling, punctuation, clarity, consistency, and formatting suggestions in one transaction.
- Rebuilt the Windows installer with a concise bilingual native interface, custom destination selection, reliable upgrade-path detection, clear installation states, and crisp per-pixel rounded rendering while keeping visual assets lightweight.
- New documents now default to Wide; interface language uses a compact flyout, and direct PDF export no longer reports a false failure while current Edge or Chrome finishes writing asynchronously.

## What's new in 2.6.2

- More settings now offers six persistent app-font presets: System, Sans serif, Serif, Rounded, Song style, and Kai style, updating both the interface and Markdown prose immediately.
- Interface language, app font, document width, and dictionary language now use compact current-value rows with adaptive flyouts. The release also fixes the macOS More popover drifting away from its three-dot button and clicks unexpectedly closing a revealed submenu.
- Fixed the three native macOS window controls sitting too high or returning there after activation. An AppKit-owned inset title bar keeps them centered with the book mark and product name.
- Refined Home and document lists with flatter surfaces, clearer outline icons, more filename space, and improved light/dark contrast.
- Fixed repeated local macOS builds potentially reusing a previous app bundle, ensuring current code is always embedded in the Universal package.

## What's new in 2.6.1

- Flowcharts, state diagrams, and mind maps now use a visual node canvas for adding, connecting, dragging, and editing nodes without hand-writing Mermaid; sequence, Gantt, timeline, Kanban, and common data charts retain structured field editors.
- The canvas supports full screen, 50%–200% zoom, free panning, edge expansion, automatic layout, and select-all group movement. State diagrams use compact nodes and offset transition labels to prevent overlaps.
- Existing flowchart, state, and mind-map fences can be reopened from the editor and saved in place, with a safe Source-mode fallback for advanced Mermaid syntax.
- Academic Formulas defaults to inline output. Select plain text or TeX and confirm in the formula dialog to convert it directly. Put the cursor inside an existing formula and choose Edit current formula, or double-click its live preview, to restore its content, numbering, and display mode and replace it in place; saving unchanged content adds no undo step. Long custom equations use multiline editing without silent truncation. Changes verify the document session and source snapshot; ambiguous previews never replace content. Numeric factors use explicit multiplication, and unsupported equations remain readable in exports. Manual source survives output-mode changes; changing templates requires confirmation.

Equation templates can be searched by Chinese/English names, subjects, parameter labels and common keywords. The first query searches all subjects; select a category to narrow it. Filtering never changes the equation being edited. Inside the dialog, `Ctrl/⌘ + F` focuses search, `Esc` clears its query, and `↓` moves to the results.

Use Display or Numbered output for multiline equations. Switching to Inline never silently removes newlines or comments; the original source is retained with guidance. Gradients accept 1–16 comma-separated variables; double integrals have two separate variable fields. Taylor series has separate function-name (e.g. `g`), variable (e.g. `t`) and expansion-center fields, with grouping for compound centers. Template variables accept single letters, LaTeX symbols or subscripted names; use Custom formula for complex expressions. Existing document equations are not automatically rewritten.

The editor renders equations using preview styling. Click to select; double-click or press Enter to open equation editing, then save in place or cancel without changes. The dialog defaults to offline visual editing of fractions, scripts and matrix cells. Structure buttons insert fractions, roots, integrals and sums, with matrix row/column additions/removals and undo/redo. Template parameters remain available and source is collapsed under Advanced. Chemistry content uses parameter input to preserve arrows, charges and states rather than converting it. Unsupported, commented or oversized equations safely retain source. No-op edits and undo to the original equation preserve exact formatting. Show/Hide source changes presentation only; Copy retains original Markdown, and Delete/Backspace is undoable. More → Editor layout → Rendered equations/Equation source remembers the display preference, including editor-only mode. Invalid equations retain source with guidance; code remains literal. Each document renders at most 256 equations; documents with 300,000+ characters retain source to bound scanning cost.

Click inside visual equations to place the caret in fractions, scripts and matrix cells, then type to edit. Clicking or dragging changes only the caret/selection and never rewrites the equation automatically.

Dot/cross-product templates accept plain letters or compound expressions in place of default vectors. Generated LaTeX separates commands from parameters and preserves grouping for cross-product operands and angles.

Choose Normal/Large layout when editing an inline equation. Large layout expands fractions and sum symbols while keeping the equation inline; editor, live preview and reading share the same typesetting. The choice persists per equation as standard LaTeX `\displaystyle`, can be switched back, and never changes other equations in bulk. Scripts retain appropriate sizes; line height may increase.

Clicking the unchanged inline layout preserves exact source and lets you continue editing template parameters without an unnecessary replace-source confirmation. Actual manual source edits still require confirmation before template parameters replace them.

Deferred initial focus after opening the formula dialog or switching templates never overrides a later click into another parameter. Closing or reopening the dialog invalidates the old focus request.

Compound parameters retain their grouping in logarithms, gradients, eigenvalue equations, means and conditional probability. For example, a logarithm argument of `u+v` remains one complete argument. Mean templates group already-subscripted data symbols before adding a sample index, avoiding duplicate subscripts. Existing document equations are not rewritten automatically.

Each 3×3 matrix row takes three comma-separated cells, with English or Chinese separators. Commas inside function parentheses, TeX groups and nested matrices stay inside their cells. Missing, extra or empty cells and unclosed structures retain your input and prompt correction. Parameters for 2×2 matrices, determinants and inverses cannot inject outer row/column commands. Use visual matrix controls or Custom formula for other sizes and structures.

Correcting a formula or closing its dialog clears that dialog's obsolete content-validation warning without dismissing messages from other operations.
Manually numbered display formulas in Advanced source synchronize the number field without rewriting the source. Switching to Display and back to Numbered retains that number.

A successful chart-data import retry, or closing the chart dialog, clears the old import warning without dismissing messages from other operations.

The compact equation-dialog header and layout controls leave more height for visual editing and live preview. Controls wrap on narrow windows, while Save and Cancel remain accessible at the bottom.

Equation validation uses the final output mode. Save and Ctrl/⌘+Enter share validation, so unsupported inline numbering is never written. Literal `katex-error` text/comments remain valid content. Deeply nested or over-budget Markdown retains editable source; failed scans never provide unreliable in-place replacement ranges or automatically rewrite the document.

Preview and saving also verify that the final Markdown parses as the same complete equation. If unescaped dollars inside an inline equation conflict with its outer delimiters, the draft is retained and submission is blocked. Choose Display output or wrap the full inline equation in `\(...\)` under Advanced. Equation content is never silently escaped or rewritten.

Equation actions stay beside their equation: rendered equations show Edit/Show source text buttons on hover or focus, and support double-click or Enter editing. Expanded source retains its Hide source action.

## What's new in 2.6.0

> **macOS 2.5.0 migration:** Version 2.5.0 used the retired raw-executable updater and cannot safely upgrade itself to a complete application bundle. Install 2.5.1 or later once from the [official website](https://qm.ssssa.cn/#download); normal in-app updates resume after that one-time migration.

- Added local PicGo Server and direct PicGo Cloud image hosting with first-run guidance, real upload progress, and safe fallback to local `assets`.
- Added a visual table designer for editing cells, adding, removing, and dragging rows or columns, changing alignment and width, and updating existing Markdown tables in place.
- Added web/Word rich-paste conversion, Copy as Markdown/plain text, and offline English spell checking with suggestions, ignore rules, and a personal dictionary.
- Added one Export document center with native DOCX, styled/unstyled HTML, PDF, PNG/JPEG, plus optional Pandoc exports to EPUB, RTF, ODT, LaTeX, MediaWiki, and custom formats.
- Long PNG/JPEG documents now render as independently generated 2× A4 pages with sequential filenames, avoiding the blurry fit-to-screen result of ultra-tall bitmaps.
- PDF export now includes heading bookmarks and safely wraps long code, connection strings, wide tables, and diagrams. It waits for current Edge/Chrome to finish an asynchronously written PDF, while exports also use a busy lock and top-layer error notifications.
- The outline now supports title search, hierarchical/flat views, and remembered folds; standalone `[TOC]` markers become live linked contents in reading and HTML/PDF exports.
- New Document now has a three-second duplicate-click guard for both buttons and keyboard shortcuts.

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
- Document lists use theme-colored outline icons without background tiles, leaving more room for filenames while retaining favorites, pin markers, and selection indicators. Missing files use muted icons.
- Recent records can still be removed from the document context menu without deleting the original file.

## What's new in 2.4.3

- Unified the default brand green at the exact `#159A63`; primary controls are no longer automatically darkened to `#10744A`, keeping buttons, selections, accent text, and application icons on the same green.
- Replaced the top-left brand tile with a transparent open-book mark whose strokes follow the selected accent, with no square plate, border, or shadow.
- Aligned the title-bar book mark and “Quillite Markdown” label to the same visual height, with dedicated sizing for the compact macOS title bar.
- Home illustrations, cards, and shortcut keys use flat, shadow-free surfaces with consistent thin borders, corners, and clear typography. Accent buttons such as New Document and back-to-top also remain shadow-free; selected states keep their theme-colored outline.
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

- Click the editor filename to rename it safely and use the displayed location to reveal it. A new draft's first manual save asks for a name and folder; autosave continues protecting the draft. Save As remembers the last chosen folder and never overwrites an existing file. Cross-folder copies keep image links pointed at the original attachments.
- Image storage now offers opt-in Base64 embedding for PNG, JPEG, WebP, GIF and BMP, plus a Portable Markdown export that embeds local images into a new standalone `.md` copy without changing originals or attachments. Limits: 25 MiB per image, 64 MiB per document and 256 distinct images per export. Online images are not fetched automatically. Encoded image data is omitted from AI requests; some Markdown readers may not support embedded images.
- The source editor previews local attachments (relative/absolute paths and file URLs), HTTP(S) images, Base64/data images, reference-style Markdown and HTML `<img>`, also in editor-only mode. Image actions stay hidden until hover, keyboard focus or a touch tap, then appear as an overlay without shifting the document. Every image supports undoable left/center/right alignment plus percent/pixel width and an optional explicit pixel height; aspect ratio is preserved by default and original sizing can be restored in one click. Reading preview and styled HTML/PDF exports retain the layout, and large embedded-image payloads no longer force formulas in the same document back to source. SVG is displayed only as an image, never as executable inline markup. Code and ordinary links are not loaded. Show Source never changes document content; missing images retain their references with a placeholder. Limits: 256 previews and 25 MiB per local/embedded image. Online images depend on network access and browser format support.
- Image-only paragraphs with multiple images display horizontally. Join Next Image combines adjacent images into a row; Separate Images restores independent paragraphs. Each row supports 2–6 images with independent alignment, stored as a standard HTML image table without changing image addresses, consuming captions, or moving/deleting attachments. Word export fits images proportionally to their cell widths, without data-table borders or headers.
- Read and edit Markdown with the same calm, polished interface.
- Open, read, and edit plain-text `.txt` files too: the reader renders them as-is (no Markdown parsing), the editor uses plain text mode, and the `.txt` file association can be registered for double-click opening.
- Insert images either from local files or by pasting an `http/https` online link with an optional description.
- Split editing mode: live preview on the left, syntax-highlighted editor on the right.
- The optional AI Assistant provides two reviewable workflows. AI Edit processes only Markdown explicitly selected by the user and can polish, rewrite, shorten, expand, summarize, translate, or follow a custom instruction. AI Check sends the whole document only after confirmation, then lists precisely locatable grammar, spelling, punctuation, clarity, consistency, and Markdown suggestions; users choose individual fixes and apply them in one undoable transaction. Built-in official integrations cover DeepSeek, Zhipu GLM, Qwen, OpenAI, and Kimi, with Alibaba Cloud Model Studio, SiliconFlow, OpenRouter, and custom OpenAI-compatible endpoints available as additional providers. After a provider key is saved, the app loads models through the provider's model API, while a custom model ID can also be entered manually. Provider keys coexist in separate Windows Credential Manager, macOS Keychain, or Linux Secret Service entries; the default provider and model can be selected together without overwriting or removing another key. Keys are never written to preferences, logs, or feedback data, and every cloud operation asks for consent before document content is sent.
- The formatting toolbar covers H1–H6, bold, italic, strikethrough, highlight, text color, links, inline/fenced code, quotes, lists, tasks, horizontal rules, tables and images. The text-color control sits directly after Highlight and offers a complete 48-color square palette with the default color, seven grayscale steps and 40 spectrum shades. Changes preview live, can be recolored or reset, and remain fully undoable. When space runs out, controls move into the immediately responsive in-app More Formats menu instead of creating a horizontal scrollbar. More Formats also adds bold italic, underline, superscript, subscript, Academic Formulas, hard breaks, footnotes, reference links, autolinks, syntax escaping, HTML/collapsible blocks, keyboard keys and comments. Common actions support `Ctrl/Cmd + B`, `Ctrl/Cmd + I`, `Ctrl/Cmd + K`, `Ctrl/Cmd + Shift + X` and `Ctrl/Cmd + Shift + H`.
- A visual table designer lets you edit cells directly, change row and column counts, add, remove, or drag rows and columns into order, choose left/center/right alignment per column, and drag column borders to resize. Place the cursor inside an existing Markdown table and use the table button to edit it in place; the saved source remains a standard portable GFM table.
- Rich text pasted from web pages or Word is converted automatically from clipboard HTML to Markdown. Headings, emphasis, lists, quotes, code, links, online images, and GFM tables are preserved while Office-only styling and unsafe addresses are removed. Conversion runs before native paste so content is inserted once and undone in one step; code and table editors keep their own plain-text paste rules. Right-click selected editor text to copy it as Markdown or plain text. Plain-text copy strips underline/color HTML tags, decodes entities and preserves breaks, while tags and entities inside code remain literal. Markdown copy retains the original source.
- Built-in offline English spell checking marks misspellings in prose, tables, collapsible sections, and footnotes with a red wavy underline. Right-click to apply an undoable suggestion, ignore the word in the current document, or add it to the persistent personal dictionary. More → Spell check controls Auto/US/UK dictionaries and personal words; re-enabling immediately restores marks. Code, URLs, formulas, acronyms, and camel-case identifiers are excluded, and document text is never uploaded.
- Built-in Academic Formulas, KaTeX typesetting, and mhchem chemistry support: one unified entry groups 95 templates by mathematics, algebra and functions, geometry, calculus, linear algebra, probability and statistics, physics, chemistry, and chemical reactions. New formulas default to inline output, with display and numbered modes still available. Place the cursor in an existing formula and choose Edit current formula, or double-click the rendered formula in the live preview, to edit and replace it in place without selecting its complete source; the guide is available directly inside the dialog. Raw `$…$` / `\(…\)` inline math, `$$…$$` / `\[…\]` display math, `\ce{…}` chemistry, and `\tag{…}` numbering remain fully supported. [Open the formula and chemistry guide](https://qm.ssssa.cn/guides/formulas/).
- Typora-style Mermaid diagrams render directly from fenced ` ```mermaid ` blocks. Flowcharts open on a visual canvas where process, decision, and start/end nodes can be added, dragged, connected, relabelled, reshaped, and automatically arranged in four directions. Put the cursor inside a diagram fence to reveal Edit this diagram and save changes back to that block in place. Only the drawing workspace expands in full-screen mode, where Exit and Insert/Save remain available and the canvas can be zoomed from 50% to 200% with buttons or `Ctrl/Cmd + wheel`. At every zoom level, empty-space dragging pans freely, edge dragging extends the view, and Select all or `Ctrl/Cmd + A` lets every node move as one group. Quillite generates standard Mermaid; advanced subgraphs and styling can stay safely in Source mode. The other Mermaid templates retain editable source, live preview, and one-click insertion, while Word/HTML/PDF exports preserve the rendered result. [Open the Mermaid examples](docs/Mermaid-图表完整案例.md).
- A canvas badge marks every template with visual editing. State diagrams and mind maps now share the complete node canvas used by flowcharts, including full screen, zoom, free panning, node dragging, select-all group movement, connections, and automatic layout. State diagrams retain transition semantics, while mind maps retain a cycle-safe parent-child hierarchy; all three canvas types reopen from document fences and save in place. Sequence, Gantt, timeline, Kanban, pie, bar, line, and doughnut charts expose structured fields and data rows with a live preview. Advanced syntax stays safely in Source mode rather than being converted with data loss.
- Diagram Builder also includes 15 offline data charts: bar, line, stacked bar, area, scatter, diverging comparison, bar-and-line combo, funnel, heatmap, box plot, bubble, gauge, doughnut, waterfall, and word cloud. Editable fenced `echarts` JSON stays in the Markdown file, renders locally as SVG, and exports consistently to Word, HTML, and PDF. [Open the data-chart examples](docs/ECharts-数据图表案例.md).
- Three built-in reference shortcuts—Charts, Formulas, and Formatting—cover all 41 diagram templates, all 95 Academic Formula templates, and the Markdown/HTML formats supported by the editor. Charts are grouped by purpose and formulas by discipline; new headings use a custom fiery-red rounded NEW badge with light/dark styling instead of system emoji. The chart and formula pickers display matching NEW badges from the same addition list. Opening a reference does not add it to Recent Reading.
- More settings offers System, Sans serif, Serif, Rounded, Song-style, and Kai-style app fonts. The interface, Markdown editor prose, reader and live preview share the selected font immediately and remember the choice. Font changes preserve the caret and undo history, while code remains monospaced.
- More → App font → Body & math typography offers 11 automatic Chinese/English pairings: Default, Modern, Clear & readable, Book reading, Classic document, Literary, Handwritten feel, Soft & rounded, Magazine, Technical and Monospaced prose. The floating panel previews both panes directly in the current document; save remembers settings, while cancel or Escape restores the previous display. Previous custom pairs remain available. Small/Standard/Large math sizes retain KaTeX fonts; code stays monospaced, local fonts fall back when unavailable, and no online fonts are downloaded.
- Close Preview returns from the reading screen to Home without removing the document from Recent. Home now provides the three complete examples together with a comprehensive shortcut guide for files, reading, editing, and text formatting.
- Inserting a code block lets you pick a common programming language (JavaScript, Python, Go, Java, C/C++, Rust, HTML, SQL, and more) and writes a language-tagged fenced block with highlighting. An “Exit editing” button in the editor header returns you to the immersive reading view at any time.
- Undo from the toolbar or with `Ctrl/Cmd + Z`; each document has isolated history that stops at the originally loaded content.
- `Ctrl/Cmd + F` searches Markdown source in place, highlights matches and scrolls to the selected result. In live editing, a match inside hidden syntax such as a link destination temporarily reveals that part, including inside tables and details blocks; closing search restores rendering. The find-and-replace panel follows the selected Chinese or English interface language.
- Inside table cells, code, details bodies/summaries, HTML prose and footnotes, `Ctrl/Cmd + F` opens document-wide search. `F3` / `Shift + F3` and `Ctrl/Cmd + G` / `Ctrl/Cmd + Shift + G` navigate next/previous results. Keyboard focus follows the result so typing replaces the selected text, not the old cell. Navigation still reveals hidden destinations after the panel closes.
- Search highlights reach tables, code and nested editable prose using matches from the original Markdown, without inventing regex line endings at cell boundaries. “All” preserves multiple selections after closing the panel; typing across those selections shares one undo action and respects field rules such as escaping table pipes.
- Multiple carets inside rendered blocks follow the actual text instead of stretching along the block edge, including emptied table cells. Multi-selection newline and paste retain code/footnote prefixes, normalize line breaks to spaces in table cells and section titles, and keep caret offsets correct for Windows multiline clipboard text.
- Mixed-selection paste handles each insertion position separately: prose retains rich formatting while code, comments and section titles receive plain text, including inline code inside nested prose. Repeated Backspace/Delete after clearing table, code or footnote fields cannot escape their boundaries into structure or following text; footnote-end carets and highlights stay aligned with the text.
- Word deletion (Ctrl+Backspace/Delete on Windows/Linux, Option+Backspace/Delete on macOS) also protects table, code and footnote boundaries. Carets added inside projected fields with Ctrl+click (Command+click on macOS) synchronize to the main document and survive paste, undo/redo and follow-up typing; literal code, comments and section titles do not receive rich-text markers.
- Multi-caret Enter inside a table cell or section title inserts spaces under its single-line rules instead of navigating away and losing carets; single-caret Enter keeps its existing navigation. Active cells retain caret-owned edge whitespace. Final blank lines in quoted/list code map after container prefixes, so follow-up typing does not break the code block.
- In live rendering, deletion and paste move invalid edge whitespace outside bold, italic, strikethrough and highlight markers without losing text or spaces. Ambiguous whitespace uses equivalent character references to avoid creating indented code or extra hard breaks. Word deletion no longer exposes broken markup; emptied wrappers are removed, nested formatting and undo/redo are preserved, and active footnotes retain new leading spaces owned by the caret.
- Emptying colors, links, inline code, underline, superscript/subscript, keyboard styling or HTML highlights also removes their empty wrapper, so subsequent typing is plain text without stale styles or backticks. Removing a reference link preserves shared definitions; nonempty whitespace in code/HTML remains content.
- Pasting, typing or deleting across different inline styles preserves unselected text styles and link targets, repairing both selection boundaries instead of exposing broken markers. Adjacent emphasis uses equivalent HTML to avoid delimiter ambiguity; toolbar toggles still remove it. Nested prose, tables, footnotes and single-step undo are supported.
- Cross-style edits retain reference links' original identifiers and shared definitions. Shortened angle-bracket autolinks keep their complete destination (including `mailto:` for email), while formatting punctuation and character entities remain literal label text. Unselected inline code retains its code styling.
- Typing, deleting or adding a newline inside a shortcut/collapsed reference label retains its original identifier without changing shared definitions or other references. Backspace at the label start or Delete at its end removes the paired hidden link markers while keeping the text, rather than leaving broken source; each operation is undoable in one step.
- Deleting a hidden edge of bold, italic, strikethrough, highlight, text color, inline code or other supported inline styles also removes its paired marker. Only that formatting layer is removed; text and enclosing styles remain, with accurate follow-up typing and single-step undo.
- Live inline code accepts literal backticks by widening its delimiters. Semantic padding stays hidden without rewriting code content. The toolbar can remove long-delimiter code styling while retaining literal backticks, intentional spaces and footnote positions, with undo/redo support.
- Newlines and multiline paste inside live inline code close each physical line separately, preventing stray backticks or accidental headings/fenced blocks. Quote, list and footnote continuation remains structural; multiline code application/removal shares the same rules and undo history.
- Multiline prose selections follow visible text instead of flooding the line end; empty lines remain indicated and code backgrounds do not hide the selection. Removing inline-code boundaries preserves literal punctuation; forward joining quote/list lines removes hidden prefixes, with subsequent typing and undo/redo preserved.
- Multiple carets can join quote/list lines and nested prose in one operation. Each editable field retains its rules: code keeps literal punctuation and tables keep cell boundaries. Deleting hidden style edges in tables, details and footnotes behaves like ordinary prose, with one-step undo for the complete action.
- Reapplying inline code preserves displayed backticks, backslashes and edge spaces without exposing extra escapes; source mode retains literal source text. Inline formatting records its actual resulting selection so formatting can be applied again after undo/redo.
- Live mode can remove code styling from only the selected text, retaining the remaining code, literal punctuation and spaces, including multiple selections within one span. Ctrl/⌘+D selects the next occurrence from details, tables and footnotes. Undo/redo retains actual caret positions and selection direction without changing continuous-typing history grouping.
- Live single-line text selections are painted from visible text bounds; hidden format markers no longer stretch a two-letter selection to the end of the line.
- Create a Markdown file and begin editing immediately, with autosave every 10 seconds while editing. Atomic recovery snapshots can restore unsaved edits after an abnormal exit. Large documents automatically use deferred preview refreshes, pause full-document spell scans, and avoid copying the entire buffer on every keystroke.
- One “Export document” action opens every export option without extra tools for Word, styled HTML, unstyled HTML, PDF with heading bookmarks, and high-resolution PNG/JPEG images. Every image page is rendered independently at 2× resolution with the A4 aspect ratio and saved under sequential filenames, without whole-document scaling or resampling. Even when Single long image is selected, documents longer than three A4 pages automatically switch to A4 HD pages so viewers and social apps cannot reduce a tens-of-thousands-pixel image to a blurry thumbnail. Documents up to three pages can still use a losslessly joined 1280px layout that exports at approximately 2560px wide. It supports reusable presets plus `{title}`, `{date}`, and `{page}` header/footer variables. PDF export uses an installed Edge, Chrome, or Chromium to create navigable bookmarks without increasing Quillite's installer size, with system printing as a fallback. Install [Pandoc](https://pandoc.org/installing.html) locally to add EPUB, RTF, ODT, LaTeX, MediaWiki, or custom writer/extension/argument exports. Pandoc is optional.
- Direct PicGo Cloud hosting is available under More → Image hosting. Choose PicGo Cloud and sign in securely in the system browser—there is no need to install PicGo or copy a credential, while free allowances and later billing are provided by PicGo Cloud. The login token is stored separately in the local configuration directory rather than normal preferences. Selected, dropped, and pasted images are still saved to the document's local `assets` directory first, then uploaded through presigned or multipart APIs and inserted as an online URL. A loading indicator shows real transfer percentage and the online-link generation stage. Any failure falls back to the portable local path so the image is never lost. Users who already have PicGo can keep using the Local PicGo compatibility mode, whose Server connection remains restricted to localhost/loopback addresses.
- Built-in feedback for feature suggestions and functional issues, with optional contact details, up to five screenshots, and automatic app/system version information. Administrators can review, resolve, or delete feedback together with all attached images.
- The document outline now supports title search and hierarchical/flat views. Hierarchical search keeps matching headings in context with their ancestors and remembers per-document folding; flat view makes every title quick to scan. Put `[TOC]` on its own Markdown line to generate a live linked table of contents that is retained in HTML/PDF exports. Active-section tracking, manual resizing, display-aware typography, document search, printing, and back-to-top navigation remain available.
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
- Single-instance file opening and unsaved-change protection, with Save, Don't Save, and Cancel choices on exit; the window closes only after a successful save.
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

Version 2.0 and later replace Electron with Go and Wails while retaining the existing HTML/CSS interface and CodeMirror editor. The current Windows installer is about **12 MB**, compared with about 90 MB for the previous Electron build.

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

New Markdown documents do not require a location prompt. On macOS they are always stored in the user's `Documents/Quillite Markdown` folder so application upgrades cannot overwrite them. Portable Windows and Linux builds retain the application-directory preference with a Documents fallback. The first manual save lets you choose a name and folder. Save As transfers draft identity and removes the duplicate Recent entry, but retains the original draft file. Local images referenced by absolute or relative paths are loaded securely through the Go backend for reliable previewing.

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

For real-input formula regression, run `node tests/browser-formula-roundtrip.mjs` from `frontend`. Provide Playwright (optionally via `PLAYWRIGHT_MODULE`) and a Chromium browser (optionally via `BROWSER_EXECUTABLE`). The test uses synthetic documents in a fresh browser context, not real documents or desktop file APIs. It checks every registered formula's block insertion, advanced-source editing, cancellation, source round trips, single-step undo/redo, and document history isolation; it does not cover every parameter or output mode.

Run `node tests/browser-formula-structures.mjs` for real-input coverage of 13 visual structure tools, four matrix row/column actions, placeholder validation, saving, and undo. Set `AUDIT_FORMULA_MODE` to `inline`, `block` (default), or `numbered` to test each output mode. This also uses isolated synthetic documents; it does not prove all template parameters, complex nesting, or IME combinations are covered.

Incomplete or invalid equations and invalid chart data show a muted Insert/Save button with a not-allowed cursor. Valid input restores the normal button appearance. Selected equation text and slots follow the app's light/dark theme independently of the system preference.

Chart validation messages adapt to light/dark surfaces; invalid fields retain their error border and focus ring while focused. Run `node tests/browser-chart-series-paste.mjs` for isolated CSV/TSV and row-operation checks on 12 data charts, plus series additions/removals, confirmation/cancellation and undo on eight charts. Set `AUDIT_THEME=dark` and `AUDIT_CONTRAST=strict` to check the actual styles.

After showing a diagram's source in live editing, use the persistent Return to rendered view action above the editor without scrolling back to the beginning. Returning selects the diagram without changing content or undo history. Returning and redoing an edit target the visible start of the chart, preventing a jump below the collapsed source. Run `node tests/browser-chart-source-roundtrip.mjs` for title/data edits, exact source retention, invalid JSON rejection, cancellation, undo and returned-chart visibility across the current 19 ECharts templates and four complex configurations. Configurations that cannot be parsed completely remain source-editable.

Run `node tests/browser-mermaid-roundtrip.mjs` on isolated synthetic documents to exercise all 22 current Mermaid templates: real source edits, no-op saves, invalid syntax rejection, return to rendered view, cancellation, undo/redo and new-document history isolation. The 11 visual templates also receive node, field or value edits followed by save and reopen checks. Set `AUDIT_THEME=dark` to repeat in dark mode. This is not complete acceptance of every canvas operation or arbitrary Mermaid syntax.

Saving or cancelling a diagram dismisses its obsolete source-validation warning without hiding newer warnings from other operations. Gantt excluded dates, alternate regions and completed tasks use the current light/dark theme's neutral colors. Run `node tests/browser-diagram-feedback.mjs` with `AUDIT_STRICT=1` to check warning cleanup, theme switching and unchanged document content; `AUDIT_THEME=dark` starts in dark mode.

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
