# ECharts 数据图表完整案例

本文档包含轻阅 Markdown 内置的全部 19 类离线数据图表。直接使用轻阅 Markdown 打开本文件，即可查看每个案例的真实渲染效果；常用图表支持数据表格与 Excel／CSV／TSV 粘贴，也可以修改 JSON 源码。

> 使用入口：编辑模式 → 更多格式 → 图表生成器 → 数据分析。

## 一、柱状图

适合比较不同分类的数量、金额或频次。

```echarts
{
  "title": { "text": "月度文档数量", "left": "center" },
  "tooltip": { "trigger": "axis" },
  "xAxis": { "type": "category", "data": ["一月", "二月", "三月", "四月", "五月", "六月"] },
  "yAxis": { "type": "value", "name": "文档数" },
  "series": [{ "name": "文档数", "type": "bar", "data": [42, 58, 76, 69, 91, 108] }]
}
```

## 二、折线图

适合展示连续时间内的趋势和变化速度。

```echarts
{
  "title": { "text": "阅读时长趋势", "left": "center" },
  "tooltip": { "trigger": "axis" },
  "xAxis": { "type": "category", "boundaryGap": false, "data": ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] },
  "yAxis": { "type": "value", "name": "分钟" },
  "series": [{ "name": "阅读时长", "type": "line", "smooth": true, "data": [18, 26, 21, 34, 42, 55, 48] }]
}
```

## 三、堆叠柱状图

适合同时比较各分类总量和内部组成。

```echarts
{
  "title": { "text": "导出类型分布", "left": "center" },
  "tooltip": { "trigger": "axis" },
  "legend": { "top": 30 },
  "xAxis": { "type": "category", "data": ["一季度", "二季度", "三季度", "四季度"] },
  "yAxis": { "type": "value" },
  "series": [
    { "name": "Word", "type": "bar", "stack": "total", "data": [32, 41, 48, 53] },
    { "name": "PDF", "type": "bar", "stack": "total", "data": [24, 30, 39, 45] },
    { "name": "HTML", "type": "bar", "stack": "total", "data": [12, 18, 21, 27] }
  ]
}
```

## 四、面积图

适合突出趋势变化和累计规模。

```echarts
{
  "title": { "text": "累计阅读量", "left": "center" },
  "tooltip": { "trigger": "axis" },
  "xAxis": { "type": "category", "boundaryGap": false, "data": ["一月", "二月", "三月", "四月", "五月", "六月"] },
  "yAxis": { "type": "value", "name": "篇次" },
  "series": [{ "name": "阅读量", "type": "line", "smooth": true, "areaStyle": {}, "data": [120, 182, 251, 334, 442, 581] }]
}
```

## 五、散点图

适合观察两个连续变量的相关性和离群点。

```echarts
{
  "title": { "text": "文档长度与阅读时长", "left": "center" },
  "tooltip": { "trigger": "item" },
  "grid": { "left": 62, "right": 76, "top": 62, "bottom": 58, "containLabel": true },
  "xAxis": { "type": "value", "name": "字数（千字）", "nameLocation": "middle", "nameGap": 30 },
  "yAxis": { "type": "value", "name": "阅读时长（分钟）", "nameLocation": "middle", "nameGap": 38 },
  "series": [{ "name": "文档", "type": "scatter", "symbolSize": 15, "data": [[1.2, 4], [2.4, 7], [3.1, 9], [4.8, 16], [5.4, 14], [7.2, 23], [8.5, 28]] }]
}
```

## 六、正反向对比图

适合从中心线向左右比较两组相反或对立指标。

