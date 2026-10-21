# macOS 最近阅读批量清除无响应

## 证据与范围

- 上方按钮、右键“清除所选”及 Delete 共用 `clearSelectedRecentRecords`，原代码直接依赖 `window.confirm` 的同步结果；返回 false 时无提示地终止。
- 本机项目使用 Wails 2.13.0；其 Darwin `WailsContext` 设置了 WKUIDelegate，但未实现 JavaScript confirm panel 回调。该依赖与 macOS 下操作静默取消的反馈相符。
- 修改仅涉及此批量确认流程，不批量替换其他业务确认，不改变文件接口。

## 修复

- 使用 HTML 模态 dialog 与应用内中英文确认说明；取消默认聚焦，支持取消按钮和 Esc，确认才调用原记录清除 API。
- 在等待用户确认前加忙碌锁，防止重复点击；弹窗期间后台编辑快捷键不执行。
- 确认后按请求时的路径快照与当前最近列表取交集，不扩大删除范围。
- 继续逐条串行清除；失败项保留、可重试，不删除原文件，不改收藏或未保存文档。

## 验证

- Chromium 与 Playwright WebKit 均通过更新后的 `browser-recent-selection.mjs`。
- 测试将 `window.confirm` 替换为抛异常函数，确保所有入口完全不依赖原生确认；覆盖取消/Esc、重复触发、三个入口、部分失败重试、置顶/失效记录、收藏、当前未保存内容及空列表持久性。
- JavaScript 全部单元测试、Go test / vet、diff --check 通过；已有后端 `TestBulkRecentRemovalPreservesFilesFavoritesAndDrafts` 验证原文件/收藏/草稿保留。
- 本地 WebKit 为 Windows 上的浏览器内核回归，不等同真实 macOS Wails 安装版验收；发布工作流已增加 macOS runner 上的 WebKit 批量清除回归，后续由工作流构建和同步官网。
- 临时构建及截图位于 `D:\工作\CodexTemp\quillite-mac-recent-clear-20261021`。
