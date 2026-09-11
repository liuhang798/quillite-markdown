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
