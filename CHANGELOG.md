# Changelog

All notable changes to Quillite Markdown are documented here.

## [Unreleased]

### 简体中文

- 修复本地 assets、内嵌 Base64 和 PicGo Cloud 模式保存图片设置失败时没有可见提示的问题；四种模式共用错误提示区，保留当前选择并支持重试，重新打开或切换模式后清除旧提示。

- 补齐流程图和状态图新增节点后的同步聚焦，防止搜索输入意外改写节点名称；新增三类画布实际拖动、键盘、缩放、结构编辑和保存撤回回归。

- 修复插入图片、图表新增数据行和思维导图新增节点后延迟聚焦抢走其他输入框光标的问题，避免快速切换字段时文字写入错误位置。

- 修复表格设计器打开或新增行列后的延迟聚焦抢走用户已选单元格、导致快速输入落入表头的问题；刷新时同步定位，补充打开、新增行列与关闭重开的焦点和撤回回归。

- 修复高级源码手写公式编号后，编号输入框仍显示旧值、切换模式丢失手写编号的问题；只同步字段，不改写源码，补充中英文、两种分隔符、可视化修改、保存回读与撤回重做回归。

- 修复公式校验失败后，修正、插入成功或取消窗口仍残留旧警告的问题；只清理公式内容校验提示，保留其他操作的警告，补充中英文实际操作和提示归属回归。
- 修复图表 CSV／TSV 导入成功重试后仍显示“数据未应用”的旧提示；关闭图表窗口也会清理本次导入警告，补充12类图表的真实重试检查。

- 修复表格粘贴失败后成功重试仍残留“原内容未改变”警告的问题；只清除表格粘贴自己的旧提示，不影响其他警告或撤回历史，补充五类容器与失败输入的真实重试回归。

- 修复重命名后公式、图表、表格与脚注编辑入口仍绑定旧文档身份而失效的问题；刷新回调但保留正文、未保存状态和撤回历史。脚注控件在另存或重命名后更新操作上下文，新增含嵌套内容的隔离实操回归。
- 修复历史版本的异步选择与关闭重开竞态：只采纳当前文档、当前窗口和最后一次选择的响应；读取中或失败时禁止恢复旧版本，并校验返回版本的路径、标识和正文。新增中英文加载提示与恢复、撤回、文档切换及迟到保存回执的隔离实操回归。
- 修复“复制为纯文本”泄漏下划线、文字颜色等 HTML 标签及字符实体的问题；保留可见换行、图片说明和代码中的字面内容，复制为 Markdown 仍保留原始源码。补充源码／即时渲染右键复制与表格、容器、富文本粘贴回归。
- 编辑器延迟恢复焦点时检查当前文档是否仍获焦，避免复制后用户已切换到其他窗口／框架时抢回输入焦点。

- 修复3×3矩阵将 `f(x,y)`、分组或嵌套矩阵中的逗号误当列分隔符的问题；严格核对每行3项，保留错误输入并提供双语修正提示。矩阵／行列式／逆矩阵的单元格参数禁止注入外层行列指令，补充结构与撤回重做实操回归。

- 修复对数、梯度、特征值方程、平均数与条件概率模板的复合参数丢失分组、改变数学含义，以及平均数符号已有下标时重复下标的问题；新增独立预期源码和行内／块级／编号插入、回读、撤回重做实操回归。

- 修复公式窗口或模板切换后的延迟聚焦抢走已点击参数的光标，导致快速输入落入其他字段的问题；校验焦点来源、窗口可见性与会话，关闭／重开后旧请求失效。
- 修复重复点击当前行内公式排版后被误记为手动源码编辑，导致后续修改参数出现不必要覆盖确认的问题；保留原始源码与真正手动修改的确认保护。新增逐模板行内／编号参数、模式切换、原位编辑、取消及撤回重做实操回归。
- 修复跨区块 AI 替换时脚注／引用代码续行前缀重复添加的问题，保留回复中的更深缩进。补充反引号／波浪线围栏字面内容、完整块替换、跨块选择、真实双向鼠标拖选和撤回重做回归。
- 修复即时渲染的多行 AI 结果破坏表格、脚注和引用结构的问题：单元格／折叠标题保持单行，表格竖线转义，续行保留容器前缀，已有前缀不重复；编辑和校对均保持一次撤回，源码模式仍原样写回。修复 AI 校对等待设置期间切换文档后，旧响应在新文档打开窗口的问题。
- 补充 AI 工具栏的隔离界面回归：8 个入口、7 类嵌套选区、逐项接受、脱敏恢复、取消与旧校对结果保护。响应由本地模拟，不使用真实 Key 或上传文档；不将界面通过视为真实服务联通验证。
- 修复选中普通文字或 LaTeX 后直接确认公式不生效的问题：明确区分选中文字转换与已有公式编辑，保留已有公式原样保存的无操作语义。补充 30 个工具栏入口在宽／窄窗口下的应用、取消、撤回重做和继续输入实操，以及容器内选中文字转公式回归。
- 修复即时编辑的表格、折叠区和脚注缺少拼写标记及右键纠错的问题，统一映射主文档标记与位置；修复 emoji 后的错词偏移、脚注正文漏检与重新启用拼写检查不刷新。补充候选纠错、撤回重做、本文忽略、个人词典和美式／英式切换的隔离实操回归。
- 修复紧邻结束围栏的空代码块先回车／粘贴换行再输入时，文字粘连围栏并吞入后文的问题。独立保留代码正文换行与围栏分隔行，兼容容器前缀、撤回重做及继续输入；补充连续回车、波浪号围栏、清空重填、围栏粘贴与长行鼠标定位实操回归。
- 即时渲染代码块支持 Tab／Shift+Tab 增减缩进，保留双向选区、多光标、容器前缀与共享撤回／重做；Escape 返回正文，提供中英文操作提示。代码选区按实际文字测量，消除原生蓝色选区叠加与整行尾部着色。补充普通、引用、列表、折叠区、脚注及缩进代码的多行粘贴与连续输入回归。
- 即时渲染表格新增 TSV／规则 HTML 表格按行列粘贴、保留空值及有限自动扩展，兼容引用、列表、折叠区与脚注；保留未覆盖内容、列对齐／宽度和一步撤回。合并单元格、不规则或超限输入不修改原文。修复反向拖选粘贴后撤回／重做继续输入落在旧单元格光标位置的问题。
- 恢复窗口补全 Tab 焦点循环、Escape 和后台快捷键隔离；慢速恢复可取消，过期读取／新建回调不会替换新输入或解除后续恢复的忙碌状态。无法读取原文件时恢复到独立新草稿，保留新草稿修订和首次另存，不再误报原文件冲突。
- 启动旧草稿先保留为独立、只新增的本地恢复备份，再允许新编辑更新或清理当前快照；保存失败保留原材料。恢复提示不再自动抢焦点，通过顶部“恢复草稿”手动查看；“稍后处理”不删除备份，恢复前校验当前输入和文档会话。文档工具的“文档安全”可预览并另存旧草稿；备份最多 64 份／256 MiB，达到上限时停止覆盖并提示手动保存，不自动删除。
- 修复启动恢复旧文件夹覆盖刚选择的新目录、同一路径重新打开后旧列表迟到覆盖，以及刷新返回时切回旧侧栏的问题。资源浏览器独立校验请求顺序，保留最新列表与用户当前标签，过期失败不再打断新操作。
- 修复启动初始化较慢时，立即新建／打开文档被后到的启动文档抢占、已输入文字被替换的问题；用户操作始终优先，保留启动期间的最近阅读与置顶记录，延迟返回的启动模式不会干扰新操作。
- 修复多光标 Delete 合并引用／列表时隐藏前缀混入正文；按每处实际编辑区域处理并保留所有光标、主选区和一步撤回。修复表格／折叠区／脚注的多光标删除只移除半个隐藏格式标记，保留代码字面符号、表格边界和源码搜索语义；补充真实混合区域合并、继续输入及历史回归。
- 修复跨物理行选区铺满行尾、代码底色遮住选区及脚注内原生选区重复着色；按可见文字逐行测量并保留空行提示。修复删除行内代码边界后字面反引号等标点破坏渲染，以及 Delete 合并引用／列表时隐藏前缀进入正文的问题；补充真实双向拖选、连续删除、输入与撤回重做回归。
- 修复多行行内代码输入反引号、粘贴及换行后样式中断或文字误变标题的问题。逐行选择安全分隔符并保留字面内容、光标、引用／列表／脚注前缀；跨行应用及取消代码格式不再产生意外围栏，补充真实操作与撤回重做回归。
- 修复部分代码选区点击行内代码按钮插入可见反引号的问题：只取消选中部分，保留未选代码、边界空格及字面标点，同段多选一次处理。修复嵌套编辑区 Ctrl/⌘+D 无效。通过统一历史反向效果保留实际选区，修复反复撤回重做后格式按钮和换行失效，保持输入分组；补充真实双向拖选、多选及历史回归。
- 修复取消行内代码后重新应用显示多余转义符的问题：即时渲染仅解码解析确认的转义/实体，按字面反引号选择安全分隔符，保留边界空格及源码模式语义。行内格式记录操作后的实际选区，修复撤回重做后选区反转导致工具栏无效；补充正文、折叠区、表格和脚注双向选择回归。
- 修复行内代码输入反引号导致分隔符冲突、样式失效的问题；自动扩充分隔符并隐藏语义填充空格，保持字面内容、光标和历史。修复工具栏不能取消长分隔符代码，兼容脚注正文投影及续行缩进；补充真实输入、网址/邮箱编辑与双向拖选回归。
- 修复加粗、斜体、删除线、底色、颜色和行内代码等格式首尾退格/Delete 后露出半截源码的问题；成对清理被删除层的隐藏标记，保留外层格式、正文和历史，补充多光标与连续换行回归。
- 修复简写/折叠引用链接内部输入、删除或换行后失去原链接关系的问题，首次局部编辑固定原引用名称，保留共享定义、嵌套编辑与多光标。修复首尾删除隐藏链接标记留下另一半的问题，成对去除标记并保留文字；新增鼠标定位、连续输入、边界删除、继续输入及撤回重做回归。
- 修复跨格式删除或粘贴使折叠/简写引用链接失去原定义、自动链接遗留尖括号的问题。保留完整链接目标与邮箱语义，安全转义标签中的格式符号及实体，不创建嵌套可编辑链接；补充正文、折叠区、表格、脚注和跨段落的真实拖选回归。
- 修复跨行内格式选区粘贴、输入或删除导致格式标记残缺的问题，保留未选中文字、嵌套样式及链接目标。强调样式交界使用等价安全 HTML，避免连续星号歧义，并让工具栏识别这些等价格式；新增双向真实拖选、继续输入、撤回重做及格式取消回归。
- 修复隐藏格式交界的单行选区高亮铺满行尾；复用实际文字矩形绘制，并保留多选、双向文字与跨区块选区处理。
- 修复删空颜色、链接、行内代码及 HTML 行内样式后残留标签/反引号、继续输入继承旧样式的问题。仅清理本次编辑造成的空包装，保留共享链接定义、非空字面空格和原始源码编辑；覆盖嵌套包装与撤回重做。
- 修复即时渲染中按词删除或粘贴首尾空白使粗体、斜体、删除线和底色失效的问题。保持文字与空格，将边界空白放到标记外，清理删空的格式，并防止空白变成代码缩进/硬换行。保留嵌套样式、多选方向及撤回重做，修复脚注行首空白导致继续输入偏移，补充正文/表格/折叠区/脚注实操回归。
- 修复单元格/折叠标题多光标回车跳出编辑区、表格末尾空格被裁掉后丢失光标，以及引用/列表代码末尾空行输入破坏容器前缀的问题。保留单光标导航，补充多行粘贴、继续输入、撤回重做与隐藏格式换行后样式隔离的真实操作回归。
- 修复按词删除越过空表格、代码和脚注字段边界；沿用各平台快捷键。子编辑区自行添加的多光标完整同步到主文档，修复字面字段粘入富文本标记及撤回重做后继续输入落到旧位置，增加投影前缀和多选历史焦点回归。
- 修复混合多选富文本粘贴污染代码/注释的问题，按每处插入上下文选择富文本或纯文本，并兼容仅含 HTML 的剪贴板。修复删空区块后继续 Backspace/Delete 破坏表格、围栏及脚注前缀或删除后文的问题；保留原子语法与投影前缀。修正脚注等可编辑区块末尾光标和选区偏到下一行，补充混合粘贴、连续删除、继续输入与撤回实操回归。
- 修复渲染区块多选光标拉长、删除后空单元格定位和 Windows 多行粘贴后的光标偏移；坐标递归映射到实际子编辑区。多选回车/粘贴保留字段结构、表格竖线转义及代码/脚注前缀。增加删除、换行、双格式粘贴、继续输入和撤回重做回归。
- 修复嵌套可编辑内容缺少全量查询高亮、全部结果位于表格内时关闭面板丢失多选的问题。按原始源码匹配并逐层映射高亮与选区，保留正则上下文；跨组件批量字符输入统一修改所有选区并可撤回，表格竖线与折叠标题等字段规则保持有效，普通文本多选不被接管。增加 16 类混合/纯嵌套查找与批量输入回归。
- 修复表格、代码、折叠区块和脚注等子编辑区拦截全篇查找快捷键的问题；搜索跳转同步输入焦点，保留嵌套命中的临时显示状态，避免接着输入修改旧位置。关闭面板后 F3/Ctrl+G 仍能显示隐藏语法中的结果，普通鼠标定位恢复渲染。补充多层嵌套、正反向查找、紧接输入/撤回和隐藏地址回归。
- 修复即时渲染中查找命中隐藏链接地址却看不到结果的问题；将临时显示状态同步到表格、折叠区块等嵌套编辑区，关闭查找或普通鼠标定位后恢复隐藏语法。补充 12 类内容的真实查找、替换、撤回，以及两种编辑模式下的多结果、全字、大小写、正则和全部替换回归。
- 修复 C4 不同关系交叉时标签覆盖、长标签封住绕行出口以及人物形状连接无法绕行的问题；标签沿原线寻找空位，人物自环修正到身体外边界。人物文字按实际身体底色计算对比度，修复深色主题灰底黑字，并保留显式颜色。增加人物/外部人物、数据库、队列、长说明及交叉关系的真实填充几何和编辑往返回归。
- 修复 C4 重复长关系绕行后重叠、节点自连接退化为零长度的问题：统一同组标签间距、分开外侧通道，自环避让相邻标签。增加重复竖排、不同标签宽度、多重/双向自环、相邻节点及明暗主题编辑往返回归。
- 修复 C4 长连线及标签穿过中间节点：碰撞时搜索节点外折线路径，保留原始端点、箭头、源码及显式偏移；横纵留白分别计算，避免宽标签堵住竖排通道。增加横排、竖排、反向、多行、偏移与非动态关系的实际几何和编辑往返回归。
- 修复 C4 自定义连线颜色与箭头不一致：按关系颜色隔离共享箭头定义，保留箭头形状、方向及默认主题行为；增加混合颜色、反向、双向关系和主题/撤回往返实操回归。
- 改善 C4 默认节点文字对比度和边界可见性，将标签连线遮挡扩展到所有 C4 类型；修复显式边界文字颜色被固定灰色覆盖，保留用户指定的黑色、白色及其他文字/线条颜色。增加明暗主题下源码往返、修改、撤回和颜色保持回归。
- C4 卡片与原位编辑窗口按源码显示五种类型的中英文名称，不改变模板身份。动态图标签居中并保留显式偏移，背景遮挡连线，避免穿字；增加标签覆盖范围、节点避让及双语名称实际操作回归。

- 修复 C4Dynamic 同一起终点的多次交互被最后一条覆盖的问题；按源码顺序保留并编号，为重复／反向关系分开曲线和标签。保留箭头方向、技术说明和原文，默认动态曲线跟随主题，显式连线颜色不再被覆盖。

- 修复 C4 嵌套边界、组件及部署图内部纵向留白过大的问题；保留横向文字间隔，在布局计算时限制纵向间隔，节点与连线由引擎一致生成。增加五种 C4 类型及多行图的首屏、逐节点滚动、源码修改、返回、撤回重做与主题往返回归。

- 修复 C4 图首屏大量留白、主要节点落在滚动区下方的问题：压缩标题与图形间空白，整体平移节点、边界和连线并同步画布比例，不改源码；覆盖明暗主题、无标题、多行、前缀、源码返回和实际横向滚动。

- 修复图表前置注释、init 或 frontmatter 导致类型识别失效的问题；采用渲染引擎返回的类型并兼容宽度样式，恢复对应排版与流程图自动对比处理。使用引擎解析的配置保护显式文字色与主题 CSS，不修改源码。

- 修复 Mermaid 仅设置 themeVariables、未重复指定主题时节点文字不更新的问题；保留严格安全过滤，验证 init／frontmatter、多条配置合并、源码返回及后续图表配色隔离。兼容补丁在上游结构变化时阻断构建，避免静默失效。

- 修复 Mermaid 显式 base 主题的 primaryTextColor 被应用节点文字预设压住的问题；覆盖 init／frontmatter、明暗主题往返、源码返回和后续图表默认色恢复，不修改文档源码。

- 改善 Mermaid 流程图自定义纯色节点的文字对比：只在未指定文字色且对比不足时调整渲染文字，不改背景或源码；保留显式文字色和透明／复杂背景，增加明暗主题、返回源码及颜色保留回归。

- 修复图表源码选区回车丢失引用／列表前缀，以及连续回车在行首缩进中退出源码续行的问题；支持正反向和跨行正文选区，保留容器与独立撤回，不接管越过围栏或容器标记的结构性选择。
- 修复图表源码展开后继承引用斜体、列表粗体与引用背景的问题；完整显示首行前缀，使用等宽源码样式并保留当前行提示。显示、鼠标定位和键盘原子范围共用过滤结果，返回渲染不改正文及相邻内容样式。

- 修复紧凑引用图表无法即时渲染；原位修改逐行保留引用前缀与 Tab 缩进。修复展开图表源码后回车丢失引用／列表前缀、拆散图表的问题，续行保留代码缩进并支持独立撤回；增加七种前缀结构的真实操作回归。

- 删除嵌套图表后，将新光标的滚动请求逐层传递到主编辑区，避免视口停在文末、看不到继续输入的位置。复杂图表拒绝切换到可视化模式的通知也归属于本次弹窗，保存或取消后清理，保留其他操作的新警告。

- 引用块与列表内的 Mermaid／ECharts 围栏支持即时渲染和原位编辑，保存保留外层引用／缩进与相邻图表；不把公式、HTML 或代码示例中的围栏当作图表。补充复杂源码在折叠区块、HTML、脚注与引用容器内的编辑、取消、返回渲染、删除和撤回回归。

- 图表源码修正并保存成功或取消后，清除该图表的过期校验通知；按通知归属识别，保留其他操作后来产生的警告。甘特图排除日期、交替区域与已完成任务不再沿用固定白色／浅灰底，改为跟随明暗主题的中性色。

- 增加当前 22 种 Mermaid 模板的隔离实操往返回归，其中 11 种包含可视化字段／节点修改；覆盖源码保存、取消、非法输入、返回定位及撤回隔离，并可重复浅色和深色测试。

- 修复长图表查看源码后返回入口滚出视口的问题：图表接入编辑区顶部常驻“返回渲染”，同时正确收起因光标进入而展开的源码，不改正文或撤回历史；返回和修改后重做定位到图表可见起点，避免画面跳空；增加当前 ECharts 模板及复杂配置的源码往返回归。

- 修复深色图表数据校验文字对比度不足，以及错误输入框聚焦后边框恢复绿色的问题；保留明确错误边框和焦点环，并补充数据粘贴／系列增删的隔离浏览器回归。

- 图表数据校验失败时，插入／保存按钮与公式共用灰色禁用样式及禁止光标，修正数据后恢复；避免禁用按钮仍呈绿色可点击状态。

- 修复应用深色模式与系统主题不同时，可视化公式选中文字／空位仍显示黑色的问题；选区颜色明确跟随应用主题。

- 公式未填完或校验失败时，插入／保存按钮使用明确的灰色禁用样式与禁止光标，不再出现可点击的绿色悬停效果；校验通过后恢复原样。

- 增加可视化公式结构的隔离实操回归，覆盖结构按钮、空位填写、矩阵增删行列与三种输出模式的保存、取消和撤回。

- 增加按当前公式注册表运行的隔离浏览器回归脚本，检查块级插入、源码修改与往返、取消、撤回／重做及新文档历史隔离。

- 修复分隔线拖到极限后编辑区被压缩到几十像素、正文与操作入口被裁掉的问题；按实际可用宽度限制预览与编辑分栏，文档库拖宽也保留编辑空间。鼠标与方向键从当前可见位置调整，窗口收缩不覆盖宽度偏好，分隔线同步数值无障碍属性。

- 修复窄分栏编辑头部文字挤成竖排的问题：文件信息与操作区按可用空间换行，状态和按钮文字不拆行，长文件名保留省略与完整重命名入口；中英文和三种编辑布局共用自适应规则。

- 区块源码的“返回渲染”改为主编辑区顶部常驻入口，长内容和嵌套源码无需滚回起点。返回保留文本光标与选区，并在组件高度稳定后将光标保持在视口内；定位遇到新输入、滚动或换文档即停止，不写入撤回历史。

- 修复引用内标准折叠／HTML 正文区块显示源码的问题；字段映射保留原始引用与脚注前缀，支持标题、正文回车、内层代码／表格编辑、源码往返与共享撤回。独立解析周边文字，防止后续引用符号外露；代码示例中的结束标签不截断外层区块。

- 修复整块内容拖入脚注后与目标正文粘连的问题；段落分隔在统一应用目标投影缩进前生成，嵌套折叠正文中的脚注前缀及引用／列表归属保持。

- 修复深层嵌套区块跨区块编辑后撤回丢失键盘焦点、无法直接重做的问题；仅在历史操作导致编辑器焦点落空时恢复，保留其他控件焦点与只读／失效视图保护。

- 修复图片悬浮工具栏入场位移导致快速点击边缘点空的问题；保留淡入、悬停／聚焦显示和源码常驻返回，不移动可点击区域。

- 修复便携 Markdown 导出及跨目录另存漏处理脚注图片的问题。按脚注正文投影精确改写图片位置，保留容器与共享定义；在线、缺失和复杂图片不再绕过完整性检查，代码／公式／注释图片样例保持原文。便携导出增加异步文档会话保护。

- 修复新表格插入后脱离引用／列表或截断脚注的问题；按光标位置保留容器缩进与列宽元数据，正确处理列表文字开头和空行，保持后文与单步撤回。表格弹窗锁定打开时的选区并校验只读状态和文档快照。

- 修复顶部工具栏及“更多格式”的表格入口无法定位脚注内已有表格的问题。即时编辑和源码模式按脚注正文投影定位，引用、列表、折叠容器保留列宽、后续正文及精确撤回。

- 修复脚注内部定义不能被正文或其他脚注引用的问题。阅读、即时图片／链接及地址编辑共用全文定义索引，保留首次定义优先和精确源码位置；修改、删除首定义及撤回可同步刷新使用处，并排除代码、公式和注释中的伪定义。

- 修复脚注引用式图片在阅读区显示源码、引用式链接未渲染及 Ctrl/⌘+K 未识别已有链接的问题。脚注继承全文引用定义，定义变化同步刷新；地址／提示文字编辑保持引用关系、原始位置、会话保护和单步撤回。

- 修复脚注表格的“编辑表格”误打开空白新表格：按当前编辑区解析并映射回主文档，保留容器缩进、列宽、后续正文及单步撤回；重复保存未修改表格不增加撤回步骤。

- 即时脚注显示全文统一编号，支持点击／键盘编辑多行正文、删除单个引用与撤回；表格和折叠区块继承同一编号。编辑弹窗校验文档快照与会话，保留脚注标识和其他定义。阅读／编辑共用引用识别，排除代码、公式、图片属性和链接内的脚注样式文字。
- 脚注定义改为源码原位的可编辑编号区块，隐藏标识和续行缩进，保留精确字符映射；多行输入／粘贴不改其他定义，跨区块拖选剪切保留部分选中区块的结构，并支持撤回及源码往返。
- 修复脚注块级内容在阅读区变成普通文字；表格、代码、列表、块级公式及图表使用完整 Markdown 渲染。嵌套选区映射保留跨脚注替换时的表格／围栏结构，公式和图表保存保留外层缩进与撤回。
- 修复行内公式外层格式被过滤、标题回车后露出原始标记的问题；解析时隔离已识别公式中的 Markdown 标点并保留外围样式。公式在嵌套格式内继承文字字号与颜色；修复图片标签的等号导致外层高亮失效，并避免解析图片属性内的格式。
- 标题内链接分段保留地址、提示文字、引用定义及内外层样式；折叠／简写引用转为显式引用，自动链接的两段均保留完整目标。修复空引用 `[]` 不渲染、网址形状的链接文字被误认成目标地址，以及引用标识的实体字符匹配与阅读区不一致的问题。
- 修复标题中间回车后下划线式标题仍合并，以及加粗、高亮、颜色等样式被拆成源码的问题；分段保留标题前半段和正文后半段，在分界闭合／续接内联样式。Setext 规范化保留同一标题内多个光标的精确映射，转换与分段只占一次撤回。
- 修复多光标同时编辑标题、引用、列表和正文时，普通段落导致整组回车丢失引用／列表续行的问题；分别处理每个上下文并组合成一次事务，保留有序列表重编号、标题退格、隐藏标记原子删除和单步撤回。
- 修复下划线式标题转引用／列表时被拆散的问题；任务转换保留文字与复选框而不显示标题语法。即时渲染标题末尾回车在下划线后换行，开头退格恢复正文，保留容器、内联格式与单步撤回。
- Setext 下划线式标题按完整块切换级别或恢复正文，清理真实下划线并保留容器及相邻段落边界；多行标题的软换行合为空格、强制换行保留，重复选中同一标题只处理一次。安全行内 `<br>` 支持即时换行显示与两侧定位编辑，不暴露源码标签。
- 修复列表／引用内设置 ATX 标题时外层标记变成标题文字，以及格式刷对已有引用重复增加层级。嵌套格式按真实语法识别，代码／HTML 块与表格不被标题／引用操作改写；任务项转标题保留列表位置并可撤回恢复复选框。
- 标题、引用、列表与格式刷支持主编辑区全部选区，不再仅修改第一处；按行去重且保留未选中段落，列表父子缩进一次计算、编号不跨未选中条目串联。组合样式统一撤回；格式刷等待修饰键或拖选鼠标释放后再应用，颜色与行内样式叠加后的回车保留外层结束标记。
- 修复主编辑区多选文字仅第一处应用行内格式／颜色、其余选区丢失的问题；保留主选区、反向选择与单步撤回，即时渲染回车分别关闭格式后换行。默认颜色对未着色文字不写入标签，颜色替换只剥离完整平衡色块，防止把相邻色块误判成一层。
- 多选即时渲染文字时按可见文字测量简单选区背景，避免隐藏语法标记导致背景误铺至行尾；区块及跨行选区继续使用编辑器原有绘制。
- 修复阅读区含图片表格挤窄相邻文字列的问题：默认列宽与即时编辑保持稳定，保留手动列宽；单元格内图片组响应式折行、正文顶部对齐，带样式 HTML 同步布局规则，不修改 Markdown。
- 同排图片使用单一操作面板和明确的图片选择器，消除小图组与单图浮层重叠；支持 Enter 进入、Esc 返回、顺序键盘操作，并按编辑区及行号栏边界定位，图片离开可见区后隐藏面板。窄单元格自动折行，活动图片面板不再被相邻单元格遮挡。
- 修复单元格内多图调整布局后，查看源码再返回导致整表显示原始文本的问题；内部图片排版不再占用外层单元格映射。纯多图阅读与编辑布局一致，拆分／合并采用单元格内换行并保留精确撤回。
- 共享引用式图片支持完整、折叠与简写引用的即时渲染；嵌套表格／正文继承文档定义，修改地址或标题后同步刷新，删除定义后保留源码并可撤回。显示模式切换不把引用改写为直接地址，首个定义优先且不同文档相互隔离。
- 规则 GFM 表格的单元格可即时渲染行内公式、直接地址／HTML／内嵌图片，并支持原位修改、图片尺寸与对齐、源码返回和共享撤回；表格公式保存拦截破坏行列的输出并保留草稿。修复调整图片尺寸后焦点丢失、紧接着 Ctrl+Z 无效的问题。

- 修复跨正文删除部分表格后列宽被重置：将紧邻列宽元数据纳入表格区块，局部删除保护设置，整块移动／复制／删除包含设置，源码往返与撤回保持内容。

- 修复表格分隔行末尾空格／Tab 导致即时编辑退回源码，以及末尾 Tab 导致阅读区不显示表格的问题；统一编辑解析，仅对渲染输入处理分隔行，保留原文空白、代码示例与正文硬换行。

