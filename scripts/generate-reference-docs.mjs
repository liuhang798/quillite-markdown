import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FORMULA_GROUP_LABELS,
  FORMULA_TEMPLATES,
  buildFormulaExpression,
  formulaValues
} from '../frontend/src/formula-templates.js';
import {
  DIAGRAM_CATEGORIES,
  DIAGRAM_TEMPLATES,
  diagramTemplateSource
} from '../frontend/src/diagram-templates.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(root, 'docs', 'reference');
mkdirSync(outputDirectory, { recursive: true });

const writeReference = (name, content) => {
  const normalized = `${content.trim()}\n`;
  writeFileSync(resolve(outputDirectory, name), normalized, 'utf8');
  console.log(`generated ${name} (${normalized.length} characters)`);
};

const categoryName = id => DIAGRAM_CATEGORIES.find(category => category.id === id)?.name?.zh || id;

const diagramSections = DIAGRAM_TEMPLATES.map((template, index) => {
  const language = template.engine === 'echarts' ? 'echarts' : 'mermaid';
  const source = diagramTemplateSource(template, 'zh-CN').replaceAll('{{date}}', '2026-08-21');
  return [
    `## ${index + 1}. ${template.name.zh}`,
    '',
    `- 分类：${categoryName(template.category)}`,
    `- 用途：${template.description.zh}`,
    `- 引擎：${language === 'echarts' ? 'ECharts' : 'Mermaid'}`,
    '',
    `\`\`\`${language}`,
    source,
    '\`\`\`'
  ].join('\n');
}).join('\n\n---\n\n');

writeReference('图表案例.MD', `# 图表案例大全

> 本文档由轻阅 Markdown 的实际图表模板自动生成，共覆盖 **${DIAGRAM_TEMPLATES.length} 种图表**。在编辑模式中可通过“更多格式 → 图表生成器”选择模板、修改源码并插入文档。

## 覆盖范围

| 分类 | 数量 |
| --- | ---: |
${DIAGRAM_CATEGORIES.filter(category => category.id !== 'all').map(category => `| ${category.name.zh} | ${DIAGRAM_TEMPLATES.filter(template => template.category === category.id).length} |`).join('\n')}

> 图表源码可以直接修改。Mermaid 图表使用 \`\`\`mermaid\` 代码块，数据图表使用 \`\`\`echarts\` JSON 代码块。

---

${diagramSections}
`);

let formulaIndex = 0;
const formulaSections = Object.entries(FORMULA_GROUP_LABELS).map(([group, labels]) => {
  const templates = FORMULA_TEMPLATES.filter(template => template.group === group);
  if (!templates.length) return '';
  const entries = templates.map(template => {
    formulaIndex += 1;
    const values = formulaValues(template);
    const expression = buildFormulaExpression(template, values);
    const fields = template.fields.map(field => `- ${field.label.zh}：\`${values[field.key]}\``).join('\n');
    return [
      `### ${formulaIndex}. ${template.name.zh}`,
      '',
      fields,
      '',
      '$$',
      expression,
      '$$'
    ].join('\n');
  }).join('\n\n');
  return `## ${labels.zh}\n\n${entries}`;
}).filter(Boolean).join('\n\n---\n\n');

writeReference('科学公式案例.MD', `# 科学公式案例大全

> 本文档由轻阅 Markdown 的实际学科公式模板自动生成，共覆盖 **${FORMULA_TEMPLATES.length} 种公式**，包含数学、代数、几何、微积分、线性代数、概率统计、物理、基础化学与化学反应。

## 三种插入方式

行内公式适合夹在文字中，例如质能方程 $E=mc^2$。

块级公式单独居中显示：

$$
E=mc^2
$$

编号公式使用 \`\\tag{}\`：

$$
E=mc^2 \\tag{1}
$$

> 在编辑模式中通过“更多格式 → 学科公式”可按学科选择模板、填写参数、编辑生成的 Markdown，再插入文档。

---

${formulaSections}
`);

