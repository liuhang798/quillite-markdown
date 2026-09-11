# Design QA：AI 翻译要求单行化与控件对齐

- source visual truth path: `C:\Users\柳航\AppData\Local\Temp\codex-clipboard-8750b82f-5880-492b-b2d8-7bed75d36dfb.png`
- implementation screenshot path: Codex in-app browser tab 4 的同轮截图证据（本地页面 `http://127.0.0.1:5178/`）
- viewport: 1626 × 904 CSS px；另验证 720 × 900 CSS px 的窄屏状态
- source and implementation pixel dimensions: source focused crop 1626 × 424 px；implementation focused capture 1626 × 424 px
- CSS size and density normalization: 来源与实现均按 1626 CSS px 宽度、1:1 密度进行同轮并列比较；重点比较来源截图覆盖的顶部表单区域
- state: 浅色主题、编辑模式、AI 翻译、已选择文本、生成前隐私检查状态

## Full-view comparison evidence

- 来源截图中，“翻译要求”仍为约 58 px 高的多行文本框，高于目标语言下拉框与生成按钮，视觉重量偏大。
- 修改后，“翻译要求”改为真正的单行文本输入框；目标语言、翻译要求和生成按钮在宽屏并列为一行，三个控件顶部均为 190.40625 px、高度均为 38 px。
- 底部设置、取消和替换按钮均保持可见；逐项修改列表在自己的区域内滚动。
- 720 × 900 窄屏下控件恢复单列排列，弹框 `scrollHeight` 800 px、`clientHeight` 718 px，使用弹框滚动条访问底部按钮，没有横向重叠或裁切。

## Focused region comparison evidence

- 已针对用户红框中的顶部请求区进行聚焦比较；翻译要求不再显示可拉伸角，目标语言选择框、要求输入框和生成按钮同高同线。
- 原文和 AI 结果仍保持双栏，标签及文本可读；逐项修改标题栏、筛选、批量操作、段落卡片和“显示更多修改”均正常显示。

## Required fidelity surfaces

- Fonts and typography: 延用现有字体、字重和颜色变量；标题由 25 px 调整为 22 px，层级仍清晰，无新增截断。
- Spacing and layout rhythm: 弹框内边距保持 18/24 px；顶部三列间距 12 px，三个控件统一为 38 px 高，生成按钮使用 23 px 标签补偿量与输入控件上沿精确对齐。
- Colors and visual tokens: 未新增颜色或阴影，继续使用现有 `--ink`、`--muted`、`--line`、`--accent` 等令牌。
- Image quality and asset fidelity: 该界面没有图片资产或自定义图标变更，不适用图像质量差异。
- Copy and content: 标题、字段说明、操作按钮和翻译内容均保持原样，仅将要求控件由多行改为单行。
- Accessibility and behavior: 使用原生 `input[type="text"]` 保留标签、键盘输入和焦点语义；窄屏通过弹框滚动保证全部操作可达。

## Findings

- 无剩余 P0、P1 或 P2 问题。
- P3：极窄屏下信息密度较高，但控件不重叠且可滚动，不影响任务完成。

## Comparison history

1. Earlier finding [P1]: 顶部请求区纵向占用过大，压缩逐项修改列表，用户需要频繁滚动才能审阅多条结果。
2. Fix made: 新增 `ai-request-settings` 响应式网格；收紧标题、内边距、字段高度和区域间距；有逐项修改时将原文/AI 结果区限制为 104 px，并让修改列表填充剩余高度。
3. Post-fix visual evidence: 同一 1576 × 902 状态下，顶部请求区缩至单行布局，逐项修改区可同时显示更多卡片，底部操作保持可见；720 × 900 状态下改为单列滚动且全部操作可达。
4. Earlier finding [P2]: 紧凑布局初版使用底部对齐，导致较矮的目标语言字段整体下沉，与翻译要求标签和输入框错位。
5. Fix made: 外层网格改为顶部对齐；生成按钮单独增加 23 px 顶部补偿，窄屏时清除补偿并恢复整行宽度。
6. Post-fix visual evidence: 1533 × 900 浏览器实测中，选择框、要求文本框和生成按钮顶部均为 190 px；720 × 900 下按钮宽 538 px、单列排列且无重叠。
7. Earlier finding [P2]: “翻译要求”使用 58 px 高的多行文本框，虽然上沿已对齐，但与 38 px 高的选择框和按钮不等高，仍显得突兀并占用额外空间。
8. Fix made: 将共享要求控件由 `textarea` 改为 `input[type="text"]`，并把要求输入框及可选篇幅输入框统一为 38 px 高。
9. Post-fix visual evidence: 1626 × 904 浏览器实测中，目标语言、翻译要求和生成按钮的 `top` 均为 190.40625 px、`height` 均为 38 px；720 × 900 下三者依次单列排列，宽度均为 538 px，无横向溢出或重叠。

## Open Questions

- 无。

## Implementation Checklist

- [x] 压缩 AI 翻译顶部请求区
- [x] 将宽屏字段与生成按钮放入同一行
- [x] 对齐两个字段标签和三个控件的上沿
- [x] 将翻译要求改为单行输入框并统一控件高度
- [x] 为逐项修改列表分配弹性剩余高度
- [x] 保留窄屏单列和弹框滚动行为
- [x] 检查 21 条修改、筛选、显示更多和底部操作
- [x] 检查浏览器控制台，无 warning/error

## Follow-up Polish

- 无发布阻断项。

final result: passed