```echarts
{
  "title": { "text": "功能满意与不满意对比", "left": "center" },
  "tooltip": { "trigger": "axis" },
  "legend": { "top": 30 },
  "grid": { "left": 92, "right": 76, "top": 72, "bottom": 56, "containLabel": true },
  "xAxis": { "type": "value", "min": -100, "max": 100, "name": "比例（%）", "nameLocation": "middle", "nameGap": 30 },
  "yAxis": { "type": "category", "data": ["阅读体验", "编辑体验", "导出功能", "主题外观"] },
  "series": [
    { "name": "不满意", "type": "bar", "stack": "compare", "data": [-18, -24, -31, -12] },
    { "name": "满意", "type": "bar", "stack": "compare", "data": [78, 72, 64, 85] }
  ]
}
```

## 七、组合图（柱状图＋折线图）

适合使用双坐标轴同时展示规模和变化率。

```echarts
{
  "title": { "text": "下载量与增长率", "left": "center" },
  "tooltip": { "trigger": "axis" },
  "legend": { "top": 30 },
  "xAxis": { "type": "category", "data": ["一月", "二月", "三月", "四月", "五月", "六月"] },
  "yAxis": [{ "type": "value", "name": "下载量" }, { "type": "value", "name": "增长率（%）" }],
  "series": [
    { "name": "下载量", "type": "bar", "data": [320, 410, 520, 610, 780, 920] },
    { "name": "增长率", "type": "line", "yAxisIndex": 1, "smooth": true, "data": [8, 12, 15, 11, 19, 18] }
  ]
}
```

## 八、漏斗图

适合展示流程各阶段的转化和流失。

```echarts
{
  "title": { "text": "用户转化漏斗", "left": "center" },
  "tooltip": { "trigger": "item" },
  "series": [{
    "name": "转化", "type": "funnel", "top": 55, "bottom": 20,
    "label": { "show": true, "position": "inside" },
    "data": [{ "value": 100, "name": "访问官网" }, { "value": 72, "name": "下载安装" }, { "value": 54, "name": "首次打开" }, { "value": 41, "name": "持续使用" }]
  }]
}
```

## 九、热力图

适合用颜色深浅展示二维数据密度或相关程度。

```echarts
{
  "title": { "text": "每周阅读热力", "left": "center" },
  "tooltip": { "position": "top" },
  "grid": { "top": 60, "left": 80, "right": 30, "bottom": 70 },
  "xAxis": { "type": "category", "data": ["上午", "中午", "下午", "晚上"] },
  "yAxis": { "type": "category", "data": ["周一", "周二", "周三", "周四", "周五"] },
  "visualMap": { "min": 0, "max": 10, "calculable": true, "orient": "horizontal", "left": "center", "bottom": 10 },
  "series": [{ "type": "heatmap", "label": { "show": true }, "data": [[0,0,2],[1,0,5],[2,0,7],[3,0,4],[0,1,3],[1,1,8],[2,1,6],[3,1,9],[0,2,1],[1,2,4],[2,2,8],[3,2,7],[0,3,4],[1,3,6],[2,3,9],[3,3,8],[0,4,2],[1,4,5],[2,4,7],[3,4,10]] }]
}
```

## 十、箱线图

适合展示中位数、四分位数、整体分布和异常范围。

```echarts
{
  "title": { "text": "不同文档类型阅读时长分布", "left": "center" },
  "tooltip": { "trigger": "item" },
  "xAxis": { "type": "category", "data": ["技术文档", "项目方案", "学习笔记", "会议记录"] },
  "yAxis": { "type": "value", "name": "分钟" },
  "series": [{ "name": "阅读时长", "type": "boxplot", "data": [[3,6,10,15,24],[4,8,12,19,30],[2,5,8,13,20],[1,3,6,9,15]] }]
}
```

## 十一、气泡图

适合通过横轴、纵轴和气泡大小同时比较三个数值指标。第四个值用于显示名称。

```echarts
{
  "__quillite": { "transform": "bubble" },
  "title": { "text": "文档价值分析", "left": "center" },
  "tooltip": { "trigger": "item" },
  "xAxis": { "type": "value", "name": "使用频率" },
  "yAxis": { "type": "value", "name": "平均阅读时长" },
  "series": [{ "name": "文档", "type": "scatter", "data": [[20,12,18,"说明文档"],[45,18,32,"项目方案"],[72,28,46,"知识库"],[58,10,24,"会议记录"],[86,22,38,"操作手册"]] }]
}
```