- 引用、列表和折叠正文中的规则 GFM 表格支持单元格即时编辑、跨格／跨块拖选和结构设计器；保存保留层级、对齐与列宽元数据，支持增删／拖排行列和单步撤回。宽表格限制在自身区域滚动，修复阅读区及样式 HTML 默认样式覆盖表格对齐的问题。
- 空格／Tab 缩进代码支持即时编辑，覆盖引用、列表及嵌套容器；换行保留原前缀，支持跨行／跨块拖选、源码返回及共享撤回。修复清空代码后焦点跳到下一行，以及引用内空代码导致渲染事务失败的问题。
- 修复窄编辑区图片对齐按钮覆盖“查看源码”、误触修改对齐的问题；单张图片操作使用可换行的统一悬浮栏，保留悬停／聚焦显示与源码常驻返回入口。
- 图片悬浮操作不再被小图／多图框裁切；图片框不再作为可滚动容器，避免聚焦浮层按钮时图片被内部滚动移位。
- 展开长图片源码后检查“收起源码”按钮的实际可见位置，必要时校正编辑区滚动，避免按钮被顶部工具栏遮住。
- 修复跨区块选区从代码开始时错误插入富文本标记，以及折叠／HTML 正文与表格单元格粘贴丢失格式的问题；按实际编辑区和选区起点分流，源码／行内代码和折叠标题保留纯文本，嵌套编辑共享撤回且不重复插入。
- 富文本中的显式换行保留为 Markdown 硬换行，不再被尾部空白清理吞掉，阅读预览保留分行效果。
- 修复跨区块多行粘贴破坏引用／列表代码缩进、反向删除丢失开头引用及父级列表标记的问题。保留必要结构而正常删除选中文字；保留原围栏位置供冲突加长，支持单步撤回，并统一空列表标记在编辑器和阅读预览中的解析。
- 引用／列表中的完整围栏代码支持即时编辑，按实际代码分段映射点击和选区；换行补齐容器前缀，合并行、源码往返及撤回保持内容。跨块拖动部分代码不再携带隐藏前缀，保留复制文字中的段落边界。
- 修复已选文字跨代码、正文、表格和嵌套编辑区拖动时误变为复制的问题；统一单步移动／撤回，保留复制修饰键、单元格转义及局部区块结构。切换文档后拒绝旧拖放，文件导入遮罩仅响应文件，不再遮挡文字落点。
- 修复完整区块拖入正文中间时段落粘连，以及从选中区块内部起拖不生效的问题；保留完整跨块选区、目标段落边界和单步撤回，并验证外部文字拖入代码。
- 修复完整区块拖入引用／列表后脱离原层级的问题；使用真实语法上下文保留引用前缀、嵌套／有序／任务列表续行缩进与单步撤回，避免拆散目标后半段及后续条目。
- 修复代码区输入或拖入结束围栏导致代码提前截断、后续正文被误吞入代码的问题；自动加长外层反引号／波浪线围栏，保留代码原文、光标和共享撤回，源码编辑保持原样。

- 修复跨块拖选到视口边缘无法继续滚动的问题；支持上下边缘持续滚动并保持选区起点，鼠标释放、Esc、窗口失焦、文档变化及编辑器销毁时停止待处理拖选。

- 修复鼠标跨代码／表格／嵌套正文拖选停留在内部、反向 Shift 点击丢失原选区起点的问题；鼠标选区沿用跨块输入结构保护，内外编辑区统一明暗主题选区高亮，保留单步撤回和单区域原生拖选。

- 修复网页／Word 富文本粘贴时纯文本与 Markdown 重复插入的问题；提前拦截已转换的粘贴，保留单步撤回及跨块结构保护，避免外层处理器抢走内部代码／表格的粘贴。

- 增加内部编辑区边界的 Shift 方向键连续选择；跨区块删除／替换保留部分选中区块的代码围栏、表格分隔符及 HTML 结构，完整选中的区块仍可删除。防止原生 DOM 选区重映射及输入差异把围栏混入正文，删除／替换后恢复内部文本焦点，并保留单步撤回重做。

- 修复代码／注释／折叠区块文本首尾的方向键无法进入相邻编辑区域的问题；表格边界左右按单元格顺序、上下按同列导航，进入隐藏折叠正文时自动展开。移动光标不修改 Markdown，保留选区和输入法正在输入时的原有处理。

- 折叠／HTML 区块支持混合图片、公式和图表即时渲染及原位操作；内外层明确分配预览范围，避免重叠显示。弹窗保存／主文档撤回同步内部编辑器时立即恢复图片与公式，不再等待延迟扫描闪回源码；显示模式、图表主题和另存路径上下文继续同步。

- 修复嵌套表格／代码的撤回重做和格式快捷键未传递到主文档、嵌套表格设计器无法打开及中文界面内部按钮显示英文的问题。隐藏有效表格的列宽元数据；表格编辑窗口增加文档会话与内容快照校验，拒绝过期覆盖并保留输入。

- 修复折叠区块在即时渲染中被拆成标题、正文及空白 HTML 片段的问题，支持标题／正文直接编辑、收起展开及源码返回。HTML 工具栏插入保留段落边界；独立注释提供可见编辑区。区块正文的格式末尾回车和连续空行不再破坏结束标记或丢失空行，统一使用主文档撤回历史。

- 新建引用式链接通过编辑窗口填写，定义追加文末并避开已有名称，防止吞入后文或覆盖共享引用。自动链接改用地址输入，校验 HTTP/HTTPS，改址保持自动链接语法，支持取消和单步撤销。

- 修复即时渲染隐藏新链接待填地址的问题，增加中英文链接编辑窗口，支持已有行内、自动及引用式链接的地址／提示文字修改；保留引用关系、无修改保存、取消和单步撤销，拒绝危险协议与过期文档修改。脚注定义追加到文末，防止段落后文被并入注释。

- 修复有序／无序／任务列表互换时旧标记残留、子项层级被编号宽度破坏的问题；保留引用容器、任务勾选及代码内容。格式刷增加色板颜色和任务列表识别，嵌套颜色按平衡标签解析，局部改色不再使外层颜色退回源码。

- 修复跨行选区截至下一行行首时，标题／引用／列表误改下一行；格式刷按解析后的实际样式识别叠加粗斜体及下划线等格式，避免重复包裹，行内与块级修改统一单步撤销，过期文档／会话不应用格式刷。

- 修复选中完整格式文字后再次点击行内格式按钮会重复叠加标记的问题；支持取消格式，粗体与斜体独立切换，保留选区并逐步撤销。

- 修复思维导图可视化编辑按固定空格数计算深度、把非标准缩进的后代压平的问题；按实际父子缩进解析。矩形、圆角和圆形节点的标识与形状在改名和调整归属后保留；注释、图标、类名及暂未支持的语法保持源码编辑，避免当成普通主题后损坏。
- 修复思维导图节点名称中的括号导致语法错误、引号和方括号被改写的问题；使用可往返的 Mermaid 文字编码保留原文、Markdown 标记及类似 HTML 的文字。补齐图表引擎 SVG 文本实体解码，在测量排版前还原文字且不执行 HTML；引擎升级时补丁不匹配会阻止打包。
- 固定内置甘特图范例的生成日期，避免跨日重新生成产生无关变更；用户新建甘特图仍按当天日期生成。
- 三类画布支持键盘切换节点／连线、Enter 选择或连接、F2 编辑文字、Shift+方向键移动、Alt+方向键平移和 Delete 删除；重绘保留焦点，全屏延迟回焦不抢占后续操作。画布提供对应图表类型的无障碍名称及快捷键说明。
- 修复画布自动排列把长链与宽层级挤成重叠节点的问题，按实际节点大小保留最小间距；状态图不再提供无法写入源码的连线样式。
- 修复思维导图超过五层时静默压平后代层级，以及删除中间主题后画布与源码的分支归属不一致；保留深层结构和根主题，删除后子主题上移到原父主题，连线提供明确的“移至根主题”操作，兼容取消与主文档撤销重做。
- 修复原位图表编辑把键盘焦点留在背景的问题，覆盖可视化、源码及仅源码模板；延迟回焦校验文档会话、编辑器、弹窗和当前焦点，避免抢走后续操作的焦点。编辑器内 Mermaid 不再受 370px 缩略图高度压缩，保留共享可读宽度并在图内滚动。
- 修复时间线可视化编辑后同一阶段的多条事件被拆成重复阶段节点的问题；保留原始事件分组，也保留用户显式创建的同名独立阶段，支持修改、增删及保存回读。
- 修复时序图可视化编辑把响应虚线箭头的一部分误当作参与者标识的问题；更改消息和箭头时保留正确的发起方、接收方，不支持的激活等语法继续保留源码编辑。
- 图表数据编辑出现无效输入时，插入／保存按钮同步禁用，修正后恢复；系列重命名同步更新表头、单元格无障碍名称及错误提示，保留当前输入焦点。
- 修复向量点积／叉积模板把普通字母参数与 LaTeX 命令粘连、导致修改后无法渲染的问题；叉积的复合操作数和角度保留完整分组，新增实际参数修改与回读验证。
- 修复光标进入任务行、普通列表或字符实体时控件退回源码并导致文字位移的问题；这些行内控件在光标移动和选区变化时保持排版，方向键跨过完整标记，复制仍保留原始 Markdown。补齐主编辑器的 Ctrl/Command+Shift+Z 重做，与首页提示及表格／代码内层编辑器一致。
- 修复任务列表正文中的高亮、下划线、上下标、键盘按键和文字颜色显示为源码的问题；统一任务与段落的行内格式处理，保留勾选框、嵌套任务、格式末尾回车续行及撤销，代码和公式不参与错误格式化。
- 修复图片“查看源码”后返回按钮被裁切、无法切回预览的问题：源码展开时在正常布局中常驻显示“收起源码”，隐藏无关图片操作；支持鼠标与键盘返回，保留图片内容与撤销记录。
- 修复选中文字并应用底色等行内格式后直接回车会删除文字、留下孤立标记并使整段误变标题的问题：保留工具栏临时选区的内容，在完整结束标记后换行；兼容叠加格式、颜色和撤销，手动重新选择、继续输入、输入法组合及源码模式仍保持原有替换行为。
- 修复即时渲染将工具栏文字颜色标签显示为源码的问题：复用统一色板，正确显示当前及旧版颜色，保留彩色文字的加粗／底色、直接编辑、换行和撤销；未知颜色与危险属性不作为样式执行。
- 修复即时渲染中格式文字末尾回车拆开隐藏结束标记的问题：删除线、加粗、斜体等格式保留在上一行，新行正常输入；兼容列表／引用续行、单步撤销重做，源码模式与表格单元格回车行为不变。
- 修复即时渲染中标题与正文的鼠标定位错位：表格、代码、公式和图表的垂直留白统一纳入可测量区域；点击隐藏标记旁的行首／行尾时，光标明确落在可见文字一侧，避免输入到标题符号前或破坏末尾格式。新增全文逐块点击、输入和撤回审计。
- 图表与公式选择列表为当前新增的 4 类图表、16 个公式模板显示火红色 NEW 徽标，与范例文档共用新增名单；支持搜索、分类及明暗主题。
- 优化直方图：明暗主题下用细边线区分同高相邻分箱，保持连续区间及原始频数；阅读时长范例补充分钟单位，数据编辑支持修改或清空横轴名称／单位。
- 修复即时渲染代码块输入时的滚动抖动：未变化的表格/代码块复用已测量高度，输入仅同步实际字符变更，并校验当前源码范围；增加逐帧与滚动写入回归，覆盖代码块底部点击、连续输入及长文档，防止“先跳走再跳回”的瞬时位移。
- 对齐图表选择弹窗中的搜索框、分类按钮和模板列表边缘，移除搜索区域重复的左右内边距。
- 修复日历热力图编辑后色标上限只升不降：自动范围随数值修改、删除、粘贴及重新打开同步更新，支持小数和全零数据；提供自动缩放开关，自定义固定范围仍保留。同步收缩跟随数据的日期范围，并回归其他统计图的数据更新及百分比固定刻度。
- 修复日历热力图数据被日历背景遮挡、色标端点重复和日期网格消失；保留用户指定的数值范围，默认日历色标不再强制开启拖动筛选。新增四类图表的真实 SVG 数据可见性回归，覆盖中英文、明暗主题和宽窄尺寸。
- 同步更新内置图表与公式范例，完整收录 41 类图表及 95 种公式；按用途与学科分类整理，新增项仅在标题末尾显示自绘火红色 NEW 圆角徽标，适配明暗主题，不依赖系统 Emoji，不显示新增说明或汇总，并通过生成文件与实际内嵌内容一致性测试防止范例遗漏。
- 新增默认即时渲染编辑与可记忆的源码切换：直接排版标题、行内格式、列表、引用、代码、表格、目录及分隔线。点击正文不再展开整行标记；表格单元格和代码原位编辑、精确字符定位，支持拖选、Tab 切换单元格、输入法组合及主文档统一撤回，避免点击后的排版跳动。表格/代码提供独立源码入口，表格结构沿用可视化设计器。切换不重建文档与撤回历史；保留图片/公式/图表预览和纯文本、复杂语法、大文档的源码回退，内嵌图片编码不计入 30 万字符正文上限。增加中英文界面及实际浏览器回归。
- 学科公式新增 16 个高频模板（共 95 个）：三角恒等式与和差倍角、集合与逻辑、多行对齐推导、三元方程组、样本协方差、标准误、均值置信区间、泊松分布及线性回归。继续支持行内、块级、编号和可视化编辑。
- 图表新增直方图、百分比堆叠图、横向排名图和日历热力图（共 41 个），支持中英文名称／用途搜索。直方图以原始样本分箱；百分比保留原始数值，零合计为零、负数拒绝。
- 为堆叠柱状图、面积图、组合图、正反向对比图、散点图和新增图表接入数据表格，支持多系列增删及 Excel／TSV／CSV 粘贴；导入失败保持原数据，保存前仍校验实际渲染与原文档快照。类图和实体关系图支持基础字段与关系表单，高级语法保留源码模式。
- 日历标签、空白单元格和网格使用主题配色；新增搜索、表格和导入控件适配白天／黑夜。图表导出继续使用白纸配色，不将夜间浅色文字直接导出到白底。

### English

- Show image-settings save failures in a shared status area for all four storage modes, including local assets, embedded Base64 and PicGo Cloud. Preserve the selection for retry and clear obsolete feedback when reopening or changing modes.

- Extended immediate node focus to flowcharts and state diagrams so typing into search cannot rename a node; added isolated canvas drag, keyboard, zoom, structure and save/undo regression.

- Fixed delayed autofocus after opening images, adding chart rows and adding mindmap nodes stealing a newer field selection and sending quick typing to the wrong input.

- Fixed delayed focus in the table designer redirecting fast input to a header after opening or adding rows/columns. Focus now moves with the grid update; regression checks cover opening, row/column insertion, reopening, and undo.

- Fixed stale number fields after manually editing equation tags in Advanced source, including losing the tag when switching output modes. Synchronization does not rewrite source; Chinese/English delimiter, visual-edit, save/reopen and history regressions cover the change.

- Fixed stale formula validation warnings after correction, successful insertion or cancellation. Only formula content-validation feedback is cleared; unrelated messages remain. Added Chinese/English interaction and warning-ownership regressions.
- Fixed stale “data was not applied” warnings after successful CSV/TSV import retries. Closing the chart dialog also clears its import warning; added actual retry checks across 12 chart types.

- Fixed stale “existing content is unchanged” warnings after a successful table-paste retry. Only the paste operation's own warning is cleared; unrelated notifications and undo history remain intact. Added real retry coverage across five table containers and rejected input types.

- Fixed equation, diagram, table and footnote edit actions retaining the old document identity after rename. Rebind actions without resetting text, dirty state or undo history; footnotes also refresh their action context after Save As. Added isolated UI regression coverage including nested content.
- Fix asynchronous version-history races: accept only the current document, dialog and latest selection. Disable restoring stale content while loading or after failure, validate returned version identity/content, and add bilingual loading hints plus isolated history, undo, document-switching and delayed-save interaction regressions.
- Fixed Copy as plain text leaking HTML formatting tags and character entities. Preserve visible breaks, image descriptions and literal code; Copy as Markdown keeps the original source. Added source/live context-menu copy and table/container/rich-paste regressions.
- Deferred editor focus restoration now checks document focus, so copying cannot pull input back after the user has focused another window or frame.

- Fixed 3×3 matrix templates splitting commas inside `f(x,y)`, groups or nested matrices into extra columns. Validate three entries per row, preserve invalid input and show bilingual correction guidance. Matrix, determinant and inverse cell parameters reject outer alignment commands; added structure and undo/redo interaction regressions.

- Fixed compound parameters changing mathematical scope in logarithm, gradient, eigenvalue, mean and conditional-probability templates; preserve grouping and avoid duplicate sample subscripts. Added independent expected-source checks and real inline/block/numbered insert, reopen and history regressions.

- Fixed deferred initial focus after opening the formula dialog or switching templates stealing the caret from a parameter the user has already clicked. Focus origin, dialog visibility and session checks prevent input going into another field and invalidate stale requests after close/reopen.
- Fixed clicking an unchanged inline equation layout being treated as a manual source edit, which caused unnecessary confirmation on subsequent parameter input. Exact source and confirmation for real manual edits remain protected; added per-template inline/numbered parameter, mode-switching, in-place edit, cancel and history regressions.
- Fixed duplicate continuation prefixes when AI replacements cross from footnotes or quoted code into prose, preserving deeper indentation in replies. Added UI regression for literal backtick/tilde fences, whole-block replacement, cross-block selections, real bidirectional mouse drags, and undo/redo.
- Fixed multiline AI results breaking live tables, footnotes, and quotes. Cells and collapsible titles stay single-line, table pipes are escaped, and continuation prefixes are preserved without duplication; edits and review fixes remain single-step undoable while source mode stays literal. Late AI review settings no longer open a dialog after switching documents.
- Added isolated AI toolbar UI regression for eight entries, seven nested selection contexts, partial acceptance, redaction restoration, cancellation, and stale-review protection. Responses are mocked locally without real keys or document uploads; UI passes do not certify live-provider connectivity.
- Fixed confirming a formula from selected plain text or TeX doing nothing. Selection conversion is now distinct from editing an existing formula, whose unchanged save remains a no-op. Added wide/narrow-window interaction coverage for all 30 toolbar entries and selected-text conversion inside containers.
- Fixed missing spelling marks and contextual corrections in live tables, collapsible sections, and footnotes by projecting authoritative document ranges. Fixed offsets after emoji, skipped footnote prose, and stale marks after re-enabling spelling. Added isolated interaction regressions for corrections, undo/redo, document ignores, personal words, and US/UK dictionaries.
- Fix Enter or trailing-newline paste into an immediately closed empty code block joining subsequent text to the closing fence and absorbing following prose. Preserve separate body and fence-separator newlines, container prefixes, undo/redo and follow-up input; add real tests for repeated Enter, tilde fences, clear/retype, literal-fence paste and pointer editing in long lines.
- Live code blocks support Tab / Shift+Tab indentation, preserving forward/reverse selections, multiple carets, container prefixes and shared undo/redo. Escape returns to the document, with bilingual keyboard hints. Code selections use measured text bounds instead of duplicate native highlights or full-width line-end fills. Add multiline-paste and follow-up typing regressions for plain, quoted, listed, details, footnote and indented code.
- Live tables accept TSV and rectangular HTML grids, retain empty cells, and expand within bounded dimensions, including quotes, lists, details and footnotes. Unchanged content, column alignment/widths and single-step undo are preserved; merged, irregular or oversized input is rejected atomically. Undo/redo now restores the focused cell caret instead of reusing a stale position after reverse-drag paste.
- Recovery now traps Tab focus, supports Escape and blocks background document shortcuts. Slow recovery can be cancelled; stale read/create callbacks cannot replace new input or unlock a later attempt. Unreadable sources recover into independent new drafts with their own revision and first-save picker, without false source-conflict warnings.
- Startup drafts are preserved as separate create-only local recovery archives before current edits can update or clear the active snapshot; preservation failures retain original material. Recovery uses a manual toolbar entry instead of stealing focus. Later keeps backups, and restoration checks current input and session. Document tools → Safety can preview and save preserved drafts separately. Archives are bounded to 64 entries / 256 MiB; reaching the limit blocks replacement and prompts manual saving without automatic deletion.
- Fixed delayed folder restoration overriding newly selected directories, stale lists replacing a reopened folder, and refresh responses switching back to a previous sidebar tab. Explorer requests retain the newest result and current tab, and stale failures no longer interrupt newer actions.
- Fixed delayed startup initialization overriding an immediate New/Open action or replacing newly typed content. User actions take precedence, recent and pinned entries created during startup survive, and late startup-mode responses do not interrupt newer actions.
- Fixed multi-caret forward joins leaking hidden quote/list prefixes into prose. Handle each editable field separately while retaining all carets, the main selection and one-step undo. Tables, details and footnotes now remove complete hidden style edges, preserving literal code punctuation, cell boundaries and source-search semantics. Added real mixed-field joins, follow-up typing and history regressions.
- Fixed multiline selection paint extending to the line end, opaque code backgrounds hiding it, and duplicate native selection coloring in footnotes. Measure visible text per physical line and retain empty-line indicators. Removing inline-code edges now preserves literal punctuation; forward joins remove hidden quote/list prefixes instead of inserting them into prose. Added real forward/reverse drags, consecutive deletion, typing and undo/redo regression checks.
- Fixed multiline inline-code edits, paste and Enter exposing delimiters or creating accidental headings. Each line uses safe delimiters while preserving literal content, carets and quote/list/footnote prefixes. Multiline application/removal avoids accidental fenced blocks, with real interaction and undo/redo regressions.
- Fixed inline-code toggles inserting visible backticks into partial selections. Remove only selected styling while preserving unselected code, edge spaces and literal punctuation, including multiple ranges in one span. Forward Ctrl/⌘+D from nested editors. Retain actual selections through public history inversion effects, fixing repeated undo/redo breaking formatting and Enter while preserving typing groups; add real selection and history regressions.
- Fixed extra escapes appearing when inline code is reapplied. Live mode decodes parser-confirmed escapes/entities and chooses safe delimiters while retaining edge spaces and literal source-mode behavior. Inline formatting records its actual resulting selection, fixing invalid ranges after undo/redo; add bidirectional selection regressions in prose, details, tables and footnotes.
- Fixed literal backtick input breaking inline-code delimiters. Widen wrappers and hide semantic padding while preserving content, caret and history. Allow toolbar removal of long-delimiter code, including projected footnote bodies and continuation indentation; add real typing, URL/email editing and bidirectional selection regressions.
- Fixed Backspace/Delete at inline formatting edges exposing unmatched markers in emphasis, highlights, colors, code and other supported styles. Remove only the paired formatting layer while preserving enclosing styles, text and history; add multi-cursor and consecutive-newline regressions.
- Fixed typing, deletion and newlines inside shortcut/collapsed reference labels losing their original link association. Preserve identifiers, shared definitions, nested editing and multiple cursors. Deleting a hidden link edge now removes its paired marker while retaining text; add mouse-placement, continuous-input, boundary-deletion and undo/redo regressions.
- Fixed cross-style deletion/paste breaking collapsed/shortcut reference links or leaving autolink angle brackets. Preserve complete destinations and email semantics, escape literal label punctuation/entities, and avoid nested editable links. Add real drag-selection regressions in prose, details, tables, footnotes and across paragraphs.
- Fixed partial inline-style selections leaving broken delimiters after paste, typing or deletion. Unselected text, nested styles and link targets remain intact. Equivalent safe HTML at emphasis seams avoids ambiguous delimiter runs and remains removable with toolbar toggles; added real bidirectional dragging, follow-up typing, undo/redo and toggle coverage.
- Fixed single-line selection highlights stretching to the line edge at hidden formatting boundaries. Measured text rectangles preserve multiple selections, bidirectional text and cross-block selection handling.
- Fixed empty colors, links, inline code and HTML inline styles retaining wrappers/backticks and leaking styles into subsequent typing. Remove only wrappers emptied by the current edit, retain shared link definitions, nonempty literal spaces and raw-source editing, with nested-wrapper and undo/redo coverage.
- Fixed word deletion and pasted edge whitespace breaking bold, italic, strikethrough and highlight in live rendering. Preserve text and spaces outside valid markers without creating indented code/hard breaks, remove emptied wrappers, and retain nested styles, selection direction and undo/redo. Fixed follow-up typing drift at new leading footnote spaces; added real-operation coverage in prose, tables, details and footnotes.
- Fixed multi-caret Enter leaving cells/section titles, caret loss when trimming active cell whitespace, and final blank-line typing before quoted/list code prefixes. Preserved single-caret navigation and added real multiline paste, follow-up typing, undo/redo and hidden-format newline isolation regressions.
- Protected empty table/code/footnote field boundaries during word deletion using platform-native shortcuts. Child-created multiple carets now synchronize to the authoritative document; fixed rich-text markers in literal fields and stale typing positions after undo/redo, with projected-prefix and history-focus regressions.
- Fixed mixed-selection rich paste leaking formatting markers into code/comments by choosing payloads per insertion context, including HTML-only clipboards. Repeated Backspace/Delete cannot escape emptied projected fields into table/fence/footnote structure or following prose. Corrected carets/highlights at editable block ends and added mixed paste, repeated deletion, follow-up input and undo coverage.
- Fixed block-height multi-carets, empty-cell positioning after deletion, and caret drift after Windows multiline paste by mapping coordinates to actual nested editors. Multi-selection newline/paste preserves field structure, escaped table pipes, and code/footnote prefixes, with deletion, clipboard, follow-up typing, undo and redo regression coverage.
- Fixed missing query highlights in nested editable content and loss of multiple selections when closing search with all results inside a table. Root-source matches and selections project through nested editors without inventing regex boundaries. Cross-widget character input updates every selected range in one undoable action while retaining table/summary field rules; ordinary text multi-selection keeps its existing input path. Added 16 mixed/nested-only search and typing regressions.
- Fixed document-wide search shortcuts being swallowed inside projected table, code, details and footnote editors. Navigation transfers keyboard focus and preserves temporary reveal intent so subsequent typing edits the found result, not the old location. F3/Ctrl+G still reveal hidden syntax after closing the panel; ordinary pointer placement restores rendering. Added nested navigation, immediate typing/undo and hidden-destination regressions.
- Fixed invisible search hits inside hidden link destinations in live editing. Temporary reveal intent reaches nested table/details editors and clears when search closes or ordinary pointer selection resumes. Added real find/replace/undo coverage for 12 content cases and next/previous, whole-word, case-sensitive, regex and replace-all checks in both editor modes.
- Fix overlapping captions at C4 crossings, long captions sealing route exits and routing failures around person shapes. Move captions along existing paths and correct person self-ports to the outer body boundary. Compute person text contrast against the actual body fill, fixing black text on dark gray while retaining explicit colors. Add actual-fill geometry and editing regressions for internal/external people, databases, queues, long descriptions and crossed relationships.
- Fix repeated long C4 relationships collapsing onto one route and self-relationships degenerating to zero-length paths. Share caption clearance across separate outer channels and route loops around adjacent captions. Add unequal-width, vertical, multiple/bidirectional self-loop, neighboring-node and light/dark editing regressions.
- Route obstructed C4 connectors and captions around intermediate nodes while preserving original ports, arrows, source and explicit offsets. Compute horizontal and vertical clearance separately so wide labels do not block stacked-node gaps. Add geometry and editing regressions for horizontal, vertical, reverse, multirow, offset and non-dynamic relationships.
- Match C4 arrowheads to custom connector colors using isolated marker definitions, preserving arrow geometry, direction and default theme behavior. Add mixed-color, reverse, bidirectional, theme and undo round-trip interaction regressions.
- Improve default C4 node-text contrast and boundary visibility, and mask connectors beneath captions across all C4 types. Fix explicit boundary text colors being overridden by hard-coded gray, preserving user-specified black, white and other text/stroke colors. Add light/dark source round-trip, editing, undo and color-preservation regressions.
- Show source-specific bilingual names for all five C4 families in live cards and in-place editors without changing template identity. Center dynamic captions while retaining explicit offsets and mask connector strokes beneath text; add browser checks for caption bounds, node overlap and bilingual names.

- Preserve repeated C4Dynamic interactions instead of replacing earlier events for the same endpoints. Keep source order and numbering, separate repeated/reverse curves and labels, retain arrow directions and technology labels, and respect explicit stroke colors while adapting default dynamic curves to the theme.

- Reduce excessive internal vertical spacing in nested C4 boundaries, component and deployment diagrams while preserving horizontal caption spacing and engine-computed connector endpoints. Add interaction coverage for all five C4 types and multirow diagrams, including initial visibility, scrolling to each node, source editing/return, undo/redo and theme round trips.

- Fixed excessive leading whitespace hiding C4 primary nodes below the initial scroll viewport. The drawing moves as one unit, preserving node/boundary/connector geometry and source while updating the canvas aspect ratio; regressions cover both appearances, untitled/multirow diagrams, prefixes, source return and real horizontal scrolling.

- Fixed leading comments, init directives and frontmatter bypassing diagram-type handling. Rendered engine types now select the appropriate layout, width rules and automatic flowchart contrast adjustment; engine-parsed foreground settings and theme CSS remain protected without modifying source.

- Fixed derived Mermaid node colors not updating when a diagram supplies themeVariables without repeating its theme. Strict security filtering remains intact; checks cover init/frontmatter, merged directives, source round trips and subsequent-diagram isolation. The compatibility patch fails the build if its upstream target changes.

- Fixed application node-text defaults overriding primaryTextColor in explicitly selected Mermaid base themes; added init/frontmatter, appearance round-trip, source-return and subsequent-diagram reset checks without changing document source.

- Improve text contrast on custom solid-color Mermaid flowchart nodes only when no foreground is specified and contrast is insufficient. Keep node backgrounds and Markdown intact, preserve explicit foregrounds and transparent/complex paints, and add theme-switch/source-return color-preservation regressions.

- Fix Enter replacing selected diagram source dropping quote/list prefixes and consecutive Enter inside indentation bypassing source continuation. Support forward, backward and multiline body selections with preserved containers and isolated undo; leave fence/container-marker-crossing structural selections to normal editing commands.
- Isolate exposed diagram source from quote italics, list bolding and prose backgrounds. Show complete opening prefixes in upright monospace with an active-line cue; rendering, pointer placement and cursor atoms share the same decoration filtering. Returning to rendered view preserves Markdown and neighboring prose styles.

- Render diagrams in compact blockquotes and preserve per-line quote prefixes and tab indentation on in-place edits. Enter in exposed diagram source now retains quote/list prefixes and code indentation instead of splitting the diagram, with isolated undo; added real-operation regressions for seven prefix structures.

- Deleting nested diagrams forwards the new caret's scroll request through projected editors to the main document, preventing the viewport from remaining at the document tail. Unsupported visual-mode warnings now belong to their diagram dialog and clear on save/cancel without dismissing newer unrelated warnings.

- Mermaid/ECharts fences inside blockquotes and lists now render and edit in place, retaining surrounding prefixes and neighboring diagrams. Fences inside math, HTML or literal code examples remain source. Added complex-source edit, cancel, source-return, deletion and undo regressions across details, HTML, footnotes and quote containers.

- Dismiss obsolete diagram source-validation notifications after a successful save or cancellation, using ownership to preserve newer warnings from other operations. Gantt excluded dates, alternate regions and completed tasks now follow light/dark neutral colors instead of fixed white/light-grey defaults.

