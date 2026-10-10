# Design QA：未保存退出确认

- source visual truth path: `C:\Users\柳航\AppData\Local\Temp\codex-clipboard-de63b398-746e-47a2-8cb8-f4a896f584c5.png`
- implementation evidence: Codex in-app browser tab 8，同轮本地页面 `http://127.0.0.1:5178/`
- viewport: 904 × 904 CSS px
- state: 浅色主题、编辑模式、文档存在未保存更改、点击窗口关闭按钮

## Comparison

- 来源中的 Windows 原生警告框只显示“确定”，无法选择保存，也没有取消与明确放弃入口。
- 修改后使用轻阅现有弹框视觉体系，居中显示“尚未保存”以及“取消 / 不保存 / 保存”三个操作。
- “保存”为主题色主操作并默认获得键盘焦点；“不保存”使用低强度危险色；“取消”保持中性。
- 背景遮罩、圆角、边框、阴影、字号和按钮高度与现有应用弹框一致，未改变编辑器及其他页面布局。

## Behavior and accessibility

- 原生窗口关闭、标题栏关闭按钮和应用退出入口统一触发同一个确认流程。
- 保存会等待进行中的自动保存，保存最新正文成功且后端确认 dirty 状态已清除后才退出。
- 只读或写入失败时进入现有“另存为”流程；取消另存为或保存失败均保留窗口和原文。
- 不保存会清理异常恢复快照，再退出；取消、点击遮罩或按 Escape 均保留文档。
- 弹框具有 `role="dialog"`、`aria-modal`、标题和描述关联，三个按钮均有明确中文/英文文案。
- 弹框使用最高层级，即使 AI 或其他弹框已打开也不会被遮挡。

## Findings

- 无 P0、P1 或 P2 问题。
- 无剩余发布阻断项。

final result: passed

---

# Design QA：公式窗口紧凑布局（2026-10-10）

- source visual truth path: `C:/Users/柳航/AppData/Local/Temp/codex-clipboard-76c24d0a-7a7d-45a9-a0ae-f3c817957c98.png`
- implementation screenshot path: `D:/工作/CodexTemp/quillite-formula-compact-20261010/compact-desktop.png`
- viewport: 1134 × 831 CSS px; source and implementation both 1134 × 831 pixels, 1:1 comparison, no density normalization.
- state: light theme, Chinese, editing the same geometric-sequence inline equation with custom template and Advanced collapsed. Source builder is partly scrolled; implementation shows its full heading. Do not treat the newly visible heading as added functionality.
- full-view comparison evidence: both source and implementation opened together in one image-comparison tool result; screenshot annotations treated as requested spacing changes, not UI to reproduce.
- focused region comparison: not needed; header text, option labels, editing controls and footer are legible at 1:1 in the full captures.

## Findings and required fidelity surfaces

- No actionable P0/P1/P2 findings. Header now measures 50.34 px; output/layout options occupy one 32 px row at the reference desktop size. Visual editor, live preview and Advanced remain visible without builder scrolling for this equation.
- Fonts/typography: existing application and equation fonts retained. Title reduced from 25 to 21 px and guidance from 14 to 12 px; equation input and preview sizes unchanged. Title hierarchy and Chinese/English labels remain legible.
- Spacing/layout rhythm: intentionally reduced dialog padding, header gaps, builder heading spacing and output-control margins. Desktop options share a row; 800 × 600 windows wrap to two rows. At 600 × 600 the existing single-column/catalog scrolling layout remains usable, with persistent footer buttons outside the scroll area.
- Colors/tokens: existing accent, paper, border and muted-text tokens retained. No color or contrast redesign.
- Image quality/assets: no raster assets or logos changed. Existing vector close icon and formula font rendering retained, without generated substitutes.
- Copy/content: all existing labels and explanatory text retained in both languages. Tutorial, close, source, template search, layout choices, Cancel and Save remain present.
- Scope: new CSS rules restricted to `#formulaDialog`; shared diagram-dialog spacing is unchanged. No formula-parser, file-write, deletion, installer or update logic changed in this task.

## Behavior and responsive checks

- Chinese desktop (1134 × 831), short window (800 × 600) and narrow window (600 × 600): no horizontal layout overflow; Cancel/Save remain within viewport.
- English desktop and 800 × 600: long labels fit or wrap their groups, with no panel overflow and all five output/layout buttons within panel bounds.
- Large layout updates only the inline draft; Display mode hides inline-layout controls and hint. Cancel followed by reopen preserves the original source exactly.
- Save then reopen retains the selected Large layout and standard LaTeX source.
- Browser error console: no errors recorded on this test page.
- Additional evidence: `compact-small.png`, `compact-narrow.png`, `compact-english.png` in the same temporary verification directory.
- Frontend tests: 581 passed. Go tests/vet, renderer syntax, production build and source-level safety gate passed. Complete Windows installer includes the custom launcher and verified `QUILLITE_PAYLOAD` footer.
- Residual test gap: no native macOS/Linux runtime or real installer lifecycle performed on the user's machine; installer lifecycle remains restricted to disposable Windows CI.

## Comparison history

- First post-change visual comparison found no actionable P0/P1/P2 differences; no further visual fix was necessary. Differences in density are the user's requested compacting, not fidelity defects.

final result: passed
