# Windows 安装标准字体回归 Design QA

- Source visual truth: `C:/Users/柳航/AppData/Local/Temp/codex-clipboard-f49fa78d-6935-4ac1-9e74-f411334ca44e.png`, `C:/Users/柳航/AppData/Local/Temp/codex-clipboard-9596602b-14c1-4819-96a0-d8fb447765b7.png`
- Implementation screenshots: `design-qa-artifacts/installer-normal-type-ready.png`, `design-qa-artifacts/installer-normal-type-complete.png`, `design-qa-artifacts/installer-normal-type-formal-ready.png`
- Full-view comparison: `design-qa-artifacts/installer-normal-type-full-comparison.png`
- Focused typography comparison: `design-qa-artifacts/installer-normal-type-focus-comparison.png`
- Source pixels: 572 × 426 px installer capture and 282 × 57 px typography reference；implementation pixels: 640 × 427 px
- Viewport / CSS-equivalent size: 640 × 427，Windows 原生分层窗口，density normalization 1:1；局部字体样本仅按字高归一化比较笔画形态
- State: 简体中文，准备安装；同时回归安装完成 100% 状态

## Full-view comparison evidence

完整对比图左侧为用户指出“太丑”的高对比度锐化版，右侧为恢复标准 Windows 字体渲染后的同尺寸准备页。新版保持背景、图标、圆角、按钮尺寸与所有中心位置不变，标题和按钮文字从粗硬的块状笔画恢复为舒展、均衡的常规字形。

## Focused comparison evidence

局部对比左侧是用户给出的正常文字参考“阅读与编辑”，右侧是新版安装标题按相同字高归一化后的结果。两者均呈现 Microsoft YaHei UI／微软雅黑系的正常横竖笔画比例、自然的曲线与 ClearType 平滑边缘；新版不再出现覆盖率阈值造成的笔画膨胀和像素块感。

## Required fidelity surfaces

- Fonts and typography: 使用系统 Microsoft YaHei UI，原生 ClearType Natural 直接在最终 640 × 427 表面绘制；标题 26 px／500、说明 14 px／400、按钮 13 px／500，完成标题 24 px／500、百分比 35 px／600。移除自定义灰阶蒙版、RGB 最大覆盖率和阈值锐化。
- Spacing and layout rhythm: 104 × 104 图标、107 × 39／106 × 39 按钮、标题区与按钮区中心位置均未改变。
- Colors and visual tokens: 标题黑色、品牌绿说明、主按钮白字和次按钮绿字保持原色；标准 ClearType 的轻微子像素过渡属于 Windows 正常文字渲染。
- Image quality and asset fidelity: 背景与图标继续复用原两份 WebP；图标高质量缩放、透明边缘处理、按钮 8 × 8 圆角和窗口逐像素透明均未改变。
- Copy and content: 全部准备、安装、完成及按钮文案保持不变。

## Interaction and build checks

- 真实启动 Win32 安装外壳，捕获准备页；点击“开始安装”并等待模拟核心成功，捕获完成页。
- 开始安装、退出、立即打开、安全取消、动态百分比和窗口拖动逻辑未变化。

## Findings

没有剩余 P0、P1 或 P2 问题。新版字体已回到图二所示的正常 Windows 文字风格；按钮小字号清晰但不再过粗，标题具有层级但没有块状锐化感。

## Comparison history

- Initial P1: 上一轮为消除模糊引入“ClearType 离屏蒙版 → RGB 最大覆盖率 → 阈值锐化”，使中文笔画膨胀、发黑、呈现低质量像素字观感。
- Fix: 完全删除自定义文字蒙版与覆盖率处理，改为 Microsoft YaHei UI 常规字重和系统 ClearType Natural；同时把标题、说明、按钮与百分比字重收敛到 400–600。
- Post-fix evidence: `installer-normal-type-ready.png`, `installer-normal-type-complete.png`, `installer-normal-type-formal-ready.png`, `installer-normal-type-full-comparison.png`, `installer-normal-type-focus-comparison.png`。

