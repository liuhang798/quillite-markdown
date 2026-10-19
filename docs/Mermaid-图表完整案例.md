# Mermaid 图表完整案例

轻阅 Markdown 内置 Mermaid 11 图表引擎。只要把图表源码放进语言标记为 `mermaid` 的围栏代码块，阅读页面和编辑页面左侧的实时预览就会自动显示图表。

编辑器“更多格式”提供统一的“图表生成器”：弹窗内按用途列出本文覆盖的 22 类常用图表，选择后可以查看说明、编辑完整源码并实时预览，再一键插入 Markdown。所有源码仍保存在 Markdown 文件中，不会被替换成图片。

## 快速开始

基本写法如下。第一行决定图表类型，其余内容描述节点、关系或数据。

````markdown
```mermaid
flowchart LR
    A[开始] --> B[结束]
```
````

## 一、流程图（Flowchart）

**适用场景：** 业务流程、审批逻辑、程序执行路径和决策分支。

```mermaid
flowchart LR
    A([收到需求]) --> B{资料是否完整}
    B -- 是 --> C[进入开发]
    B -- 否 --> D[补充资料]
    D --> B
    C --> E[测试验收]
    E --> F([发布完成])
```

- `LR` 表示从左向右；可改成 `TD`，让图表从上向下排列。
- `[]` 是普通步骤，`{}` 是判断节点，`([])` 是起止节点。
- `[/文字/]` 是输入／输出平行四边形。画布工具栏可直接添加，也可选中节点后切换形状，保留文字和连线。

### 教学示例：输入、计算与输出

```mermaid
flowchart TD
    A([开始]) --> B[/输入两个数 a、b/]
    B --> C[计算 sum = a + b]
    C --> D[/输出 sum/]
    D --> E([结束])
```

## 二、时序图（Sequence Diagram）

**适用场景：** 接口调用、登录过程、客户端与服务器之间的交互顺序。

```mermaid
sequenceDiagram
    autonumber
    actor U as 用户
    participant A as 轻阅 Markdown
    participant F as 本地文件
    U->>A: 选择 Markdown 文档
    A->>F: 请求读取文件
    F-->>A: 返回文档内容
    A-->>U: 显示实时预览
    U->>A: 修改并保存
    A->>F: 写入最新内容
```

- `->>` 表示请求，`-->>` 常用于返回结果。
- `autonumber` 会自动给每一步编号。

## 三、甘特图（Gantt Chart）

**适用场景：** 项目排期、研发计划、任务依赖和里程碑管理。

```mermaid
gantt
    title 轻阅 Markdown 版本发布计划
    dateFormat YYYY-MM-DD
    excludes weekends
    section 规划
    需求分析 :done, plan, 2026-08-20, 2d
    section 实施
    功能开发 :active, dev, after plan, 4d
    测试验收 :test, after dev, 2d
    正式发布 :milestone, release, after test, 0d
```

- `done`、`active` 分别表示已完成和进行中的任务。
- `after plan` 表示任务在 `plan` 完成后开始。

## 四、类图（Class Diagram）

**适用场景：** 面向对象设计、类属性、方法和类之间的关系。

```mermaid
classDiagram
    class Document {
        +String path
        +String content
        +open()
        +save()
    }
    class Editor {
        +renderPreview()
        +exportWord()
    }
    Document "1" --> "1" Editor : 在编辑器中打开
```

## 五、状态图（State Diagram）

**适用场景：** 订单状态、页面状态、文档生命周期和状态机设计。

```mermaid
stateDiagram-v2
    [*] --> 未打开
    未打开 --> 阅读中 : 打开文档
    阅读中 --> 编辑中 : 点击编辑
    编辑中 --> 已保存 : 保存
    已保存 --> 阅读中 : 返回预览
    阅读中 --> [*] : 关闭文档
```

## 六、实体关系图（ER Diagram）

**适用场景：** 数据库表结构、实体字段及一对一、一对多关系。

```mermaid
erDiagram
    USER ||--o{ DOCUMENT : creates
    DOCUMENT ||--o{ REVISION : contains
    USER {
        string id PK
        string name
    }
    DOCUMENT {
        string id PK
        string title
        string path
    }
    REVISION {
        string id PK
        datetime saved_at
    }
```

## 七、用户旅程图（User Journey）

**适用场景：** 用户体验分析、服务流程和各步骤满意度记录。

```mermaid
journey
    title 用户阅读与编辑文档的体验
    section 打开文档
      选择文件: 5: 用户
      加载预览: 4: 应用
    section 编辑文档
      修改内容: 5: 用户
      实时预览: 5: 用户, 应用
      自动保存: 4: 应用
```

评分范围通常为 1～5，数字越高代表体验越好。

## 八、饼图（Pie Chart）

**适用场景：** 展示分类占比和构成比例。

```mermaid
pie showData
    title 文档类型占比
    "技术文档" : 45
    "项目方案" : 25
    "学习笔记" : 20
    "其他" : 5
    "其他1" : 5
```

## 九、象限图（Quadrant Chart）

**适用场景：** 任务优先级、产品定位和二维指标分析。

```mermaid
quadrantChart
    title Task value and urgency
    x-axis Low value --> High value
    y-axis Low urgency --> High urgency
    quadrant-1 Do first
    quadrant-2 Quick wins
    quadrant-3 Defer
    quadrant-4 Plan
    Fix crash: [0.92, 0.88]
    Update docs: [0.58, 0.35]
    Polish icon: [0.32, 0.42]
```

