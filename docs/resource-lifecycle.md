# 资源生命周期与内存优化 / Resource lifecycle and memory

2026-10-20，基于 `49fb829` 后的开发分支；未改动已发布的 v3.0.0 标签或更新日志正文。

## 检查范围与修改

检查前端编辑／阅读切换、图表与图片预览、导出等待、历史版本弹窗、缓存与监听器，以及 Go 图片上传的数据分配路径。保留已有功能、安全检查、撤回历史和用户文件；没有按文件大小或简单引用次数批量删除模块。

- 图表弹窗替换 DOM 前、关闭弹窗、切到纯文本或渲染异常时，取消旧 Mermaid 工作并销毁 ECharts 实例及其 ResizeObserver。
- 阅读时卸载隐藏的即时渲染组件；编辑时释放隐藏阅读 DOM。通过重新配置 CodeMirror 展示扩展保留正文、选区及历史，返回时按最新内容重建。
- 提取共用的 `image-load-session.js`，编辑器和阅读预览每个会话最多并行读取 4 张本地图片。相同引用仅共享尚未完成的读取，完成后不保留 Base64 缓存；切换或关闭时清空队列，忽略晚到结果。已经进入 Go 的读取不能中断。
- 关闭文档清空最多 16 MiB 的阅读 HTML 缓存，关闭历史版本弹窗清理比较 DOM；导出图片等待在成功、失败或超时后清理监听器和计时器。
- 字数统计按匹配到的词段流式计数，仅对含中日韩字符的词段细分，避免整篇替换字符串与匹配数组；保留原 Unicode 统计口径，大段 Base64 不逐字符执行 JavaScript。
- 本机 PicGo multipart 请求由小型头尾缓冲与原图片数据组合，删除整张图片的额外复制，保留 MIME、Content-Length 与上传进度。

## 对比结果

| 可重复场景 | 原实现 | 修改后 |
|---|---:|---:|
| 图表弹窗连续更新 20 次后的存活实例 | 20 | 1 |
| 上述弹窗关闭后的存活实例 | 20 | 0 |
| 100 张本地图片、桥接读取尚未返回时已启动的读取 | 100 | 4 |
| 图片导出等待超时后残留的监听器 | 2 | 0 |
| 25 MiB 图片构造／消费 multipart 的 Go 分配量 | 26,224,307 B/op | 41,393 B/op |
| 240 万字符混合文本字数统计后 JS 堆增长（单次样本） | 58,245,528 B | 3,384,824 B |

字数一致为 900,000，单次耗时约 205 ms → 87 ms；千万字符连续 Base64 样本约 13 ms → 10 ms。JS 堆增长受 GC 时机影响，不等于峰值或整机占用；Go 数据只计 multipart 组装与消费，不包含读取图片和网络传输。浏览器测试使用隔离的真实前端、真实 ECharts 和合成文档。以上不是桌面应用总内存降低比例，也不是所有平台的性能保证。

## 复测

前端目录执行 `node --test tests/*.test.mjs` 与 `npm run build`；仓库根目录执行 `go test ./...`、`go vet ./...`。

```bash
# Frontend; set PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE if needed.
node tests/browser-resource-lifecycle.mjs
# Compare against the checked-out HEAD renderer before committing this change:
# RESOURCE_BASELINE=1 node tests/browser-resource-lifecycle.mjs

# Repository root; 25 MiB synthetic image, no network access.
go test . -run TestPicGoMultipartBody -bench BenchmarkPicGoMultipartBody -benchmem
```

新增验证覆盖并发上限、读取去重、失败重试、会话关闭、晚到结果、缓存清理、Unicode 统计一致性与 multipart 内容／长度。浏览器验证同时检查隐藏内容回收、浅色／深色模式切换、完整图片导出；已有编辑与文档测试验证选区和撤回重做。

本次通过：1,853 项前端单元测试、Go 全包测试与 vet、生产构建、61 项发布源码安全检查；浏览器回归覆盖上述资源生命周期、编辑模式／预览联动、阅读与切换性能、即时编辑、图片源码切换、12 组图片／表格边界，以及 19 类数据图表和 4 组自定义配置。额外验证了排队读取超过原 3 秒解码等待时间时仍完整导出全部图片，缺失本地图片则明确失败。

Windows 测试包已使用 NSIS 和自定义启动器完整封装并校验 payload，未执行安装或发布。安装／升级／卸载生命周期仍须一次性 Windows CI 验证；本次没有重新运行 macOS/Linux 原生桌面验证。

## 审计后修复：打印图片完整性

系统打印复用有界图片读取队列，等待完整队列和浏览器图片加载完成后再校验每张图片；缺失、损坏或超时会显示中英文提示并停止打印。等待期间切换文档、关闭文档、返回编辑或重新渲染会取消旧请求，重复操作仅保留最新请求。PDF 回退打印也按实际成功与否返回结果。

回归入口：`frontend/tests/print-readiness.test.mjs`、`frontend/tests/browser-resource-lifecycle.mjs`。浏览器用真实前端和图片解码，替换原生打印桥接记录调用时的图片状态，不启动系统打印窗口或真实打印机。

修复后通过 1,862 项前端测试（新增 9 项打印等待／取消／失败处理测试）、Go 全包测试与 vet；真实浏览器确认 20 张排队图片全部就绪后才调用打印，缺失或损坏图片及切换文档不会调用打印。

System printing now waits for all queued image reads and image loading, validates image readiness, and fails closed with a localized message. Stale or superseded print requests are cancelled. Browser tests intercept the native print bridge; they do not validate physical printers or native print dialogs.

## 退出编辑的阅读位置（2026-10-20）

移除退出编辑时强制回顶的操作。进入编辑前仅保存阅读段落的短文本特征、序号和视口偏移，不保存隐藏 DOM；退出后按段落恢复，内容已修改或删除时按附近序号回退。前方新增段落不会使未修改的目标段落偏移。新文档不沿用旧文档位置，编辑选区和撤回历史保持原有行为。

恢复后的 10 秒内监听布局和资源加载变化；主动滚动、触摸、点击、按键、目录导航、回顶部、重新渲染、文档切换或再次编辑会停止校正。取消时释放监听器和旧 DOM 引用，避免与资源回收优化冲突。超过窗口的极慢资源不再强制校正位置。

验证：`reading-position.test.mjs` 与 `browser-reading-position.mjs` 覆盖有界快照、重复内容、前文插入、即时／源码模式反复切换、模拟异步布局变化、用户接管和新文档隔离。1,865 项前端测试、Go 全包测试与 vet 通过；现有浅色／深色、双向布局、选区、撤回重做、阅读性能、目录和导出／打印完整性浏览器回归通过。浏览器验证不等同于原生安装生命周期验证。

## English summary

Leaving the editor restores a compact pre-edit reading anchor, without retaining hidden reader DOM. A bounded 10-second correction window follows late layout changes and is cancelled by user navigation or document/mode changes. Editor selection and undo history are preserved.

This change fixes chart-instance retention, shares bounded local-image read queues, releases hidden rendered content and closed-document caches, cleans up export listeners, and removes the full-image multipart copy. The benchmark table describes individual allocation/lifecycle scenarios, not total desktop memory. Existing rendering, storage, upload progress, selection and undo behavior remain the validation baseline. These fixes are included in the October 20 same-version v3.0.0 rebuild.