## Follow-up polish

当前范围无需 P3 调整。

final result: passed

---

# Windows 安装流程中英文双语言（2026-09-01）

## Source and implementation

- Implementation: `cmd/installer-launcher/main_windows.go`
- Chinese ready state: `design-qa-artifacts/installer-bilingual-zh-ready.png`
- English ready state: `design-qa-artifacts/installer-bilingual-en-ready.png`
- English installing state: `design-qa-artifacts/installer-bilingual-en-installing.png`
- English complete state: `design-qa-artifacts/installer-bilingual-en-complete.png`
- Production-package ready states: `design-qa-artifacts/installer-bilingual-formal-zh-ready.png`, `design-qa-artifacts/installer-bilingual-formal-en-ready.png`
- Viewport: 640 × 427 px native layered window

## Required fidelity surfaces

- Copy and content: 安装器默认简体中文，右下角显示 `English`；切换后显示英文完整文案，入口改为 `中文`。准备、安装中、完成、失败、按钮、动态省略号、目录选择提示及窗口标题均来自同一双语文案表。
- Layout and typography: 英文标题与说明保持单行居中，主按钮沿用 164 × 47 px；较长的 `Custom installation` 使用 11 px Microsoft YaHei UI，未发生裁切或与主内容碰撞。
- Interaction: 语言入口在全部四个状态保持可点击并显示手型光标；切换仅更新语言，不修改页状态、安装目录、百分比或取消状态。
- Image and size: 继续复用现有背景与图标，不新增位图或动画素材；全部安装图文源码仍低于 800 KB 构建限制。

## Verification

- 使用模拟安装核心依次捕获中文准备页、英文准备页、英文安装中与英文完成页，英文长文案均完整显示。
- 安装过程中切换语言不会重新开始任务；完成后仍按既有规则在三秒后自动关闭，QA 进程退出码为 0。
- 中文／英文文案、动态省略号、语言入口命中区与四状态可点击性均有 Go 回归测试覆盖。

final result: passed

---

# Windows 安装三状态统一按钮（2026-09-01）

- Source visual truth: `C:/Users/柳航/AppData/Local/Temp/codex-clipboard-373c4e96-2df0-4cc2-93ab-34ce2a60d625.png`, `C:/Users/柳航/AppData/Local/Temp/codex-clipboard-cd66be1f-30f4-49d7-98ea-b12ab693e7b1.png`, `C:/Users/柳航/AppData/Local/Temp/codex-clipboard-a5a22ce4-8d09-496c-a200-49f6c495f05a.png`
- Implementation screenshots: `design-qa-artifacts/installer-unified-ready.png`, `design-qa-artifacts/installer-unified-installing.png`, `design-qa-artifacts/installer-unified-complete.png`
- Same-scale comparison: `design-qa-artifacts/installer-unified-states.png`
- Viewport and implementation pixels: 640 × 427 px at native 1:1 density；state: 简体中文，准备／安装中／完成

## Findings and verification

- 三个状态使用相同的 164 × 47 px 绿色居中按钮和右上角关闭图标，位置、圆角、颜色与文字基线一致。
- 安装中保留真实进度百分比，按钮文案按 420 ms 周期循环“正在安装.／..／...”，安装核心成功前不会进入完成页。
- 完成页只显示“完成安装”按钮和右上角关闭图标；两者都关闭安装器，不再显示双按钮或倒计时。
- 准备页主按钮、自定义安装、完成按钮和右上角关闭均通过命中测试切换为 Windows 手型光标；安装中的状态按钮不伪装成可点击操作。
- 三张同尺寸截图确认字体、间距、品牌绿、背景与图标质量保持一致，没有裁切、重叠或空白残留。
- No actionable P0, P1, or P2 findings remain.

final result: passed

---

# Windows 安装文字清晰度精修 Design QA