## 十二、仪表盘

适合突出展示单个关键指标的完成度或状态。

```echarts
{
  "title": { "text": "本月目标完成率", "left": "center" },
  "series": [{
    "type": "gauge", "center": ["50%", "58%"],
    "progress": { "show": true, "width": 18 },
    "axisLine": { "lineStyle": { "width": 18 } },
    "detail": { "valueAnimation": true, "formatter": "{value}%", "fontSize": 26 },
    "data": [{ "value": 78, "name": "完成率" }]
  }]
}
```

## 十三、环形图

适合展示分类占比，并在图表中心保留说明空间。

```echarts
{
  "title": { "text": "文档来源占比", "left": "center" },
  "tooltip": { "trigger": "item" },
  "legend": { "bottom": 5 },
  "series": [{
    "name": "来源", "type": "pie", "radius": ["42%", "68%"], "center": ["50%", "52%"],
    "label": { "formatter": "{b}\n{d}%" },
    "data": [{ "value": 46, "name": "本地创建" }, { "value": 28, "name": "团队共享" }, { "value": 16, "name": "即时通讯" }, { "value": 10, "name": "其他" }]
  }]
}
```

## 十四、瀑布图

适合展示一个总量经过连续增加和减少后的变化过程。

```echarts
{
  "title": { "text": "月度用户变化", "left": "center" },
  "tooltip": { "trigger": "axis" },
  "xAxis": { "type": "category", "data": ["期初", "新增", "回流", "流失", "停用", "期末"] },
  "yAxis": { "type": "value", "name": "用户数" },
  "series": [
    { "name": "辅助", "type": "bar", "stack": "total", "itemStyle": { "color": "transparent" }, "data": [0,1200,1530,1280,1160,0] },
    { "name": "增加", "type": "bar", "stack": "total", "data": [1200,330,170,"-","-",1090] },
    { "name": "减少", "type": "bar", "stack": "total", "data": ["-","-","-",250,120,"-"] }
  ]
}
```

## 十五、词云图

适合根据词频突出关键词和主题分布。

```echarts
{
  "title": { "text": "Markdown 关键词", "left": "center" },
  "tooltip": { "show": true },
  "series": [{
    "type": "wordCloud", "shape": "circle", "gridSize": 10,
    "sizeRange": [18, 58], "rotationRange": [0, 0],
    "data": [{ "name": "Markdown", "value": 100 }, { "name": "本地优先", "value": 82 }, { "name": "实时预览", "value": 76 }, { "name": "轻量", "value": 70 }, { "name": "开源", "value": 66 }, { "name": "学科公式", "value": 58 }, { "name": "图表", "value": 54 }, { "name": "Word 导出", "value": 46 }, { "name": "PDF", "value": 42 }, { "name": "跨平台", "value": 38 }]
  }]
}
```

## 16. 直方图

展示样本分布：输入原始样本并设置分箱数；区间左闭右开，最后一箱含最大值。

```echarts
{
  "__quillite": {
    "dataEditor": "histogram",
    "samples": [
      12,
      15,
      18,
      18,
      21,
      24,
      25,
      28,
      31,
      36,
      42,
      48
    ],
    "bins": 6
  },
  "title": {
    "text": "阅读时长分布",
    "left": "center"
  },
  "tooltip": {
    "trigger": "axis"
  },
  "xAxis": {
    "type": "category",
    "name": "阅读时长（分钟）",
    "nameLocation": "middle",
    "nameGap": 32,
    "data": [
      "[12, 18)",
      "[18, 24)",
      "[24, 30)",
      "[30, 36)",
      "[36, 42)",
      "[42, 48]"
    ]
  },
  "yAxis": {
    "type": "value",
    "minInterval": 1,
    "name": "频数"
  },
  "series": [
    {
      "type": "bar",
      "barCategoryGap": "0%",
      "data": [
        2,
        3,
        3,
        1,
        1,
        2
      ]
    }
  ]
}
```