- Added isolated UI round-trip coverage for all 22 current Mermaid templates, including visual field/node edits for 11 templates, source saves, cancellation, invalid input, return positioning and undo isolation in light or dark mode.

- Fixed selected equation text and slots remaining black when the app's dark theme differs from the system theme; visual equation selection now follows app colors.

- Fixed the return action scrolling out of view for long diagram source. Diagrams now use the persistent Return to rendered view panel, including source exposed by the caret, without changing document content or undo history. Returning and redoing edits target the visible start of the chart instead of scrolling to a blank area below it. Added source round-trip coverage for current ECharts templates and complex configurations.

- Fixed low-contrast chart validation text in dark mode and invalid fields reverting to green borders on focus. Error borders and focus rings remain visible; isolated browser coverage now includes pasted data and series additions/removals.

- Invalid chart data now uses the same muted disabled Insert/Save appearance and not-allowed cursor as formulas; correcting the data restores the normal action.

- Incomplete or invalid equations now show a muted disabled Insert/Save button and a not-allowed cursor instead of a clickable green hover effect; valid input restores the normal appearance.

- Added isolated real-input regression for visual equation structures, placeholder completion, matrix row/column actions, and save/cancel/undo across three output modes.

- Added an isolated browser regression driven by the current formula registry, covering block insertion, source editing and round trips, cancellation, undo/redo, and new-document history isolation.

- Keep usable editing space at split-divider and library-resize limits instead of clipping text and controls into a tiny strip. Mouse and arrow-key changes start at the visible divider; window constraints do not overwrite saved width preferences, and separator value attributes track the fitted range.

- Reflow the editor header to its pane width instead of squeezing status and action labels into vertical text. Document details and whole controls wrap while long names remain ellipsized and fully accessible in Rename, in both languages and all three editing layouts.

- Keep the block-source return action above the main editor scroller, including long and nested source views. Returning preserves text carets/selections and reveals the caret as widget heights settle; new input, user scrolling or a document switch cancels pending positioning without adding undo history.

- Fixed source fallback for standard collapsible/HTML content blocks inside quotes. Lossless fields retain quote/footnote prefixes for title, prose newline, nested code/table edits, source round-trips and shared undo. Parse surrounding prose independently so following quote markers remain hidden, and do not let literal closing tags in code truncate the outer block.

- Fixed whole-block drops joining destination prose inside footnotes. Paragraph breaks now receive the full destination projection indentation, including nested bodies and quote/list ownership.

- Fixed keyboard focus loss after undo rebuilt deeply nested editing blocks. Subsequent redo remains available; focus repair respects other controls, read-only state and stale views.

- Fixed missed edge clicks while image toolbars appeared: controls fade without sliding, retaining hover/focus visibility and the persistent source-return action.

- Fixed Portable Markdown export and cross-directory Save As skipping footnote images. Projected image ranges retain containers and shared definitions; remote, missing and complex sources no longer bypass completeness checks. Code/formula/comment examples remain unchanged. Portable export now guards asynchronous document sessions.

- Fixed new tables escaping quote/list containers or truncating footnotes. Insertion retains container indentation and width metadata at text boundaries and blank lines, preserves following text and supports single-step undo. The dialog captures its opening selection and validates read-only state and document snapshots.

- Fixed toolbar and More Formats table actions opening a blank table when the caret is inside a footnote table. Live and source editing resolve the projected body while preserving quote/list/collapsible containers, column widths, following text and exact undo.

- Fixed definitions inside footnotes not resolving from the main text or other notes. Reading, live images/links and destination editing share a document-wide definition index with first-definition priority and exact source coordinates. Edits, first-definition removal and undo refresh uses while excluding fake definitions in code, formulas and comments.

- Fixed reference images showing source in reading footnotes, missing reference-link rendering, and Ctrl/⌘+K failing to recognize existing footnote links. Footnotes inherit document definitions and refresh with changes; destination/title edits preserve references, original positions, session guards and single-step undo.

- Fixed Edit Table opening a blank table for tables inside footnotes. Tables are parsed in their current editing scope and mapped back to the main document, retaining container indentation, widths, following content and single-step undo. Saving an unchanged table again does not add an undo step.

- Render live footnotes with document-wide numbers, click/keyboard editing of multiline content, and undoable reference-only deletion. Tables and collapsible sections inherit the same numbers. The dialog validates document/session snapshots and preserves identifiers and other definitions. Shared recognition excludes code, equations, image attributes and link-contained footnote-like text.
- Render footnote definitions as editable numbered blocks at their source positions, hiding markers and continuation prefixes while retaining exact character mapping. Multiline input/paste preserves other definitions; cross-block drag selection and cutting retain partially selected wrappers, with undo and source-mode round-trips.
- Render full block Markdown inside footnotes instead of flattening tables, code, lists, display equations and diagrams into text. Compose nested source mappings to protect partial tables/fences in cross-footnote replacements; preserve outer indentation when saving formulas and diagrams, with undo.
- Fix inline-equation wrappers losing their styles and exposing raw markers after heading splits. Isolate Markdown punctuation inside recognized equations while preserving outer formats. Nested equations inherit text size and color; highlights accept equals signs in image attributes without styling the attributes themselves.
- Preserve link destinations, titles, reference definitions and nested styles when splitting headings. Expand collapsed/shortcut references and retain the full target for both autolink fragments. Fix collapsed-reference rendering, URL-shaped labels being mistaken for destinations, and entity-label matching that differed from the reading renderer.
- Fix underlined headings staying merged after Enter inside their text and inline styles breaking into raw syntax. Retain the leading heading and trailing prose, closing/reopening inline styles at the split. Setext normalization preserves multiple caret offsets within one heading and composes with the split into one undo step.
- Fix mixed live cursors losing quote/list continuation when any cursor is in ordinary prose. Handle each context separately and compose a single transaction, preserving ordered-list renumbering, heading Backspace, atomic hidden-marker deletion and one-step undo.
- Keep underlined headings whole when converting to quotes or lists; task conversion retains text and a checkbox without literal heading syntax. In live editing, Enter at the heading end moves past the underline and Backspace at its start returns to prose, preserving containers, inline formats and single-step undo.
- Convert Setext headings as whole blocks when changing level or returning to prose, removing their real underlines while retaining containers and neighboring paragraph boundaries. Join soft line breaks, retain explicit breaks and deduplicate selections in the same heading. Safe inline `<br>` tags render as live line breaks with editable text on both sides instead of showing raw tags.
- Fix ATX headings turning outer list/quote markers into heading text and repeated format painting adding quote levels. Detect nested block styles from parsed syntax; protect code/HTML blocks and tables from heading/quote commands. Converting a task to a heading keeps its list position and restores its checkbox on undo.
- Headings, quotes, lists and the format painter now handle all main-editor selections rather than only the first. Deduplicate selected lines, preserve gaps, calculate list indentation together and keep numbering separate across unselected items. Combined styles undo atomically; the painter waits for held modifiers or pointer selection to end, and Enter preserves closing outer color markers around stacked inline styles.
- Fixed inline formatting and text colors affecting only the main selection and dropping secondary selections in the main editor. Preserve the main range, reversed selections and single-step undo; live Enter closes each format before inserting a newline. Default color leaves uncolored text unchanged, and color replacement only unwraps complete balanced spans rather than adjacent independent spans.
- Measure simple live multi-selections from visible text to avoid highlighting to the line edge around hidden syntax; block and multiline selections retain the editor's existing rendering.
- Fix images squeezing neighboring table text into single-character columns in reading mode. Stable default columns retain explicit widths; image groups reflow within cells and prose stays top-aligned. Styled HTML shares the layout rules without changing Markdown.
- Image rows share one action panel with an explicit image picker instead of overlapping card/group overlays. Enter opens actions, Escape returns, and keyboard traversal remains available; the panel respects editor/gutter bounds and hides when its image leaves the viewport. Images wrap in narrow cells; neighboring cells no longer cover the active image panel.
- Fix multi-image cells falling back to raw table text after layout changes and source-return: nested image rows no longer claim outer table cells. Image-only cells share editing/reading layout; cell-safe separators support split/join and exact undo.
- Full, collapsed and shortcut image references now render in nested tables and bodies using document-wide definitions. Target/title changes refresh all uses; deleting definitions preserves editable source and supports undo. Presentation never rewrites references as URLs; first definitions win and documents remain isolated.
- Regular GFM cells render inline equations and direct Markdown/HTML/embedded images, with in-place editing, sizing/alignment, source return and shared undo. Formula saves reject output that would split table rows/columns while preserving the draft. Image sizing restores editor focus so immediate Ctrl+Z works.

- Fixed column widths resetting after partially deleting a table across prose. Adjacent width metadata now belongs to its table block: partial edits protect it, whole-block moves/copies/deletion include it, and source return and undo preserve content.

- Fixed trailing spaces/tabs on table delimiter rows disabling live editing, and trailing tabs preventing reading-side table rendering. Editor parsing is shared; delimiter normalization is render-only and preserves source whitespace, code examples and prose hard breaks.

- Added live cell editing, cross-cell/cross-block selection and structural editing for regular GFM tables inside quotes, lists and details sections. Saves retain container prefixes, alignment and width metadata; row/column changes and reordering share undo history. Wide tables scroll within their own area. Fixed default reading/styled HTML CSS overriding table alignment.
- Added live editing for space/tab-indented code, including quotes, lists and nested containers. Newlines retain their source prefixes; cross-line/cross-block selection, source return and shared undo are supported. Fixed focus moving to the following line after clearing code and rendering transactions failing on empty quoted code.
- Fix image alignment controls covering Show source in narrow editor panes and triggering the wrong action. Single-image actions share a wrapping overlay, retaining hover/focus disclosure and the persistent source return control.
- Keep image overlays accessible beyond small-image and grouped-image bounds, without making the image wrapper a scroll container that shifts its contents when controls receive focus.
- After expanding long image source, keep the return button within the visible editor viewport instead of leaving it clipped beneath the top toolbar.
- Fixed rich-text markers entering code through cross-block selections and formatting being lost in nested prose/table-cell pastes. Route by the actual editable field and insertion position; source/inline code and section titles retain plain text, while nested edits share undo without duplicate insertion.
- Preserve explicit rich-text line breaks as Markdown hard breaks instead of stripping them during trailing-whitespace cleanup, keeping reading-preview lines separate.
- Fixed multiline cross-block pastes losing code-container prefixes and reverse deletions removing opening quote/list markers. Preserve required structure while deleting selected prose, keep fence positions stable for collision repair and single-step undo, and align empty-list parsing between the editor and reading preview.
- Added live editing for complete fenced code inside quotes/lists with segment-based caret and selection mapping. Newlines preserve container prefixes; line joining, source round-trips and undo preserve content. Partial-code cross-block drags omit hidden prefixes while retaining paragraph boundaries in copied text.
- Fixed selected text being copied instead of moved between code, prose, tables and nested editors. Cross-editor moves now share a single undo step, preserve copy modifiers, cell escaping and partial-block structure, reject stale drops after document switching, and keep the file-import overlay out of text dragging.
- Fixed paragraph joining when whole blocks are dropped into prose and inactive drags starting inside selected blocks. Preserve the full cross-block selection, destination paragraph boundaries and single-step undo; verify external text drops into code.
- Fixed whole-block drops escaping their quote/list container. Preserve syntax-derived quote prefixes and nested/ordered/task list continuation indentation, remaining text, following items and single-step undo.
- Fixed literal closing fences prematurely ending live code blocks and swallowing following prose. Widen the outer backtick/tilde fences while preserving literal content, caret and shared undo; explicit source editing stays untouched.

- Fixed cross-block dragging stopping at viewport edges. Top/bottom edge scrolling preserves the selection anchor and stops on mouse release, Escape, window blur, document changes or editor destruction.

- Fixed mouse selections getting trapped inside code, tables and nested content, and reverse Shift-click losing the original selection anchor. Pointer selections now use cross-block input protection and consistent light/dark selection highlighting, retaining single-step undo and native dragging within one editor.

- Fixed duplicate plain-text and Markdown insertion when pasting rich HTML. Converted paste is handled before the native editor, remains a single undo step, and retains partial block structure without intercepting nested code/table clipboard behavior.

- Added Shift-arrow selection across inner editor boundaries. Cross-block deletion/replacement preserves the syntax of partially selected code, tables and HTML containers while allowing whole-block deletion. Prevented native DOM selection remapping and input diffs from inserting fence syntax into text; restored inner focus after edits and kept single-step undo/redo.

- Fixed arrow navigation getting trapped at code/comment/collapsible text boundaries. Table boundaries navigate in cell order horizontally and by column vertically; entering collapsed content expands it. Navigation does not change Markdown and leaves existing selections and active composition to their normal handlers.

- Collapsible/HTML blocks now render and edit mixed images, equations and diagrams in place with explicit preview ownership. Synchronizing dialog saves or main-document undo refreshes inner images and equations immediately instead of briefly exposing source. Display modes, diagram themes and Save As path contexts stay synchronized.

- Fixed undo/redo and formatting shortcuts inside nested tables/code, in-place table designer targeting, and untranslated nested controls. Valid table-width metadata stays hidden. Table dialogs validate the document session and source snapshot before saving, preserving input when the target has changed.

- Keep collapsible sections intact in live editing, with directly editable titles/bodies, collapse/expand and a return-from-source action. HTML insertion preserves paragraph boundaries; standalone comments remain discoverable in the editor. Formatted line breaks and consecutive blank lines inside blocks preserve delimiters and use the main document's undo history.

- Create reference links through the link editor with unique names and end-of-document definitions, preserving following text and existing references. Autolinks use an address-only editor with HTTP/HTTPS validation, stable syntax on URL changes, cancellation and one-step undo.

- Add a bilingual link editor so live rendering no longer hides the destination being entered. Edit existing inline, automatic and reference links while preserving shared definitions, no-op saves, cancellation and one-step undo; reject unsafe protocols and stale documents. Append footnote definitions at the document end without absorbing paragraph suffixes.

- Replace old markers when converting ordered, unordered and task lists, adjust child indentation for marker width, and retain quote containers, existing checks and code content. Format painter supports palette colors and task lists; balanced nested color spans preserve surrounding styles during partial recoloring.

- Exclude the untouched next line from heading/quote/list formatting when a selection ends at its start. Format painter reads parsed combined styles, avoids duplicate wrappers, groups inline/block changes into one undo step and rejects stale document sessions.

- Toggle whole inline-format selections instead of adding duplicate wrappers. Preserve independent bold/italic styles, text selections and separate undo steps.

- Fix mind-map visual editing flattening descendants with nonuniform indentation. Resolve parents from relative indentation and preserve square, rounded and circular node IDs/shapes through label and parent changes. Comments, icons, classes and unsupported syntax remain in source mode instead of being corrupted into plain topics.
- Fix parentheses breaking mind-map syntax and quotes/brackets being silently rewritten. Round-trippable Mermaid text escapes preserve literal labels, Markdown markers and HTML-like text. Complete SVG text entity decoding before layout without interpreting HTML; packaging fails if an engine upgrade invalidates the guarded compatibility patch.
- Pin the generated Gantt reference date to avoid day-dependent documentation changes; newly created Gantt diagrams still use today's date.
- Add keyboard node/edge navigation, Enter selection/connection, F2 label editing, Shift+arrow movement, Alt+arrow panning and Delete actions to all three canvases. Preserve focus across redraws without delayed fullscreen focus stealing; expose type-specific canvas names and keyboard instructions.
- Fix automatic canvas layout squeezing long chains and wide ranks into overlapping nodes; minimum spacing uses actual node sizes. Hide state-transition line styles that cannot be serialized.
- Preserve mind-map hierarchies deeper than five levels and keep canvas/source parentage consistent after deletion. Keep the root, move surviving children to the removed topic's parent, and offer an explicit Move to root action for connections, with cancel and document undo/redo support.
- Fix in-place diagram editing leaving keyboard focus in the background, including visual, source and source-only templates. Deferred focus restoration checks the document session, editor, dialog and current focus before returning. Editor Mermaid SVGs retain their shared readable width in a scrolling viewport instead of being squeezed into a 370px thumbnail.
- Preserve timeline event groups during visual editing instead of splitting a period into duplicate nodes. Explicit same-name period nodes remain separate through edits, row changes and save/reopen.
- Fix sequence visual editing consuming part of a dashed response arrow as a participant ID. Message and arrow edits preserve the correct endpoints; unsupported activation and other syntax stays in source mode.
- Disable chart insert/save actions while structured data is invalid and restore them after correction. Renaming a series updates headers, accessible cell names and validation labels without rebuilding or blurring inputs.
- Fix edited plain-letter operands merging with LaTeX commands in dot/cross-product templates. Preserve grouping for compound cross-product operands and angles, with parameter-editing and round-trip coverage.
- Kept task checkboxes, bullets and decoded entities rendered while moving the caret or selecting text, avoiding source expansion and text shifts. Keyboard navigation treats their source markers atomically; copying retains Markdown. Added Ctrl/Command+Shift+Z redo to the main editor in both display modes, matching the shortcut guide and nested table/code editors.
- Fixed custom inline formatting appearing as source inside task lists: highlights, underline, superscript/subscript, keyboard keys and text colors now share prose rendering, preserving checkboxes, nested tasks, formatted-line Enter continuation and undo while excluding code and formulas.
- Fix the return control being clipped after showing image source. Keep “Hide source” visible in normal layout while source is open and hide unrelated image controls; mouse and keyboard restore the preview without changing image content or undo history.
- Fix pressing Enter immediately after applying inline formatting to selected text deleting that text and leaving orphan markers that turn the paragraph into a heading. Preserve toolbar-retained selections and break after complete closing markers, including stacked formats, colors and undo; manual reselection, typing, composition and source-mode replacement remain unchanged.
- Fix toolbar text-color tags appearing as source in live editing. Reuse the shared palette for current and legacy colors, preserving bold/highlight combinations, direct editing, newline and undo; unknown colors and unsafe attributes are not executed as styles.
- Fix Enter at the visible end of formatted text splitting hidden closing markers in live editing. Preserve strikethrough, bold and other inline formatting on the previous line, with list/quote continuation and single-step undo/redo; source mode and table-cell Enter behavior are unchanged.
- Fix mouse caret placement in live-rendered headings and prose: include vertical spacing for tables, code, formulas and diagrams in measurable boxes. Bias clicks at hidden line-prefix/suffix markers toward visible text, preserving heading prefixes and trailing formatting. Add whole-document block-by-block click, input and undo audits.
- Show fiery-red NEW badges beside the 4 new chart and 16 new formula templates in the pickers. Share the addition list with reference documents, including filtered searches/categories and light/dark themes.
- Improve histograms with theme-aware thin bin outlines that distinguish equal-height neighbours without changing intervals or frequencies. Add minutes to the reading-duration sample and allow editing or clearing horizontal-axis labels/units.
- Fix scroll jitter while typing in live-rendered code blocks: retain measured heights for unchanged tables/code, forward only actual character edits and validate the current source range. Add animation-frame and scroll-write regressions for caret placement, repeated typing and long documents to catch transient jump-and-return motion.
- Align the diagram catalog search field, category buttons and template list by removing duplicate horizontal search padding.
- Fix calendar color scales that only expanded after edits: automatic ranges now shrink or grow after editing, deleting, pasting and reopening, including fractional and zero data. Add an auto-scale toggle while retaining custom fixed domains. Keep data-derived date ranges in sync and regression-test other statistics charts and intentional percentage scales.
- Fix calendar heat cells hidden behind the background, duplicated legend endpoints and missing grid strokes. Preserve custom value ranges and default calendar legends to non-filtering. Add real SVG visibility checks for all four new charts across languages, light/dark modes and narrow/wide sizes.
- Refresh bundled chart/formula examples to cover all 41 charts and 95 formulas, grouped by purpose and discipline. New headings use a custom fiery-red rounded NEW badge with light/dark styling instead of system emoji, without release summaries or additional labels. Check generated and embedded references for stale content.
- Add default live-rendered editing and a remembered Source switch for headings, inline formats, lists, quotes, code, tables, TOC and rules. Keep prose markers hidden on click; edit table cells and code in place with precise caret placement, drag selection, Tab navigation, IME protection and shared document undo, avoiding click-induced layout jumps. Provide explicit source actions and retain the table structure designer. Mode changes preserve text, selection and undo history. Retain image/equation/diagram previews and source fallback for plain text, complex syntax and large prose; embedded image payloads do not count toward the 300,000-character prose limit. Include bilingual controls and real-browser regression coverage.
- Added 16 formula presets (95 total): trigonometry, sets and logic, aligned derivations, three-equation systems, sample covariance, standard error, mean confidence intervals, Poisson distribution and linear regression. Inline, display, numbered and visual editing remain available.
- Added histogram, 100% stacked bar, horizontal ranking and calendar heatmap templates (41 total), with bilingual name/purpose search. Histograms bin raw observations; percentage charts retain raw values, keep zero totals at zero and reject negatives.
- Added data tables for stacked bars, areas, combo charts, diverging bars, scatter plots and new charts, with multi-series editing and Excel/TSV/CSV paste. Invalid imports preserve drafts; saves still verify rendering and document snapshots. Basic class/ER fields and relations gain forms; advanced syntax stays source-only.
- Theme-aware calendar labels, empty cells, grids and new controls support light/dark mode. Image exports retain paper-safe colors.

## [2.7.8] - 2026-10-13

### 简体中文

- 插入图表后自动收起源码并显示图表，光标停在图表后的空行，可继续输入；保留“查看源码”和全局源码模式，不更改 Markdown 内容。
- 补充可选故障日志的前端构建指纹、编辑器初始化阶段与源码降级状态，接入 CodeMirror 内部异常回调；超长日志明确标记截断并保留完整 UTF-8 字符。不采集正文、路径、密钥或操作轨迹，继续受产品改进开关控制，兼容现有官网日志接口。
- 增强运行时错误恢复：Windows 拖放过滤无效条目，虚拟文件路径解析失败时提示先保存到本地；启动文档或文件夹失效时保留当前内容并提示，不再冒泡为未处理 Promise。编辑器显示扩展触发 `isEmpty` 初始化错误时，本次运行退回源码编辑，保留正文、保存与撤回，不修改显示偏好；其他加载失败允许重试。更新下载超时显示重试／官网下载指引，并检查下载文件落盘结果，不放宽冲突、校验或删除边界。
- 修复统计图表编辑与保存：饼图保留零值行，空白、无效、非有限和超范围数值提示具体位置并保留草稿与上次有效预览；同步更新图例名称及选择状态，修正中英文瀑布图期末值与下降柱基线。保存前使用实际安全渲染校验，失败不替换原图；检查期间切换文档、修改草稿或关闭窗口均不提交过期结果。
- 编辑器内默认显示 Mermaid／ECharts 图表，选中、悬停或键盘聚焦时就近显示“编辑图表／查看源码”，支持双击与 Enter 打开现有画布／数据编辑；移除右上角重复入口。源码展开／收起不改正文，复制保留 Markdown，删除及原位修改可单步撤销；未修改保存保留原文，过期编辑拒绝写入并保留弹框输入。
- “更多 → 编辑布局”可切换并记忆图表显示／源码。仅编辑模式仍可看图；只绘制挂载且接近视口的图表，隐藏编辑器时取消并释放实例。错误或超限保留源码，不强行转换引用／列表或不完整围栏。最多 64 张图表、单图 2 万字符，超过 30 万字符的文档保留源码。不新增文件或目录删除操作。

### English

- Keep newly inserted diagrams rendered with source collapsed and the caret on the following blank line. Retain Show source and the global source mode without changing Markdown content.
- Add opt-in error diagnostics for the frontend asset fingerprint, editor initialization stage and source-fallback mode, including CodeMirror's internal exception callback. Mark truncated logs explicitly without splitting UTF-8 characters. No document content, paths, credentials or activity history are added; retain the existing privacy switch and website API.
- Improve runtime recovery: filter invalid Windows drop items and explain how to handle virtual files without disk paths. Missing startup documents/folders no longer become unhandled promises or replace current content. Recover from display-extension `isEmpty` initialization failures with session-only source editing, retaining text, save and undo without changing display preferences; other initialization failures can be retried. Provide actionable update-timeout guidance and check downloaded-file flush/close results without weakening conflict, integrity, or deletion safeguards.
- Preserve zero-valued pie rows, reject blank/non-finite/out-of-range chart numbers with field-specific feedback, and retain drafts and the last valid preview. Synchronize renamed legend entries and selection state; correct waterfall totals and loss baselines in both languages. Validate saves through the actual safe renderer and reject failed or stale results after document/draft/dialog changes.
- Render Mermaid/ECharts diagrams directly in the editor with local Edit/Show source actions on selection, hover or keyboard focus. Double-click or Enter opens the existing canvas/data editor; remove the detached floating action. Source toggles preserve text, copy retains Markdown, and deletion/in-place changes are individually undoable. No-op saves retain exact source; stale edits refuse writes and keep the dialog draft.
- More → Editor layout remembers rendered/source diagram display, including editor-only mode. Render only mounted near-visible diagrams and cancel/dispose when the editor is hidden. Errors and limits retain source; ambiguous quote/list containers or incomplete fences are never forcibly converted. Limit to 64 diagrams and 20,000 characters per diagram; documents over 300,000 characters retain source. No new file/directory deletion operations.

## [2.7.7] - 2026-10-10

### 简体中文

- 修复行内公式含嵌套美元符号时弹窗预览正常、保存后被 Markdown 拆成错误公式的问题：模板、源码、可视化预览及按钮／快捷键保存共用实际分隔符解析校验；冲突时保留输入并提示块级或 `\(...\)`，不自动改写公式，无新增文件或目录删除操作。
- 编辑页标题区与格式工具栏进一步紧凑化，并优先直接显示“公式”“图表”等高频功能；粗斜体与下划线改为和其他格式工具一致的紧凑图标，减少进入“更多格式”的次数。
- 编辑器内公式操作恢复“修改公式／查看源码”文字按钮及原有悬浮样式。
- 修复公式审计发现的三项问题：深度嵌套 Markdown 扫描超限或失败时保留源码编辑、不使用部分定位结果；合法正文和注释中的 `katex-error` 不再误判为语法错误；预览与保存统一按最终行内／块级／编号输出校验，快捷键不能绕过错误检查。不新增文件或目录删除操作。
- 图片预览工具栏新增自定义宽高：宽度支持百分比或像素，高度可保持原比例自动计算或指定像素值，并可一键恢复原始尺寸。图片操作默认隐藏，鼠标悬停、键盘聚焦或触屏点击时以不挤压版面的浮层显示；修改使用标准 HTML 图片属性、单步可撤销，多图同排及阅读预览、样式 HTML、PDF 均保留尺寸，不修改或移动图片文件。
- 修复插入较大的内嵌 Base64 图片后，图片编码被计入公式预览性能阈值、导致同一文档中的公式全部退回源码的问题；公式扫描会跳过图片编码，同时保持原文、公式位置和撤回历史不变。
- 插入图片窗口醒目标注支持 4 种存储／图床方式，并直接列出本地 assets、内嵌 Base64、PicGo Cloud 与本机 PicGo；设置按钮同步改为“设置 4 种图片方式”，避免把本地与内嵌方式误解成只能配置图床。
- 收紧公式窗口标题、说明和排版选项，宽窗口将插入方式与行内排版并排展示，窄窗口自动换行；为可视化编辑与实时预览保留更多空间，不缩小公式或改变内容。
- 行内公式新增“常规排版／大号排版”，大号展开分数与求和符号但仍留在正文行内，编辑器与预览一致；使用标准 LaTeX `\displaystyle` 保存，仅作用于当前公式，可切回常规，不批量改写已有文档。

- 移除编辑器右上角重复的“编辑当前公式”浮动入口，保留每个公式旁的“修改公式／查看源码”、双击和回车编辑；排版模式下操作按钮仅在悬停或获得焦点时显示，图表编辑入口不受影响。
- 修复公式可视化输入继承页面禁止选择样式，导致鼠标点击不能定位的问题；分子、分母、上下标和矩阵单元支持点击定位输入。浏览器回归加载实际应用样式，避免独立测试页漏掉该冲突。
- 公式窗口默认采用离线可视化编辑，可修改分子／分母、上下标、矩阵单元并插入常用结构，支持矩阵增删行列和撤销／重做。模板参数保留，源码收进“高级”；化学内容保留参数输入，复杂、含注释或超限的公式安全回退源码。未改动／撤销保留原文；异步载入核验窗口会话，重新打开重置独立撤销基线。增加全部 79 个模板的逐项浏览器与三种输出方式回归。
- 编辑器内公式默认按预览效果排版显示，支持行内／块级／编号与化学式；双击或选中后回车打开原位编辑，查看／收起源码不改正文。复制保留 Markdown，删除可撤销；错误公式显示源码和提示。更多 → 编辑布局可切换并记忆公式排版／源码，仅编辑模式同样可用。最多排版 256 个公式，30 万字符及以上保留源码以控制开销。
- 修复多行公式行内输出与预览不一致：阻止无效行内插入并保留源码，提示改用块级／编号。梯度按实际变量列表生成偏导，二重积分分别生成两个微分项；泰勒展开独立设置函数名称和自变量，并对复合展开点分组。无效变量提供双语提示，不改动已有文档公式。
- 公式模板新增中英文名称、学科和关键词搜索，提供结果数量、无结果提示、一键清除与窗口内 Ctrl/⌘+F。搜索和学科切换仅筛选列表，不再自动更换当前公式或覆盖草稿。
- 修复长公式编辑时被裁剪、预览双击定位到错误公式、旧公式窗口跨文档写入，以及数字／复合参数拼接改变数学含义的问题。保存核验文档会话和原文快照，未修改的公式保持原始源码；无法可靠定位时不替换内容。
- 自定义公式改为多行编辑；手动源码切换行内／块级／编号时保留表达式，切换模板前确认。块级插入与转换保留引用／列表结构；错误或超限公式保留源码，HTML／PDF 导出不再静默清空。缓存公式索引，避免每次移动光标重复解析。无新增文件或目录删除操作。

### English