- Source visual truth: `C:/Users/柳航/AppData/Local/Temp/codex-clipboard-39593497-fc4d-47f1-a846-92c51e71251b.png`
- Implementation screenshots: `design-qa-artifacts/installer-crisp-text-ready.png`, `design-qa-artifacts/installer-crisp-text-complete.png`, `design-qa-artifacts/installer-crisp-text-formal-ready.png`
- Full-view comparison: `design-qa-artifacts/installer-crisp-text-full-comparison.png`
- Focused same-state comparison: `design-qa-artifacts/installer-crisp-text-comparison.png`
- Source pixels: 360 × 126 px focused crop；implementation pixels: 640 × 427 px
- Viewport / CSS-equivalent size: 640 × 427，Windows 原生分层窗口，density normalization 1:1
- State: 简体中文，准备安装；同时回归安装完成 100% 状态

## Full-view comparison evidence

完整对比图左侧为上一版正式准备页，右侧为文字清晰度精修后的同尺寸准备页。背景、图标、标题位置、按钮尺寸和页面节奏均保持不变；新版只增强文字栅格质量，并把按钮标签从 12 px／650 调整为更适合 39 px 高按钮的 13 px／700。

## Focused comparison evidence

局部对比严格使用相同的准备安装状态与 360 × 126 像素区域。左侧用户截图中的按钮文字和绿色说明存在低覆盖率灰边，右侧新版的笔画主体更实、边缘更窄，中文横竖笔画不再发虚；按钮圆角与背景没有受到影响。

## Required fidelity surfaces

- Fonts and typography: 字体继续使用 Microsoft YaHei UI；ClearType 仅用于生成字体提示良好的离屏蒙版，RGB 子像素随后折叠为灰阶并收紧低覆盖率边缘，因此没有彩边，也没有原灰阶直绘的灰蒙感。标题、百分比、说明和按钮标签均走同一清晰合成路径。
- Spacing and layout rhythm: 640 × 427 窗口、104 × 104 图标、107 × 39／106 × 39 按钮和全部中心线未改变；按钮文字仍为整数像素居中。
- Colors and visual tokens: 品牌绿、黑色标题、绿色说明、白色／绿色按钮文字未改变；只改变文字像素的覆盖率曲线。
- Image quality and asset fidelity: 背景与图标继续使用原两份 WebP，未新增或重复图片素材；图标透明边缘精修保持不变。
- Copy and content: “轻巧、专注、即刻可用”“开始安装”“退出”以及完成页全部文案未修改。

## Interaction and build checks

- 真实启动 Win32 安装外壳，捕获准备页；点击“开始安装”，等待模拟安装核心成功后捕获完成页。
- 开始安装、退出、立即打开、安全取消、动态百分比和窗口拖动逻辑未改变。
- 新增文字覆盖率单调性测试，保证低覆盖率灰边被清除、实心笔画保持 100% 覆盖。

## Findings

没有剩余 P0、P1 或 P2 问题。新版小字号文字在 1:1 显示下清晰、无彩边；与用户截图相比，按钮标签与说明文字的笔画对比度明显提高。

## Comparison history

- Initial P2: 原生分层窗口直接使用普通灰阶抗锯齿绘制 12 px 按钮文字，低覆盖率边缘在浅色和绿色表面上形成灰蒙感。
- Fix: 以 ClearType Natural 生成离屏字体蒙版，取 RGB 子像素最大覆盖率转换为灰阶，再裁除低于 20／255 的虚边并将 218／255 以上提升为实心；按钮标签同步调整为 13 px 半粗体。
- Post-fix evidence: `installer-crisp-text-ready.png`, `installer-crisp-text-complete.png`, `installer-crisp-text-formal-ready.png`, `installer-crisp-text-full-comparison.png`, `installer-crisp-text-comparison.png`。

## Follow-up polish

当前范围无需 P3 调整。

final result: passed

---

# Windows 安装图标与按钮原生分辨率精修 Design QA