## 17. 百分比堆叠图

填写非负原始数值，按分类归一为 100%；合计为零时显示为零。

```echarts
{
  "__quillite": {
    "dataEditor": "percent",
    "rawColumns": [
      [
        40,
        20,
        30
      ],
      [
        20,
        40,
        10
      ],
      [
        40,
        40,
        60
      ]
    ]
  },
  "title": {
    "text": "分类构成比例",
    "left": "center"
  },
  "tooltip": {
    "trigger": "axis"
  },
  "legend": {
    "top": 30
  },
  "xAxis": {
    "type": "category",
    "data": [
      "一月",
      "二月",
      "三月"
    ]
  },
  "yAxis": {
    "type": "value",
    "min": 0,
    "max": 100,
    "axisLabel": {
      "formatter": "{value}%"
    }
  },
  "series": [
    {
      "name": "系列 1",
      "type": "bar",
      "stack": "percent",
      "data": [
        40,
        20,
        30.000000000000004
      ]
    },
    {
      "name": "系列 2",
      "type": "bar",
      "stack": "percent",
      "data": [
        20,
        40,
        10
      ]
    },
    {
      "name": "系列 3",
      "type": "bar",
      "stack": "percent",
      "data": [
        40,
        40,
        60.00000000000001
      ]
    }
  ]
}
```

## 18. 横向排名图

适合长名称；按数值从高到低填入各行，第一行显示在顶部。

```echarts
{
  "title": {
    "text": "阅读排名",
    "left": "center"
  },
  "tooltip": {
    "trigger": "axis"
  },
  "xAxis": {
    "type": "value"
  },
  "yAxis": {
    "type": "category",
    "inverse": true,
    "data": [
      "技术文档与操作指南",
      "项目方案与学习笔记",
      "会议纪要"
    ]
  },
  "series": [
    {
      "name": "阅读次数",
      "type": "bar",
      "data": [
        120,
        86,
        42
      ]
    }
  ]
}
```

## 19. 日历热力图

按日期展示非负数值；日期不可重复，范围不超过 366 天。

```echarts
{
  "__quillite": {
    "height": 360
  },
  "title": {
    "text": "每日活跃记录",
    "left": "center"
  },
  "tooltip": {
    "trigger": "item"
  },
  "visualMap": {
    "min": 0,
    "max": 10,
    "orient": "horizontal",
    "left": "center",
    "bottom": 8
  },
  "calendar": {
    "top": 85,
    "left": 55,
    "right": 35,
    "cellSize": [
      "auto",
      24
    ],
    "range": [
      "2026-01-01",
      "2026-03-31"
    ],
    "yearLabel": {
      "show": false
    },
    "dayLabel": {
      "nameMap": "cn"
    },
    "monthLabel": {
      "nameMap": "cn"
    }
  },
  "series": [
    {
      "type": "heatmap",
      "coordinateSystem": "calendar",
      "data": [
        [
          "2026-01-01",
          3
        ],
        [
          "2026-01-12",
          7
        ],
        [
          "2026-02-02",
          10
        ],
        [
          "2026-02-20",
          5
        ],
        [
          "2026-03-31",
          8
        ]
      ]
    }
  ]
}
```

## 编辑说明

- 修改 `title.text` 可以更换标题。
- 修改 `xAxis.data`、`yAxis.data` 可以更换分类或坐标轴标签。
- 修改 `series` 中的 `data` 可以替换业务数据。
- 同一坐标轴下可以添加多个 `series`，组成多系列对比图。
- JSON 必须使用英文双引号，最后一个字段后不要保留逗号。
- 图表完全在本地渲染，不会上传文档内容或图表数据。