writeReference('常规内容案例.MD', `# Markdown 常规内容格式大全

> 本文档覆盖轻阅 Markdown 编辑工具栏支持的常用文本与排版格式。该内置案例为只读文档；如需修改，请先使用“另存为”创建副本。

## 一、标题

# 一级标题
## 二级标题
### 三级标题
#### 四级标题
##### 五级标题
###### 六级标题

## 二、段落与换行

这是一个普通段落。段落之间使用空行分隔。

这一行结尾使用反斜杠强制换行，\\
因此下一行会换行。也可以使用 HTML 换行标签：<br>这是标签后的文字。

## 三、文字样式

- **粗体文字**
- *斜体文字*
- ***粗斜体文字***
- ~~删除线文字~~
- <mark>高亮文字</mark>
- <span data-md-color="#d14343" style="color:#d14343">自定义红色文字</span>
- <span data-md-color="#2f6fb2" style="color:#2f6fb2">自定义蓝色文字</span>
- H<sub>2</sub>O 与 x<sup>2</sup>
- <u>下划线文字</u>

## 四、引用

> 一级引用用于突出说明。
>
> > 二级引用用于补充细节。

## 五、列表

### 无序列表

- 第一项
- 第二项
  - 二级项目 A
  - 二级项目 B
- 第三项

### 有序列表

1. 第一步
2. 第二步
   1. 子步骤 A
   2. 子步骤 B
3. 第三步

### 任务列表

- [x] 已完成任务
- [ ] 待完成任务
- [ ] 另一个待办事项

## 六、链接

- 行内链接：[轻阅 Markdown 官网](https://qm.ssssa.cn/ "轻阅 Markdown")
- 自动链接：<https://qm.ssssa.cn/>
- 邮箱链接：<lh805798@163.com>
- 参考式链接：[查看图表教程][diagram-guide]

[diagram-guide]: https://qm.ssssa.cn/guides/diagrams/ "图表教程"

## 七、图片

![轻阅 Markdown 应用图标](https://qm.ssssa.cn/product/appicon.png "轻阅 Markdown")

> 编辑工具栏的“插入图片”会生成同样的 \`![说明](路径)\` 语法，本地相对路径会按当前文档目录解析。

## 八、代码

行内代码示例：使用 \`Ctrl + S\` 保存文档，调用 \`renderMarkdown()\` 更新预览。

\`\`\`javascript
const message = 'Hello, Markdown!';
console.log(message);
\`\`\`

\`\`\`go
package main

import "fmt"

func main() {
    fmt.Println("轻阅 Markdown")
}
\`\`\`

## 九、表格

| 对齐方式 | 示例内容 | 数值 |
| :--- | :---: | ---: |
| 左对齐 | 居中 | 100 |
| Markdown | 轻阅 | 2.6.0 |
| 表格 | 支持长文本自动换行 | 36 |

## 十、分隔线

上方内容

---

下方内容

## 十一、转义字符

使用反斜杠可显示特殊符号：\\*不是斜体\\*、\\# 不是标题、\\[不是链接\\]。

## 十二、HTML 扩展

<details>
<summary>点击展开详情</summary>

这里是可折叠的详情内容，包含 <kbd>Ctrl</kbd> + <kbd>Enter</kbd> 键盘提示。

</details>

<p style="text-align:center">这是一段居中的 HTML 文本。</p>

<!-- 这是一条 Markdown 源码注释，预览中不会显示。 -->

## 十三、特殊字符与 Emoji

中文、English、数字 123、数学符号 ± × ÷ ≠ ≤ ≥ ∞，以及 Emoji：📖 ✨ ✅ 🚀。

## 十四、图表与科学公式

图表和科学公式内容较多，已分别收录在左下角的“图表范例”和“公式范例”文档中。
`);