- Source visual truth: `C:/Users/柳航/AppData/Local/Temp/codex-clipboard-c7f4bfaf-95d3-41c3-b2a8-c4f18944eefc.png`
- Before screenshot: `design-qa-artifacts/installer-polish-complete.png`
- Implementation screenshots: `design-qa-artifacts/installer-native-foreground-complete.png`, `design-qa-artifacts/installer-native-foreground-formal-ready.png`
- Full-view comparison: `design-qa-artifacts/installer-native-foreground-comparison.png`
- Focused comparison: `design-qa-artifacts/installer-native-foreground-focus.png`
- Source pixels: 430 × 333 px annotated crop；before / implementation pixels: 640 × 427 px
- Viewport / CSS-equivalent size: 640 × 427，Windows 原生分层窗口，density normalization 1:1
- State: 简体中文，安装完成 100%

## Full-view comparison evidence

完整对比图左侧是上一版整帧缩放实现，右侧是前景原生分辨率实现。新版保持所有位置、比例、颜色和文案不变；图标与按钮不再随 960 × 640 背景一起缩小，而是在最终 640 × 427 画面上直接合成。

## Focused comparison evidence

局部对比将图标和主按钮放大约 4 倍。新版图标先把半透明像素的暗色底边替换为相邻绿色，再以 Catmull–Rom 缩放到 104 × 104，因此外轮廓没有黑色锯齿光晕；新版按钮使用 8 × 8 子像素覆盖率直接绘制，文字改用灰阶抗锯齿，消除了旧图中边缘毛刺和放大后可见的彩色 ClearType 条纹。

## Required fidelity surfaces

- Fonts and typography: 字号、字重和基线不变；从 ClearType 改为适合透明分层窗口的灰阶抗锯齿，按钮和说明文字不再出现彩色边缘。
- Spacing and layout rhythm: 图标 104 × 104、按钮 107 × 39／106 × 39，中心线和页面节奏完全保持。
- Colors and visual tokens: 品牌绿色、白色图形、按钮填充及说明文字颜色未变化；只清理透明边缘的暗色 RGB 底色。
- Image quality and asset fidelity: 继续使用原始 `app-icon.webp`，未重绘或替换品牌图形；运行时仅执行一次高质量缩放与透明边缘去底色并缓存结果。
- Copy and content: 安装完成、100%、说明和按钮文案保持不变。

## Interaction and build checks

- 真实启动 Win32 安装外壳，点击开始安装并捕获完成状态。
- 正式安装包重新生成后再次启动并捕获准备页，确认最终产物保持 640 × 427 且使用同一原生分辨率前景渲染。
- 前景在最终分辨率绘制，背景仍沿用高质量缩放；动态百分比刷新不会重复计算图标缩放或窗口圆角蒙版。
- 开始安装、退出、立即打开、安全取消和窗口拖动交互未变化。

## Findings

没有剩余 P0、P1 或 P2 问题。单像素显示在极端最近邻放大下仍会看到像素网格，这是物理像素本身而非锯齿缺陷；正常 1:1 显示下图标与按钮边缘连续、无暗边或彩边。

## Comparison history

- Initial P2: 图标和按钮先绘制在 960 × 640，再以非整数比例缩至 640 × 427；图标透明边缘还带有暗色 RGB 底边，透明窗口上的文字使用 ClearType 彩色子像素。
- Fix: 将前景改为最终分辨率直接渲染；图标使用透明边缘颜色扩散和 Catmull–Rom 缩放，按钮使用 8 × 8 覆盖率，文字使用灰阶抗锯齿。
- Post-fix evidence: `installer-native-foreground-complete.png`, `installer-native-foreground-comparison.png`, `installer-native-foreground-focus.png`。

## Follow-up polish

当前范围无需 P3 调整。

final result: passed

---

# Windows 安装窗口边缘精修 Design QA