- Fix nested dollars passing inline equation preview but splitting into invalid formulas after saving. Template/source/visual previews and button/shortcut submission share actual Markdown delimiter validation. Conflicts retain the draft and guide users to Display or `\(...\)` without rewriting equations or adding file/directory deletion operations.
- Make the editor header and formatting toolbar more compact, prioritize direct access to frequently used Formula and Diagram actions, and present Bold Italic and Underline as compact toolbar icons consistent with the other formatting tools.
- Restore the rendered equation's Edit/Show source text buttons and original floating style.
- Fix three equation-audit findings: excessive or failed Markdown scanning retains editable source without partial location results; legitimate `katex-error` text/comments are not syntax errors; preview and all save paths validate the final inline/display/numbered output, so keyboard shortcuts cannot bypass validation. No new file or directory deletion operations.
- Add custom width and height controls to the image preview toolbar. Width accepts percent or pixels; height can preserve the original aspect ratio or use an explicit pixel value, with one-click reset. Image actions stay hidden until hover, keyboard focus or a touch tap, then appear as an overlay without reflow. Standard HTML image attributes keep edits undoable and preserve sizing in image rows, reading preview, styled HTML and PDF without modifying or moving image files.
- Fix formulas falling back to source after a large embedded Base64 image pushed the document past the formula-preview performance threshold. Formula scanning now skips encoded image payloads while preserving the original document, exact formula offsets, and undo history.
- Highlight all four image storage/hosting methods in the Insert Image dialog—local assets, embedded Base64, PicGo Cloud and local PicGo—and rename its settings action so local and embedded modes are not mistaken for hosting-only options.
- Compact the equation dialog header, guidance and layout controls. Arrange output and inline-layout options side by side when space permits and wrap on narrower windows, leaving more room for visual editing and live preview without scaling or changing equations.
- Add Normal/Large layout for inline equations. Large layout expands fractions and sum symbols without moving equations to a separate line; editor and preview stay consistent. Persist standard LaTeX `\displaystyle` per equation, allow switching back and never rewrite existing documents in bulk.

- Remove the duplicate floating equation-edit button. Keep per-equation Edit/Show source actions, double-click and Enter editing; rendered equation controls appear on hover or focus, without affecting diagram editing.
- Fix visual equations inheriting non-selectable application chrome, which blocked mouse caret placement. Enable click-to-edit inside fractions, scripts and matrix cells; browser regression now includes the real application stylesheet.
- Default to offline visual equation editing for fractions, scripts and matrix cells, with common structure insertion, matrix row/column operations and undo/redo. Retain template parameters and collapse source under Advanced; chemistry keeps parameter input and complex/commented/oversized input falls back safely. Preserve unchanged source, guard asynchronous dialog sessions and reset undo baselines on reopening. Add per-template browser and three-output-mode regression coverage for all 79 templates.
- Render equations inside the editor using the preview styling, including inline/display/numbered and chemistry formulas. Double-click or select and press Enter to edit in place; showing/hiding source never changes the document. Copy retains Markdown and deletion is undoable; invalid equations retain source with guidance. More → Editor layout remembers rendered/source display, including editor-only mode. Limit previews to 256 equations and retain source for documents with 300,000+ characters.
- Prevent invalid multiline inline equations while preserving source and guiding users to Display/Numbered output. Generate gradients from the actual variable list and both differentials in double integrals. Taylor series now uses separate function-name/variable fields and groups compound expansion centers. Invalid variable names show localized guidance; existing document equations are not rewritten.
- Add equation-template search by bilingual names, subjects and keywords, with result counts, empty-state guidance, Clear and dialog-scoped Ctrl/⌘+F. Search and subject changes only filter the catalog, without switching the current equation or overwriting drafts.
- Fix long-equation truncation, incorrect preview-to-source mapping, stale cross-document equation writes, and numeric/compound operand concatenation. Saving verifies the document session and original editor snapshot; no-op edits preserve source exactly, and ambiguous mappings never replace content.
- Add multiline custom equation editing, retain manually edited source when changing output modes, and confirm template replacement. Display insertion/conversion preserves quote/list containers. Failed or oversized equations retain readable source in HTML/PDF exports; cached indexes avoid reparsing on cursor movement. No new file or directory deletion operations.

## [2.7.6] - 2026-10-08

### 简体中文

- 发布审计补齐引用中换行图片组与单图后续正文的对齐保护，保留加粗/链接和引用/列表容器；字体面板关闭时同步恢复已保存样式，导出/打印不使用未保存的临时字体预览。无新增文件或目录删除操作。

- 修复图片拆分丢失引用／列表结构、换行多图对齐吞图、实体路径与 Windows 反斜杠解析、列表内 Word 同排布局，以及跨目录另存后的图片加载状态；保留原文件和附件。

- 简化正文与公式设置为 11 种中英文自动搭配风格和公式小/标准/大字号，使用非模态浮动面板在实际文档中预览；保存后跨重启记忆，取消/Escape/保存失败恢复原显示。兼容原有自定义字体搭配，保留 KaTeX 字体、代码等宽与撤回历史，不唤醒隐藏预览、不下载在线字体。
- 修复 KaTeX 字体精简步骤误吞压缩 CSS 中主字体规则的问题，避免公式数字和部分符号意外跟随正文字体；继续只打包 WOFF2，同时保留全部字体与非字体规则。
- 软件字体同步应用于 Markdown 编辑器正文与阅读/实时预览，切换时重新测量换行和光标位置但不重置文档、选区或撤回历史；行内代码及代码块继续使用等宽字体，仅编辑模式不因此启动预览渲染。
- 编辑器图片预览扩展至本地附件、绝对/file 路径、HTTP(S) 在线、Base64/data、引用式 Markdown 和 HTML 图片，均支持左/中/右对齐和查看源码；仅编辑模式同样可用。新增相邻图片合并同排、拆成单张，每排 2–6 张独立对齐；不吞说明、不移动或删除图片，可完整撤销，最多提供 256 张预览。SVG 仅作为安全图片显示。
- 图片同排与对齐在阅读预览、Word、样式 HTML 和 PDF 中保留；修复导出过滤误删图片对齐样式，改用严格样式白名单，Word 同排图片按列宽等比缩小且无表头/边框。修复同排对齐后意外展开源码，以及异步附件读取的范围移动/会话隔离。
- 文件名支持点击重命名，编辑器显示保存位置；新文档首次手动保存选择名称与目录，自动保存保留草稿。另存窗口定位当前目录并记忆最近选择，跨目录副本重定位本地图片引用。重命名及另存不覆盖同名文件，不删除原草稿或附件。
- 新增可选 Base64 图片内嵌（PNG/JPEG/WebP/GIF/BMP）与导出中心“便携 Markdown”，仅生成新副本；缺图、在线图片、复杂引用、单图或总大小超限时停止。AI 请求用可恢复占位符替代图片编码，并限制恢复体积。
- 补齐 AI 响应完整性校验：流式与兼容非流式 SSE 共用帧解析，超过 8 MiB、缺少结束标记、畸形事件或平台中途报错时停止，部分结果不可应用；正常完整消息与空流式回退仍兼容。
- 日志完整隐藏含单引号、空格、UNC 网络共享和任意 Unix 绝对路径，仅保留固定的安全错误类别；不再泄漏路径尾部或把可识别的云盘、权限和恢复原因一起丢弃。
- 修复 Windows 云盘目录保存因硬链接被拒绝而失败：使用原生独立副本保留权限和附加数据，继续校验原文件身份、修订和并发写入；发布失败时恢复原文件或保留恢复材料。
- 修复超长单行文档进入编辑时图表/公式扫描的正则堆栈溢出；逐行扫描保留 CRLF 与光标位置，同时修复 emoji 前缀导致公式定位错位和大量脚注的参数溢出。
- AI 总结、编辑与校对在发送前按 Unicode 字符检查 200 万字符上限，并提供中文/英文拆分提示。兼容空 `content` 后的 `text` 字段、非流式请求返回的多事件 SSE 和空 JSON 流式响应回退；输出截断、平台拒答和空结果有明确提示，推理内容不作为最终正文。
- Word/HTML/PDF 导出被拒绝访问时提示关闭占用程序或选择可写的新文件名，保留已有文件；64 MiB 打开限制与磁盘文件已删除的冲突提示更明确。
- 预期的大小限制和导出权限问题不作为软件故障上报；修复日志中用户目录前缀后的路径以及带空格的文件名脱敏不完整的问题。

### English

- Release audit adds alignment protection for soft-break image groups in quotes and Markdown prose following single images, preserving formatting and containers. Closing typography restores saved CSS synchronously; export/print do not use unsaved typography drafts. No new file/directory deletion operations.

- Fixed quote/list containers during image splitting, soft-break image-row alignment, entity and Windows path decoding, Word rows inside lists, and image loading after cross-directory Save As. Original documents and attachments remain untouched.

- Simplified Body & math typography to 11 automatic bilingual styles and Small/Standard/Large math sizes. A nonmodal floating panel previews the actual document; save persists settings, while cancel/Escape/save failure restores the previous display. Existing custom font pairs remain supported; KaTeX fonts, monospaced code and undo history stay intact without waking hidden previews or downloading fonts.
- Fixed KaTeX font optimization swallowing the main-font rule after a semicolon-less face in minified CSS, which let formula digits and some symbols inherit prose fonts. WOFF2-only packaging now preserves every face and all non-source rules.
- App-font presets now apply consistently to Markdown editor prose and the reader/live preview. Changes remeasure wrapping and caret geometry without resetting the document, selection or undo history; inline/fenced code stays monospaced and editor-only mode does not restart preview rendering.
- Editor image previews now support local attachments, absolute/file paths, HTTP(S), Base64/data, reference-style Markdown and HTML images, all with left/center/right alignment and optional source expansion, also in editor-only mode. Adjacent images can join into independently aligned rows of 2–6 or split again, with full undo, no lost captions, and no moved/deleted attachments; up to 256 previews. SVG is displayed only as an image.
- Reading preview, Word, styled HTML and PDF preserve image rows/alignment. Export sanitization retains narrowly whitelisted image layout rather than removing it; Word fits row images proportionally to cells without headers/borders. Fixed unexpected source expansion after row alignment and local-image async range/session isolation.
- Click file names to rename and see the save location. The first manual draft save chooses a name and folder while autosave retains draft protection. Save As starts in the current folder or last chosen draft folder and rebases local image references across directories. Renames and copies never overwrite existing names or remove drafts/attachments.
- Added optional Base64 image embedding (PNG/JPEG/WebP/GIF/BMP) and Portable Markdown in the export center. Exports create new copies only and stop on missing/online/complex image references or size limits. AI requests replace image data with recoverable placeholders and bound restoration size.
- Added shared SSE completeness checks for streamed and compatible non-streamed responses. Responses exceeding 8 MiB, missing termination, malformed events or provider errors stop processing and cannot expose applicable partial output. Complete message frames and empty-stream fallback remain compatible.
- Diagnostic path redaction covers quotes, spaces, UNC shares and arbitrary absolute Unix paths. Only fixed safe error categories are retained, preserving recognizable cloud, permission and recovery causes without exposing private tails.
- Fixed safe saves in Windows cloud-sync folders that reject hard links. Native independent copies preserve permissions and attached data; original identity, revision and concurrent-write protections remain enforced, with rollback or retained recovery material on failure.
- Replaced whole-line regular expressions in diagram/formula scanning to avoid WebView stack overflow on very long lines while preserving CRLF and cursor offsets. Fixed formula offsets after emoji and unbounded argument spreading for large footnote lists.
- AI summaries, edits and reviews check the 2,000,000 Unicode-character limit before sending, with localized guidance. Compatible response parsing accepts text fields after empty content, multi-event SSE for non-streaming requests, and one fallback for empty JSON streaming replies. Truncated, filtered and empty answers are explained; reasoning is never used as final document text.
- Word/HTML/PDF access-denied failures explain how to close occupying apps or choose a writable new destination while retaining existing files. File-open size limits and conflicts caused by deleted disk files have clearer guidance.
- Expected size limits and export permissions are not reported as software faults. Diagnostics redact complete local path tails and filenames containing spaces.

## [2.7.5] - 2026-09-18

### 简体中文

- 修复部分 OpenAI 兼容服务流式返回空内容时 AI 总结失败的问题：仅在尚未产生任何文本时自动回退一次非流式请求，并兼容更多文本字段。
- 修复大文档与图片导出的边界问题：Pandoc 源文档上限与 64 MiB 文档限制一致，Word、HTML 和 PDF 渲染内容使用独立的 96 MiB 上限；PNG/JPEG 导出会先验证并内嵌图片，同时保持原显示尺寸，无法读取图片时停止导出而不生成缺图文件。
- Windows 应用内更新在 AppData 执行助手被系统策略拒绝时，可在已安装程序旁创建独占命名的临时助手；重启后只通过同一文件句柄删除与已确认旧版本完全一致的助手，未知文件不按路径删除，也不安排重启后延迟删除。
- 错误诊断不再上报权限拒绝、无效 API Key、文件已不存在等可预期操作结果；新增常见凭据脱敏，并只读取错误对象的白名单字段，避免任意对象携带文档数据进入诊断。
- 修复 Windows“应用和功能”普通卸载入口：登记命令使用 NSIS 原位运行参数，保持严格的卸载程序路径、安装标识和注册表三重校验，同时让正常卸载不再因临时副本路径被拒绝。发布 CI 会核对真实登记命令并在 GitHub 托管临时机完成安装、原位升级、卸载和用户文档保留验证。
- 仅编辑模式在“另存为”与“退出编辑”之间显示“恢复预览”，一键恢复上次分栏方向及最新正文，恢复后自动隐藏按钮。
- 新增持久化的“仅编辑”布局：实时预览标题栏可关闭预览，编辑器占满可用宽度；“更多 → 编辑布局”可恢复两种分栏方向。`Ctrl/⌘ + E` 在完整预览与编辑间切换，保留光标与撤销记录。隐藏期间取消预览调度、停止后续图表渲染并释放图表实例，导出时按需渲染最新正文。
- 修复本轮审计的五项问题：最终文档写入改为保护原文件后仅向空目标位置提交，Windows 使用排他句柄校验并移动原文件；提交位置被外部程序占用时拒绝覆盖，保留恢复材料。macOS/Linux 无法强制约束其他编辑器的已有写句柄，成功保存后也保留原 inode 对应的 `.quillite-save-recovery-*` 本地恢复副本，不自动清理。修复工具定位时权限提示被遮挡、模板新建后预览空白、嵌套/HTML 标题锚点误报，以及安装回归脚本从错误位置运行卸载器的问题。
- 新增“更多 → 文档工具”：基础 Markdown 问题检查与定位、文件夹全文搜索、批量替换前后预览、文档安全中心、自定义模板与隐私诊断导出。批量替换默认不勾选文件，跳过当前文档与链接，必须经一次性预览令牌确认；写入前保存历史版本并重新核对修订号，冲突逐文件跳过，不自动重试。备份及历史只能另存新副本，不覆盖原文件。
- 发布流水线新增安全回归门禁与仅限 GitHub 托管 Windows 临时环境运行的安装/升级/卸载文档保留验证；本地不会自动执行真实安装卸载测试。
- 保存、另存与冲突副本的返回内容和修订号固定对应本次实际写入的字节，避免写入后被外部修改的版本成为下一次覆盖依据；前端拒绝内容不一致的保存回执。阅读模式下手动合并也主动更新恢复备份，不再依赖编辑器初始化。
- 修复冲突恢复保护：恢复快照持久化原始修订号与冲突状态，旧快照或版本不匹配时继续暂停自动保存；冲突未解决时不因内容等于旧基线清除备份。过期合并草稿需明确确认丢弃后重新合并。统一已确认风险卸载器仅禁用登记后的再次更新检查，不扩大文件处理权限。
- 文档保存冲突新增“磁盘版本／当前编辑”并排对比，可保留当前编辑、使用磁盘版本、另存新副本或手动合并。冲突期间暂停自动保存；合并先应用到编辑器，再次保存需明确确认，并重新校验磁盘修订。副本只允许新文件名，不覆盖已有文件。
- Windows 旧卸载器自动处理要求完整文件 SHA-256 命中已审核风险名单，并精确匹配本产品卸载登记；未知文件即使命中旧登记也不删除、不改名、不移除登记。安全标记版本继续保留。
- 文件核验和删除/禁用使用同一锁定句柄，防止检查后替换；改名禁止覆盖现存文件。无安全标记且身份不明时暂停热更新，引导用户备份后选择新目录完整安装。
- 当前未取得可验证的旧卸载器样本，生产风险名单为空；不会用安装包哈希、版本号或现场采集哈希冒充已确认身份。

### English

- Fixed AI summaries for OpenAI-compatible gateways that return an empty streamed response. A single non-streaming fallback is used only before any text has been emitted, with support for additional compatible text fields.
- Fixed large-document and image-export boundaries. Pandoc now shares the 64 MiB source-document limit; Word, HTML, and PDF rendered exports have a separate 96 MiB limit; and PNG/JPEG export validates and embeds images without changing their displayed size. Unreadable images stop the export instead of producing incomplete output.
- Windows in-app updates can stage an exclusively named helper beside the installed application when policy blocks execution from AppData. After restart, cleanup deletes only the file object held and verified as byte-identical to the confirmed previous version; unknown paths are untouched and no reboot-time path deletion is scheduled.
- Diagnostics no longer submit expected permission, invalid-key, or missing-file outcomes. Common credential formats are redacted, and only allowlisted error fields are read so arbitrary objects cannot carry document data into diagnostics.
- Fixed the normal Windows Apps & Features uninstall entry. The registered command now uses NSIS in-place execution, preserving strict executable-path, ownership-marker, and registry checks without rejecting a legitimate uninstall from a temporary self-copy. Release CI validates the registered command and performs install, in-place upgrade, uninstall, and user-document preservation checks on a disposable GitHub-hosted runner.
- Editor-only mode shows Restore preview between Save As and Exit editing. It restores the previous split orientation and latest content, then hides itself.
- Added persistent Editor only layout: close the live-preview pane for full-width editing and restore either split orientation from More → Editor layout. `Ctrl/⌘ + E` toggles the full reading preview while preserving the caret and undo history. Hidden previews cancel scheduled rendering and pending chart work, dispose chart instances, and render fresh content only when explicitly exporting or restoring the preview.
- Fixed five audit findings: final document publication is create-only after preserving the original; Windows verifies and moves the original through an exclusive handle. Concurrently recreated destinations are never overwritten, and recovery material is retained on failure. Since POSIX cannot exclude other editors' open writers, macOS/Linux retain original-inode `.quillite-save-recovery-*` backups after successful saves too, without automatic deletion. Fixed obscured permission prompts during tool navigation, blank template previews, nested/HTML heading anchor checks, and lifecycle tests running an uninstaller from the wrong location.
- Added More → Document tools: basic Markdown checks with source navigation, folder text search, before/after batch replacement previews, a document safety center, custom templates and private diagnostic export. Batch replacement starts with no files selected, excludes the open document and links, and requires a single-use preview token. Each write captures history and rechecks revisions; conflicts are skipped without automatic retries. Recovery/history exports only create new copies.
- Added a release safety regression gate and a real install/upgrade/uninstall document-preservation test restricted to disposable GitHub-hosted Windows runners. Local runs never automatically install or uninstall the application.
- Save, Save As and conflict-copy receipts now describe the bytes written by that operation, never a subsequently reread external version. The frontend rejects mismatched receipt content. Reader-only manual merges explicitly update recovery backups without requiring an initialized editor.
- Recovery snapshots persist the original revision and conflict state; legacy or mismatched snapshots remain paused for comparison. Unresolved conflicts keep backups even when content matches the old baseline. Stale merge drafts require explicit discard before restarting. Repeated update checks now agree after registry-only remediation of a verified risky uninstaller, without expanding file mutation authority.
- Document conflicts now show disk and editor versions side by side, with keep edits, use disk, save a new copy, and manual merge actions. Autosave stays paused during conflicts. Merges are applied to the editor first and require explicit save confirmation with revision revalidation. Conflict copies never overwrite existing files.
- Legacy Windows uninstaller remediation requires an audited full-file SHA-256 allowlist match plus exact product uninstall registration. Unknown files and registrations remain untouched, even with stale matching registry entries. Safe-marked files remain preserved.
- Verification and deletion/disable use the same locked handle; rename never overwrites an existing destination. Unverified unmarked files block in-app updates and guide users to back up and install into a new dedicated directory.
- No verified historical uninstaller specimen is currently available, so the production risk allowlist is empty. Installer hashes, version strings and hashes learned on users' machines are never treated as proof.

## [2.7.4] - 2026-09-14

### 简体中文

- 本次重新构建保留每次启动、检查更新和执行更新时的旧卸载器处理逻辑，带安全标记的版本原样保留。已知限制：旧卸载登记仍在但同名文件已被替换时，现有路径归属判断可能误认；本次未加入风险文件哈希名单。
- 安全复审：保存前校验文档内容指纹，外部修改冲突时保留编辑并提示另存；Windows 替换保留 ACL/数据流并带失败恢复备份，macOS 使用原生元数据复制，特殊文件无法安全处理时拒绝覆盖。
- Pandoc 改为临时输出，成功验证后再替换；导出图片请求阻止回环、内网及重定向绕过。更新请求重定向限制在官网 HTTPS 地址。
- 文档读取、保存、历史快照和异常恢复统一 64 MiB 上限，恢复失败明确提醒；发布流水线增加 Windows/macOS 测试与静态检查，严格检出发布标签，删除未经校验的 NSIS 下载兜底。
- 文档保存和另存为改为同目录临时文件同步后替换，失败时保留原文件；历史版本清理只处理经路径归属和内容格式验证的快照。
- Windows 安装核心在覆盖程序文件前再次校验目录归属，卸载需同时匹配程序文件、标记与卸载登记；无法验证目标的快捷方式不再被覆盖或删除。macOS 更新保留旧版应用包作为恢复备份。
- Windows 安装器新增最终路径确认页：默认或自定义选择后先显示实际安装目录，可返回或更改位置；只有明确点击“确认并安装”才开始安装，避免选完文件夹立即安装。
- 缩小常见路径的确认框，长路径仍可换行显示；二次安装会在验证程序与目录归属标记后优先定位上次安装位置，兼容用户级、系统级及旧版安装登记。
- 二次安装点击“自定义安装”时，文件夹选择器直接定位到已验证的上次安装目录；确认同一目录可原位安装，不会创建第二层“轻阅 Markdown”。
- 将 Windows 安装路径确认页的“返回”紧邻“更改位置”排列，中英文分别匹配文字宽度，并同步调整鼠标命中区域。

### English

- This rebuild retains legacy-uninstaller remediation at startup and during update checks/application; safe-marked versions remain untouched. Known limitation: a stale uninstall registration can misidentify a replaced same-name file. A risky-file hash allowlist is not included in this rebuild.
- Safety review: saves validate content fingerprints and retain editor changes on external conflicts. Windows replacement preserves ACLs/streams with a recovery backup; macOS copies native metadata, and unsupported special files fail closed.
- Pandoc writes temporary output before committing; remote export images cannot access loopback/private networks, including through redirects. Update redirects stay on the official HTTPS origin.
- Reading, saving, history and recovery share a 64 MiB limit, with visible recovery-failure warnings. Release CI adds Windows/macOS tests and vet, checks out the exact release tag, and removes the unverified NSIS download fallback.
- Document saves and Save As now sync a same-directory temporary file before replacing the target, preserving the original on failure. History pruning considers only snapshots with verified ownership and format.
- The Windows installer core revalidates destination ownership before overwriting program files, and the uninstaller requires matching executable, marker, and registration. Unverified shortcuts are neither overwritten nor deleted. macOS updates retain the previous app bundle for recovery.
- Added a final destination confirmation screen to the Windows installer. Default and custom selections show the actual target folder, allow going back or changing it, and do not start installation until the user explicitly confirms.
- Made the destination card compact for ordinary paths while retaining wrapping for longer paths. Repeat installations now prefer a verified previous location from per-user, machine-wide, or legacy registration records.
- Custom installation now opens the folder picker at the verified previous installation directory. Confirming that folder reuses it in place rather than creating a second `Quillite Markdown` level.
- Placed Back immediately after Change location on the Windows destination-confirmation screen, with language-specific spacing and matching click targets.

## [2.7.3] - 2026-09-11

### 简体中文

- 取消 Windows 旧卸载器的独立重大缺陷弹框。更新检查会静默识别注册表卸载命令精确指向当前安装目录、且不含安全标识的风险 `uninstall.exe`：优先只删除该文件，失败则改名禁用，再失败则移除精确匹配的卸载登记；带安全标识的版本及无法确认归属的同名文件一律保留。风险解除后继续应用内更新，全部措施失败时仍安全回退到完整安装包。
- 修复 2.7.3 Windows 安装启动器错误地预先创建取消标记、导致安装核心启动后立即中断的问题；取消标记现在只在用户主动取消时生成，并增加安装握手回归测试。
- 完成文件删除安全复审：Windows 安装、升级和卸载全面禁止通配符及递归目录删除，不再自动清理注册表记录的旧安装目录；注册表安装位置必须通过程序文件和专属目录标识双重验证，卸载前也必须读取并匹配该标识，标识缺失或异常时只移除卸载登记并保留全部文件。草稿另存为只迁移应用内记录，不再物理删除原草稿；Windows 更新辅助程序仅允许从应用更新目录原子替换带安全卸载器的 `QuilliteMarkdown.exe`，并在启动失败时恢复已保留的旧版本，macOS 更新也改用随机私有暂存目录并在替换前验证当前应用签名和 Bundle Identifier。
- macOS 源码更新脚本不再使用 `git reset --hard` 或 `git clean`；检测到未提交、已修改或未跟踪文件时立即停止，仅允许 `git merge --ff-only`，避免辅助脚本清除本地工作。
- 修复 Windows 自定义安装路径可能被旧的 C 盘安装记录覆盖，以及程序文件与用户文件混放、卸载存在递归删除整个目录风险的问题。自定义路径现通过参数与 Unicode 安全的进程环境双通道传入，完成前核验目标盘程序及注册表位置；所选文件夹始终作为父目录，并在其中新建“轻阅 Markdown”专属子目录。跨盘迁移保留旧位置的全部文件供用户自行确认，卸载也仅在目录归属验证通过后删除本软件拥有的精确程序文件名。
- 未保存文档退出确认改为应用内三操作弹框，新增“保存”主按钮，并保留“不保存”和“取消”。保存会等待自动保存结束并确认最新内容落盘后再退出；保存失败或取消另存为时继续保留窗口和编辑内容。
- AI 生成、编辑、校对、续写、翻译、精简、扩写和自定义入口均提供与任务匹配的提示词输入；续写与扩写可选择填写目标字数，精简可选择填写保留比例或目标篇幅，留空时不限制。翻译要求改为紧凑的单行输入框，与目标语言和生成按钮同高对齐。修复目标语言列表展示 30 种、后端却只接受 4 种的问题，现已逐项支持全部可见语言。
- 编辑器 AI 下拉菜单首位新增突出显示的“AI生成”，可输入自定义提示词生成 Markdown 文档内容，预览结果后确认插入当前光标位置，不会覆盖已有文字。
- 修复“AI生成”弹窗误显示为“AI编辑”以及生成后“插入到光标位置”按钮无法点击的问题，并将“生成”按钮移至具体要求文本框下方。
- AI 弹窗移除重复的“处理方式”选择，由工具栏中的 AI 功能直接确定生成、编辑、校对、续写、翻译、精简、扩写或自定义流程；各流程使用独立标题、输入范围和必要字段。
- 阅读页首位新增醒目的“AI总结生成”入口，并采用文档内联速览：发送前复用敏感内容识别、可选脱敏和整篇文档发送确认，操作栏下方原位显示实时进度，完成后展示约 5–10 秒可读完的一句话概览与 3–5 个关键点，并可随时关闭；长文档先分段提炼再二次汇总，避免把多段摘要简单拼接。
- AI 翻译的目标语言由 4 种扩展到 30 种世界常用语言，增加繁体中文、西班牙语、印地语、阿拉伯语、法语、孟加拉语、葡萄牙语、印尼语、乌尔都语等常用选项；每项均以“本地语言名（中文名称）”显示，便于识别不同文字。
- 将编辑器标题栏的“历史版本”按钮调整到操作区最右侧，使保存状态、另存为和退出编辑保持连续排列。
- 编辑器 AI 入口统一移到“正文／标题”选择框后的 AI 下拉菜单，集中提供 AI 编辑、校对、续写、翻译、精简、扩写和自定义功能；移除编辑器标题栏中重复的 AI 编辑与 AI 检查按钮。AI 续写会读取光标前的上下文并把新内容插入光标位置。
- 修复 AI 编辑返回大量逐项修改时卡片被压缩成横线的问题；每条修改保持完整内容高度，超过 300 像素后在列表内部滚动。
- 新增文档异常恢复：未保存的编辑内容会防抖写入独立的原子恢复快照，正常保存或明确放弃后自动清理；异常退出后启动时可选择恢复并继续编辑。大文档按规模延迟实时预览，暂停高成本全文拼写扫描，并避免每次按键复制整篇编辑缓冲区；预览跟随光标改用二分定位，降低长文档输入与导航卡顿。
- 统一 AI 设置中服务与模型下拉框的高度、字体和箭头，修复 macOS/WebKit 原生样式不一致。DeepSeek 未配置 Key 时显示两个内置候选并明确提示尚未查询账号；保存或测试连接保存 Key 后加载实际模型，刷新失败保留上次列表，快速切换服务或关闭弹窗时忽略过期查询结果。
- 新增第一批第三方 AI 接入：阿里云百炼、硅基流动、OpenRouter 与自定义 OpenAI 兼容接口。百炼支持官方公共地址、业务空间及 Token Plan 兼容地址，自定义接口支持模型手动填写和 `/models` 自动发现；每个平台 Key 独立保存在系统凭据库。固定平台地址不可篡改，自定义地址强制 HTTPS，仅 localhost 允许 HTTP，并拒绝地址中的凭据、查询参数和具体请求端点。
- 调整 AI 设置顺序为先填写 API Key、再选择模型；自定义 OpenAI 兼容接口不再预填假定的默认模型，必须使用服务商实际提供的模型 ID。
- AI 模型选择支持在地址和 API Key 输入完整后自动加载，无需先保存 Key；草稿 Key 只用于当次查询，不会落盘。阿里云百炼业务空间兼容地址会自动转换为其 `/api/v1/models` 接口并解析专用响应格式，查询完成后由用户选择模型，不自动指定默认项。
- “测试连接”升级为分步骤连接诊断，分别展示服务地址、API Key、模型列表和所选模型实际调用结果，并针对鉴权失败与地址错误提供可理解的提示。诊断可直接使用尚未保存的 Key，且不会额外持久化凭据。
- 模型列表成功查询后会按服务与地址缓存七天，接口临时不可用时显示带时间标记的缓存候选；关闭正在生成的 AI 编辑或 AI 检查会立即取消底层网络请求，不再只关闭界面后继续占用连接。
- AI 编辑改为兼容 OpenAI SSE 的实时流式输出，生成内容会逐段显示，服务完成或用户取消时立即结束连接；AI 结果新增逐项差异审阅，可分别接受修改或保留原文，再一次性安全写回当前选区。
- 新增纯本地文档版本历史：保存前自动压缩保留旧版本，可在编辑器中比较并恢复；单文档最多 30 版、全局最多 100 MB，历史记录不会发送到网络。
- AI 编辑与文档检查支持最长 200 万字符的 Markdown 分段处理，按标题和段落切分、跳过围栏代码块并显示真实分段进度，单段异常会自动重试一次。
- AI 修改审阅升级为段落级修改卡片，支持全部／已接受／保留原文筛选、分批加载和一键定位原文，长结果不再一次渲染全部节点。
- 新增 AI 发送前隐私检查，可识别 API Key、邮箱、手机号、身份证号和银行卡号；用户可逐项决定是否用可还原占位符脱敏，AI 返回后仅在本机恢复原值。

