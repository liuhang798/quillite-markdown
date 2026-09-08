const name = (zh, en) => ({ zh, en });
const chartSource = option => JSON.stringify(option, null, 2);

export const DIAGRAM_CATEGORIES = [
  { id: 'all', name: name('全部', 'All') },
  { id: 'process', name: name('流程与项目', 'Process & projects') },
  { id: 'software', name: name('软件与系统', 'Software & systems') },
  { id: 'data', name: name('数据分析', 'Data analysis') },
  { id: 'knowledge', name: name('知识与规划', 'Knowledge & planning') }
];

export const DIAGRAM_TEMPLATES = [
  {
    id: 'flowchart', category: 'process', visualEditor: 'canvas', name: name('流程图', 'Flowchart'),
    description: name('业务流程、审批逻辑、程序路径和决策分支；支持直接在画布上添加、连接、拖动和修改节点。', 'Business processes, approvals, execution paths, and decisions, with direct node editing, connecting, and dragging on the canvas.'),
    source: {
      zh: `flowchart LR\n    A([收到需求]) --> B{资料是否完整}\n    B -- 是 --> C[进入开发]\n    B -- 否 --> D[补充资料]\n    D --> B\n    C --> E[测试验收]\n    E --> F([发布完成])`,
      en: `flowchart LR\n    A([Receive request]) --> B{Information complete?}\n    B -- Yes --> C[Start development]\n    B -- No --> D[Complete information]\n    D --> B\n    C --> E[Test and accept]\n    E --> F([Release])`
    }
  },
  {
    id: 'sequence', category: 'process', visualEditor: 'structured', name: name('时序图', 'Sequence diagram'),
    description: name('接口调用、登录过程以及客户端和服务器的交互顺序。', 'API calls, login flows, and ordered client-server interactions.'),
    source: {
      zh: `sequenceDiagram\n    autonumber\n    actor U as 用户\n    participant A as 轻阅 Markdown\n    participant F as 本地文件\n    U->>A: 选择 Markdown 文档\n    A->>F: 请求读取文件\n    F-->>A: 返回文档内容\n    A-->>U: 显示实时预览`,
      en: `sequenceDiagram\n    autonumber\n    actor U as User\n    participant A as Quillite Markdown\n    participant F as Local file\n    U->>A: Select a Markdown document\n    A->>F: Read file\n    F-->>A: Return content\n    A-->>U: Show live preview`
    }
  },
  {
    id: 'gantt', category: 'process', visualEditor: 'structured', name: name('甘特图', 'Gantt chart'),
    description: name('项目排期、研发计划、任务依赖和里程碑。', 'Project schedules, task dependencies, and milestones.'),
    source: {
      zh: `gantt\n    title 版本发布计划\n    dateFormat YYYY-MM-DD\n    excludes weekends\n    section 规划\n    需求分析 :done, plan, {{date}}, 2d\n    section 实施\n    功能开发 :active, dev, after plan, 4d\n    测试验收 :test, after dev, 2d\n    正式发布 :milestone, release, after test, 0d`,
      en: `gantt\n    title Release plan\n    dateFormat YYYY-MM-DD\n    excludes weekends\n    section Planning\n    Requirements :done, plan, {{date}}, 2d\n    section Delivery\n    Development :active, dev, after plan, 4d\n    Testing :test, after dev, 2d\n    Release :milestone, release, after test, 0d`
    }
  },
  {
    id: 'state', category: 'process', visualEditor: 'canvas', name: name('状态图', 'State diagram'),
    description: name('订单、页面或文档的状态机和生命周期。', 'State machines and lifecycles for orders, pages, or documents.'),
    source: {
      zh: `stateDiagram-v2\n    [*] --> 未打开\n    未打开 --> 阅读中 : 打开文档\n    阅读中 --> 编辑中 : 点击编辑\n    编辑中 --> 已保存 : 保存\n    已保存 --> 阅读中 : 返回预览\n    阅读中 --> [*] : 关闭文档`,
      en: `stateDiagram-v2\n    [*] --> Closed\n    Closed --> Reading : Open document\n    Reading --> Editing : Edit\n    Editing --> Saved : Save\n    Saved --> Reading : Preview\n    Reading --> [*] : Close`
    }
  },
  {
    id: 'journey', category: 'process', name: name('用户旅程图', 'User journey'),
    description: name('用户体验、服务流程和各步骤满意度。', 'User experience, service flows, and satisfaction by step.'),
    source: {
      zh: `journey\n    title 用户阅读与编辑体验\n    section 打开文档\n      选择文件: 5: 用户\n      加载预览: 4: 应用\n    section 编辑文档\n      修改内容: 5: 用户\n      实时预览: 5: 用户, 应用\n      自动保存: 4: 应用`,
      en: `journey\n    title Reading and editing experience\n    section Open document\n      Select file: 5: User\n      Load preview: 4: App\n    section Edit document\n      Change content: 5: User\n      Live preview: 5: User, App\n      Autosave: 4: App`
    }
  },
  {
    id: 'timeline', category: 'process', visualEditor: 'structured', name: name('时间线', 'Timeline'),
    description: name('产品发展、事件历史和阶段性成果。', 'Product evolution, event history, and milestones.'),
    source: {
      zh: `timeline\n    title 产品功能演进\n    2026 Q1 : Markdown 阅读\n            : 最近阅读\n    2026 Q2 : 实时编辑\n            : Word 与 PDF 导出\n    2026 Q3 : 学科公式\n            : Mermaid 图表`,
      en: `timeline\n    title Product evolution\n    2026 Q1 : Markdown reading\n            : Recent documents\n    2026 Q2 : Live editing\n            : Word and PDF export\n    2026 Q3 : Academic formulas\n            : Mermaid diagrams`
    }
  },
  {
    id: 'kanban', category: 'process', visualEditor: 'structured', name: name('看板', 'Kanban'),
    description: name('待办、进行中、测试中和已完成任务。', 'Tasks grouped by backlog, progress, testing, and completion.'),
    source: {
      zh: `kanban\n  todo[待处理]\n    task1[撰写功能需求]\n    task2[设计交互界面]\n  doing[进行中]\n    task3[开发 Mermaid 图表]\n  testing[测试中]\n    task4[检查导出效果]\n  done[已完成]\n    task5[实时预览]`,
      en: `kanban\n  todo[To do]\n    task1[Write requirements]\n    task2[Design interface]\n  doing[In progress]\n    task3[Build Mermaid diagrams]\n  testing[Testing]\n    task4[Verify export]\n  done[Done]\n    task5[Live preview]`
    }
  },
  {
    id: 'class', category: 'software', name: name('类图', 'Class diagram'),
    description: name('类属性、方法和面向对象关系。', 'Class properties, methods, and object-oriented relationships.'),
    source: {
      zh: `classDiagram\n    class Document {\n        +String path\n        +String content\n        +open()\n        +save()\n    }\n    class Editor {\n        +renderPreview()\n        +exportWord()\n    }\n    Document "1" --> "1" Editor : 在编辑器中打开`,
      en: `classDiagram\n    class Document {\n        +String path\n        +String content\n        +open()\n        +save()\n    }\n    class Editor {\n        +renderPreview()\n        +exportWord()\n    }\n    Document "1" --> "1" Editor : opens in`
    }
  },
  {
    id: 'er', category: 'software', name: name('实体关系图', 'ER diagram'),
    description: name('数据库表结构、字段和一对多关系。', 'Database entities, fields, and cardinality.'),
    source: {
      zh: `erDiagram\n    USER ||--o{ DOCUMENT : creates\n    DOCUMENT ||--o{ REVISION : contains\n    USER {\n        string id PK\n        string name\n    }\n    DOCUMENT {\n        string id PK\n        string title\n        string path\n    }\n    REVISION {\n        string id PK\n        datetime saved_at\n    }`,
      en: `erDiagram\n    USER ||--o{ DOCUMENT : creates\n    DOCUMENT ||--o{ REVISION : contains\n    USER {\n        string id PK\n        string name\n    }\n    DOCUMENT {\n        string id PK\n        string title\n        string path\n    }\n    REVISION {\n        string id PK\n        datetime saved_at\n    }`
    }
  },
  {
    id: 'requirement', category: 'software', name: name('需求图', 'Requirement diagram'),
    description: name('软件需求、验证方法以及组件追踪关系。', 'Software requirements, verification methods, and traceability.'),
    source: {
      zh: `requirementDiagram\n    requirement fast_preview {\n        id: REQ001\n        text: Preview_updates_within_300_ms\n        risk: medium\n        verifymethod: test\n    }\n    element editor {\n        type: software\n        docref: renderer\n    }\n    editor - satisfies -> fast_preview`,
      en: `requirementDiagram\n    requirement fast_preview {\n        id: REQ001\n        text: Preview_updates_within_300_ms\n        risk: medium\n        verifymethod: test\n    }\n    element editor {\n        type: software\n        docref: renderer\n    }\n    editor - satisfies -> fast_preview`
    }
  },
  {
    id: 'gitgraph', category: 'software', name: name('Git 分支图', 'Git graph'),
    description: name('版本分支、提交记录和合并过程。', 'Branches, commits, and merge history.'),
    source: {
      zh: `gitGraph\n    commit id: "初始化项目"\n    branch develop\n    checkout develop\n    commit id: "开发图表功能"\n    commit id: "补充测试"\n    checkout main\n    merge develop\n    commit id: "发布新版本" tag: "v2.4.9"`,
      en: `gitGraph\n    commit id: "Initial project"\n    branch develop\n    checkout develop\n    commit id: "Build diagrams"\n    commit id: "Add tests"\n    checkout main\n    merge develop\n    commit id: "Release" tag: "v2.4.9"`
    }
  },
  {
    id: 'block', category: 'software', name: name('块图', 'Block diagram'),
    description: name('系统模块、硬件模块和数据处理管线。', 'System modules, hardware blocks, and data pipelines.'),
    source: {
      zh: `block-beta\n    columns 3\n    input["Markdown 文件"] parser["解析器"] preview["实时预览"]\n    input --> parser\n    parser --> preview`,
      en: `block-beta\n    columns 3\n    input["Markdown file"] parser["Parser"] preview["Live preview"]\n    input --> parser\n    parser --> preview`
    }
  },
  {
    id: 'packet', category: 'software', name: name('数据包图', 'Packet diagram'),
    description: name('网络协议、二进制数据和字段位宽。', 'Network protocols, binary data, and bit fields.'),
    source: {
      zh: `packet-beta\n    0-15: "源端口"\n    16-31: "目标端口"\n    32-47: "数据长度"\n    48-63: "校验和"`,
      en: `packet-beta\n    0-15: "Source port"\n    16-31: "Destination port"\n    32-47: "Data length"\n    48-63: "Checksum"`
    }
  },
  {
    id: 'architecture', category: 'software', name: name('架构图', 'Architecture diagram'),
    description: name('系统服务、模块分组、存储与连接关系。', 'Services, module groups, storage, and connections.'),
    source: {
      zh: `architecture-beta\n    group desktop(cloud)[Desktop]\n    service editor(server)[Editor] in desktop\n    service preview(internet)[Preview] in desktop\n    service file(database)[File] in desktop\n    editor:R -- L:file\n    editor:R -- L:preview`,
      en: `architecture-beta\n    group desktop(cloud)[Desktop]\n    service editor(server)[Editor] in desktop\n    service preview(internet)[Preview] in desktop\n    service file(database)[File] in desktop\n    editor:R -- L:file\n    editor:R -- L:preview`
    }
  },
  {
    id: 'c4', category: 'software', name: name('C4 系统上下文图', 'C4 context'),
    description: name('从用户和外部系统视角说明软件边界。', 'System boundaries viewed through users and external dependencies.'),
    source: {
      zh: `C4Context\n    title 轻阅 Markdown 系统上下文\n    Person(user, "用户", "阅读和编辑本地 Markdown 文档")\n    System(app, "轻阅 Markdown", "跨平台 Markdown 阅读编辑器")\n    System_Ext(site, "官方网站", "提供教程、版本与下载")\n    Rel(user, app, "打开、阅读和编辑")\n    Rel(app, site, "检查更新", "HTTPS")`,
      en: `C4Context\n    title Quillite Markdown system context\n    Person(user, "User", "Reads and edits local Markdown")\n    System(app, "Quillite Markdown", "Cross-platform Markdown reader and editor")\n    System_Ext(site, "Official website", "Guides, releases, and downloads")\n    Rel(user, app, "Open, read, and edit")\n    Rel(app, site, "Check for updates", "HTTPS")`
    }
  },
  {
    id: 'pie', category: 'data', visualEditor: 'structured', name: name('饼图', 'Pie chart'),
    description: name('分类占比和构成比例。', 'Category proportions and composition.'),
    source: {
      zh: `pie showData\n    title 文档类型占比\n    "技术文档" : 45\n    "项目方案" : 25\n    "学习笔记" : 20\n    "其他" : 10`,
      en: `pie showData\n    title Document types\n    "Technical" : 45\n    "Projects" : 25\n    "Notes" : 20\n    "Other" : 10`
    }
  },
  {
    id: 'quadrant', category: 'data', name: name('象限图', 'Quadrant chart'),
    description: name('任务优先级、产品定位和二维指标。', 'Prioritization, positioning, and two-dimensional metrics.'),
    source: {
      zh: `quadrantChart\n    title Task value and urgency\n    x-axis Low value --> High value\n    y-axis Low urgency --> High urgency\n    quadrant-1 Do first\n    quadrant-2 Quick wins\n    quadrant-3 Defer\n    quadrant-4 Plan\n    Fix crash: [0.92, 0.88]\n    Update docs: [0.58, 0.35]\n    Polish icon: [0.32, 0.42]`,
      en: `quadrantChart\n    title Task value and urgency\n    x-axis Low value --> High value\n    y-axis Low urgency --> High urgency\n    quadrant-1 Do first\n    quadrant-2 Quick wins\n    quadrant-3 Defer\n    quadrant-4 Plan\n    Fix crash: [0.92, 0.88]\n    Update docs: [0.58, 0.35]\n    Polish icon: [0.32, 0.42]`
    }
  },
  {
    id: 'xy', category: 'data', name: name('XY 图表', 'XY chart'),
    description: name('趋势折线、数量柱状图和多组数据对比。', 'Line trends, bars, and series comparisons.'),
    source: {
      zh: `xychart-beta\n    title "每月打开文档数"\n    x-axis [Jan, Feb, Mar, Apr, May, Jun]\n    y-axis "Documents" 0 --> 120\n    bar [45, 62, 78, 70, 95, 112]\n    line [40, 58, 72, 82, 92, 108]`,
      en: `xychart-beta\n    title "Documents opened monthly"\n    x-axis [Jan, Feb, Mar, Apr, May, Jun]\n    y-axis "Documents" 0 --> 120\n    bar [45, 62, 78, 70, 95, 112]\n    line [40, 58, 72, 82, 92, 108]`
    }
  },
  {
    id: 'sankey', category: 'data', visualEditor: 'structured', name: name('桑基图', 'Sankey diagram'),
    description: name('流量、能量、资金或数据的去向与占比。', 'Flow and distribution of traffic, energy, money, or data.'),
    source: {
      zh: `sankey-beta\nMarkdown,Parser,100\nParser,Preview,70\nParser,WordExport,15\nParser,HTMLExport,15`,
      en: `sankey-beta\nMarkdown,Parser,100\nParser,Preview,70\nParser,WordExport,15\nParser,HTMLExport,15`
    }
  },
  {
    id: 'radar', category: 'data', name: name('雷达图', 'Radar diagram'),
    description: name('多维能力评估和指标综合对比。', 'Multi-dimensional capability and metric comparisons.'),
    source: {
      zh: `radar-beta\n    title 轻阅 Markdown 能力分布\n    axis speed["速度"], preview["预览"], export["导出"], theme["主题"], local["本地"]\n    curve quillite["轻阅"]{95, 90, 82, 88, 100}\n    max 100\n    min 0`,
      en: `radar-beta\n    title Quillite Markdown capabilities\n    axis speed["Speed"], preview["Preview"], export["Export"], theme["Themes"], local["Local"]\n    curve quillite["Quillite"]{95, 90, 82, 88, 100}\n    max 100\n    min 0`
    }
  },
  {
    id: 'treemap', category: 'data', name: name('树状矩形图', 'Treemap'),
    description: name('用面积展示层级数据和各部分占比。', 'Hierarchical data represented by proportional areas.'),
    source: {
      zh: `treemap-beta\n    "轻阅 Markdown"\n        "阅读": 35\n        "编辑": 30\n        "导出": 20\n        "图表": 15`,
      en: `treemap-beta\n    "Quillite Markdown"\n        "Reading": 35\n        "Editing": 30\n        "Export": 20\n        "Diagrams": 15`
    }
  },
  {
    id: 'bar-chart', category: 'data', engine: 'echarts', visualEditor: 'structured', name: name('柱状图', 'Bar chart'),
    description: name('比较不同分类的数量、金额或频次。', 'Compare values, amounts, or frequencies across categories.'),
    source: {
      zh: chartSource({ title: { text: '月度文档数量', left: 'center' }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: ['一月', '二月', '三月', '四月', '五月', '六月'] }, yAxis: { type: 'value', name: '文档数' }, series: [{ name: '文档数', type: 'bar', data: [42, 58, 76, 69, 91, 108] }] }),
      en: chartSource({ title: { text: 'Monthly documents', left: 'center' }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] }, yAxis: { type: 'value', name: 'Documents' }, series: [{ name: 'Documents', type: 'bar', data: [42, 58, 76, 69, 91, 108] }] })
    }
  },
  {
    id: 'line-chart', category: 'data', engine: 'echarts', visualEditor: 'structured', name: name('折线图', 'Line chart'),
    description: name('展示连续时间内的趋势和变化速度。', 'Show trends and rates of change over continuous time.'),
    source: {
      zh: chartSource({ title: { text: '阅读时长趋势', left: 'center' }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', boundaryGap: false, data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] }, yAxis: { type: 'value', name: '分钟' }, series: [{ name: '阅读时长', type: 'line', data: [18, 26, 21, 34, 42, 55, 48] }] }),
      en: chartSource({ title: { text: 'Reading time trend', left: 'center' }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', boundaryGap: false, data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }, yAxis: { type: 'value', name: 'Minutes' }, series: [{ name: 'Reading time', type: 'line', data: [18, 26, 21, 34, 42, 55, 48] }] })
    }
  },
  {
    id: 'stacked-bar-chart', category: 'data', engine: 'echarts', name: name('堆叠柱状图', 'Stacked bar chart'),
    description: name('同时比较总量和各组成部分。', 'Compare totals and their composition at the same time.'),
    source: {
      zh: chartSource({ title: { text: '导出类型分布', left: 'center' }, tooltip: { trigger: 'axis' }, legend: { top: 30 }, xAxis: { type: 'category', data: ['一季度', '二季度', '三季度', '四季度'] }, yAxis: { type: 'value' }, series: [{ name: 'Word', type: 'bar', stack: 'total', data: [32, 41, 48, 53] }, { name: 'PDF', type: 'bar', stack: 'total', data: [24, 30, 39, 45] }, { name: 'HTML', type: 'bar', stack: 'total', data: [12, 18, 21, 27] }] }),
      en: chartSource({ title: { text: 'Export format distribution', left: 'center' }, tooltip: { trigger: 'axis' }, legend: { top: 30 }, xAxis: { type: 'category', data: ['Q1', 'Q2', 'Q3', 'Q4'] }, yAxis: { type: 'value' }, series: [{ name: 'Word', type: 'bar', stack: 'total', data: [32, 41, 48, 53] }, { name: 'PDF', type: 'bar', stack: 'total', data: [24, 30, 39, 45] }, { name: 'HTML', type: 'bar', stack: 'total', data: [12, 18, 21, 27] }] })
    }
  },
  {
    id: 'area-chart', category: 'data', engine: 'echarts', name: name('面积图', 'Area chart'),
    description: name('突出趋势变化和累计规模。', 'Emphasize trend changes and cumulative magnitude.'),
    source: {
      zh: chartSource({ title: { text: '累计阅读量', left: 'center' }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', boundaryGap: false, data: ['一月', '二月', '三月', '四月', '五月', '六月'] }, yAxis: { type: 'value', name: '篇次' }, series: [{ name: '阅读量', type: 'line', smooth: true, areaStyle: {}, data: [120, 182, 251, 334, 442, 581] }] }),
      en: chartSource({ title: { text: 'Cumulative reads', left: 'center' }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', boundaryGap: false, data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] }, yAxis: { type: 'value', name: 'Reads' }, series: [{ name: 'Reads', type: 'line', smooth: true, areaStyle: {}, data: [120, 182, 251, 334, 442, 581] }] })
    }
  },
  {
    id: 'scatter-chart', category: 'data', engine: 'echarts', name: name('散点图', 'Scatter plot'),
    description: name('观察两个连续变量之间的相关性和离群点。', 'Inspect correlation and outliers between two continuous variables.'),
    source: {
      zh: chartSource({ title: { text: '文档长度与阅读时长', left: 'center' }, tooltip: { trigger: 'item' }, grid: { left: 62, right: 76, top: 62, bottom: 58, containLabel: true }, xAxis: { type: 'value', name: '字数（千字）', nameLocation: 'middle', nameGap: 30 }, yAxis: { type: 'value', name: '阅读时长（分钟）', nameLocation: 'middle', nameGap: 38 }, series: [{ name: '文档', type: 'scatter', symbolSize: 15, data: [[1.2, 4], [2.4, 7], [3.1, 9], [4.8, 16], [5.4, 14], [7.2, 23], [8.5, 28]] }] }),
      en: chartSource({ title: { text: 'Document length vs reading time', left: 'center' }, tooltip: { trigger: 'item' }, grid: { left: 72, right: 80, top: 62, bottom: 62, containLabel: true }, xAxis: { type: 'value', name: 'Words (thousands)', nameLocation: 'middle', nameGap: 32 }, yAxis: { type: 'value', name: 'Reading time (minutes)', nameLocation: 'middle', nameGap: 44 }, series: [{ name: 'Documents', type: 'scatter', symbolSize: 15, data: [[1.2, 4], [2.4, 7], [3.1, 9], [4.8, 16], [5.4, 14], [7.2, 23], [8.5, 28]] }] })
    }
  },
  {
    id: 'diverging-bar-chart', category: 'data', engine: 'echarts', name: name('正反向对比图', 'Diverging bar chart'),
    description: name('从中心线向左右比较两组相反或对立指标。', 'Compare opposing values extending left and right from a shared baseline.'),
    source: {
      zh: chartSource({ title: { text: '功能满意与不满意对比', left: 'center' }, tooltip: { trigger: 'axis' }, legend: { top: 30 }, grid: { left: 92, right: 76, top: 72, bottom: 56, containLabel: true }, xAxis: { type: 'value', min: -100, max: 100, name: '比例（%）', nameLocation: 'middle', nameGap: 30 }, yAxis: { type: 'category', data: ['阅读体验', '编辑体验', '导出功能', '主题外观'] }, series: [{ name: '不满意', type: 'bar', stack: 'compare', data: [-18, -24, -31, -12] }, { name: '满意', type: 'bar', stack: 'compare', data: [78, 72, 64, 85] }] }),
      en: chartSource({ title: { text: 'Satisfied vs dissatisfied', left: 'center' }, tooltip: { trigger: 'axis' }, legend: { top: 30 }, grid: { left: 92, right: 82, top: 72, bottom: 56, containLabel: true }, xAxis: { type: 'value', min: -100, max: 100, name: 'Percent', nameLocation: 'middle', nameGap: 30 }, yAxis: { type: 'category', data: ['Reading', 'Editing', 'Export', 'Appearance'] }, series: [{ name: 'Dissatisfied', type: 'bar', stack: 'compare', data: [-18, -24, -31, -12] }, { name: 'Satisfied', type: 'bar', stack: 'compare', data: [78, 72, 64, 85] }] })
    }
  },
  {
    id: 'combo-chart', category: 'data', engine: 'echarts', name: name('组合图（柱状＋折线）', 'Combo chart (bar + line)'),
    description: name('使用双坐标轴同时展示规模和变化率。', 'Use dual axes to show magnitude and rate together.'),
    source: {
      zh: chartSource({ title: { text: '下载量与增长率', left: 'center' }, tooltip: { trigger: 'axis' }, legend: { top: 30 }, xAxis: { type: 'category', data: ['一月', '二月', '三月', '四月', '五月', '六月'] }, yAxis: [{ type: 'value', name: '下载量' }, { type: 'value', name: '增长率（%）' }], series: [{ name: '下载量', type: 'bar', data: [320, 410, 520, 610, 780, 920] }, { name: '增长率', type: 'line', yAxisIndex: 1, data: [8, 12, 15, 11, 19, 18] }] }),
      en: chartSource({ title: { text: 'Downloads and growth rate', left: 'center' }, tooltip: { trigger: 'axis' }, legend: { top: 30 }, xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] }, yAxis: [{ type: 'value', name: 'Downloads' }, { type: 'value', name: 'Growth (%)' }], series: [{ name: 'Downloads', type: 'bar', data: [320, 410, 520, 610, 780, 920] }, { name: 'Growth', type: 'line', yAxisIndex: 1, data: [8, 12, 15, 11, 19, 18] }] })
    }
  },
  {
    id: 'funnel-chart', category: 'data', engine: 'echarts', name: name('漏斗图', 'Funnel chart'),
    description: name('展示流程各阶段的转化和流失。', 'Show conversion and drop-off across process stages.'),
    source: {
      zh: chartSource({ title: { text: '用户转化漏斗', left: 'center' }, tooltip: { trigger: 'item' }, series: [{ name: '转化', type: 'funnel', top: 55, bottom: 20, label: { show: true, position: 'inside' }, data: [{ value: 100, name: '访问官网' }, { value: 72, name: '下载安装' }, { value: 54, name: '首次打开' }, { value: 41, name: '持续使用' }] }] }),
      en: chartSource({ title: { text: 'User conversion funnel', left: 'center' }, tooltip: { trigger: 'item' }, series: [{ name: 'Conversion', type: 'funnel', top: 55, bottom: 20, label: { show: true, position: 'inside' }, data: [{ value: 100, name: 'Visit website' }, { value: 72, name: 'Download' }, { value: 54, name: 'First launch' }, { value: 41, name: 'Retained' }] }] })
    }
  },
  {
    id: 'heatmap-chart', category: 'data', engine: 'echarts', name: name('热力图', 'Heatmap'),
    description: name('用颜色深浅展示二维数据密度或相关程度。', 'Use color intensity to show two-dimensional density or correlation.'),
    source: {
      zh: chartSource({ __quillite: { height: 460 }, title: { text: '每周阅读热力', left: 'center' }, tooltip: { position: 'top' }, grid: { top: 60, left: 80, right: 38, bottom: 108, containLabel: true }, xAxis: { type: 'category', data: ['上午', '中午', '下午', '晚上'] }, yAxis: { type: 'category', data: ['周一', '周二', '周三', '周四', '周五'] }, visualMap: { min: 0, max: 10, calculable: true, orient: 'horizontal', left: 'center', bottom: 8, inRange: { color: ['#C9E3F1', '#86C8C0', '#F3E39A', '#EEA06F', '#D85E63'] } }, series: [{ type: 'heatmap', data: [[0, 0, 2], [1, 0, 5], [2, 0, 7], [3, 0, 4], [0, 1, 3], [1, 1, 8], [2, 1, 6], [3, 1, 9], [0, 2, 1], [1, 2, 4], [2, 2, 8], [3, 2, 7], [0, 3, 4], [1, 3, 6], [2, 3, 9], [3, 3, 8], [0, 4, 2], [1, 4, 5], [2, 4, 7], [3, 4, 10]], label: { show: true } }] }),
      en: chartSource({ __quillite: { height: 460 }, title: { text: 'Weekly reading heatmap', left: 'center' }, tooltip: { position: 'top' }, grid: { top: 60, left: 80, right: 38, bottom: 108, containLabel: true }, xAxis: { type: 'category', data: ['Morning', 'Noon', 'Afternoon', 'Evening'] }, yAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] }, visualMap: { min: 0, max: 10, calculable: true, orient: 'horizontal', left: 'center', bottom: 8, inRange: { color: ['#C9E3F1', '#86C8C0', '#F3E39A', '#EEA06F', '#D85E63'] } }, series: [{ type: 'heatmap', data: [[0, 0, 2], [1, 0, 5], [2, 0, 7], [3, 0, 4], [0, 1, 3], [1, 1, 8], [2, 1, 6], [3, 1, 9], [0, 2, 1], [1, 2, 4], [2, 2, 8], [3, 2, 7], [0, 3, 4], [1, 3, 6], [2, 3, 9], [3, 3, 8], [0, 4, 2], [1, 4, 5], [2, 4, 7], [3, 4, 10]], label: { show: true } }] })
    }
  },
  {
    id: 'boxplot-chart', category: 'data', engine: 'echarts', name: name('箱线图', 'Box plot'),
    description: name('展示数据分布、中位数、四分位数和异常范围。', 'Show distributions, medians, quartiles, and ranges.'),
    source: {
      zh: chartSource({ title: { text: '不同文档类型阅读时长分布', left: 'center' }, tooltip: { trigger: 'item' }, xAxis: { type: 'category', data: ['技术文档', '项目方案', '学习笔记', '会议记录'] }, yAxis: { type: 'value', name: '分钟' }, series: [{ name: '阅读时长', type: 'boxplot', data: [[3, 6, 10, 15, 24], [4, 8, 12, 19, 30], [2, 5, 8, 13, 20], [1, 3, 6, 9, 15]] }] }),
      en: chartSource({ title: { text: 'Reading time distribution', left: 'center' }, tooltip: { trigger: 'item' }, xAxis: { type: 'category', data: ['Technical', 'Project', 'Notes', 'Meetings'] }, yAxis: { type: 'value', name: 'Minutes' }, series: [{ name: 'Reading time', type: 'boxplot', data: [[3, 6, 10, 15, 24], [4, 8, 12, 19, 30], [2, 5, 8, 13, 20], [1, 3, 6, 9, 15]] }] })
    }
  },
  {
    id: 'bubble-chart', category: 'data', engine: 'echarts', name: name('气泡图', 'Bubble chart'),
    description: name('通过横轴、纵轴和气泡大小同时比较三个指标。', 'Compare three measures through x, y, and bubble size.'),
    source: {
      zh: chartSource({ __quillite: { transform: 'bubble', height: 460 }, title: { text: '文档价值分析', left: 'center' }, tooltip: { trigger: 'item' }, grid: { left: 72, right: 72, top: 70, bottom: 66, containLabel: true }, xAxis: { type: 'value', name: '使用频率', nameLocation: 'middle', nameGap: 32 }, yAxis: { type: 'value', name: '平均阅读时长', nameLocation: 'middle', nameGap: 42 }, series: [{ name: '文档', type: 'scatter', data: [[20, 12, 18, '说明文档'], [45, 18, 32, '项目方案'], [72, 28, 46, '知识库'], [58, 10, 24, '会议记录'], [86, 22, 38, '操作手册']] }] }),
      en: chartSource({ __quillite: { transform: 'bubble', height: 460 }, title: { text: 'Document value analysis', left: 'center' }, tooltip: { trigger: 'item' }, grid: { left: 82, right: 78, top: 70, bottom: 70, containLabel: true }, xAxis: { type: 'value', name: 'Usage frequency', nameLocation: 'middle', nameGap: 34 }, yAxis: { type: 'value', name: 'Average reading time', nameLocation: 'middle', nameGap: 48 }, series: [{ name: 'Documents', type: 'scatter', data: [[20, 12, 18, 'Guide'], [45, 18, 32, 'Plan'], [72, 28, 46, 'Knowledge base'], [58, 10, 24, 'Meeting notes'], [86, 22, 38, 'Manual']] }] })
    }
  },
  {
    id: 'gauge-chart', category: 'data', engine: 'echarts', name: name('仪表盘', 'Gauge chart'),
    description: name('突出展示单个关键指标的完成度或状态。', 'Highlight the completion or status of one key metric.'),
    source: {
      zh: chartSource({ title: { text: '本月目标完成率', left: 'center' }, series: [{ type: 'gauge', center: ['50%', '58%'], progress: { show: true, width: 18 }, axisLine: { lineStyle: { width: 18 } }, detail: { valueAnimation: true, formatter: '{value}%', fontSize: 26 }, data: [{ value: 78, name: '完成率' }] }] }),
      en: chartSource({ title: { text: 'Monthly target completion', left: 'center' }, series: [{ type: 'gauge', center: ['50%', '58%'], progress: { show: true, width: 18 }, axisLine: { lineStyle: { width: 18 } }, detail: { valueAnimation: true, formatter: '{value}%', fontSize: 26 }, data: [{ value: 78, name: 'Completion' }] }] })
    }
  },
  {
    id: 'doughnut-chart', category: 'data', engine: 'echarts', visualEditor: 'structured', name: name('环形图', 'Doughnut chart'),
    description: name('以环形结构展示分类占比，并在中心保留说明空间。', 'Show proportions in a ring with room for a central summary.'),
    source: {
      zh: chartSource({ __quillite: { height: 460 }, title: { text: '文档来源占比', left: 'center' }, tooltip: { trigger: 'item' }, legend: { bottom: 4, left: 'center' }, series: [{ name: '来源', type: 'pie', radius: ['38%', '62%'], center: ['50%', '48%'], label: { formatter: '{b}\n{d}%' }, data: [{ value: 46, name: '本地创建' }, { value: 28, name: '团队共享' }, { value: 16, name: '即时通讯' }, { value: 10, name: '其他' }] }] }),
      en: chartSource({ __quillite: { height: 460 }, title: { text: 'Document sources', left: 'center' }, tooltip: { trigger: 'item' }, legend: { bottom: 4, left: 'center' }, series: [{ name: 'Source', type: 'pie', radius: ['38%', '62%'], center: ['50%', '48%'], label: { formatter: '{b}\n{d}%' }, data: [{ value: 46, name: 'Created locally' }, { value: 28, name: 'Team shared' }, { value: 16, name: 'Messaging' }, { value: 10, name: 'Other' }] }] })
    }
  },
  {
    id: 'waterfall-chart', category: 'data', engine: 'echarts', name: name('瀑布图', 'Waterfall chart'),
    description: name('展示一个总量经过连续增减后的变化过程。', 'Show how sequential gains and losses change a total.'),
    source: {
      zh: chartSource({ title: { text: '月度用户变化', left: 'center' }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: ['期初', '新增', '回流', '流失', '停用', '期末'] }, yAxis: { type: 'value', name: '用户数' }, series: [{ name: '辅助', type: 'bar', stack: 'total', itemStyle: { color: 'transparent' }, data: [0, 1200, 1530, 1280, 1160, 0] }, { name: '增加', type: 'bar', stack: 'total', data: [1200, 330, 170, '-', '-', 1090] }, { name: '减少', type: 'bar', stack: 'total', data: ['-', '-', '-', 250, 120, '-'] }] }),
      en: chartSource({ title: { text: 'Monthly user change', left: 'center' }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: ['Opening', 'New', 'Returned', 'Lost', 'Inactive', 'Closing'] }, yAxis: { type: 'value', name: 'Users' }, series: [{ name: 'Helper', type: 'bar', stack: 'total', itemStyle: { color: 'transparent' }, data: [0, 1200, 1530, 1280, 1160, 0] }, { name: 'Increase', type: 'bar', stack: 'total', data: [1200, 330, 170, '-', '-', 1090] }, { name: 'Decrease', type: 'bar', stack: 'total', data: ['-', '-', '-', 250, 120, '-'] }] })
    }
  },
  {
    id: 'word-cloud', category: 'knowledge', engine: 'echarts', name: name('词云图', 'Word cloud'),
    description: name('根据词频突出关键词和主题分布。', 'Emphasize keywords and topic distribution by frequency.'),
    source: {
      zh: chartSource({ title: { text: 'Markdown 关键词', left: 'center' }, tooltip: { show: true }, series: [{ type: 'wordCloud', shape: 'circle', gridSize: 14, sizeRange: [16, 46], rotationRange: [0, 0], data: [{ name: 'Markdown', value: 100 }, { name: '本地优先', value: 82 }, { name: '实时预览', value: 76 }, { name: '轻量', value: 70 }, { name: '开源', value: 66 }, { name: '学科公式', value: 58 }, { name: '图表', value: 54 }, { name: 'Word 导出', value: 46 }, { name: 'PDF', value: 42 }, { name: '跨平台', value: 38 }] }] }),
      en: chartSource({ title: { text: 'Markdown keywords', left: 'center' }, tooltip: { show: true }, series: [{ type: 'wordCloud', shape: 'circle', gridSize: 14, sizeRange: [16, 46], rotationRange: [0, 0], data: [{ name: 'Markdown', value: 100 }, { name: 'Local first', value: 82 }, { name: 'Live preview', value: 76 }, { name: 'Lightweight', value: 70 }, { name: 'Open source', value: 66 }, { name: 'Formulas', value: 58 }, { name: 'Diagrams', value: 54 }, { name: 'Word export', value: 46 }, { name: 'PDF', value: 42 }, { name: 'Cross-platform', value: 38 }] }] })
    }
  },
  {
    id: 'mindmap', category: 'knowledge', visualEditor: 'canvas', name: name('思维导图', 'Mindmap'),
    description: name('知识整理、功能拆解、头脑风暴和文章大纲。', 'Knowledge organization, feature breakdowns, and outlines.'),
    source: {
      zh: `mindmap\n  root((轻阅 Markdown))\n    阅读\n      实时预览\n      目录定位\n      收藏文档\n    编辑\n      语法高亮\n      自动保存\n      学科公式\n    导出\n      Word\n      PDF\n      HTML`,
      en: `mindmap\n  root((Quillite Markdown))\n    Read\n      Live preview\n      Outline navigation\n      Favorites\n    Edit\n      Syntax highlighting\n      Autosave\n      Academic formulas\n    Export\n      Word\n      PDF\n      HTML`
    }
  }
];

export function diagramTemplatesForCategory(category) {
  return category === 'all' ? DIAGRAM_TEMPLATES : DIAGRAM_TEMPLATES.filter(template => template.category === category);
}

export function diagramTemplateById(id) {
  if (id === 'source-mermaid' || id === 'source-echarts') return {
    id, engine: id === 'source-echarts' ? 'echarts' : 'mermaid',
    name: name('自定义图表', 'Custom diagram'),
    description: name('编辑原始源码，右侧实时预览；保存时只替换当前图表。', 'Edit the original source with live preview; saving replaces only this diagram.'),
    source: { zh: '', en: '' }
  };
  return DIAGRAM_TEMPLATES.find(template => template.id === id) || DIAGRAM_TEMPLATES[0];
}

export function diagramTemplateSource(template, locale = 'zh') {
  const source = template?.source?.[locale] || template?.source?.zh || '';
  return source.replaceAll('{{date}}', new Date().toISOString().slice(0, 10));
}