- Source visual truth: `C:/Users/柳航/AppData/Local/Temp/codex-clipboard-52ac3295-38be-4791-8c1b-5e223db46b96.png`
- Before screenshot: `design-qa-artifacts/installer-percentage-complete.png`
- Implementation screenshots: `design-qa-artifacts/installer-polish-complete.png`, `design-qa-artifacts/installer-polish-formal-ready.png`
- Full-view comparison: `design-qa-artifacts/installer-polish-comparison.png`
- Focused comparison: `design-qa-artifacts/installer-polish-focus.png`
- Source pixels: 712 × 581 px annotated desktop capture；before / implementation pixels: 640 × 427 px
- Viewport / CSS-equivalent size: 640 × 427，Windows 原生 Win32 分层窗口，density normalization 1:1
- State: 简体中文，安装完成 100%，黑色桌面背景用于暴露透明边缘质量

## Full-view comparison evidence

完整对比图左侧是原二值裁切窗口，右侧是逐像素透明版本。新版保持背景、图标、文案、百分比和按钮布局不变，四角曲线在深色背景上连续过渡，不再出现旧 Win32 区域裁切形成的台阶；主按钮也不再出现白色外框。

## Focused comparison evidence

局部对比按 5 倍最近邻放大：左上两块分别展示修改前与修改后的圆角，后者在曲线边缘具有连续的半透明覆盖像素；右上、右下分别展示修改前与修改后的主按钮，修改前右侧和顶部可见白色轮廓，修改后边框与填充使用同一品牌绿色，轮廓干净一致。

## Required fidelity surfaces

- Fonts and typography: 未改动 Microsoft YaHei UI 字体、字重、字号和文字基线；按钮文字仍保持清晰居中。
- Spacing and layout rhythm: 640 × 427 尺寸、28 px 视觉圆角、图标、标题、百分比、说明和按钮间距保持不变。
- Colors and visual tokens: 主按钮边框改为与填充相同的品牌绿色；次按钮继续使用浅灰绿边框，未改变背景和状态色。
- Image quality and asset fidelity: 仍只使用现有背景与图标 WebP；窗口使用 4 × 4 子像素覆盖率生成逐像素透明蒙版，避免二值区域裁切锯齿，并缓存蒙版以免动态百分比刷新时重复计算。
- Copy and content: 全部安装文案与动态百分比逻辑保持原样。

## Interaction and build checks

- 真实启动 Win32 分层窗口，点击“开始安装”，等待模拟安装核心完成并通过 `PrintWindow` 捕获逐像素透明窗口。
- 重新打包正式安装程序后再次启动并捕获准备页，确认最终产物仍为 640 × 427，抗锯齿圆角与无白边主按钮均与验收实现一致。
- 动态百分比刷新通过窗口线程的自定义重绘消息执行，避免后台安装线程直接绘制窗口。
- 点击区域、安全取消、完成页“立即打开”和窗口拖动逻辑未改变。

## Findings

没有剩余 P0、P1 或 P2 问题。圆角在单像素层面仍必须由显示器像素组成，但现在边界包含半透明覆盖像素，不再是明显的硬台阶；按钮白边已完全移除。

## Comparison history

- Initial P2: 四个圆角由 1-bit `SetWindowRgn` 裁切，深色背景上出现明显锯齿；主按钮使用白色描边，形成不够精细的亮边。
- Fix: 改为 `WS_EX_LAYERED + UpdateLayeredWindow` 逐像素透明合成，使用缓存的 4 × 4 超采样圆角蒙版；主按钮边框与绿色填充统一。
- Post-fix evidence: `installer-polish-complete.png`, `installer-polish-comparison.png`, `installer-polish-focus.png`。

## Follow-up polish

当前范围无需 P3 调整。

final result: passed

---

# Windows 安装动态百分比 Design QA

- Source visual truth: `C:/Users/柳航/AppData/Local/Temp/codex-clipboard-988b54f7-e4c0-4303-8f5a-44304ea14f7e.png`
- Implementation screenshots: `design-qa-artifacts/installer-percentage-installing.png`, `design-qa-artifacts/installer-percentage-complete.png`
- Side-by-side comparison: `design-qa-artifacts/installer-percentage-comparison.png`
- Source pixels: 640 × 427 px；implementation pixels: 640 × 427 px
- Viewport / CSS-equivalent size: 640 × 427，Windows 原生 Win32 窗口，density normalization 1:1
- State: 简体中文，安装中 38% 与安装完成 100%