### English

- Removed the standalone critical-defect dialog for legacy Windows uninstallers. Update checks now silently identify only an unmarked `uninstall.exe` whose registered uninstall command points exactly to the current install directory, delete that exact file when possible, rename it as a fallback, or remove only the exact matching uninstall registration as a final disable step. Safety-marked and unowned same-name files are always preserved; in-app updating resumes after remediation and still falls back to the full installer if every measure fails.
- Fixed a 2.7.3 Windows launcher regression that created the cancellation marker before starting the installer core, causing every installation to stop immediately. The marker is now created only after an explicit user cancellation, with a regression test covering the installer handshake.
- Completed a destructive-filesystem safety review. Windows installation, upgrade, and uninstall paths now forbid wildcard and recursive directory deletion and never automatically clean a registry-recorded previous install directory. A recorded install location must pass both executable and dedicated ownership-token checks; uninstall applies the same token check, and a missing or invalid token removes only the uninstall registration while preserving every file. Save As migrates draft records without physically deleting the original draft. The Windows update helper atomically replaces only `QuilliteMarkdown.exe` from the application update directory when a safety-marked uninstaller is present and restores its preserved previous version if launch fails, while macOS updates use random private staging directories and verify the current bundle identifier and signature before replacement.
- The macOS source-update helper no longer uses `git reset --hard` or `git clean`. It stops when modified, uncommitted, or untracked files exist and permits only a `git merge --ff-only`, preventing the helper from discarding local work.
- Fixed a previous C-drive install record overriding a Windows custom destination, as well as application files mixing with user data and recursive destination deletion during uninstall. The destination now reaches NSIS through both an argument and a Unicode-safe process environment variable, and completion verifies the executable and registry location. Every custom-selected folder becomes a parent with a dedicated Quillite Markdown child directory. Cross-drive moves preserve every file in the previous location for manual review, and uninstall deletes only exact product filenames after directory ownership has been verified.
- Replaced the limited native unsaved-changes warning with an in-app Save / Don't Save / Cancel dialog. Save waits for any autosave, verifies the latest content is written, and quits only after success; failed or cancelled saves keep the document open.
- Added task-specific prompts to AI Generate, Edit, Proofread, Continue, Translate, Condense, Expand, and Custom. Continue and Expand optionally accept a target length, while Condense optionally accepts a retention ratio or target size; leaving it blank applies no limit. Translation instructions now use a compact single-line field aligned in height with the target-language selector and Generate button. Fixed the backend to support all 30 visible translation targets instead of accepting only four.
- Added a prominent AI Generate action at the top of the editor AI menu. It writes Markdown from a custom prompt and inserts the reviewed result at the current cursor without replacing existing text.
- Fixed the AI Generate dialog title and its disabled insert-at-cursor action, and moved Generate below the instruction field.
- Removed the redundant action selector from the AI dialog. Each toolbar command now opens its dedicated generate, edit, proofread, continue, translate, condense, expand, or custom workflow with the correct title, scope, and required fields.
- Added a prominent AI Summary action at the start of the reader toolbar and made it an inline brief. Before sending, it reuses sensitive-content detection, optional redaction, and explicit whole-document consent. Progress appears below the document actions, then the same panel shows a closable 5–10 second overview with one lead sentence and 3–5 key points. Long documents are summarized by section and consolidated instead of concatenating partial summaries.
- Expanded AI translation targets from four to 30 widely used languages, including Traditional Chinese, Spanish, Hindi, Arabic, French, Bengali, Portuguese, Indonesian, Urdu, and more. Every option now pairs its native label with a Chinese-language annotation for easier identification.
- Moved the Version History button to the far right of the editor header actions, keeping save status, Save As, and Exit Editing together.
- Consolidated editor AI actions into an AI dropdown beside the paragraph/heading picker, covering edit, proofread, continue, translate, condense, expand, and custom actions; removed the duplicate AI Edit and AI Check header buttons. AI Continue reads context before the cursor and inserts only new content at the cursor.
- Fixed AI edit review cards collapsing into horizontal lines when many changes are returned; each change now keeps its full content height and long lists scroll internally after 300 pixels.
- Added crash recovery for documents: unsaved edits are debounced into a separate atomic snapshot, cleared after a successful save or an explicit discard, and offered for restoration after an abnormal exit. Large documents defer live-preview work by size, pause expensive full-document spell scans, avoid copying the entire editor buffer on every keystroke, and use binary lookup for cursor-following preview navigation.
- Standardized AI provider/model picker heights, fonts, and arrows for macOS/WebKit. DeepSeek shows two explicitly unverified built-in candidates before a key is configured. Saving a key (including through Test connection) loads account models; failed refreshes retain the previous list, and stale discovery results cannot overwrite a different provider or a closed dialog.
- Added the first third-party AI integrations: Alibaba Cloud Model Studio, SiliconFlow, OpenRouter, and custom OpenAI-compatible endpoints. Model Studio supports its public, workspace, and Token Plan compatible URLs; custom endpoints allow manual model IDs plus `/models` discovery. Keys remain isolated in the native credential vault. Fixed provider URLs cannot be overridden, custom URLs require HTTPS except on localhost, and embedded credentials, queries, or request-specific paths are rejected.
- Reordered AI setup so the API key comes before model selection. Custom OpenAI-compatible endpoints no longer assume a default model and require an actual model ID supplied by the service.
- Model discovery now starts automatically once the endpoint and API key are entered, without saving the key first. Draft keys are used only for the current request and are never persisted. Alibaba Cloud workspace-compatible URLs are translated to the dedicated `/api/v1/models` endpoint and its response format is parsed; users still choose a model after discovery rather than receiving an assumed default.
- Test Connection is now a staged connection diagnostic covering the service endpoint, API key, model list, and a real request to the selected model, with clearer authentication and endpoint guidance. Diagnostics can use an unsaved draft key without persisting it.
- Successful model lists are cached for seven days per provider and endpoint, with a visible cache timestamp when live discovery is unavailable. Closing an active AI Edit or AI Check now cancels the underlying network request instead of merely hiding the dialog.
- AI Edit now streams OpenAI-compatible SSE output into the result pane as it arrives and ends promptly on provider completion or cancellation. A per-change diff review lets users accept individual revisions or retain the original fragments before applying once to the current selection.
- Added fully local document version history. Each save can retain a compressed pre-save revision for comparison and restoration, capped at 30 versions per document and 100 MB globally; history never leaves the device.
- AI Edit and AI Check now process Markdown documents up to two million characters in heading/paragraph chunks, preserve fenced code locally, report real chunk progress, and automatically retry a failed chunk once.
- AI change review now groups nearby edits by paragraph, filters accepted or retained changes, renders results in batches, and locates the original text in one click.
- Added a pre-send AI privacy check for API keys, email addresses, phone numbers, ID numbers, and bank cards. Users choose each value to redact with a reversible placeholder, and originals are restored locally after the response.

## [2.7.2] - 2026-09-08

### 简体中文

- 全部 Mermaid／ECharts 代码块统一提供“编辑此图表”入口，自动选择画布、结构化表单或原始源码与实时预览。桑基图新增来源／目标／数值表格并修复中文节点渲染；图表保存保留原引擎、缩进、换行及 ECharts 已有配置，文档会话或原图变化时阻止过期覆盖。
- 修复图表安全过滤误改原始数据和维度映射的问题，保留数据中的 link、constructor 等合法字段；改为逐项遍历大数组，避免大量数据点或筛选条件触发参数数量上限。原型污染防护与真正图表配置的安全限制保持生效。
- 修复词云强制统一字号的问题，恢复按词频权重和 sizeRange 显示大小，同时保留用户显式设置的字号。
- 打开文件按最新请求生效，等待期间新增的编辑再次确认后才丢弃。升级 DOMPurify、Mermaid、ECharts 及相关依赖，ECharts 保留 v5 主题布局；数据图表强制安全的 richText 提示框、过滤危险链接及原型键、转义数据视图标签，并拒绝文档提供的正则筛选以防界面卡死。
- 修复异步保存、另存为、写权限检查和磁盘刷新跨文档返回时误更新当前文档的问题；保存期间继续输入或退出编辑仍保留未保存状态。内置范例另存后立即恢复可编辑控件和真实路径。
- AI 编辑结果与文档会话绑定，切换文件或关闭预览时清除旧选区，避免相同文字或插入操作落入另一份文档。
- 导出文件替换失败不再删除原目标；偏好设置改为临时文件写入后替换。抽取共用写文件函数并补充数据保护回归测试。
- 公式字体只打包 WOFF2，保留全部字形，移除重复的 TTF／WOFF 编码；案例生成测试改用临时目录，避免污染正式文档。

- 编辑模式支持左右切换：通过实时预览标题栏的切换按钮，或“更多 → 编辑布局”选择“预览在左／编辑在左”，并自动记住选择。切换保留正文、选区、撤销记录及 AI 检查结果，分栏拖动与方向键同步适配新的方向。

- Windows 首次显示窗口前，按所在显示器的可用工作区与 DPI 缩放调整尺寸并居中，避免低分辨率主屏、双屏不同缩放或任务栏导致顶部菜单超出屏幕；不限制后续放大窗口，macOS 与 Linux 启动方式保持不变。

### English

- Added a unified Edit this diagram entry for every Mermaid/ECharts fence, routing to a canvas, structured form, or original source with live preview. Sankey diagrams gain Source/Target/Value rows and Unicode label support. In-place saving preserves the engine, indentation, line endings, and existing ECharts options, and rejects stale document sessions or changed source blocks.
- Fixed chart sanitization altering raw data and dimension mappings, preserving legitimate fields such as link and constructor. Large arrays and filter lists are traversed incrementally to avoid argument-count limits, while prototype-pollution protection and executable-option restrictions remain active.
- Fixed word clouds forcing one font size on every word; sizes now follow weights and sizeRange while respecting explicitly configured sizes.
- File opening now honours the latest request and rechecks edits made while waiting. Updated DOMPurify, Mermaid, ECharts and related dependencies, retaining the ECharts v5 theme layout. Data charts enforce richText tooltips, filter unsafe links and prototype keys, escape data-view labels and reject untrusted regex filters.
- Guarded asynchronous saves, Save As, permission checks and disk refreshes by document session. Edits made during a save remain unsaved even after leaving edit mode. Saved reference copies immediately regain editable controls and their real path.
- Bound AI edit selections to their document session to prevent stale replacements or insertions in another document.
- Export replacement failures now preserve the original destination. Preferences use staged writes; shared file-writing code and data-protection regression tests were added.
- Kept every formula font face in WOFF2 while removing duplicate TTF/WOFF assets. Reference-generation tests now write to temporary directories instead of changing tracked examples.

- Added a persistent editor/preview side preference, available from the live-preview swap button or More → Editor layout. Swapping preserves document content, selection, undo history and AI review results; divider dragging and arrow keys follow the selected orientation.

- Windows now fits and centres its startup window within the target monitor's work area before showing it, accounting for DPI scaling, taskbars and negative multi-monitor coordinates. This prevents clipped title bars on smaller displays without limiting later resizing or changing macOS/Linux startup.

## [2.7.1] - 2026-09-04

### 简体中文

- 宽屏本页目录补齐与最近阅读侧栏一致的折叠能力：目录标题栏可收起，收起后在右侧保留边缘箭头按钮，并记住用户选择；窄屏展开时不再把焦点移入尚在动画中的抽屉，消除整页短暂位移后复位的问题。
- 窄屏本页目录入口改为与左侧最近阅读一致的边缘箭头按钮；展开后按钮随目录边缘移动并反向，可直接再次点击自主收起或展开。
- 修复窄屏展开本页目录时，正文滚动条瞬间消失导致页面横向闪动的问题；目录现在不再改变正文滚动与尺寸，遮罩改为平滑淡入。
- 窄屏与竖屏下不再直接关闭本页目录功能：目录默认收起并显示独立入口，展开后作为覆盖正文的右侧抽屉呈现，不再挤压文档；点击章节、关闭按钮、外部遮罩或按 Esc 均可收起，宽屏目录和拖动宽度保持原有行为。
- 修复竖屏显示器或较窄窗口中选择“全宽”后，正文仍被响应式规则限制为 790 像素的问题；全宽模式现在始终使用阅读窗格的全部可用宽度，窄、中、宽模式继续保留适合阅读的响应式上限。
- 修复 macOS 导出 PDF 时，Chrome／Edge 已写完完整 PDF 但无头进程仍保持运行，最终被误报为 `PDF_EXPORT_TIMEOUT` 的问题；导出现在同时监听文件完成与浏览器退出，PDF 一旦校验完整便立即保存并安全结束临时进程，同时保留 Windows 启动器提前退出后的异步写入兼容。
- 强化 Windows 正式打包流程：NSIS 核心包必须继续封装新版自定义安装启动器，并校验文件长度及末尾 `QUILLITE_PAYLOAD` 标记；覆盖已有成品时改用可靠的同目录原子替换，防止误交付旧安装界面。

### English

- Wide layouts now give the on-page outline the same collapsible behavior as the Recent Reading sidebar: a header control collapses it, a right-edge arrow restores it, and the choice persists. Opening the narrow drawer no longer focuses an element while it is still moving in from off-screen, preventing the entire page from briefly shifting and snapping back.
- The narrow-screen outline trigger now matches the edge-arrow treatment used by the Recent Reading sidebar. It follows the drawer edge and reverses direction while open, so the same button can independently expand or collapse the outline.
- Fixed the horizontal page flash when opening the narrow-screen outline, which was caused by temporarily removing the document scrollbar. The outline no longer changes document scrolling or dimensions, and its backdrop now fades in smoothly.
- Narrow and portrait layouts no longer remove the on-page outline. It starts collapsed behind a dedicated trigger and opens as a right-side drawer over the document without changing document width. Selecting a heading, using Close, clicking the backdrop, or pressing Escape dismisses it, while wide-screen resizing remains unchanged.
- Fixed Full width still being capped at 790 pixels on portrait displays or narrower windows. Full width now always uses all available space in the reading pane, while Narrow, Medium, and Wide retain their readable responsive limits.
- Fixed macOS PDF exports being misreported as `PDF_EXPORT_TIMEOUT` when Chrome or Edge had already written a complete PDF but kept its headless process alive. Export now watches file completion and process exit concurrently, saves as soon as the PDF validates, and safely stops the temporary process while retaining support for Windows launchers that exit before detached writing finishes.
- Hardened the official Windows packaging flow: the NSIS core must be wrapped with the current custom installer launcher and pass final-length plus trailing `QUILLITE_PAYLOAD` validation. Replacing an existing output now uses a reliable same-directory atomic move so the legacy installer UI cannot be delivered by mistake.

## [2.7.0] - 2026-09-02

### 简体中文

- 新安装或尚未选择文档宽度时，阅读与编辑区域现在默认使用“宽”；已手动保存的窄、中、宽或全宽设置继续保持不变。
- 修复 Windows 新版 Edge／Chrome 的启动器先退出、实际无头浏览器稍后才写入 PDF 时，直接导出被误判为“找不到 document.pdf”的问题；现在会等待并校验 PDF 完整写入后再保存，不再产生连续失败日志。
- “更多”设置中的界面语言改为与文档宽度一致的“当前值 + 二级菜单”折叠样式，中文与 English 选项默认收起，减少设置面板占用空间。
- Windows 安装程序改为更简洁的双状态原生界面：准备页与完成页共用同一张白色至翡翠绿背景，居中显示应用图标、标题、副标题和两个操作按钮，不再显示百分比、进度条或阶段动画。安装期间保留精简的“正在安装”反馈与安全退出；完成后提供“立即打开”，会按注册表记录或默认目录启动已安装的轻阅 Markdown。窗口继续按原设计等比缩放为 640×427，并使用真实圆角裁切。旧玻璃／能量／高光素材、进度轮询和浏览器动画预览均已删除，正式界面只保留两份 WebP（约 41 KB）；NSIS 改用 Solid LZMA 压缩，全部图文源码仍受 800 KB 构建硬限制。
- 精修 Windows 安装界面的原生分层窗口渲染：四角改用逐像素透明覆盖，图标、文字与按钮在最终 640×427 分辨率直接合成；图标透明边缘会去除暗色底边，按钮使用 8×8 子像素圆角并移除白色外框。标题、说明与按钮文字恢复 Windows 标准 Microsoft YaHei UI 常规字重及 ClearType Natural 渲染，不再使用会让笔画变粗变硬的自定义覆盖率锐化。
- Windows 安装准备页新增“安装位置”与“更改”操作：默认显示当前用户目录，升级时优先沿用注册表记录的原安装目录；用户可通过系统文件夹窗口选择自定义路径，包含中文或空格的路径会作为单个参数安全传给静默 NSIS 核心，并在旧目录解析完成后明确覆盖默认位置。
- Windows 安装准备、安装中与完成三个状态统一为右上角关闭图标和单个居中绿色主按钮；准备页保留“开始安装”，安装中按钮循环显示“正在安装.／..／...”，完成页按钮改为“完成安装”并关闭安装器，同时在完成后3秒自动关闭。所有可点击操作悬停时显示手型光标。安装路径不再常驻占用页面空间，点击左下角“自定义安装”选择目录后会直接开始安装，无需再次确认。
- Windows 安装流程新增中英文双语言切换：默认显示简体中文，右下角可随时切换 English／中文；准备安装、安装中、完成、失败、主按钮、动态安装文字、错误提示、文件夹选择提示和窗口标题都会立即使用所选语言，切换过程中不重置安装状态。
- 全新安装会将安装器当前语言作为软件首次启动语言：使用 English 流程安装后默认进入英文界面，使用中文流程则默认进入简体中文；升级安装继续保留原有语言偏好，不会被安装器覆盖。
- 新增可选的 AI 助手：选中 Markdown 后可进行润色、改写、精简、扩写、总结、翻译或按自定义要求处理，结果会先并排预览，确认后才替换原文，并可通过撤销恢复。
- AI 助手现内置 DeepSeek、智谱 GLM、通义千问、OpenAI 与 Kimi，选择服务并填写对应 API Key 即可使用，官方接口与推荐模型自动配置。各服务的 Key 在 Windows 凭据管理器、macOS 钥匙串或 Linux Secret Service 中分开安全保存，切换或删除某一服务不会影响其他服务，且所有 Key 均不会写入偏好、日志或反馈数据。使用云端接口前会逐次确认发送选中文字。
- AI 助手设置现在会使用所选服务已安全保存的 Key 调用模型列表接口，提供真实可用模型下拉选择，并允许将“服务 + 模型”组合设为默认项；接口暂不可用时会回退到已选或推荐模型。DeepSeek、智谱 GLM、通义千问、OpenAI 和 Kimi 的 Key 可同时保存，加载模型、设置新默认项、测试连接或删除其他服务的 Key 都不会清除任何其他 Key。
- 新增“AI检查”：用户确认后可检查当前整篇 Markdown，按语法、拼写、标点、表达、一致性和 Markdown 语法分类展示可定位的原文与建议修改；支持逐条勾选、全选/取消全选和一键应用所选项。应用前会校验文档快照并阻止错位或重叠建议，全部修改合并为一次可撤销编辑。
- 优化“AI检查”的运行反馈与模型兼容性：检查期间显示动态扫描状态、当前服务与模型、已用时间、阶段说明和渐进进度；失败后保留清晰原因并可直接重试。现在兼容文本块、思考标签、代码围栏、顶层数组和单条 SSE 等常见返回形式，格式不规范时会自动请求模型修复一次，避免长时间静止后只显示“invalid response”。
- “AI检查”不再设置固定超时时间：只要接口连接保持正常，就会持续等待模型完成检查及必要的结果格式修复，直到成功返回或网络/API 明确报错；模型列表和连接测试继续使用较短的超时，避免影响设置页面响应。
- 普通“AI编辑”同样取消固定超时时间，并新增当前服务与模型、已用时间、连接/生成/整理阶段、动态转轮和渐进进度；关闭窗口后旧请求结果不会覆盖后来打开的编辑任务，网络或 API 明确报错时会停止进度并显示原因。
- “AI检查”结果现在会在当前文档的整个编辑会话中保留：关闭弹窗或应用所选修改后再次打开，仍可查看上一次建议；新增独立“重新检查”按钮，只有主动重新检查、退出编辑或切换文档时才清理旧结果，已应用的建议会锁定以避免重复替换。
- 优化“AI检查”长建议的显示：每条原文与建议修改区域随内容自动增高，最高 300 像素后独立滚动；建议数量较多时由整个检查弹框统一滚动，不再压缩卡片或截断末尾文字。

### English
- New installs, or profiles without a saved document-width choice, now default to Wide. Existing Narrow, Medium, Wide, or Full width preferences remain unchanged.
- Fixed direct PDF export being misreported as a missing `document.pdf` when current Windows Edge or Chrome launchers exit before the detached headless browser finishes writing the file. Quillite now waits for and validates a complete PDF before saving it, avoiding repeated false failure logs.
- Interface language in More settings now uses the same compact current-value row and cascading submenu as Document width. Simplified Chinese and English stay collapsed until needed, reducing the menu height.
- The Windows installer now uses a simpler native interface. Ready, installing, and completed states share one white-to-emerald background and center the app icon, title, subtitle, and two actions. Installation adds a smooth numeric percentage without restoring the old progress bar or layered animation; it remains below 100% until the installer core actually succeeds, then completes at 100%. Safe exit and Open now remain available, resolving the installed app from the recorded registry location or the default directory before launch. The genuinely rounded window remains proportionally sized at 640×427. Legacy glass, energy, flare, progress-file polling, and browser-preview code/assets stay removed; production keeps only two WebP files (about 41 KB), while Solid LZMA compresses the NSIS payload and the hard 800 KB source budget remains enforced.
- Ready, installing, and completed Windows installer states now share one top-right close icon and one centered green action. The ready state says Start installation, the installing state cycles `Installing.`, `Installing..`, and `Installing...`, and the completed state uses Finish installation to close the installer while also closing automatically after three seconds. Every interactive action shows a hand cursor on hover. The path row stays hidden, while choosing a folder through Custom installation starts immediately without another confirmation.
- The Windows installation flow is now bilingual. It starts in Simplified Chinese and offers an always-available English／中文 switch in the bottom-right corner. Ready, installing, completed, and failed states—including actions, animated installation text, error messages, folder-picker prompts, and the window title—change immediately without resetting installation progress.
- A fresh install now carries the launcher's selected language into the app: installing through the English flow starts Quillite in English, while the Chinese flow starts it in Simplified Chinese. Upgrades preserve the existing language preference instead of overwriting it.
- Refined the Windows installer surface with per-pixel alpha corners instead of a binary Win32 region, removing visible stair-stepping on all four rounded corners. The primary action now uses a same-color outline rather than a white rim, preserving a clean solid-green silhouette at native scale.
- The installer icon, labels, and buttons are now rendered directly at the final 640×427 display resolution instead of being downsampled together with the 960×640 backdrop. The icon uses cached Catmull–Rom resizing plus transparent-edge color bleeding to remove dark matte halos; buttons use 8×8 subpixel coverage, and layered-window text uses grayscale antialiasing instead of colored ClearType fringes.
- Installer typography now uses standard Microsoft YaHei UI weights and native ClearType Natural rendering at the final resolution. The custom high-contrast coverage mask has been removed so titles, subtitles, percentages, and button labels keep the smooth, balanced appearance of normal Windows text instead of looking heavy or pixel-sharpened.
- The Windows ready screen now shows the installation directory with a Change action. Fresh installs default to the current-user Programs folder, upgrades retain the registered prior location, and an explicitly selected folder safely overrides that location after upgrade detection. Chinese and space-containing paths are passed to the silent NSIS core as one argument.
- Added an optional AI Assistant for selected Markdown: polish, rewrite, shorten, expand, summarize, translate, or follow a custom instruction. Results are reviewed side by side before replacement and remain undoable.
- The AI Assistant now includes DeepSeek, Zhipu GLM, Qwen, OpenAI, and Kimi. Choose a provider and enter its API key; the official endpoint and recommended model are configured automatically. Provider keys are isolated in Windows Credential Manager, macOS Keychain, or Linux Secret Service, so switching or deleting one provider never affects another, and no key is written to preferences, logs, or feedback data. Every cloud operation requires explicit consent before selected text is sent.
- AI settings now use the selected provider's securely stored key to load its available models and present a model picker. A provider-and-model pair can be made the default, while the selected or recommended model remains available as a fallback if model discovery is temporarily unavailable. Keys for DeepSeek, Zhipu GLM, Qwen, OpenAI, and Kimi coexist independently; loading models, changing the default, testing a connection, or deleting one key never removes another.
- Added AI Check for whole-document review after explicit confirmation. It presents precisely locatable grammar, spelling, punctuation, clarity, consistency, and Markdown suggestions with original/replacement comparisons, individual selection, select/clear all, and one-step apply. A source snapshot and overlap checks prevent misplaced edits, while all accepted fixes remain one undoable editor transaction.
- Improved AI Check progress feedback and model compatibility. While checking, the dialog now shows animated scanning, the active provider and model, elapsed time, phase details, and gradual progress; failures retain a clear explanation and an immediate retry path. Common text-block, thinking-tag, fenced, top-level-array, and single-event SSE responses are accepted, and malformed review output gets one automatic format-repair attempt instead of ending with a generic `invalid response`.
- AI Check no longer has a fixed deadline. As long as the connection remains healthy, it keeps waiting for the model and any required output-format repair until completion or an explicit network/API failure. Model discovery and connection tests retain shorter limits so the settings page remains responsive.
- Ordinary AI Edit now also has no fixed deadline and displays the active provider/model, elapsed time, connection/generation/refinement phases, a spinner, and gradual progress. Closing the dialog prevents a stale response from overwriting a later editing task, while explicit network or API errors stop progress and remain visible.
- AI Check results now persist for the entire editing session. Closing the dialog or applying selected fixes no longer discards the previous suggestions, and reopening the dialog shows them again. A dedicated Check again action refreshes them on demand; applied suggestions are locked against duplicate replacement, while exiting editing or switching documents clears the session.
- Improved long AI Check suggestions: original and replacement panes now grow with their content up to 300 pixels before scrolling internally. When many suggestions exceed the available viewport, the complete dialog scrolls as one surface instead of compressing cards or clipping their final lines.

## [2.6.2] - 2026-08-29

### 简体中文

- 修复 macOS 更新或重新启动后，AppKit 在窗口激活、恢复和显示器切换的最终布局阶段再次覆盖三个原生窗口按钮位置的问题；现在会在系统布局完成后的下一帧及短延迟阶段重新确认对齐，避免按钮偶发下移。
- 修复 macOS 左上角三个原生窗口按钮偏高、窗口重新激活后又恢复旧位置的问题；改用 AppKit 原生内嵌标题栏承载按钮，并在网页标题栏加载完成及窗口尺寸变化后重新对齐，与书本图标和应用名称保持同一水平中心线。
- “更多”设置新增软件字体选择，支持系统默认、无衬线、衬线、圆体、宋体和楷体六种跨平台字体预设；界面与 Markdown 正文即时切换，代码内容继续使用等宽字体，选择会写入偏好并在重启后恢复。
- “更多”设置中的软件字体、文档宽度和词典语言改为“当前值 + 二级菜单”的紧凑样式，悬停、点击或键盘均可展开；子菜单会按窗口剩余空间自动选择左右方向，避免设置内容过长或超出屏幕。
- 修复鼠标移入已展开二级菜单触发器后紧接着点击会反而关闭菜单的问题；点击现在始终保持对应二级菜单打开并聚焦当前选项。
- 修复 macOS“更多”设置弹框沿用 Windows 固定右边距、导致弹框偏离三个点按钮的问题；现在按按钮实际位置对齐，并在窗口缩放时保持贴边可见。
- 修复 macOS 重复本地打包时可能误用并重新签名上一次已改名应用包、导致新代码未进入安装包的问题；统一构建脚本现在会先清理精确的旧生成包，再规范化本次 Wails 输出。
- 文档列表改用无底色的主题色线性图标，收窄图标占位以显示更多文件名；保留选中描边、收藏和置顶标记，失效文件使用灰色图标区分。
- 首页采用无阴影的平面样式：移除纸张插画与卡片投影、背景光晕和快捷键双层底边，统一细边框与圆角，改善快捷键字号、行距和文字对比度；明暗主题与系统快捷键保持适配。

### English