## 十、XY 图表（XY Chart）

**适用场景：** 趋势折线、数量柱状图和两组数据对比。

```mermaid
xychart-beta
    title "每月打开文档数"
    x-axis [Jan, Feb, Mar, Apr, May, Jun]
    y-axis "Documents" 0 --> 120
    bar [45, 62, 78, 70, 95, 112]
    line [40, 58, 72, 82, 92, 108]
```

## 十一、需求图（Requirement Diagram）

**适用场景：** 软件需求、验证方法和需求与组件的追踪关系。

```mermaid
requirementDiagram
    requirement fast_preview {
        id: REQ001
        text: Preview_updates_within_300_ms
        risk: medium
        verifymethod: test
    }
    element editor {
        type: software
        docref: renderer
    }
    editor - satisfies -> fast_preview
```

## 十二、Git 分支图（Git Graph）

**适用场景：** 版本分支、提交记录和合并过程说明。

```mermaid
gitGraph
    commit id: "初始化项目"
    branch develop
    checkout develop
    commit id: "开发图表功能"
    commit id: "补充测试"
    checkout main
    merge develop
    commit id: "发布新版本" tag: "v2.5.1"
```

## 十三、思维导图（Mindmap）

**适用场景：** 知识整理、功能拆解、头脑风暴和文章大纲。

```mermaid
mindmap
  root((轻阅 Markdown))
    阅读
      实时预览
      目录定位
      收藏文档
    编辑
      语法高亮
      自动保存
      学科公式
    导出
      Word
      PDF
      HTML
```

## 十四、时间线（Timeline）

**适用场景：** 产品发展、事件历史和阶段性成果展示。

```mermaid
timeline
    title 轻阅 Markdown 功能演进
    2026 Q1 : Markdown 阅读
            : 最近阅读
    2026 Q2 : 实时编辑
            : Word 与 PDF 导出
    2026 Q3 : 学科公式
            : Mermaid 图表
```

## 十五、看板（Kanban）

**适用场景：** 待办、进行中、测试中和已完成任务的可视化管理。

```mermaid
kanban
  todo[待处理]
    task1[撰写功能需求]
    task2[设计交互界面]
  doing[进行中]
    task3[开发 Mermaid 图表]
  testing[测试中]
    task4[检查导出效果]
  done[已完成]
    task5[实时预览]
```

## 十六、桑基图（Sankey Diagram）

**适用场景：** 流量、能量、资金或数据在各环节中的去向与占比。

```mermaid
sankey-beta
Markdown,Parser,100
Parser,Preview,70
Parser,WordExport,15
Parser,HTMLExport,15
Parser,PDFPrint,20
```

## 十七、块图（Block Diagram）

**适用场景：** 系统模块、硬件模块和数据处理管线。

```mermaid
block-beta
    columns 3
    input["Markdown 文件"] parser["解析器"] preview["实时预览"]
    input --> parser
    parser --> preview
```

## 十八、数据包图（Packet Diagram）

**适用场景：** 网络协议、二进制数据和字段位宽布局。

```mermaid
packet-beta
    0-15: "源端口"
    16-31: "目标端口"
    32-47: "数据长度"
    48-63: "校验和"
```

## 十九、架构图（Architecture Diagram）

**适用场景：** 系统服务、模块分组、存储与模块连接关系。

```mermaid
architecture-beta
    group desktop(cloud)[Desktop]
    service editor(server)[Editor] in desktop
    service preview(internet)[Preview] in desktop
    service file(database)[File] in desktop
    editor:R -- L:file
    editor:R -- L:preview
```

## 二十、雷达图（Radar Diagram）

**适用场景：** 多维能力评估和同一对象多个指标的综合对比。

```mermaid
radar-beta
    title 轻阅 Markdown 能力分布
    axis speed["速度"], preview["预览"], export["导出"], theme["主题"], local["本地"]
    curve quillite["轻阅"]{95, 90, 82, 88, 100}
    max 100
    min 0
```

## 二十一、树状矩形图（Treemap）

**适用场景：** 用面积大小展示层级数据及各部分占比。

```mermaid
treemap-beta
    "轻阅 Markdown"
        "阅读": 35
        "编辑": 30
        "导出": 20
        "图表": 15
```

## 二十二、C4 系统上下文图（C4 Context）

**适用场景：** 从用户与外部系统视角说明软件边界和主要依赖。

```mermaid
C4Context
    title 轻阅 Markdown 系统上下文
    Person(user, "用户", "阅读和编辑本地 Markdown 文档")
    System(app, "轻阅 Markdown", "跨平台 Markdown 阅读编辑器")
    System_Ext(site, "官方网站", "提供教程、版本与下载")
    Rel(user, app, "打开、阅读和编辑")
    Rel(app, site, "检查更新", "HTTPS")
```

## 使用与导出说明

- 在编辑器中输入或粘贴 `mermaid` 代码块，左侧预览会自动刷新。
- 图表会跟随软件的明暗模式和主题色，窗口变窄时可在图表区域内滚动查看。
- 图表语法错误时，只会在对应位置显示错误说明，不影响文档其他部分。
- Word 与独立 HTML 导出会把图表转换为清晰的内嵌图片；PDF 使用系统打印引擎，尽量保持预览中的排版。
- 软件使用 Mermaid 严格安全模式，不执行节点内的脚本或点击事件。
- 22 类常用图表都可以从“更多格式 → 图表生成器”选择、编辑、预览并一键插入。