## Full-view comparison evidence

同一张对比图把原完成页放在左侧、加入百分比后的真实原生窗口放在右侧。背景裁切、圆角、图标大小与水平中心、标题字重、说明文字、按钮大小和底部留白均保持原视觉语言；新增的绿色 `100%` 位于标题和说明之间，原有内容只做必要的纵向让位。安装中截图验证数字从 0% 平滑增长，安装核心成功前最多停在 96%，成功后才以短动画补到 100%。

## Required fidelity surfaces

- Fonts and typography: 延用 Microsoft YaHei UI；标题保持粗体层级，百分比使用 52 逻辑像素的绿色粗体，说明文字略收紧到 20 逻辑像素，中文与 Markdown 混排清晰且无截断。
- Spacing and layout rhythm: 640 × 427 原生窗口、圆角半径、图标位置和按钮行不变；百分比插入标题与说明之间，四行内容仍以窗口中心线对齐，无重叠或贴边。
- Colors and visual tokens: 百分比使用既有品牌绿色，背景、正文、次要文字、主次按钮色值继续沿用当前安装界面。
- Image quality and asset fidelity: 继续只复用 `background-base.webp` 与 `app-icon.webp`；未增加新位图、进度条、玻璃图层、视频或浏览器运行时，背景与图标在 1:1 截图中保持清晰。
- Copy and content: 准备、安装中、完成和失败文案保持简体中文；安装中显示动态数值，完成页明确显示 100%，按钮仍为“正在安装…／退出”和“立即打开／退出”。

## Interaction and build checks

- 真实启动原生安装外壳，点击“开始安装”，在 38% 状态截图；等待模拟安装核心成功后，在 100% 完成状态截图。
- 数值按时间平滑递增但不会在核心成功前到达 100%；取消和退出仍沿用安全取消标记。
- 完成页“立即打开”仍优先读取当前用户卸载注册表中的安装位置，并保留默认目录回退。
- 完整原生窗口足以清楚判断字体、间距、颜色、素材和文案，因此无需额外局部放大图。

## Findings

没有剩余 P0、P1 或 P2 问题。相较原图，标题与说明仅为容纳动态百分比做了必要的紧凑调整；背景、品牌资产、按钮位置与整体重心保持一致。

## Comparison history

- Initial source: 完成页只有标题和说明，没有安装过程反馈。
- Fix: 在安装中和完成状态加入居中的动态百分比；保留同一背景与两份现有 WebP 素材，不恢复旧进度条或分层动画。
- Post-fix evidence: `installer-percentage-installing.png`, `installer-percentage-complete.png`, `installer-percentage-comparison.png`。

## Follow-up polish

当前范围无需 P3 调整。

final result: passed

---

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

---

# Windows 安装位置按钮与完成页自动关闭（2026-09-01）

## Source and implementation

- Source screenshots: `C:/Users/柳航/AppData/Local/Temp/codex-clipboard-0f1971d1-590f-40b6-a156-5437676e02cf.png`, `C:/Users/柳航/AppData/Local/Temp/codex-clipboard-c93757c3-b179-4e1b-933f-f5ec45a84347.png`
- Implementation: `cmd/installer-launcher/main_windows.go`
- Ready-state screenshot: `design-qa-artifacts/installer-path-button-integrated-ready.png`
- Production-package screenshot: `design-qa-artifacts/installer-path-countdown-formal-ready.png`
- Countdown screenshots: `design-qa-artifacts/installer-countdown-complete-10.png`, `design-qa-artifacts/installer-countdown-complete-8.png`
- Full comparison: `design-qa-artifacts/installer-path-button-comparison.png`
- Focused comparison: `design-qa-artifacts/installer-path-button-focus.png`
- State: 简体中文；准备安装与安装完成 100%；640 × 427 px 原生显示尺寸