- Fixed native macOS window controls occasionally moving down again after an update or relaunch when AppKit performed a final title-bar layout during activation, restoration, or display changes. Alignment is now reconfirmed on the next main-loop turn and after native layout settles.
- Fixed the three native macOS window controls sitting too high and returning to that position after window activation. An AppKit inset title-bar region now owns the controls, with alignment refreshed after the web title bar loads and window layout changes, keeping the same vertical center as the book icon and app name.
- More settings now offers six cross-platform app-font presets: System, Sans serif, Serif, Rounded, Song style, and Kai style. The interface and Markdown prose update immediately while code remains monospaced, and the choice is restored from preferences after restart.
- App font, document width, and dictionary language now use compact current-value rows with cascading submenus. They open by hover, click, or keyboard and automatically choose the side with available viewport space, shortening the More menu without losing any options.
- Fixed a click immediately following hover closing an already revealed settings flyout. Clicking a parent row now always keeps its flyout open and focuses the current choice.
- Fixed the More settings popover inheriting a Windows-oriented fixed right offset on macOS. It now aligns to the actual three-dot button and stays within the viewport while resizing.
- Fixed repeated local macOS builds potentially selecting and re-signing the previous renamed app bundle, leaving new code out of the installer. The shared build script now removes only that stale generated bundle before normalizing the current Wails output.
- Document lists now use theme-colored outline icons without background tiles, leaving more room for filenames. Selection outlines, favorites, and pin markers are retained; missing files use muted icons.
- Refined Home with flat, shadow-free surfaces: removed illustration and card shadows, the background glow, and raised keycap edges. Consistent thin borders and corners, clearer shortcut typography, spacing, and contrast retain light/dark theme and platform shortcut support.

## [2.6.1] - 2026-08-25

### 简体中文

- 流程图新增可视化画布编辑：无需手改 Mermaid 源码，即可直接添加处理、判断和开始／结束节点，拖动节点调整画布位置，依次点击节点创建连线，并修改节点文字、形状、连线文字与样式；支持四种流程方向和自动排列，最终仍生成兼容其他 Markdown 软件的标准 Mermaid 源码。包含子图、样式等高级语法时会安全保留源码模式，不会覆盖或丢失内容。
- 图表生成器新增全屏绘图模式，仅将流程图绘图区铺满整个应用窗口，不再放大左侧分类和弹框标题；“全屏绘图”移动到绘图工具栏首位，全屏工具栏固定提供“退出全屏”和“插入图表”。按钮或 `Ctrl/Cmd + 滚轮` 可在 50%–200% 间缩放图形，任意倍率下画布始终铺满整个绘图区。可拖动空白区域向任意方向平移，节点拖到边缘时自动扩展观察范围；新增“全选”和 `Ctrl/Cmd + A`，全选后拖动任一节点即可整体移动，且不再受原画布边界限制。按 `Esc` 可恢复弹框。同步修正流程图工具栏占用高度后画布区域被遮挡的问题。
- 已插入文档的 Mermaid 流程图支持再次进入可视化画布：光标进入 `flowchart`／`graph` 代码块后会显示“在画布中编辑流程图”按钮，保存修改会原位替换当前代码块，并保留原有围栏符号、缩进和换行格式，不会重复插入图表。
- 图表选择列表新增统一的“可视化编辑”画布图标，并将首批可视化能力扩展到 11 类高频图表。状态图与思维导图现已升级为和流程图一致的节点画布，共享全屏、缩放、自由平移、拖动、全选整体移动、边缘自动平移、连线和自动排列；状态图按“状态＋转移”保存且保留未连线状态，思维导图按“父主题＋子主题”保存并阻止多父节点与循环。三类图均可从文档代码块重新进入画布并原位保存。时序图、甘特图、时间线、看板、饼图、柱状图、折线图和环形图继续使用结构化字段／数据行编辑。遇到高级语法时会拒绝转换并安全保留源码模式。
- 优化状态图的画布排版：状态框和起止节点采用更紧凑的专用尺寸，文字与箭头同步缩小，转移条件移到连线侧边，避免纵向状态机中的节点、标签和箭头互相遮挡。
- 公式工具默认改为行内公式，并支持直接修改已有公式：光标进入行内、块级、编号或化学公式时会显示“编辑当前公式”，双击编辑预览中的渲染公式也可打开同一弹框；原公式内容、编号与插入方式会自动载入，保存后原位替换，不再要求手工选中完整源码。

### English

- Added a visual flowchart canvas. Without editing Mermaid source, users can add process, decision, and start/end nodes, drag nodes on the canvas, connect two nodes by clicking them, and edit node text, shapes, connection labels, and line styles. Four flow directions and automatic layout remain portable because the result is standard Mermaid source. Advanced subgraph or styling syntax stays safely in Source mode and is never overwritten.
- Added a focused full-screen drawing mode that expands only the flowchart workspace rather than the category list and dialog header. Its toolbar always provides Exit full screen and Insert diagram actions, plus 50%–200% zoom through buttons or `Ctrl/Cmd + wheel`; the viewport now stays full-size at every zoom level. Dragging empty space pans freely, dragging nodes near an edge automatically reveals more canvas, and Select all or `Ctrl/Cmd + A` lets users drag every node together without the old canvas boundary. `Esc` restores the dialog. The workspace also reserves the toolbar height correctly so the canvas is no longer obscured.
- Existing Mermaid flowcharts can now be reopened on the visual canvas. Moving the cursor into a `flowchart` or `graph` fence reveals an Edit flowchart on canvas action; Save changes replaces that block in place while preserving its fence marker, indentation, and line endings instead of inserting a duplicate.
- Diagram templates now carry a consistent visual-editing canvas badge across 11 frequently used types. State diagrams and mind maps now share the full node canvas used by flowcharts, including full screen, zoom, free panning, dragging, select-all group movement, edge auto-pan, connections, and automatic layout. State diagrams preserve standalone states and save state transitions; mind maps save parent-child hierarchy while preventing multiple parents and cycles. All three canvas types can reopen from an existing document fence and save in place. Sequence, Gantt, timeline, Kanban, pie, bar, line, and doughnut charts retain structured field/data-row editors. Advanced syntax refuses conversion and remains safely in Source mode.
- Refined state-diagram layout with compact state and terminal nodes, smaller labels and arrows, and transition labels offset beside their connections so vertically arranged state machines no longer overlap.
- Academic Formulas now defaults to inline output and directly edits existing inline, display, numbered, or chemistry formulas. Putting the cursor inside one reveals Edit current formula, while double-clicking its rendered live-preview form opens the same dialog; source, equation number, and output mode are restored and saved in place without selecting the full Markdown range.

## [2.6.0] - 2026-08-25

### 简体中文

- 新增可选的 PicGo 图床上传。选择、拖拽或粘贴图片时仍会先安全保存到文档旁的 `assets`，启用 PicGo 后再通过仅限本机回环地址的 HTTP 接口上传并插入在线 URL；连接或上传失败会自动回退本地相对路径，避免图片丢失。图床设置支持连接测试和可选服务密钥，密钥独立保存在用户配置目录而不进入普通偏好 JSON。
- PicGo 图床设置新增类似 Typora 的首次配置向导：分步提示安装并启动 PicGo、配置图床与开启 Server，再自动检测本机连接；普通用户无需填写地址和密钥，高级设置默认折叠，已有配置会在打开时自动检测。
- 新增 PicGo Cloud 在线 API 直连：用户可在系统浏览器通过 PKCE 安全登录，无需安装百兆 PicGo 客户端或复制密钥；登录令牌独立保存在本机配置目录。小图片使用预签名直传，大图片自动使用分片上传，任何失败仍回退文档旁的本地 `assets`。原有本机 PicGo Server 接入保留为兼容模式。
- 图片上传时新增常驻加载提示与真实字节进度条，清楚区分准备图片、上传中和生成在线链接三个阶段；慢网络下会持续显示百分比，成功或失败回退后自动收起，并完整支持中英文界面。
- 表格工具升级为可视化设计器：可直接填写单元格、动态改变行列数量、增删行列、拖动调整行列顺序、设置每列左／中／右对齐，并拖动列边界调整宽度。光标位于已有 Markdown 表格时会自动进入编辑模式并原位回写；列宽使用可忽略的轻阅 HTML 注释保存，不破坏标准 GFM 表格在其他编辑器中的兼容性。
- 新建文档增加防连点保护：创建请求进行中会立即禁用入口，创建成功后继续锁定 3 秒；按钮点击与 `Ctrl/Cmd + N` 快捷键均无法重复创建，失败或取消时仍可立即重试。
- 新增网页／Word 富文本粘贴转换：剪贴板 HTML 会自动转为 Markdown，保留标题、强调、列表、引用、代码、链接、在线图片和 GFM 表格，清理 Office 专有样式并过滤不安全链接；编辑器选区右键菜单新增“复制为 Markdown”和“复制为纯文本”。
- 新增离线英文拼写检查：编辑器使用红色波浪线标记错词，右键可直接采用候选纠错、在当前文档中忽略，或加入持久化个人词典；“更多”菜单可启停检查、选择自动／美式／英式词典及清空个人词典。代码块、行内代码、URL、HTML、公式、缩写和驼峰标识会自动排除，词典随软件提供且不上传文档内容。
- 新增统一导出中心与可复用导出预设：原生支持 DOCX、带样式 HTML、无样式语义化 HTML、带标题书签 PDF、PNG/JPEG 高清长图，并可配置 `{title}`、`{date}`、`{page}` 页眉页脚。PDF 优先调用本机 Edge／Chrome／Chromium 无头打印并生成可导航书签，不捆绑浏览器；没有可用引擎时回退系统打印。检测或选择本机 Pandoc 后，还可导出 EPUB、RTF、ODT、LaTeX、MediaWiki，或通过 writer、扩展名与附加参数生成自定义格式；参数不经过系统 shell，保存位置不能被自定义参数覆盖。Pandoc 为可选外部工具，不随轻量安装包捆绑。
- 本页目录新增标题搜索和“层级／平铺”视图切换；层级搜索会保留命中标题的上级路径，折叠状态与视图选择均可持续保存。Markdown 正文中的独立 `[TOC]` 标记会实时生成可点击的动态目录，阅读、编辑预览和 HTML／PDF 导出保持一致。
- 阅读页顶部和“更多”菜单不再分别显示导出中心、Word、HTML 与 PDF 四个入口，统一合并为“导出文档”；点击后直接进入完整的 12 种格式导出界面，减少重复按钮并保持“另存为”和“打印”独立可用。
- 修复 PDF 导出中超长代码行、连接字符串和宽表格仍以横向滚动容器打印、导致右侧内容被截断的问题；代码会在 A4 页面内安全换行，表格单元格自动收缩换行，图片与图表限制在可打印宽度内，直接 PDF 与系统打印回退保持一致。
- 修复 PNG/JPEG 长图导出为纯白图或被压缩成狭长小字图的问题：导出节点改为可正常布局和渲染的隔离容器，等待图片、字体与布局就绪后分段生成画布，再由本地 Go 后端按原始宽度无损拼接，不再触发浏览器 16384px 上限的整图等比缩小。保存前会检查正文像素，并修复十六进制背景色被规范化为 RGB 后导致正常画布被误判为空白图的问题。
- 修复“导出文档”弹窗中的异常提示被遮罩层覆盖的问题，成功、警告与错误通知现在始终显示在所有业务弹窗之上。
- “立即导出”按钮现在会在点击瞬间锁定并显示为灰色忙碌状态，导出结束或失败后再恢复，防止慢速长图生成期间重复点击和重复保存。
- PNG/JPEG 图片导出新增“自动分图（清晰，推荐）”与“单张长图”两种方式。默认自动按竖版阅读比例在内容块之间分页，生成 `文件名-01、-02…` 连续编号图片并避开已有同名批次，解决超长单图被看图软件或社交平台适配到屏幕后仍显模糊的问题；导出预设会保存所选方式。
- “单张长图”升级为 2.5K 宽版高清画布：排版宽度由 840px 提升至 1280px，2 倍清晰度下输出约 2560px 宽；正文继续保持原有 2 倍文字栅格，并优化左右留白和长宽比例，让整张适配屏幕时保留更多有效宽度。
- 彻底调整长文档图片导出策略：每页现在按标准 A4 长宽比独立进行 2 倍高清渲染，再保存为连续编号图片，不经过整图缩放或二次采样；即使选择“单张长图”，超过 3 张 A4 的长文档也会自动改为 A4 高清分页并明确提示，避免看图软件把数万像素高的图片缩成只有几百像素宽的模糊预览。短文档仍可无损拼接为单张长图。

### English

- Added optional PicGo image hosting. Chosen, dropped, and pasted images are still saved safely to the document's local `assets` directory first; when PicGo is enabled, Quillite uploads through a loopback-only HTTP endpoint and inserts the returned online URL. Connection or upload failures automatically fall back to the portable local path so an image is never lost. Settings include connection testing and an optional server secret stored separately from the normal preferences JSON.
- Added a Typora-style first-time PicGo setup guide: it walks through installing and starting PicGo, configuring an image host and enabling PicGo-Server, then detects the local connection automatically. The address and optional secret are folded under Advanced settings, while existing setups are checked automatically when reopened.
- Added direct PicGo Cloud API integration. Users sign in securely in their system browser with PKCE, without installing the large PicGo desktop app or copying credentials; the login token is stored separately in the local configuration directory. Small images use presigned direct uploads, larger images switch to multipart uploads, and every failure still falls back to the document's local `assets`. The existing local PicGo Server integration remains available as a compatibility mode.
- Added a persistent upload indicator with real byte progress. It distinguishes preparation, transfer, and online-link generation, keeps percentage feedback visible on slow networks, then dismisses itself after success or safe local fallback. All status text is available in Chinese and English.
- Upgraded the table tool to a visual designer. Cells can be edited directly; rows and columns can be resized, added, removed, and reordered by dragging; each column supports left, center, or right alignment; and column borders can be dragged to change width. When the cursor is inside an existing Markdown table, the designer edits it in place. Widths are stored in an ignorable Quillite HTML comment so the underlying GFM table stays portable to other editors.
- Added double-click protection for New Document. The entry is disabled while creation is in flight and remains locked for three seconds after success; neither the button nor `Ctrl/Cmd + N` can create duplicates during that window, while cancelled or failed attempts can be retried immediately.
- Added rich-text paste conversion for web pages and Word. Clipboard HTML is converted automatically to Markdown while preserving headings, emphasis, lists, quotes, code, links, online images, and GFM tables; Office-only styling and unsafe links are removed. The editor selection context menu now offers Copy as Markdown and Copy as plain text.
- Added offline English spell checking. Misspellings receive a red wavy underline, and their context menu offers suggested replacements, per-document ignore, and a persistent personal dictionary. More now controls spell checking, Auto/US/UK dictionaries, and personal-dictionary clearing. Code, URLs, HTML, formulas, acronyms, and camel-case identifiers are excluded automatically; dictionaries ship with the app and document text is never uploaded.
- Added a unified Export Center with reusable presets. Native exports now cover DOCX, styled HTML, semantic unstyled HTML, PDF with heading bookmarks, and high-resolution PNG/JPEG long images, with `{title}`, `{date}`, and `{page}` header/footer variables. PDF export first uses an installed Edge, Chrome, or Chromium headless print engine to create navigable bookmarks without bundling a browser, and falls back to system printing when none is available. After detecting or selecting a local Pandoc installation, EPUB, RTF, ODT, LaTeX, MediaWiki, and custom writer/extension/argument exports are also available. Arguments bypass the system shell and cannot override the save destination. Pandoc remains an optional external tool and is not bundled into the lightweight installer.
- Added title search plus hierarchical/flat view switching to the document outline. Hierarchical search retains the ancestor path for matching headings, while fold state and the chosen view persist locally. A standalone `[TOC]` marker in Markdown now becomes a live linked table of contents in reading, editor preview, and HTML/PDF exports.
- Consolidated the separate Export Center, Word, HTML, and PDF entries in the reader header and More menu into one “Export document” action. It opens the complete 12-format export interface directly, while Save As and Print remain separate actions.
- Fixed clipped PDF exports caused by long code lines, connection strings, and wide tables retaining horizontal scrolling during printing. Code now wraps safely within the A4 page, table cells shrink and wrap, and images or diagrams stay inside the printable width in both direct PDF export and the system-print fallback.
- Fixed PNG/JPEG long-image exports producing blank files or narrow images with tiny text. The export node now participates in normal layout, waits for images, fonts, and layout, and renders the document in strips that the local Go backend joins losslessly at the requested width. This avoids the browser's 16384px canvas limit silently scaling the whole image down. The pre-save pixel check also uses the original background value so hexadecimal-to-RGB style normalization cannot falsely reject a valid canvas as blank.
- Fixed export errors being obscured by the Export document modal. Success, warning, and error notifications now stay above all application dialogs.
- Export now locks immediately into a visibly grey busy state and only becomes available again after completion or failure, preventing duplicate clicks and duplicate saves during slow long-image rendering.
- PNG/JPEG export now offers “Split into readable pages (recommended)” and “Single long image.” The default mode breaks at content-block boundaries into portrait pages named `file-01`, `file-02`, and so on, automatically avoiding an existing batch. This keeps text readable when viewers or social apps would otherwise fit an ultra-tall image into a blurry thumbnail; export presets retain the selected mode.
- Single-long-image export now uses a 2.5K-wide high-definition canvas: layout width increases from 840px to 1280px and produces an approximately 2560px-wide file at 2× resolution, while preserving the existing 2× text rasterization and improving margins and aspect ratio for fit-to-screen previews.
- Long-document image export now uses a definitive readability-first strategy. Every page is rendered independently at 2× resolution with the standard A4 aspect ratio and saved as a numbered sequence without whole-document scaling or resampling. Even when Single long image is selected, documents longer than three A4 pages automatically switch to A4 HD pages with an explicit notice, preventing image viewers from shrinking a tens-of-thousands-pixel bitmap to a few hundred pixels wide. Short documents can still be joined losslessly into one image.

## [2.5.2] - 2026-08-23

### 简体中文

- 修复 macOS 点击编辑器“更多格式”需要等待 1–2 秒才弹出的问题。原生 WebKit 选择器已替换为应用内轻量菜单，点击后立即显示，并保留工具栏折叠项、键盘导航和中英文界面。
- 修复新版 macOS SDK 下安全书签解码/释放崩溃和应用链接失败的问题，并在授权路径解析后继续保留用户原始文档路径，恢复本机测试与打包。

### English

- Fixed the 1–2 second delay before More Formats opened on macOS. The native WebKit selector is replaced by a lightweight in-app menu that appears immediately while preserving collapsed toolbar commands, keyboard navigation, and both UI languages.
- Fixed security-bookmark decoding/release crashes and an application link failure with newer macOS SDKs, while preserving the user's original document path after permission resolution, restoring local testing and packaging.

## [2.5.1] - 2026-08-21

### 简体中文

- macOS 2.5.0 属于旧版裸可执行文件更新器，无法安全识别 2.5.1 起使用的完整 `.app` ZIP。更新界面现在会明确提示这类用户从官网手动安装一次 DMG，之后恢复应用内自动更新；该已知迁移情况不再作为异常日志重复上报。
- 发布流程继续强制生成并同步 `macos-universal.zip`，且只允许原子替换签名校验通过的完整应用包，避免为兼容旧格式重新引入 `Code Signature Invalid` 闪退。
- 修复置顶文档拖动排序时，拖柄占用独立列导致选中边框被拆开，以及部分 WebView 因移动指针捕获节点而中断拖拽的问题；置顶项现在与普通最近文档左侧对齐，鼠标悬停时在卡片右侧显示拖动提示，按住整张卡片任意位置即可排序，普通单击仍会打开文档。
- 左侧文档库底部新增“图表范例”“公式范例”“格式范例”三个内置参考入口。参考文档由当前 37 种图表模板和 79 种学科公式模板自动生成，并完整展示编辑器支持的常规 Markdown 文本格式；示例不会占用最近阅读记录。
- 阅读页新增“关闭预览”，可在不移除最近阅读记录的情况下返回软件首页；首页同步新增三份完整案例入口和覆盖文件、阅读、编辑及文字格式的快捷键指南。
- 新增统一的本地图片资产工作流：通过文件选择、拖放或剪贴板粘贴导入图片时，会自动复制到当前文档旁的 `assets` 目录并使用可移植相对路径；插入时可选择 10%–100% 显示宽度，同名文件会安全生成唯一名称。
- 完善 Mermaid 与 ECharts 的暗色模式：主题切换后图表会原位重绘，树图、思维导图、桑基图、C4、甘特图、热力图和仪表盘等在明暗主题下均保持可读；图表生成器新增官网教程入口。
- 修复宽幅 ECharts 在 Word／HTML 导出时被压成方形或裁掉右半部分的问题；导出现在使用稳定的白底画布与真实宽高，Word 图片尺寸计算同步保留原始比例。
- macOS 应用内更新改为下载、校验并原子替换完整的已签名 `.app` ZIP，失败时保留回滚副本；发布流程不再使用会破坏代码签名的裸可执行文件更新包。

### English

- macOS 2.5.0 used the retired raw-executable updater and cannot safely consume the complete `.app` ZIP introduced in 2.5.1. The update dialog now explains the one-time DMG installation required before normal in-app updates resume, and this known migration case is no longer submitted repeatedly as an error log.
- The release pipeline continues to require and publish `macos-universal.zip`, and the updater only atomically installs a signature-verified complete application bundle, avoiding the former `Code Signature Invalid` crash.
- Fixed pinned-document drag reordering so the handle no longer occupies a separate column that splits the selected outline, and moving a row no longer interrupts the drag in WebViews that release pointer capture when its target node is moved. Pinned items now align with ordinary recent documents, reveal a drag hint on the right when hovered, and can be reordered by dragging anywhere on the card while an ordinary click still opens the document.
- Added Charts, Formulas, and Formatting example documents above the folder shortcut in the library sidebar. The bundled references are generated from all 37 diagram templates and 79 subject-formula templates, cover the editor's supported Markdown formatting, and do not pollute Recent.
- Added Close Preview to return home without removing the current document from Recent. The redesigned home screen now includes all three example documents and a comprehensive shortcut guide for files, reading, editing, and text formatting.
- Added a unified local-image asset workflow. Images selected, dropped, or pasted from the clipboard are copied into an `assets` directory beside the current document and inserted with portable relative paths; users can choose a 10%–100% display width, and duplicate names are resolved safely.
- Improved Mermaid and ECharts dark mode. Diagrams redraw in place after appearance changes, keeping treemaps, mind maps, Sankey, C4, Gantt, heatmap, gauge, and other charts readable in both modes; Diagram Builder now links directly to the official guide.
- Fixed wide ECharts exports being forced into a square canvas or losing their right side in Word and HTML. Exports now use stable paper-coloured canvases with explicit dimensions, and Word image sizing preserves the source aspect ratio.
- Reworked macOS in-app updates to download, validate, and atomically replace a complete signed `.app` ZIP with rollback protection. The release pipeline no longer publishes raw executable updates that invalidate the application code signature.

## [2.5.0] - 2026-08-20

### 简体中文

- 图表生成器新增 15 类离线数据图表：柱状图、折线图、堆叠柱状图、面积图、散点图、正反向对比图、柱线组合图、漏斗图、热力图、箱线图、气泡图、仪表盘、环形图、瀑布图和词云图。数据图表使用可编辑的 `echarts` JSON 围栏源码，实时预览采用 SVG，Word／HTML 导出自动转换为清晰图片，PDF 打印保持预览效果。
- 图表目录现共提供 37 类模板（22 类 Mermaid + 15 类 ECharts）。新增真实浏览器巡检覆盖全部模板的中英文版本，共验证 74 次 SVG 渲染与 74 次 PNG 导出；15 类新增图表还逐项核对了有效画布、可见文字和实际绘制元素。
- 编辑器新增“图表生成器”：参照“学科公式”的统一弹窗交互，将 22 类常用 Mermaid 图表按流程与项目、软件与系统、数据分析、知识与规划分类展示。选择模板后可查看用途说明、直接编辑完整源码并实时预览，确认后插入 Markdown；原流程图、时序图和甘特图三个分散入口已合并为一个入口。
- 放大图表生成器弹窗并重新规划工作区：宽屏下源码编辑与实时图表左右并排、各自独立滚动，能够同时查看更完整的源码和图表；较窄窗口自动切回上下布局，避免内容被压缩或操作按钮超出屏幕。
- 新增覆盖全部 22 种 Mermaid 图表中英文模板的真实渲染巡检；修正 XY 图表纵轴标题与刻度重叠，并自动扩展过紧的 SVG 画布，避免时序图、XY 图表和雷达图的边缘文字被裁切。
- 修复 C4 图节点顶部的 `<<person>>`、`<<system>>` 被强制压缩后字母重叠的问题；类型标识现在使用与 Mermaid 测量一致的 `«person»`、`«system»` 并在节点中精确居中。
- 修复 Mermaid 需求图关系标签显示成黑色块的问题；`satisfies` 等关系说明现在使用清晰的中性色文字与底色，预览及 Word／HTML 导出保持一致。
- 新增 Typora 风格 Mermaid 图表：使用 ` ```mermaid ` 围栏代码块即可实时渲染流程图、时序图、甘特图及 Mermaid 支持的其他图表；编辑器“更多格式”提供三类常用模板。图表跟随明暗模式和主题色，语法错误会在原位说明且不影响文档其他内容，Word／HTML 导出会转换为清晰的内嵌图片，PDF 打印保持预览效果。
- 修复主题变量使用 CSS `color-mix()` 时 Mermaid 将其误判为不支持颜色、导致所有图表显示“图表语法有误”的问题。渲染前现在由浏览器把全部主题色转换成 Mermaid 可识别的标准 sRGB 十六进制颜色，明暗模式和八套主题均可正常使用。
- 修复流程图、类图、状态图、实体关系图和思维导图节点文字缺失的问题：Mermaid 现在统一生成安全的纯 SVG 文字，不再依赖会被安全过滤器移除的 HTML 标签。甘特图等宽图保持可读尺寸并支持横向滚动；图表引擎改为按需加载、复用主题配置并丢弃过期渲染任务，降低打开普通文档和连续编辑时的卡顿。
- 修复编辑长篇 Mermaid 文档时左侧实时预览突然跳到前面图表的问题。预览更新现在会原位复用主题一致且源码未变化的安全 SVG，只重新绘制正在修改的图表，既保持当前章节的滚动位置，也进一步减少多图文档的重复渲染。
- 统一 Mermaid 图表的中文字体和常规字重，移除通用 SVG 图标描边意外施加到图表文字后产生的粗黑轮廓，并将过小或过大的标签收敛到可读字号范围。C4 系统上下文图保留足够画布宽度，窄窗口下通过横向滚动避免整图缩小到无法阅读。
- 修复包含大量 Mermaid 图表的文档在编辑时左侧预览定位偏移：图表异步渲染完成后会基于最终高度再次校正到当前源码位置，过期渲染任务不会干扰新的光标位置。
- Mermaid 饼图改用独立于软件主题色的高区分度分类色板，各扇区不再只是同一颜色的浅色变化；图例、分区文字及明暗模式均保持清晰可辨。
- ER 实体关系图的关系标签改用独立中性色，不再强制继承软件主题色；修复 `creates`、`contains` 等关系文字与背景同色而显示为空白色块的问题。关系文字、标签底色和连线颜色会直接写入 SVG，软件预览及 Word／HTML 导出保持一致。
- 修复 C4 系统上下文图的角色类型、系统类型和关系说明在布局完成后被二次放大，导致文字压线、越过节点边界或互相重叠的问题。C4 图现在保留参与原生布局计算的字号，只统一字体、常规字重与清晰度。
- 修复较长的中文 C4 关系说明仍会伸入相邻节点的问题。C4 专用布局现在为连线标题和技术标签预留 240px 间隔，每行最多排列三个节点，并使用可横向滚动的宽画布，避免“打开、阅读和编辑”“检查更新 [HTTPS]”等文字覆盖系统说明。
- 修复包含“四反引号外层代码块 + 三反引号 Mermaid 示例”的教程文档中，左侧预览右键定位逐节偏移的问题。源码块扫描现在遵循 CommonMark 围栏长度规则，较短的内层围栏不会错误关闭外层代码块，桑基图及其后续章节可准确定位到对应源码。
- macOS 现在会为用户通过系统文件／文件夹窗口、Finder 或文件关联授权的文档保存原生 Security-Scoped Bookmark。最近阅读与资源浏览器在应用重启后会优先静默恢复授权，书签过期时自动刷新；只有旧记录或因未签名更新导致书签身份失效时，才会再次显示已定位到原文件的系统授权窗口。
- 修复 Mermaid 用户旅程图阶段标题与阶段背景使用同一颜色、导致“打开文档”“编辑文档”等文字不可见的问题；阶段标题现在使用独立正文色，并纳入全部图表真实渲染巡检与导出校验。
- 统一 Mermaid 连线备注样式：类图、状态图、实体关系图和需求图中的关系说明不再显示容易被误认为节点的矩形描边，仅保留遮挡连线所需的无边框底色与正常文字；预览及 Word／HTML／图片导出保持一致。

### English

- Added 15 offline data-chart templates to Diagram Builder: bar, line, stacked bar, area, scatter, diverging comparison, bar-and-line combo, funnel, heatmap, box plot, bubble, gauge, doughnut, waterfall, and word cloud. Their editable `echarts` JSON fences render as SVG in live preview, convert to clear embedded images for Word/HTML exports, and retain preview styling when printed to PDF.
- Diagram Builder now contains 37 templates in total (22 Mermaid + 15 ECharts). A real-browser audit verifies both localized variants of every template—74 SVG renders and 74 PNG exports—and separately checks that every newly added chart has a valid canvas, visible labels, and real drawing elements.
- Added a unified Diagram Builder to the editor. Its formula-builder-style dialog organizes 22 common Mermaid templates into Process & Projects, Software & Systems, Data Analysis, and Knowledge & Planning; each template includes a use-case description, fully editable source, live preview, and one-click Markdown insertion. The three separate flowchart, sequence, and Gantt entries are now consolidated into one command.
- Enlarged and reorganized the Diagram Builder. On wide displays the editable source and live diagram sit side by side with independent scrolling so both remain visible; narrower windows automatically return to a stacked layout without clipping controls.
- Added a real-render audit covering the Chinese and English variants of all 22 Mermaid templates. Fixed the XY-chart Y-axis title overlapping tick labels and now expands overly tight SVG canvases so edge labels in sequence, XY, and radar diagrams are not clipped.
- Fixed overlapping C4 stereotype letters caused by Mermaid compressing `<<person>>` and `<<system>>`; stereotypes now use the correctly measured guillemet form and remain centred in their nodes.
- Fixed Mermaid Requirement Diagram relationship captions appearing as solid black bars. Labels such as `satisfies` now use readable neutral text and backgrounds consistently in preview and Word/HTML exports.
- Added Typora-style Mermaid diagrams. Fenced ` ```mermaid ` blocks now render flowcharts, sequence diagrams, Gantt charts, and other Mermaid syntax in live preview, with ready-to-insert templates under More Formats. Diagrams follow the current color mode and accent, show an inline non-blocking syntax error when invalid, export as embedded high-resolution images to Word/HTML, and retain preview styling in PDF printing.
- Fixed every Mermaid diagram being reported as invalid when the active theme used CSS `color-mix()`. All theme colors are now resolved by the browser to Mermaid-compatible sRGB hex values before rendering, covering both color modes and all eight accent palettes.
- Fixed missing node labels in flowcharts, class, state, ER, and mind-map diagrams. Mermaid now emits safe pure-SVG text instead of HTML labels removed by sanitization. Wide diagrams such as Gantt retain a readable canvas with horizontal scrolling, while lazy engine loading, cached theme setup, and stale-render cancellation reduce startup and continuous-editing lag.
- Fixed the live preview jumping to an earlier chart while editing long Mermaid documents. Preview refreshes now reuse safe, unchanged SVGs for the active theme in document order and redraw only the diagram being changed, preserving the current section and avoiding redundant multi-diagram rendering.
- Normalized Mermaid labels to the application UI font at regular weight, removed the global SVG icon stroke that accidentally outlined and emboldened diagram text, and constrained extreme label sizes to a readable range. C4 context diagrams retain a sufficiently wide canvas and scroll horizontally in narrow panes instead of becoming illegibly small.
- Fixed inaccurate live-preview positioning in documents with many Mermaid diagrams by correcting the scroll position after the latest asynchronous chart layout reaches its final height, while ignoring stale render tasks.
- Mermaid pie charts now use a high-contrast categorical palette independent of the application accent, keeping slices, labels, and legends distinct in both light and dark modes.
- ER relationship labels now use an accent-independent neutral palette. This fixes captions such as `creates` and `contains` becoming invisible when their text and background inherited the same theme colour. Final caption, background, and connector colours are written into the SVG so the app preview and Word/HTML exports remain consistent.
- Fixed C4 context stereotype, system-type, and relationship labels being resized after layout, which caused text to cross node boundaries, collide with connectors, or overlap. C4 diagrams now preserve the exact font sizes used by Mermaid's layout while retaining the normalized font family, regular weight, and clear rendering.
- Fixed long Chinese C4 relationship captions still extending into neighbouring nodes. The dedicated C4 layout now reserves a 240px lane for relation and technology labels, limits each row to three nodes, and uses a horizontally scrollable wide canvas so captions such as “Open, read and edit” or “Check for updates [HTTPS]” cannot cover system descriptions.
- Fixed progressively shifted right-click source positioning in tutorials that wrap a triple-backtick Mermaid example inside a four-backtick code fence. Source block scanning now follows CommonMark fence-length rules, so a shorter inner fence cannot close the outer block and Sankey or later sections locate their actual source lines.
- macOS now persists native security-scoped bookmarks for documents and folders authorized through system panels, Finder, or file associations. Recent and Explorer restore access silently after relaunch and refresh stale bookmarks automatically; the preselected system authorization panel is retained only for legacy records or bookmarks invalidated by an unsigned app update.
- Fixed Mermaid User Journey section headings inheriting the same fill as their section backgrounds, which hid labels such as “Open document” and “Edit document.” Section headings now use an explicit readable foreground and are covered by the full real-render and export audit.
- Unified Mermaid connector annotations across class, state, ER, and requirement diagrams. Relationship captions no longer show a framed rectangle that resembles a node; they retain only a borderless background mask and normal text, consistently in preview and Word/HTML/image exports.

## [2.4.9] - 2026-08-19

### 简体中文

- 修复独立 HTML 与 Word 导出中，KaTeX 的无障碍 LaTeX 文本被 WebView 清理后展开到 `<math>` 节点、导致公式右侧重复显示源码的问题。导出现在会在前端和 Go 后端双重移除已存在结构化 MathML 时的扁平化文本副本，只保留与软件预览一致的一份公式；Word 继续生成可编辑的原生公式。
- 导出同名 Word／HTML 文件被 Word、WPS 或其他程序占用时，现在会明确提示关闭文件或更换名称；该情况属于正常文件占用，不再上传为软件错误日志。
- 修复 WPS／Word 导出学科公式时，原生公式后仍可能重复显示 LaTeX 源码的问题。导出现在只保留单一 MathML 表示，并能识别、去除被拆分到多个样式节点中的同源降级文本；已使用 WPS 实际打开回归 DOCX 验证，公式保持可编辑且后续正文不受影响。
- 新增 HTML 导出：阅读页顶部和“更多”菜单均可将当前文档保存为独立 `.html` 网页，保留明暗模式、主题色、公式、代码、表格和已加载图片，并过滤脚本、事件属性及危险链接。
- 修复 macOS 挂载安装 DMG 后，系统“应用”界面或启动台可能同时显示已安装版本和镜像内版本、形成两个“轻阅 Markdown”图标的问题；新版安装镜像会阻止 Spotlight 索引其中的应用副本，已安装的应用启动时还会安全识别并自动推出仍挂载的官方安装镜像。
- 修复 macOS 重启后从“最近阅读”打开部分 Documents、Desktop、Downloads 等受保护目录文档时出现 `operation not permitted` 的问题。macOS 应用包补齐文件夹隐私用途声明，并在历史授权失效时通过已定位到原文件的系统打开窗口恢复访问；取消授权不再作为软件异常回传。
- 修复 Word 导出遗漏或破坏学科公式的问题：行内与块级 LaTeX、分数、根式、上下标、求和、积分、极限和 mhchem 化学式现在导出为可缩放、可编辑的 Word 原生公式；编号公式保持居中并将编号对齐到右侧。MathML 不可用时仍会保留一份可读的 LaTeX 源式，避免公式再次空白。
- 编辑器“学科公式”扩充到 79 种模板，覆盖基础数学、代数与函数、几何、微积分、线性代数、概率统计、物理、基础化学和化学反应；全部模板均校验默认参数、普通渲染和编号渲染。切换学科或公式时，右侧参数区会自动回到顶部，不再出现标题被滚动位置截断的问题。
- 新增 Typora 风格科学公式：支持 `$…$` / `\(…\)` 行内 LaTeX、`$$…$$` / `\[…\]` 块级 LaTeX、mhchem `\ce{…}` 化学公式与 `\tag{…}` 手动公式编号；预览、定位和 PDF 打印保持一致，Word 导出保留单份可读 LaTeX 源式。
- 编辑器公式菜单新增官网教程入口，可直接打开中英文公式文档，查看可复制的 LaTeX、化学公式和编号示例。
- 修复 macOS／Windows 最近文档被移动、删除或聊天软件清理缓存后，打开与自动刷新会重复产生错误日志的问题。文件缺失现在会立即刷新为不可用状态、保留当前预览并仅提示一次，不再作为软件异常回传；权限、保存和渲染等真实错误仍会正常上报。
- 意见反馈新增服务端 IP 与城市记录：提交前会明确告知采集范围，服务器通过离线地域库解析国家／省份／城市，并仅在登录后的后台反馈详情中展示；当前文档与文件路径仍不会上传。

### English

- Fixed standalone HTML and Word exports showing raw LaTeX beside a rendered equation when WebView sanitization flattened KaTeX accessibility annotations into the `<math>` element. Both the frontend and Go exporters now discard that duplicate text whenever structural MathML is present, leaving one equation consistent with the app preview while Word keeps editable native equations.
- Exporting over a Word or HTML file that is open in another application now shows a clear close-or-rename message. This expected file-lock condition is no longer uploaded as a software error.
- Fixed Academic Formulas still potentially showing raw LaTeX beside the native equation in WPS or Word. Export now keeps exactly one MathML representation and removes matching fallback source even when it is split across differently styled runs. The regression DOCX was opened in WPS to verify that equations remain editable and following prose is preserved.
- Added HTML export to both the reader header and More menu. The standalone `.html` page preserves the current color mode, accent, formulas, code, tables, and loaded images while filtering scripts, event handlers, and unsafe links.
- Fixed macOS potentially showing two Quillite Markdown icons in Apps or Launchpad while the installer DMG is mounted. New images opt the bundled copy out of Spotlight indexing, and the installed app safely detects and ejects a still-mounted official installer image on launch.
- Fixed `operation not permitted` when reopening some Recent documents from protected macOS locations such as Documents, Desktop, and Downloads after an app restart. The macOS bundle now declares its folder-access purposes and recovers stale historical consent through a system open panel preselected to the original file; cancelling authorization is no longer reported as a software fault.
- Fixed missing or malformed Academic Formulas in Word exports. Inline and display LaTeX, fractions, radicals, scripts, sums, integrals, limits, and mhchem chemistry now export as scalable, editable native Word equations. Numbered equations stay centered with right-aligned labels, while a readable LaTeX fallback prevents blank output when MathML is unavailable.
- Expanded the bilingual Academic Formulas tool to 79 templates across mathematics, algebra and functions, geometry, calculus, linear algebra, probability and statistics, physics, chemistry, and chemical reactions. Every template is validated in normal and numbered rendering, and switching subjects or formulas now resets the parameter panel to the top instead of inheriting a clipped scroll position.
- Added Typora-style scientific notation: `$…$` / `\(…\)` inline LaTeX, `$$…$$` / `\[…\]` display LaTeX, mhchem `\ce{…}` chemistry, and manual equation numbers with `\tag{…}`. Academic Formulas is available under More Formats; preview, source positioning, and PDF printing stay aligned, while Word export preserves one readable LaTeX source expression.
- Added an official bilingual formula guide entry to the editor menu, with copy-ready LaTeX, chemistry, and equation-numbering examples.
- Fixed repeated error reports when a recent document was moved, deleted, or removed by chat-app cache cleanup on macOS or Windows. Missing files now refresh to an unavailable state immediately, preserve the current preview with a single notice, and are excluded from software-error telemetry while genuine permission, save, and rendering failures remain reportable.
- Feedback now records the request IP and server-resolved country, province, and city. The submission disclosure states this collection clearly, the information is shown only in authenticated admin feedback details, and the current document and file paths remain excluded.

## [2.4.8] - 2026-08-19

### 简体中文

- 右侧“本页目录”现在按显示器物理短边连续适配字号和默认宽度：1080p、2K、4K 的一级／二级目录在全局 100% 字号下分别约为 13px、15px、17px；超宽屏、竖屏和跨显示器切换不会再误用固定档位，用户手动调整的目录宽度仍优先保留。
- 最近阅读新增多文档持久置顶：置顶文档独立于 10 条普通最近记录，可从右键菜单置顶或取消置顶，并通过悬停拖柄或键盘方向键调整顺序；缺失文件仍可取消置顶或移除，收藏与置顶互不影响。
- 修复最近阅读已满时草稿另存可能先淘汰普通记录、再删除草稿而最终只剩 9 条的问题；草稿路径、置顶、收藏和最近记录现在会在一次偏好更新中迁移并去重。
- 修复微信、聊天软件缓存或外部目录中的文档被移动/删除后，软件仍反复尝试刷新并把“文件不存在”误报为程序异常的问题；最近阅读会及时标记文件不可用，当前预览保留最后一次内容且只提示一次。
- 意见反馈现在明确说明服务器会记录反馈请求 IP 并通过离线地域库解析国家、省份和城市；这些信息仅显示在登录后的管理员反馈详情中，旧反馈保持兼容且不会上传当前文档。

### English

- The right-side document outline now adapts its typography and default width continuously from the display's physical short edge. At 100% global text size, primary outline entries are approximately 13px on 1080p, 15px on 2K, and 17px on 4K displays, while ultrawide, portrait, and cross-display layouts avoid fixed-resolution misclassification and preserve user-resized widths.
- Recent now supports multiple persistent pins. Pinned documents stay above up to ten ordinary recent entries, can be pinned or unpinned from the context menu, and can be reordered with a hover handle or keyboard arrows. Missing pinned files can still be unpinned or removed, and pinning stays independent from Favorites.
- Fixed draft Save As at full Recent capacity potentially evicting an ordinary entry before deleting the draft and leaving only nine entries. Draft paths, pins, favorites, and recent records now migrate and deduplicate in one preferences update.
- Fixed moved, deleted, or expired chat-cache documents being refreshed repeatedly and misreported as software failures. Recent now marks unavailable files promptly, while an already open preview preserves its last content and shows only one warning.
- Feedback now clearly discloses that the server records the request IP and resolves country, province, and city with its offline region database. This information is available only in authenticated administrator feedback details; existing feedback remains compatible and the current document is never uploaded.

## [2.4.7] - 2026-08-18

### 简体中文

- 设置菜单中的“检查更新”移除右侧 `GitHub` 字样，使界面更简洁，并准确体现软件更新与安装包下载均由轻阅官网 `qm.ssssa.cn` 提供。
- 保持官网版本库、应用内免安装更新、三平台安装包与下载统计流程不变。

### English

- Removed the `GitHub` suffix from Check for Updates for a cleaner menu that accurately reflects the official `qm.ssssa.cn` update and download channel.
- Kept the official release catalog, installer-free in-app updates, cross-platform packages, and download metrics unchanged.

## [2.4.6] - 2026-08-18

### 简体中文

- Windows 安装程序恢复为 EXE 直链下载，GitHub Release 与官网版本库不再额外生成或分发 ZIP 包；应用内免安装更新继续使用独立 BIN。
- 软件内所有官网入口与接口统一使用 `https://qm.ssssa.cn`：客户端只读取 `https://qm.ssssa.cn/api/v1/releases/latest`，不再访问根域名、`www` 子域名或回退 GitHub Releases；更新弹窗的下载按钮固定跳转二级域名的“下载”模块，免安装更新文件也只接受该域名。
- 官网按版本、平台与来源汇总更新检查和实际安装包下载次数，用于版本发布效果统计；不上传文档内容、文件名、文件路径或设备身份。

### English

- Restored direct downloads of the Windows EXE installer. GitHub Releases and the official website no longer generate or distribute an extra ZIP, while installer-free in-app updates continue to use the separate BIN asset.
- Standardized every in-app website link and API on `https://qm.ssssa.cn`. The app reads only `https://qm.ssssa.cn/api/v1/releases/latest`, never uses the apex or `www` domains, never falls back to GitHub Releases, opens the subdomain's Download section, and accepts in-app update files only from that host.
- Added aggregate update-check and actual package-download counts by release, platform, and source without uploading document content, file names, file paths, or device identity.

## [2.4.5] - 2026-08-18

### 简体中文

- 更新检查改为优先读取轻阅官网版本库中的版本号、中英文更新日志、SHA-256 和免安装更新地址；官网接口维护或缺少当前平台更新文件时自动回退 GitHub Releases。发布工作流完成 GitHub Release 后，会自动把版本日志和 Windows、macOS、Linux 全部安装包同步到官网，完整上传后才公开。
- 编辑模式左侧实时预览的正文基准字号由 15px 适度提升至 16px，改善 2K／4K 屏幕及分栏状态下的阅读清晰度；普通阅读页、右侧源码编辑器和现有字号缩放逻辑保持不变。
- 恢复独立的每日匿名活跃统计：每台设备每天最多上报一次，且不受“参与产品改进计划”开关影响；该开关现在只控制异常错误日志回传。活跃记录仅包含服务器哈希后的随机安装标识、软件版本、系统类型、CPU 架构和服务器解析地域，不上传文档、路径、联系方式或具体操作行为。
- 更多菜单新增“意见反馈”：可选择“功能建议”或“功能异常”，填写反馈说明，并按需附上邮箱、手机和最多 5 张问题截图；软件版本与系统版本自动带入，提交前明确说明发送范围，不会上传当前 Markdown 文档。
- 意见反馈通过轻阅官网接口提交，后台支持筛选、查看受保护的反馈图片、标记已解决、重新打开和删除；删除反馈时服务器会同步永久删除该反馈的全部图片数据。
- 阅读页顶部新增“另存为”快捷操作，可直接将当前文档保存为新文件并自动打开；文档区域变窄时该操作会与导出、打印一起收进“更多”菜单，原文件保持不变。
- 无写入权限的文档点击“编辑”时改为显示明确的权限说明弹窗，列出聊天软件只读缓存、目录只读／账号权限不足、文件被其他程序占用等常见原因；弹窗新增“另存为副本并编辑”按钮，保存成功后自动打开副本并进入编辑模式，原文件保持不变。
- 阅读页顶部新增“导出 Word”和“导出 PDF”快捷操作；空间充足时与“定位文件”“打印”并列显示，文档区域变窄时导出与打印自动收进“更多”菜单，避免挤压文件路径。
- 新增 Word 与 PDF 导出：Word 由 Go 在本地生成标准 `.docx`，保留标题、段落、列表、引用、表格、代码、链接、文字样式和已加载图片；PDF 使用 Windows WebView2／macOS 系统打印引擎，在系统面板中选择“Microsoft Print to PDF”或“存储为 PDF”，尽量保持阅读预览的排版效果。
- 优化 Word 导出版式：统一中英文字体和段落节奏，标题不再被正文行距覆盖；列表改用 Word 原生多级编号并自动重新起始；表格采用固定列宽、单元格留白和重复表头，引用与代码块样式更加稳定。
- PDF 导出增加确认教程：调用系统打印前先展示三步操作说明，并根据 Windows／macOS 显示对应的打印界面示意图，确认后才打开系统打印窗口。
- 编辑模式的实时预览支持右键定位：鼠标悬停时显示对应源码行提示，右键后将目标源码行置于编辑器顶部，并以主题色短暂标记目标段落；定位成功后不再弹出提示。
- 全面升级应用提示：成功、信息、警告和错误采用独立图标与颜色；正常提示延长至约 3 秒、警告约 5 秒、错误约 8 秒，均可手动关闭，鼠标悬停时暂停消失。
- “关于轻阅 Markdown”的“参与产品改进计划”选项仅控制异常错误日志回传；断网和接口异常不会提示或影响功能。
- “回到顶部”按钮现在跟随右侧目录的左边界定位；拖动调整目录宽度时会自动留在正文右下角，不再落入目录面板内部。
- “回到顶部”按钮与正文滚动条保持固定安全间距；全宽阅读、目录宽度调整和窗口缩放时均不会再与滚动条重叠。
- “文档宽度”改为与字号预设一致的两列按钮组，选中项使用主题色边框与浅色背景，菜单更紧凑统一。
- 提升英文设置菜单的可读性：菜单适当加宽，操作文字、辅助信息和分组标题字号同步增大，减少长英文换行。
- 字号设置改为连续拖动滑杆，实时显示当前比例并标出默认 100% 位置；设置区同时说明放大、缩小和恢复默认的 Ctrl/Cmd 快捷键，自动适配显示器仍可一键启用。
- 优化字号快捷键说明排版：放大、缩小和恢复默认分别使用三个等宽小卡片，按键组合采用主题色标签，说明文字独立置于下方；按键与说明字号同步增大，中英文均保持清晰对齐。
- 本页目录升级为可折叠层级树：有子标题的节点显示展开箭头，可单独折叠或展开；点击标题仍会定位正文，折叠状态按文档保存，下次打开继续保持。
- 最近阅读列表将文档名下方的通用“最近打开”改为文件所在目录，长路径保持单行省略，鼠标悬停可查看完整目录，便于区分微信缓存、下载目录和同名文档。
- 改进微信、企业微信等聊天软件缓存附件的编辑体验：进入编辑页前先检测原文件是否可写；文件只读、被占用或权限不足时保持在阅读页并明确提示无编辑权限。最近阅读、收藏和资源浏览器的文档右键菜单新增“另存为”，可直接建立可编辑副本；保存阶段仍保留自动兜底，不删除原附件，也不要求管理员权限。
- 新增高分辨率显示器字号自动适配：在未保存手动字号时，2K/4K 且系统缩放接近 100% 的屏幕分别采用约 115%/130% 初始字号；系统已经启用高 DPI 缩放时不会重复放大。更多菜单新增“自动适配显示器”和 100%–200% 快速预设，手动选择后优先记忆用户设置，自动模式下更换显示器会重新适配。
- 编辑工具栏在“高亮”后新增文字颜色选择器，扩展为 48 色完整方格色板，覆盖默认色、7 档灰阶和 40 个综合色阶；色板采用无文字名称的 8×6 紧凑布局，并以主题色描边标记当前选择。支持选中文本后着色、再次换色、恢复默认颜色、实时预览和完整撤回，同时兼容旧版本已保存的颜色标记。
- 修复 Windows“打开所在文件夹”可能在应用窗口后方打开的问题；现在会识别目标目录窗口，通过短暂提升并立即恢复正常层级的方式，将文件资源管理器可靠地切到应用前面，同时选中目标文档且不会让窗口永久置顶。

### English

- Update checks now prefer the Quillite website release catalog for version numbers, localized notes, SHA-256 digests, and in-app update URLs, while falling back to GitHub Releases during maintenance or when a platform update asset is missing. After publishing a GitHub Release, the workflow synchronizes all Windows, macOS, and Linux packages to the official website and publishes the catalog entry only after every upload succeeds.
- Increased the split editor's live-preview base text size from 15px to 16px for clearer reading on 2K/4K displays and in narrower panes, without changing the reader, source editor, or existing text-scale controls.
- Restored independent anonymous daily-active measurement. Each device reports at most once per day regardless of the product-improvement setting, which now controls error logs only. Active events contain a server-hashed random install identifier, app version, coarse OS type, CPU architecture, and server-resolved region, without documents, paths, contact details, or individual actions.
- Added Feedback to the More menu. Users can choose Feature suggestion or Functional issue, enter a description, and optionally attach email, phone, and up to five screenshots. The app and system versions are filled automatically, and the dialog clearly explains what is sent while never uploading the current Markdown document.
- Feedback is submitted to the Quillite website API. The protected admin console can filter entries, view authenticated images, mark items resolved, reopen them, or delete them. Deleting an entry permanently removes all of its server-side images as well.
- Added a Save As shortcut to the reader header so the current document can be copied and opened as a new file directly. It moves into the More menu with export and print actions in narrower layouts, leaving the original unchanged.
- Replaced the brief warning for non-writable documents with a clear permission dialog covering read-only chat-app caches, restricted folders, and files locked by another application. A new Save Copy & Edit action opens Save As and automatically enters editing on the writable copy while leaving the original untouched.
- Added quick Export Word and Export PDF actions to the reader header. They appear beside Show File and Print when space permits, while export and print actions move into a More menu in narrower document areas so the file path remains readable.
- Added Word and PDF export. Word files are generated locally in Go as standard `.docx` packages with headings, paragraphs, lists, quotes, tables, code, links, text styling, and loaded images. PDF export uses the Windows WebView2 or macOS system print engine so the output closely follows the reading preview.
- Refined the Word export layout with explicit bilingual typography and paragraph rhythm, native restartable multilevel lists, fixed table geometry with cell padding and repeatable headers, and more stable quote and code-block styling.
- Added a confirmation tutorial before PDF export, including a three-step guide and platform-specific Windows/macOS print-window illustrations; system printing now starts only after confirmation.
- Added right-click source navigation to the live preview. Hovering shows the mapped source line, while right-clicking scrolls and focuses the corresponding line in the editor with brief accent-colored feedback.
- Redesigned all in-app notifications with distinct success, information, warning, and error treatments. Normal notices remain for about 3 seconds, warnings for about 5 seconds, and errors for about 8 seconds; every notice is dismissible and pauses while hovered.
- The “Join the product improvement program” option in About Quillite Markdown now controls sanitized error-log reporting only; offline or server failures remain silent and never affect app features.
- The back-to-top button now follows the document side of the outline divider, staying at the lower-right corner of the reading area as the outline width is resized.
- The back-to-top button now keeps a fixed safe gap from the document scrollbar, including in full-width reading, after outline resizing, and while the window is resized.
- Document width presets now use the same compact button-group treatment as text-size presets, with an accent border and soft background for the selected width.
- Improved English settings readability with a wider menu and larger action, helper, and section-label text, reducing unnecessary wrapping of longer labels.
- Replaced text-size rows and preset buttons with a continuous slider that shows the current percentage and marks the default 100% position. The panel now documents the Ctrl/Cmd shortcuts for larger, smaller, and default text while retaining automatic display fitting.
- Refined the text-size shortcut legend into three equal compact cards, with larger accent-colored keycaps above larger, separately aligned action labels in both languages.
- Upgraded the document outline to a collapsible hierarchy. Nodes with child headings expose expand controls, heading links still navigate the document, and folding state is remembered separately for each file.
- Recent now shows each document's source directory instead of the generic “Recently opened” subtitle. Long paths remain on one ellipsized line, with the full directory available on hover, making cache files, downloads, and duplicate names easier to distinguish.
- Improved editing for attachments opened from WeChat, WeCom, and other application caches. The app now checks write access before entering the editor; read-only, locked, or restricted files stay in the reader with a clear permission message. A new Save As action in the document context menu creates a writable copy directly from Recent, Favorites, or Explorer. Save-time fallback remains as a second safeguard, without deleting or elevating the original attachment.
- Added automatic text sizing for high-resolution displays. With no saved manual preference, low-DPI 2K and 4K screens start at about 115% and 130%, while displays already using OS DPI scaling are not enlarged twice. The More menu now includes Fit to Display and 100%–200% presets; manual choices take priority and persist, while automatic mode adapts again after moving to another display.
- Added a text-color picker immediately after Highlight in the editor toolbar, expanded to a complete 48-color palette covering the default color, seven grayscale steps and 40 spectrum shades. The compact label-free 8×6 grid outlines the current choice with the active theme color. Selected text can be recolored or reset with live preview and full undo support, while color markers saved by earlier versions remain compatible.
- Fixed “Show in Folder” opening behind the application on Windows; the target Explorer window is identified, briefly raised and immediately restored to normal layering so it reliably appears above the app without remaining always-on-top.

## [2.4.4] - 2026-08-17

### 简体中文

- 标题栏书本图标进一步下移微调，与“轻阅 Markdown”文字的视觉基线更加自然。
- 最近阅读列表移除右侧悬浮垃圾桶图标，释放更多横向空间显示长文档名称。
- 移除最近阅读记录仍保留在文档右键菜单中，只删除列表记录，不删除用户原文件。

### English

- Fine-tuned the title-bar book mark downward for a more natural visual baseline with the “Quillite Markdown” label.
- Removed the trailing hover trash icon from Recent, giving long document names more horizontal space.
- Recent records remain removable from the document context menu without deleting the original file.

## [2.4.3] - 2026-08-14

### 简体中文

- 产品正式更名为“轻阅 Markdown”（英文名 `Quillite Markdown`），仓库同步迁移为 `liuhang798/quillite-markdown`；应用标识、安装包、macOS 应用包、Linux 包、更新地址、文档和构建流程全部统一新品牌。
- Windows 覆盖升级会识别“MD阅读助手”旧安装目录，自动关闭旧进程、迁移用户偏好并清理旧快捷方式、旧卸载项和旧程序文件，避免改名后出现双图标或设置丢失。
- 默认品牌绿统一为精确的 `#159A63`；主按钮不再自动加深为 `#10744A`，应用按钮、选中态、强调文字以及应用/文件图标保持同一绿色。
- 左上角品牌标识改为透明背景的打开书本图形，书本线条跟随当前主题色，移除方形底板、边框与阴影。
- 标题栏书本图标与“轻阅 Markdown”文字采用一致高度并上下居中对齐，Windows 与 macOS 紧凑标题栏分别适配。
- 取消新建文档、回到顶部、首页叶子图标等主题色按钮的投影阴影，界面更干净利落；选中状态仍保留主题色描边标识。
- Windows 安装、升级与卸载向导统一为简体中文，不再显示语言选择窗口；系统版本/架构提示、WebView2 安装进度、运行中软件提示和文件打开方式同步中文化。全新安装默认使用简体中文界面，更新安装保留已有语言偏好。
- 修复 macOS 本地构建可能以内部项目名 `quillite-markdown` 出现在 Spotlight 或启动台的问题；应用包现在显式声明 `轻阅 Markdown` 显示名，本地与 CI 构建统一生成 `轻阅 Markdown.app`。
- 文字放大缩小现在作用于全局：阅读正文、左侧最近阅读/资源浏览器、右侧本页目录同步缩放。
- 左侧文档库与右侧目录的拖动分隔条不再限制最大宽度，可自由调整（仅保留正文最小空间），宽度自动记忆。

### English

- Renamed the product to **Quillite Markdown** (Chinese: **轻阅 Markdown**) and moved the repository to `liuhang798/quillite-markdown`. Application identifiers, packages, update URLs, documentation, and release automation now use the new brand consistently.
- Windows upgrades detect the legacy MD Reader Assistant installation, preserve its directory and preferences, and clean up the old executable, shortcuts, and uninstall entry to prevent duplicates or lost settings.
- Unified the default brand green at the exact `#159A63`; primary controls are no longer automatically darkened to `#10744A`, keeping buttons, selections, accent text, and app/file icons on the same green.
- Replaced the top-left brand tile with a transparent open-book mark whose strokes follow the selected accent, removing the square plate, border, and shadow.
- Aligned the title-bar book mark and product label to the same visual height, with dedicated sizing for the compact macOS title bar.
- Removed drop shadows from accent-colored buttons (New Document, back-to-top, home leaf icon) for a cleaner look; selected states keep their theme-colored outline.
- The Windows install, upgrade, and uninstall wizard is now Simplified Chinese only, with no language-selection dialog. Compatibility messages, WebView2 progress, running-app prompts, and file-open actions are localized; fresh installs start in Chinese while upgrades keep the existing language preference.
- Fixed macOS local builds appearing under the internal `quillite-markdown` project name in Spotlight or Launchpad. The bundle now declares the `轻阅 Markdown` display name explicitly, and local and CI builds consistently produce `轻阅 Markdown.app`.
- Text zoom now applies globally: the reading content, the recent/explorer sidebar, and the table of contents all scale together.
- The sidebar and table-of-contents dividers no longer have a maximum width; they can be dragged freely (a minimal content width is kept) and the width is remembered.