## Findings and corrections

- Hierarchy: 保持图标、标题、说明、路径和主要操作的单轴居中层级；未增加新的视觉层。
- Spacing: “更改”不再是路径框中的独立胶囊，按钮直接占据路径外框的最右分段，清除右侧残留空隙。
- Typography: 路径继续使用单行省略，按钮保持原生显示分辨率的白色中文标签。
- Color and shape: 使用实心品牌绿，只保留按钮右侧圆角；左侧为平直接缝，与路径区域形成完整控件。
- Interaction: 点击整个绿色分段仍打开原生文件夹选择器；完成页显示“关闭（10）”并逐秒递减，到零仅关闭安装器，“立即打开”不会被倒计时替代。

## Verification

- Before/after: `installer-path-button-comparison.png` 与 `installer-path-button-focus.png` 已确认路径控件右端无空白、按钮点击区域完整。
- Countdown: QA 安装核心实测捕获 10 秒和 8 秒状态，进程在完成后 10 秒自动正常退出，退出码为 0。
- Rounded-button geometry、倒计时文案和现有点击映射均有 Go 回归测试覆盖。
- Result: passed.

---

# Windows 安装准备页极简操作层级（2026-09-01）

## Source and implementation

- Source visual truth: `C:/Users/柳航/AppData/Local/Temp/codex-clipboard-2de63d4a-d221-441a-b6fc-eb86ee10b76e.png`
- Implementation: `cmd/installer-launcher/main_windows.go`
- Implementation screenshot: `design-qa-artifacts/installer-minimal-ready.png`
- Production-package screenshot: `design-qa-artifacts/installer-minimal-formal-ready.png`
- Full-view comparison: `design-qa-artifacts/installer-minimal-ready-comparison.png`
- Focused controls comparison: `design-qa-artifacts/installer-minimal-controls-focus.png`
- Source pixels: 640 × 439 px desktop crop；implementation pixels and viewport: 640 × 427 px；native density normalization: 1:1
- State: 简体中文，准备安装

## Required fidelity surfaces

- Fonts and typography: 标题、说明和按钮继续使用 Microsoft YaHei UI；右上角关闭图标使用 Windows 原生 `Segoe MDL2 Assets`，小字号“自定义安装”使用 12 px／500，主按钮使用 13 px／500。
- Spacing and layout rhythm: 路径栏与底部次按钮完全移除；164 × 47 px 主按钮居中并位于说明下方，右上角关闭命中区为 32 × 32 px，左下角文字入口避开 28 px 圆角安全区。
- Colors and visual tokens: 主按钮继续使用品牌绿，关闭图标和自定义入口使用低饱和深绿，不增加新底框、描边或阴影。
- Image quality and asset fidelity: 继续复用同一背景与应用图标 WebP，不新增位图；图标、背景和逐像素圆角渲染保持原质量。
- Copy and content: 保留“准备安装轻阅 Markdown”“轻巧、专注、即刻可用”“开始安装”；路径设置收敛为“自定义安装”。

## Findings and comparison history

- Initial P2: 准备页同时显示完整路径、绿色“更改”、开始与退出按钮，视觉中心拥挤，退出操作与主安装操作争夺注意力。
- Fix: 隐藏路径与修改按钮，退出改为右上角系统关闭图标，放大并居中唯一主按钮，左下角提供低干扰但可点击的自定义安装入口。
- Post-fix evidence: 完整对比确认主操作层级更清晰；局部对比确认关闭图标、主按钮和自定义入口均没有裁切、空白残留或碰撞。
- Interaction verification: 使用真实鼠标输入确认右上角关闭命中区优先于标题栏拖动并能正常退出；点击“自定义安装”选择路径后自动进入安装，无需再次点击主按钮；安装完成倒计时后以退出码 0 自动关闭。
- No actionable P0, P1, or P2 findings remain.

## Follow-up polish

当前范围无需 P3 调整。

final result: passed