## [2.4.2] - 2026-08-14

### 简体中文

- 编辑分栏（左侧预览 / 右侧编辑器）新增拖动分隔条，可自由调整两侧宽度，无最大宽度限制，宽度自动记忆，下次打开保持。
- 编辑模式新增“格式刷”：选中一段带格式的文本（加粗、斜体、删除线、高亮、行内代码、标题、引用或列表），点击工具栏格式刷复制格式，再选中目标文本即自动应用，按 Esc 取消。

### English

- The editor split panes (live preview / editor) now have a draggable divider with no maximum width limit; the width is remembered and restored on the next launch.
- Added a “format painter” to the editor: select text with formatting (bold, italic, strikethrough, highlight, inline code, heading, quote, or list), click the painter button to copy the format, then select the target text to apply it automatically. Press Esc to cancel.

## [2.4.1] - 2026-08-12

### 简体中文

- 编辑模式新增“光标定位预览”：移动光标或输入内容时，左侧实时预览会跟随滚动到当前所在章节/段落，方便边写边看排版效果。
- 编辑器头部新增“退出编辑”按钮，点击即可离开编辑状态回到沉浸式阅读页。
- 插入代码块时可以选择常用编程语言（JavaScript、Python、Go、Java、C/C++、Rust、HTML、SQL 等 19 种），并自动写入带语言标识的围栏代码块。

### English

- Editing now keeps the live preview in sync with the cursor: as the caret moves or you type, the left preview scrolls to the block being edited.
- The editor header now has an “Exit editing” button that returns to the immersive reading view.
- Inserting a code block now lets you pick a common programming language (JavaScript, Python, Go, Java, C/C++, Rust, HTML, SQL, and more), and the language-tagged fence is written automatically.

## [2.4.0] - 2026-08-12

### 简体中文

- 正式发布稳定的 Windows 应用内无安装更新：新版本下载并校验后，由独立 Go 辅助进程等待旧程序退出、替换主程序并自动重启，不再调用安装向导。
- 解决中文用户名或中文安装路径导致更新脚本无法运行，以及更新 helper 自身占用主程序、导致 Windows 拒绝覆盖的问题。
- 更新失败时会把等待超时、文件替换或重启错误写入 `apply-update.log`，并由真实 Windows 端到端测试覆盖完整自更新链路。

### English

- Officially released stable installer-free Windows in-app updates. After downloading and verifying a release, a separate Go helper waits for the old process, replaces the application, and restarts it without launching an installer wizard.
- Fixed both non-ASCII user/install paths that broke command scripts and the updater helper locking the installed executable that Windows needed to replace.
- Update timeout, replacement, and restart failures are recorded in `apply-update.log`, with the complete self-update flow protected by a real Windows end-to-end test.

## [2.3.13] - 2026-08-12

### 简体中文

- 修复 Windows 应用内更新仍可能无法覆盖旧程序的问题：更新辅助进程现在会先复制到独立临时 exe 后再启动，避免辅助进程自身占用安装目录中的主程序文件；下载校验完成后可可靠等待旧进程退出、替换程序并自动重启，无需再次运行安装向导。
- 更新辅助进程会将等待超时、文件替换失败或新版本启动失败的具体原因写入 `apply-update.log`，便于排查权限或安全软件拦截。
- 新增真实 Windows 端到端回归测试，覆盖“安装目录旧程序发起更新、被新二进制替换并自动重启”的完整链路。

### English

- Fixed a remaining Windows in-app update failure: the updater helper is now staged as a separate temporary executable before launch, so it no longer locks the installed application that it must replace. After download verification it can reliably wait for the old process, replace it, and restart without running the installer again.
- The updater now writes explicit timeout, replacement, and restart errors to `apply-update.log` for diagnosing permission or security-software interference.
- Added a real Windows end-to-end regression test covering an installed executable initiating the update, being replaced by the new binary, and restarting automatically.

## [2.3.12] - 2026-08-12

### 简体中文

- 修复 Windows 应用内更新仍可能无法覆盖旧程序的问题：更新辅助进程现在会先复制到独立临时 exe 后再启动，避免辅助进程自身占用安装目录中的主程序文件；下载校验完成后可可靠等待旧进程退出、替换程序并自动重启，无需再次运行安装向导。
- 更新辅助进程会将等待超时、文件替换失败或新版本启动失败的具体原因写入 `apply-update.log`，便于排查权限或安全软件拦截。

### English

- Fixed a remaining Windows in-app update failure: the updater helper is now staged as a separate temporary executable before launch, so it no longer locks the installed application that it must replace. After download verification it can reliably wait for the old process, replace it, and restart without running the installer again.
- The updater now writes explicit timeout, replacement, and restart errors to `apply-update.log` for diagnosing permission or security-software interference.

## [2.3.11] - 2026-08-12

### 简体中文

- 本版本用于验证 Windows 应用内更新的 Go 辅助进程自替换逻辑，无功能变化。

### English

- This release validates the Windows in-app updater's Go helper-process self-replace logic; no functional changes.

## [2.3.10] - 2026-08-12

### 简体中文

- 重构 Windows 应用内更新：替换与重启逻辑改为应用自带的 Go 辅助进程（不再使用 cmd/bat 脚本）。修复 cmd 无法处理中文路径（如用户名含中文时）导致更新脚本从未执行、更新静默失败的问题；等待旧进程退出、替换二进制、启动新版本均由 Go 通过系统 UTF-16 接口完成，并写入日志便于排查。

### English

- Reworked the Windows in-app updater: replacement and restart now run in a Go helper process instead of cmd/bat scripts. This fixes silent failures caused by cmd.exe being unable to resolve non-ASCII paths (for example Chinese user names), which previously meant the update script never ran. Waiting for the old process, replacing the binary and starting the new version all use Go's UTF-16 Win32 calls and are logged for troubleshooting.

## [2.3.9] - 2026-08-12

### 简体中文

- 修复 Windows 应用内更新的替换脚本：脚本改为纯 ASCII 并通过环境变量传递路径（避免中文路径在 cmd 中被错误解析），等待延迟改用 `ping`（修复 GUI 环境下 `timeout` 失效导致更新脚本过早超时的问题）。

### English

- Fixed the Windows in-app updater script: it is now pure ASCII and receives paths through environment variables (so non-ASCII paths survive cmd.exe parsing), and the wait delay uses `ping` instead of `timeout`, which fails when stdin is unavailable in a GUI process.

## [2.3.8] - 2026-08-12

### 简体中文

- 本版本用于验证 Windows 应用内更新的自替换逻辑（便携版与安装版均适用），无功能变化。

### English

- This release validates the Windows in-app updater's self-replace logic (works for both portable and installed deployments); no functional changes.

## [2.3.7] - 2026-08-12

### 简体中文

- 修复 Windows 应用内更新：改为直接替换正在运行的可执行文件（不再依赖静默安装器），绿色便携版与安装版均可自动升级并重启；升级过程写入日志便于排查。

### English

- Fixed Windows in-app updates: the running executable is now replaced directly instead of relying on a silent installer, so both portable and installed deployments upgrade and restart automatically. The update process writes a log for troubleshooting.

## [2.3.6] - 2026-08-12

### 简体中文

- 本版本用于验证应用内自动更新链路，无功能变化。从上一版本开始，macOS 与 Windows 用户可在更新弹窗中直接“下载并更新”，应用内完成下载、完整性校验、替换与自动重启。

### English

- This release validates the in-app automatic update pipeline; no functional changes. Starting from the previous version, macOS and Windows users can pick “Download & Update” in the update dialog to download, verify, replace and restart in-app.

## [2.3.5] - 2026-08-12

### 简体中文

- 兼容纯文本 TXT 文件：阅读页与编辑实时预览按纯文本渲染（保留原始换行与空格，不解析 Markdown 语法），编辑模式使用纯文本语法；可通过“打开文档”对话框、拖放或文件夹浏览直接打开，安装时注册 `.txt` 文件关联，双击即可用本应用打开。
- 插入图片支持填写在线链接：点击工具栏“插入图片”可在弹窗中粘贴 `http://` 或 `https://` 图片地址并附可选图片说明，也可以继续选择本地图片。
- 新增应用内自动更新：检测到新版本后可直接“下载并更新”，应用内下载（带进度条）、校验完整性后自动替换并重启，无需手动下载安装或再到系统设置授权；macOS 与 Windows 均支持，Linux 保持手动下载。

### English

- Plain-text `.txt` files are now fully supported: the reader and the live editor preview render them as-is, preserving line breaks and spaces without Markdown parsing, and the editor uses plain text mode. Files can be opened from the dialog, drag-in, or folder explorer, and the installer registers the `.txt` association so double-clicking opens them directly.
- Inserting an image now supports online links: the image dialog accepts an `http://` or `https://` image URL with an optional description, alongside the existing local file picker.
- Added in-app automatic updates: the update dialog can download and apply the new version directly with a progress bar and integrity check, then restart automatically — no manual download, installer wizard, or macOS Gatekeeper approval needed. Supported on macOS and Windows; Linux keeps the manual download flow.

## [2.3.4] - 2026-08-11

### 简体中文

- 新增当前文档外部修改自动刷新：应用重新获得焦点时会从磁盘重新读取并更新阅读页或无未保存内容的编辑页；若本软件存在未保存编辑则安全跳过，避免覆盖用户输入。
- 新增文档宽度调整：在“更多”菜单中可选择窄 / 中 / 宽 / 全宽四档内容宽度，阅读页与编辑实时预览同时生效并自动记忆。
- 修复阅读页查找主动跳过 Markdown 行内代码和代码块的问题；代码文字现在会进入匹配计数，并支持高亮及上一个/下一个定位。

### English

- Added automatic refresh for externally modified active documents. When the app regains focus, it reloads the reader or a clean editor from disk; local unsaved edits safely block replacement.
- Added document width presets in the More menu: narrow / medium / wide / full width. Both the reader and the live editor preview respect the chosen width, which is remembered.
- Fixed reader search intentionally skipping Markdown inline code and fenced code blocks. Code text now participates in match counts, highlighting, and previous/next navigation.

## [2.3.3] - 2026-08-10

### 简体中文

- 新增文档预览鼠标滚轮缩放：Windows/Linux 使用 `Ctrl + 滚轮`，macOS 使用 `Command + 滚轮`；支持阅读页和编辑模式实时预览，并自动记忆字号。
- 修复 Windows 同版本覆盖安装时，旧快捷方式或 Markdown 文件关联图标被资源管理器占用而导致安装中断的问题；两类关联现在都直接使用程序内置图标，并安全延迟清理旧图标文件。升级时若检测到旧版仍在运行，安装器会提供确认关闭并继续安装的选项。
- 新增持久化文档收藏：可在“最近阅读”和“资源浏览器”中右键收藏或取消收藏，并通过侧栏“收藏”视图集中打开、编辑和定位文档。
- 最近阅读、收藏和资源浏览器中的已收藏文档会显示主题色实心五角星，浏览列表时可快速区分。
- 收藏记录与最近阅读互不影响；取消收藏只移除记录，绝不会删除用户原文件。
- 已移动、删除或磁盘暂时不可用的收藏仍会保留并显示为不可用，方便用户随时取消收藏。
- 新建草稿另存为正式文档后，已有收藏会自动迁移到新路径，避免留下失效或重复记录。

### English

- Added mouse-wheel text zoom for document previews: `Ctrl + wheel` on Windows/Linux and `Command + wheel` on macOS. It works in both the reader and live preview and preserves the selected text size.
- Fixed Windows same-version reinstalls failing when Explorer kept old shortcut or Markdown file-association icons locked. Both associations now use the icon embedded in the executable, while legacy icons are safely removed or deferred until reboot. If the old application is still running, the installer offers to close it and continue.
- Added persistent document favorites. Right-click documents in Recent or Explorer to add or remove them, then manage them from the new Favorites sidebar view.
- Favorited documents display a filled accent-colored star in Recent, Favorites, and Explorer for quick recognition.
- Favorites remain independent from Recent, and removing a favorite never deletes the original file.
- Moved, deleted, or temporarily unavailable favorites remain visible as unavailable records so they can still be removed.
- When a favorited draft is saved as a permanent document, its favorite automatically follows the new path without leaving stale or duplicate entries.

## [2.3.2] - 2026-08-09

### 简体中文

- 修复 macOS 全屏关闭后应用进入后台，再次点击 Dock 图标无法恢复窗口的问题；全屏关闭现在只隐藏应用而不主动隐藏窗口，与普通关闭行为一致，Dock 恢复时再取消应用隐藏并检查全屏残留状态。

### English

- Fixed a macOS issue where, after closing the window from fullscreen and hiding the app, clicking the Dock icon could not bring the window back. Fullscreen close now hides the application only, matching the normal close behaviour, and the Dock reopen path unhides the application first and clears any leftover fullscreen state.

## [2.3.1] - 2026-08-09

### 简体中文

- macOS 自动跟随系统白天/黑夜模式时，现在允许用户临时手动切换；临时选择会保持到系统下一次外观变化，随后自动恢复跟随。
- 修复 macOS 应用在后台运行时点击 Dock 图标偶发不显示窗口或窗口未置于最前方的问题；隐藏或最小化的主窗口现在会恢复并获得焦点。
- 左侧“最近阅读”现在使用右键菜单提供“编辑”“打开所在文件夹”和“移除”；“编辑”会直接打开对应 Markdown 文档并进入编辑模式，不存在的记录仍可移除。
- 修复 macOS 全屏状态下点击左上角关闭按钮偶发只退出全屏、窗口仍然显示的问题；现在会等待原生全屏退出通知后可靠隐藏窗口，并保留超时兜底。

### English

- While following the macOS light/dark appearance automatically, the app now allows a temporary manual switch that remains active until the next system appearance change, when automatic following resumes.
- Fixed an intermittent macOS issue where clicking the Dock icon while the app was running in the background did not show the window or bring it to the front. Hidden and minimized main windows are now restored and focused.
- Recent now provides a right-click menu with Edit, Show in Folder and Remove. Edit opens the selected Markdown document directly in editing mode, while unavailable records can still be removed.
- Fixed an intermittent macOS issue where clicking the top-left close button in fullscreen only exited fullscreen and left the window visible. The app now waits for the native fullscreen-exit notification before reliably hiding the window, with a timeout fallback.

## [2.3.0] - 2026-08-08

### 简体中文

- macOS 现在自动跟随电脑的白天/黑夜外观：启动时立即采用系统模式，系统外观变化时界面和原生标题栏同步切换，不再被旧的本地明暗设置覆盖。
- 修复 macOS 半屏平铺或调整窗口尺寸时原生红、黄、绿按钮短暂上下跳动，以及退出全屏时 Logo 和软件名称复位延迟造成的画面重叠。
- macOS 进入全屏后，Logo 与软件名称会自动向左对齐到内容边距；退出全屏后恢复窗口按钮安全间距，切换过程平滑且不依赖屏幕尺寸猜测。
- macOS 原生红、黄、绿窗口按钮现在会在 42px 轻薄标题栏内垂直居中，并在窗口缩放、重新获得焦点及进出全屏后保持对齐。
- 修复 macOS 新建文档被错误保存在可替换的 `.app` 应用包内、导致重新安装后显示丢失的问题；新文档现在固定保存到用户“文稿/Quillite Markdown”，不会随应用升级被覆盖，已恢复的旧草稿也会自动更新最近阅读路径。
- 最近阅读会检测原文件是否仍然存在；已删除、移动或暂时无法访问的文档会显示为灰色删除线并禁用打开，同时保留清理记录按钮，避免外接磁盘未挂载时误删历史。
- Markdown 格式工具栏取消横向滚动条，窗口宽度不足时会按优先级自动把格式收进“更多格式”；同时补充粗斜体、自动链接、Markdown 转义和 HTML 区块。
- macOS 新增标准 `Command + W` 关闭窗口快捷键，行为与红色关闭按钮一致；保留 `Command + Q` 真正退出应用及未保存内容确认。
- 补全 Markdown 编辑格式：新增 H4–H6、删除线、高亮、下划线、上下标、分隔线、强制换行、脚注、引用式链接、折叠区块、键盘按键和注释；高亮与脚注已同步支持安全实时预览。
- 修复 macOS 全屏状态下点击红色关闭按钮偶发无法隐藏窗口的问题；应用会先完成退出全屏动画，再可靠隐藏并继续在后台运行。
- macOS 顶部工具条改为更轻薄的原生隐藏标题栏布局，移除额外 Toolbar 空间，并分别适配白天与黑夜模式。
- 移除阅读页与实时预览中行内代码的色块背景，保留清晰的代码文字颜色。
- 左侧当前选中的文档卡片新增随主题变化的轻量描边，让当前文档更易识别。

### English

- macOS now follows the computer's light/dark appearance automatically at launch and whenever the system setting changes, keeping the interface and native title bar in sync without letting an old local mode override the system.
- Fixed native macOS traffic lights briefly jumping vertically during tiling or window resizing, and removed the delayed Logo/title reset that could overlap the controls while leaving fullscreen.
- On macOS, the Logo and application name now move left to the content margin in fullscreen and restore the traffic-light safe area when returning to a window, using the native fullscreen state rather than screen-size guesses.
- Centered the native macOS red, yellow and green window controls vertically within the compact 42 px title bar, retaining alignment after resize, focus and fullscreen transitions.
- Fixed new macOS documents being stored inside the replaceable `.app` bundle and appearing lost after reinstalling. New documents now live in the user's `Documents/Quillite Markdown` folder and survive application upgrades, while references to recovered legacy drafts are migrated automatically.
- Recent now detects whether each source file is still available. Deleted, moved or temporarily unavailable documents appear muted with a strikethrough and cannot be opened, while their remove-record action remains available so disconnected drives do not erase history automatically.
- Removed horizontal scrolling from the Markdown toolbar. Controls now collapse into More Formats by priority when space is limited, with new bold-italic, autolink, Markdown escaping and HTML-block actions.
- Added the standard macOS `Command + W` close-window shortcut with the same behavior as the red close button, while retaining `Command + Q` for quitting with unsaved-change confirmation.
- Completed the Markdown editing set with H4–H6, strikethrough, highlight, underline, superscript, subscript, horizontal rules, hard breaks, footnotes, reference links, collapsible sections, keyboard keys and comments, including safe live rendering for highlights and footnotes.
- Fixed an intermittent macOS issue where the red close button could fail to hide a fullscreen window. The app now completes the fullscreen exit before hiding in the background.
- Reworked the macOS top bar into a slimmer native hidden-titlebar layout without the extra Toolbar space, with dedicated light and dark appearances.
- Removed the filled background from inline code in reading and live-preview views while preserving a clear code text color.
- Added a lightweight theme-colored frame to the selected sidebar document card for clearer current-document identification.

## [2.2.6] - 2026-08-07

### 简体中文

- 将主题颜色与白天/黑夜模式拆分为两个独立功能；新增清新绿、晴空蓝、活力橙、灵动紫、珊瑚红、湖水蓝、雾蓝灰和陶土棕 8 种强调色，可与两种明暗模式自由组合，图 1 绿色为默认颜色。
- 更新应用品牌图标为亮绿色书页与羽毛标识，移除外部黑色画布并保留透明圆角；应用内 Logo 会随主题颜色切换，Windows、macOS、Linux、安装器和项目主页继续使用默认绿色图标。
- 自动迁移旧版完整主题设置，分别恢复为最接近的强调色与明暗模式组合。
- 降低 Logo、主操作按钮、首页叶子图标和“回到顶部”按钮的强调色阴影，让界面层次更加轻盈克制。

### English

- Split accent color and light/dark mode into independent controls. Fresh Green, Clear Blue, Vivid Orange, Vivid Violet, Coral Red, Lake Cyan, Mist Slate and Clay Brown can be combined with either mode, with the supplied green as the default.
- Updated the application brand icon to the bright-green book-and-feather mark with transparent outer corners. In-app Logos follow the selected accent while Windows, macOS, Linux, installer and project-page icons stay green.
- Migrated legacy complete-theme settings to the closest independent accent and color-mode combination.
- Reduced accent-colored shadows on Logos, primary actions, the welcome illustration and the back-to-top control for a lighter, more restrained visual hierarchy.

## [2.2.5] - 2026-08-06

### 简体中文

- 新增 8 套完整配色主题：经典浅色、经典深色、青翠新语、云海湛蓝、紫藤雾色、琥珀书页、深海夜航和墨夜紫晶；阅读页、实时预览、Markdown 编辑器、语法高亮、菜单和弹窗会同步切换。
- 主题选择会自动保存并在下次启动时恢复；旧版 `light` / `dark` 设置会自动迁移，异常值安全回退到经典浅色。
- 放大、缩小和恢复字号现在会同时作用于阅读页、实时预览、Markdown 源码和编辑器行号，最高支持 200%，更适合 4K 高分辨率显示器。
- 字号比例会自动保存，关闭并重新打开软件后继续使用上次设置。
- macOS 点击左上角关闭按钮后改为隐藏窗口并继续在后台运行；从 Finder 打开 Markdown 文件时会在应用启动后直接显示文档。
- 点击“最近阅读”中的已有文档不再改变列表顺序。
- Windows 安装向导选择的语言会直接作为软件界面语言，首次进入软件不再重复要求选择。
- 优化 macOS 冷启动：Markdown 编辑器改为进入编辑模式时按需加载，资源浏览器目录在首屏显示后恢复，减少首次打开等待。

### English

- Added eight complete color themes: Classic Light, Classic Dark, Verdant Voice, Azure Cloud, Wisteria Mist, Amber Paper, Deep Ocean and Amethyst Night. The reader, live preview, Markdown editor, syntax highlighting, menus and dialogs switch together.
- Theme selection is saved and restored automatically; legacy `light` / `dark` values migrate safely and unknown values fall back to Classic Light.
- Increase, decrease and reset text size now apply to the reader, live preview, Markdown source and editor line numbers, with scaling up to 200% for high-DPI and 4K displays.
- The selected text scale is saved automatically and restored on the next launch.
- On macOS, the close button now hides the window while the app keeps running; Markdown files opened from Finder are displayed after startup.
- Opening an existing item from Recent no longer changes the list order.
- The Windows installer language now becomes the initial app language, avoiding a second language prompt on first launch.
- Improved macOS cold startup by loading the Markdown editor only when editing begins and restoring resource-explorer folders after the first paint.

## [2.2.4] - 2026-07-22

### 简体中文

- 修复编辑模式下 `Ctrl/Cmd + F` 会切换到预览页的问题；现在会保持在源码编辑器中查找、高亮并滚动定位匹配内容。
- 查找与替换面板新增简体中文/English 联动文案，并重新设计为与应用一致的绿色卡片式工具栏。
- 左侧文档库和右侧本页目录新增可拖动分隔条，调整后的宽度会在下次启动时自动恢复。
- 资源浏览器会记住已选择的文件夹和当前视图，下次启动自动恢复；在资源浏览器视图中再次点击标签即可更换文件夹。

### English

- Fixed `Ctrl/Cmd + F` leaving the source editor for preview mode; editor search now stays in place, highlights matches and scrolls to the selected result.
- Localized the find-and-replace panel for Simplified Chinese and English, with a polished green toolbar that matches the app.
- Added draggable dividers for the library and document outline, with panel widths restored on the next launch.
- The resource explorer now restores its selected folder and active view on launch; click the active Explorer tab again to choose another folder.

## [2.2.3] - 2026-07-21

### 简体中文

- 新增 Markdown 格式工具栏：标题、引用、加粗、斜体、链接、有序/无序列表、任务列表、表格、图片、行内代码和代码块。
- 新增 `Ctrl/Cmd + B`、`Ctrl/Cmd + I`、`Ctrl/Cmd + K` 编辑快捷键。
- 新增 Markdown 文件创建功能，无需选择目录即可在安装目录自动创建并进入编辑；安装目录不可写时会自动回退到用户“文档”目录。
- 编辑状态下每 10 秒自动保存，并避免保存期间继续输入造成内容覆盖。
- 左侧文档库新增“最近阅读 / 资源浏览器”双视图及资源列表刷新功能。
- 更新弹窗新增“30 天内不再提醒”，手动检查更新不受该设置影响。
- 调整顶部主操作样式：“新建文档”改为绿色主按钮，“打开文档”改为无背景按钮。
- 编辑工具栏新增撤回按钮；每次打开文档都会建立独立撤回历史，`Ctrl/Cmd + Z` 最多只能回到文档刚打开时的原始内容。
- 修复本地图片预览失败：改由 Go 后端安全读取绝对路径和相对路径图片，不再依赖被 WebView 限制的 `file://` 地址。
- 修复新建文档“另存为”后出现两条最近阅读记录；另存成功后会删除自动创建的临时草稿及其记录，草稿标记在软件重启后仍然有效。
- 修复升级安装后 Windows 可能出现两个“轻阅 Markdown”应用或快捷方式的问题；安装范围统一为当前用户，安装器会清理旧 Electron/早期版本遗留的重复卸载项和快捷方式。
- Windows 更新安装时自动沿用上次选择的安装目录；从未记录目录的 2.2.2 升级时，也会根据现有卸载信息识别原安装位置。
- Windows 安装完成页默认勾选“运行 轻阅 Markdown”，点击“完成”后直接启动应用，并允许用户取消勾选。
- Windows 安装向导新增简体中文与 English 语言选择，欢迎页、目录页、安装进度和完成页会使用所选语言。
- 全新安装后第一次启动会要求选择软件界面语言；选择结果会持久保存，后续启动不再弹出，从不含此功能的旧版本升级也不会弹出。

### English

- Added a Markdown formatting toolbar for headings, quotes, bold, italic, links, ordered/unordered/task lists, tables, images, inline code and code blocks.
- Added `Ctrl/Cmd + B`, `Ctrl/Cmd + I` and `Ctrl/Cmd + K` editor shortcuts.
- Added Markdown file creation without a location prompt: files are created beside the application, with a silent fallback to the user's Documents directory when needed.
- Added 10-second autosave while editing, without overwriting changes made during an in-flight save.
- Added Recent and Resource Explorer views to the sidebar, including explorer refresh.
- Added a 30-day update reminder pause; manual update checks always remain available.
- Promoted New Document to the primary toolbar action and changed Open Document to a background-free secondary action.
- Added an Undo toolbar button and per-document history isolation, so `Ctrl/Cmd + Z` stops at the content originally loaded for that document.
- Fixed local image previews by loading image files through the Go backend instead of blocked `file://` URLs.
- Fixed duplicate Recent entries after saving a newly created document under another name; the auto-created draft and its record are removed after a successful Save As, even after restarting the app.
- Fixed duplicate Windows app entries or shortcuts after upgrading by consistently using per-user installation and cleaning stale uninstall records and shortcuts left by Electron or early installers.
- Windows upgrades now reuse the previously selected installation directory, with a compatibility fallback that detects the install location used by 2.2.2.
- The Windows setup completion page now launches Quillite Markdown by default after Finish, with an option to opt out.
- Added Simplified Chinese and English selection for the complete Windows setup flow.
- A new installation asks for the app interface language on its first launch and remembers the choice; upgrades from versions that predate this feature are explicitly excluded from the prompt.

## [2.2.2] - 2026-07-21

### 简体中文

- macOS 改用左侧原生窗口控制按钮、应用菜单、系统字体和 Command 快捷键，并增大窗口按钮与软件名称之间的距离。
- 启动软件时自动检查 GitHub 最新稳定版本，不再因 24 小时时间限制错过刚发布的更新。
- 更新弹窗现在支持排版显示 Markdown 更新说明。
- GitHub Release 标题和各平台安装包统一采用 `quillite-markdown 2.2.2` 英文命名。
- 发布流程自动从本文件提取当前版本内容作为更新说明。

### English

- Adopted native left-side macOS window controls, application menus, system fonts, and Command shortcuts, with more space before the app brand.
- Checks the latest stable GitHub Release once on every startup so newly published versions are not missed by a 24-hour throttle.
- Renders Markdown release notes properly in the update dialog.
- Standardized GitHub Release titles and downloadable asset names as `quillite-markdown 2.2.2` and ASCII-safe platform filenames.
- Automatically extracts the current version section from this changelog for GitHub Release notes.
- Aligned GitHub Actions with Go 1.25 used by the project.

### Fixed

- Removed the Windows-style title-bar controls from macOS builds.
- Existing Releases now replace legacy `MD.-...` assets with consistently named packages.

## [2.2.1] - 2026-07-21

### Added

- Daily background checks for the latest stable GitHub Release.
- Manual update checks from Settings, with release notes and a direct download-page action.
- Bilingual About and update dialogs.

### Changed

- Replaced the Electron desktop shell with Go and Wails while preserving the existing interface and editor workflow.
- Reduced the Windows installer from roughly 90 MB to about 8.3 MB.
- Added a transparent multi-size application icon without a white square canvas.

### Fixed

- Table-of-contents links now navigate to their document sections.
- Opened documents appear in Recent immediately, and individual recent records can be removed.
- The split editor reliably accepts pointer focus and displays live preview on the left.
- Desktop shortcuts are recreated with a versioned icon path to avoid stale Windows icon caching.

[2.2.1]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.2.1
[2.2.2]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.2.2
[2.2.3]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.2.3
[2.2.4]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.2.4
[2.2.5]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.2.5
[2.2.6]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.2.6
[2.3.0]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.0
[2.3.1]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.1
[2.3.2]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.2
[2.3.3]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.3
[2.3.4]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.4
[2.3.5]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.5
[2.3.6]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.6
[2.3.7]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.7
[2.3.8]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.8
[2.3.9]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.9
[2.3.10]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.10
[2.3.11]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.11
[2.3.12]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.12
[2.3.13]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.13
[2.4.0]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.0
[2.4.1]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.1
[2.4.2]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.2
[2.4.3]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.3
[2.4.4]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.4
[2.4.5]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.5
[2.4.6]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.6
[2.4.7]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.7
[2.4.8]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.8
[2.4.9]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.9
[2.5.0]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.5.0
[2.5.1]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.5.1
[2.5.2]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.5.2
[2.6.0]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.6.0
[2.6.1]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.6.1
[2.6.2]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.6.2
[2.7.0]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.7.0
[2.7.1]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.7.1
[2.7.2]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.7.2
[2.7.3]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.7.3
