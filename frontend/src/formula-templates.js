const field = (key, zh, en, value, placeholder = value) => ({ key, label: { zh, en }, value, placeholder });

const OUTPUT_MODES = ['inline', 'block', 'numbered'];

const mathTemplate = (id, group, zh, en, fields, build) => ({
  id,
  kind: 'math',
  group,
  name: { zh, en },
  fields,
  build,
  modes: OUTPUT_MODES,
});

const chemistryTemplate = (id, group, zh, en, fields, build) => ({
  id,
  kind: 'chemistry',
  group,
  name: { zh, en },
  fields,
  build,
  modes: OUTPUT_MODES,
});

export const FORMULA_TEMPLATES = [
  mathTemplate('custom', 'mathematics', '自定义公式', 'Custom formula', [
    field('formula', 'LaTeX 内容', 'LaTeX source', 'E = mc^2'),
  ], values => values.formula),
  mathTemplate('equation', 'mathematics', '等式', 'Equation', [
    field('left', '等号左侧', 'Left side', 'y'),
    field('right', '等号右侧', 'Right side', 'ax+b'),
  ], values => `${values.left} = ${values.right}`),
  mathTemplate('fraction', 'mathematics', '分数', 'Fraction', [
    field('numerator', '分子', 'Numerator', 'a+b'),
    field('denominator', '分母', 'Denominator', 'c+d'),
  ], values => `\\frac{${values.numerator}}{${values.denominator}}`),
  mathTemplate('power', 'mathematics', '幂与下标', 'Power and subscript', [
    field('base', '底数', 'Base', 'x'),
    field('exponent', '指数', 'Exponent', '2'),
    field('subscript', '下标（可空）', 'Subscript (optional)', 'i', ''),
  ], values => `${values.subscript && /_/.test(values.base) ? `\\left(${values.base}\\right)` : formulaOperand(values.base)}${values.subscript ? `_{${values.subscript}}` : ''}${values.exponent ? `^{${values.exponent}}` : ''}`),
  mathTemplate('root', 'mathematics', '根式', 'Root', [
    field('radicand', '被开方数', 'Radicand', 'a^2+b^2'),
    field('index', '根指数（平方根可空）', 'Root index (optional)', '', '3'),
  ], values => values.index ? `\\sqrt[${values.index}]{${values.radicand}}` : `\\sqrt{${values.radicand}}`),
  mathTemplate('logarithm', 'mathematics', '对数', 'Logarithm', [
    field('base', '底数', 'Base', 'a'),
    field('value', '真数', 'Argument', 'x'),
  ], values => `\\log_{${values.base}} ${values.value}`),
  mathTemplate('absolute-value', 'mathematics', '绝对值', 'Absolute value', [
    field('expression', '表达式', 'Expression', 'x-a'),
  ], values => `\\left|${values.expression}\\right|`),
  mathTemplate('factorial', 'mathematics', '阶乘', 'Factorial', [
    field('value', '数值或变量', 'Value or variable', 'n'),
  ], values => `${formulaOperand(values.value)}!`),
  mathTemplate('permutation', 'mathematics', '排列数', 'Permutation', [
    field('total', '总数 n', 'Total n', 'n'),
    field('chosen', '选取数 r', 'Chosen r', 'r'),
  ], values => `A_{${values.total}}^{${values.chosen}}=\\frac{${formulaOperand(values.total)}!}{(${formulaOperand(values.total)}-${formulaOperand(values.chosen)})!}`),
  mathTemplate('combination', 'mathematics', '组合数', 'Combination', [
    field('total', '总数 n', 'Total n', 'n'),
    field('chosen', '选取数 r', 'Chosen r', 'r'),
  ], values => `C_{${values.total}}^{${values.chosen}}=\\binom{${values.total}}{${values.chosen}}=\\frac{${formulaOperand(values.total)}!}{${formulaOperand(values.chosen)}!(${formulaOperand(values.total)}-${formulaOperand(values.chosen)})!}`),
  mathTemplate('quadratic', 'algebra', '一元二次方程求根', 'Quadratic formula', [
    field('a', '系数 a', 'Coefficient a', 'a'),
    field('b', '系数 b', 'Coefficient b', 'b'),
    field('c', '系数 c', 'Coefficient c', 'c'),
  ], values => `x = \\frac{-${formulaOperand(values.b)} \\pm \\sqrt{${formulaPower(values.b, '2')}-${formulaProduct('4', values.a, values.c)}}}{${formulaProduct('2', values.a)}}`),
  mathTemplate('linear-equation', 'algebra', '一元一次方程', 'Linear equation', [
    field('a', '系数 a', 'Coefficient a', 'a'),
    field('b', '常数 b', 'Constant b', 'b'),
  ], values => `${formulaProduct(values.a, 'x')}+${formulaOperand(values.b)}=0\\quad\\Rightarrow\\quad x=-\\frac{${values.b}}{${values.a}}`),
  mathTemplate('system2', 'algebra', '二元一次方程组', 'Two-variable system', [
    field('equation1', '第一个方程', 'First equation', 'a_1x+b_1y=c_1'),
    field('equation2', '第二个方程', 'Second equation', 'a_2x+b_2y=c_2'),
  ], values => `\\begin{cases}${values.equation1} \\\\ ${values.equation2}\\end{cases}`),
  mathTemplate('binomial-theorem', 'algebra', '二项式定理', 'Binomial theorem', [
    field('left', '第一项', 'First term', 'a'),
    field('right', '第二项', 'Second term', 'b'),
    field('power', '次数 n', 'Power n', 'n'),
  ], values => `(${formulaOperand(values.left)}+${formulaOperand(values.right)})^{${values.power}}=\\sum_{k=0}^{${values.power}}\\binom{${values.power}}{k}${formulaPower(values.left, `${values.power}-k`)}\\cdot ${formulaPower(values.right, 'k')}`),
  mathTemplate('arithmetic-sequence', 'algebra', '等差数列通项', 'Arithmetic sequence', [
    field('first', '首项', 'First term', 'a_1'),
    field('difference', '公差', 'Common difference', 'd'),
    field('index', '项数', 'Index', 'n'),
  ], values => `a_{${values.index}}=${formulaOperand(values.first)}+${formulaProduct(`${formulaOperand(values.index)}-1`, values.difference)}`),
  mathTemplate('arithmetic-sum', 'algebra', '等差数列求和', 'Arithmetic series sum', [
    field('first', '首项', 'First term', 'a_1'),
    field('last', '末项', 'Last term', 'a_n'),
    field('count', '项数', 'Number of terms', 'n'),
  ], values => `S_{${values.count}}=\\frac{${formulaProduct(values.count, `${formulaOperand(values.first)}+${formulaOperand(values.last)}`)}}{2}`),
  mathTemplate('geometric-sequence', 'algebra', '等比数列通项', 'Geometric sequence', [
    field('first', '首项', 'First term', 'a_1'),
    field('ratio', '公比', 'Common ratio', 'q'),
    field('index', '项数', 'Index', 'n'),
  ], values => `a_{${values.index}}=${formulaOperand(values.first)}\\cdot ${formulaPower(values.ratio, `${formulaOperand(values.index)}-1`)}`),
  mathTemplate('geometric-sum', 'algebra', '等比数列求和', 'Geometric series sum', [
    field('first', '首项', 'First term', 'a_1'),
    field('ratio', '公比', 'Common ratio', 'q'),
    field('count', '项数', 'Number of terms', 'n'),
  ], values => `S_{${values.count}}=${formulaOperand(values.first)}\\cdot \\frac{1-${formulaPower(values.ratio, values.count)}}{1-${formulaOperand(values.ratio)}}`),
  mathTemplate('pythagorean', 'geometry', '勾股定理', 'Pythagorean theorem', [
    field('a', '直角边 a', 'Side a', 'a'),
    field('b', '直角边 b', 'Side b', 'b'),
    field('c', '斜边 c', 'Hypotenuse c', 'c'),
  ], values => `${formulaPower(values.a, '2')}+${formulaPower(values.b, '2')}=${formulaPower(values.c, '2')}`),
  mathTemplate('distance2d', 'geometry', '两点间距离', 'Distance between two points', [
    field('x1', 'x₁', 'x₁', 'x_1'),
    field('y1', 'y₁', 'y₁', 'y_1'),
    field('x2', 'x₂', 'x₂', 'x_2'),
    field('y2', 'y₂', 'y₂', 'y_2'),
  ], values => `d=\\sqrt{(${formulaOperand(values.x2)}-${formulaOperand(values.x1)})^2+(${formulaOperand(values.y2)}-${formulaOperand(values.y1)})^2}`),
  mathTemplate('midpoint', 'geometry', '中点坐标', 'Midpoint', [
    field('x1', 'x₁', 'x₁', 'x_1'),
    field('y1', 'y₁', 'y₁', 'y_1'),
    field('x2', 'x₂', 'x₂', 'x_2'),
    field('y2', 'y₂', 'y₂', 'y_2'),
  ], values => `M\\left(\\frac{${formulaOperand(values.x1)}+${formulaOperand(values.x2)}}{2},\\frac{${formulaOperand(values.y1)}+${formulaOperand(values.y2)}}{2}\\right)`),
  mathTemplate('slope', 'geometry', '直线斜率', 'Slope', [
    field('x1', 'x₁', 'x₁', 'x_1'),
    field('y1', 'y₁', 'y₁', 'y_1'),
    field('x2', 'x₂', 'x₂', 'x_2'),
    field('y2', 'y₂', 'y₂', 'y_2'),
  ], values => `k=\\frac{${formulaOperand(values.y2)}-${formulaOperand(values.y1)}}{${formulaOperand(values.x2)}-${formulaOperand(values.x1)}}`),
  mathTemplate('circle-area', 'geometry', '圆的面积', 'Circle area', [
    field('radius', '半径', 'Radius', 'r'),
  ], values => `S=\\pi\\cdot ${formulaPower(values.radius, '2')}`),
  mathTemplate('circle-circumference', 'geometry', '圆的周长', 'Circle circumference', [
    field('radius', '半径', 'Radius', 'r'),
  ], values => `C=${formulaProduct('2', '\\pi', values.radius)}`),
  mathTemplate('triangle-area', 'geometry', '三角形面积', 'Triangle area', [
    field('base', '底边', 'Base', 'a'),
    field('height', '高', 'Height', 'h'),
  ], values => `S=\\frac{1}{2}\\cdot ${formulaProduct(values.base, values.height)}`),
  mathTemplate('heron', 'geometry', '海伦公式', 'Heron formula', [
    field('a', '边 a', 'Side a', 'a'),
    field('b', '边 b', 'Side b', 'b'),
    field('c', '边 c', 'Side c', 'c'),
  ], values => `p=\\frac{${formulaOperand(values.a)}+${formulaOperand(values.b)}+${formulaOperand(values.c)}}{2},\\quad S=\\sqrt{p(p-${formulaOperand(values.a)})(p-${formulaOperand(values.b)})(p-${formulaOperand(values.c)})}`),
  mathTemplate('sine-law', 'geometry', '正弦定理', 'Law of sines', [
    field('a', '边 a', 'Side a', 'a'),
    field('b', '边 b', 'Side b', 'b'),
    field('c', '边 c', 'Side c', 'c'),
  ], values => `\\frac{${values.a}}{\\sin A}=\\frac{${values.b}}{\\sin B}=\\frac{${values.c}}{\\sin C}`),
  mathTemplate('cosine-law', 'geometry', '余弦定理', 'Law of cosines', [
    field('a', '边 a', 'Side a', 'a'),
    field('b', '边 b', 'Side b', 'b'),
    field('c', '边 c', 'Side c', 'c'),
    field('angle', '夹角', 'Included angle', 'C'),
  ], values => `${formulaPower(values.c, '2')}=${formulaPower(values.a, '2')}+${formulaPower(values.b, '2')}-${formulaProduct('2', values.a, values.b)}\\cdot \\cos\\left(${values.angle}\\right)`),
  mathTemplate('derivative', 'calculus', '导数', 'Derivative', [
    field('function', '函数', 'Function', 'f(x)'),
    field('variable', '变量', 'Variable', 'x'),
  ], values => `\\frac{d}{d${values.variable}}\\left(${values.function}\\right)`),
  mathTemplate('integral', 'calculus', '定积分', 'Definite integral', [
    field('lower', '下限', 'Lower bound', 'a'),
    field('upper', '上限', 'Upper bound', 'b'),
    field('expression', '被积函数', 'Integrand', 'f(x)'),
    field('variable', '积分变量', 'Variable', 'x'),
  ], values => `\\int_{${values.lower}}^{${values.upper}} ${values.expression}\\,d${values.variable}`),
  mathTemplate('indefinite-integral', 'calculus', '不定积分', 'Indefinite integral', [
    field('expression', '被积函数', 'Integrand', 'f(x)'),
    field('variable', '积分变量', 'Variable', 'x'),
  ], values => `\\int ${values.expression}\\,d${values.variable}=F(${values.variable})+C`),
  mathTemplate('nth-derivative', 'calculus', '高阶导数', 'Nth derivative', [
    field('function', '函数', 'Function', 'f(x)'),
    field('variable', '变量', 'Variable', 'x'),
    field('order', '阶数', 'Order', 'n'),
  ], values => `\\frac{d^{${values.order}}}{d${values.variable}^{${values.order}}}\\left(${values.function}\\right)`),
  mathTemplate('partial-derivative', 'calculus', '偏导数', 'Partial derivative', [
    field('function', '多元函数', 'Function', 'f(x,y)'),
    field('variable', '求导变量', 'Variable', 'x'),
  ], values => `\\frac{\\partial}{\\partial ${values.variable}}\\left(${values.function}\\right)`),
  mathTemplate('double-integral', 'calculus', '二重积分', 'Double integral', [
    field('domain', '积分区域', 'Domain', 'D'),
    field('expression', '被积函数', 'Integrand', 'f(x,y)'),
    field('variable1', '第一积分变量', 'First integration variable', 'x'),
    field('variable2', '第二积分变量', 'Second integration variable', 'y'),
  ], values => `\\iint_{${values.domain}} ${values.expression}\\,d${formulaVariable(values.variable1)}\\,d${formulaVariable(values.variable2)}`),
  mathTemplate('taylor-series', 'calculus', '泰勒展开', 'Taylor series', [
    field('function', '函数名称（不含括号）', 'Function name (without parentheses)', 'f'),
    field('variable', '自变量', 'Independent variable', 'x'),
    field('center', '展开点', 'Center', 'a'),
    field('index', '求和下标', 'Index', 'n'),
  ], values => {
    const name = formulaVariable(values.function), variable = formulaVariable(values.variable);
    const index = formulaVariable(values.index);
    return `${name}(${variable})=\\sum_{${index}=0}^{\\infty}\\frac{${name}^{(${index})}(${values.center})}{${index}!}\\left(${variable}-${formulaOperand(values.center)}\\right)^{${index}}`;
  }),
  mathTemplate('gradient', 'calculus', '梯度', 'Gradient', [
    field('function', '标量函数', 'Scalar function', 'f'),
    field('variables', '变量（逗号分隔，最多 16 个）', 'Variables (comma-separated, up to 16)', 'x,y,z'),
  ], values => {
    const variables = values.variables.split(/[,，]/).map(value => value.trim());
    if (!variables.length || variables.length > 16 || variables.some(value => !value)) throw new Error('FORMULA_VARIABLES_INVALID');
    const terms = variables.map(value => `\\frac{\\partial ${values.function}}{\\partial ${formulaVariable(value)}}`);
    return `\\nabla ${values.function}=\\left(${terms.join(',')}\\right)`;
  }),
  mathTemplate('limit', 'calculus', '极限', 'Limit', [
    field('variable', '变量', 'Variable', 'x'),
    field('target', '趋近值', 'Approaches', '0'),
    field('expression', '表达式', 'Expression', '\\frac{\\sin x}{x}'),
  ], values => `\\lim_{${values.variable} \\to ${values.target}} ${values.expression}`),
  mathTemplate('summation', 'calculus', '求和', 'Summation', [
    field('variable', '索引变量', 'Index', 'i'),
    field('start', '起始值', 'Start', '1'),
    field('end', '结束值', 'End', 'n'),
    field('expression', '求和项', 'Term', 'i^2'),
  ], values => `\\sum_{${values.variable}=${values.start}}^{${values.end}} ${values.expression}`),
  mathTemplate('product', 'calculus', '连乘', 'Product', [
    field('variable', '索引变量', 'Index', 'i'),
    field('start', '起始值', 'Start', '1'),
    field('end', '结束值', 'End', 'n'),
    field('expression', '连乘项', 'Factor', 'a_i'),
  ], values => `\\prod_{${values.variable}=${values.start}}^{${values.end}} ${values.expression}`),
  mathTemplate('matrix2', 'linear-algebra', '2×2 矩阵', '2×2 matrix', [
    field('a11', '第 1 行第 1 列', 'Row 1, column 1', 'a'),
    field('a12', '第 1 行第 2 列', 'Row 1, column 2', 'b'),
    field('a21', '第 2 行第 1 列', 'Row 2, column 1', 'c'),
    field('a22', '第 2 行第 2 列', 'Row 2, column 2', 'd'),
  ], values => `\\begin{bmatrix}${values.a11} & ${values.a12} \\\\ ${values.a21} & ${values.a22}\\end{bmatrix}`),
  mathTemplate('vector', 'linear-algebra', '向量', 'Vector', [
    field('name', '向量名称', 'Vector name', 'a'),
    field('components', '分量（逗号分隔）', 'Components', 'a_1,a_2,a_3'),
  ], values => `\\vec{${values.name}}=\\left(${values.components}\\right)`),
  mathTemplate('dot-product', 'linear-algebra', '向量点积', 'Dot product', [
    field('left', '向量 a', 'Vector a', '\\vec a'),
    field('right', '向量 b', 'Vector b', '\\vec b'),
    field('angle', '夹角', 'Angle', '\\theta'),
  ], values => `${formulaProduct(values.left, values.right)}=\\lVert${values.left}\\rVert\\lVert${values.right}\\rVert\\cos\\left(${values.angle}\\right)`),
  mathTemplate('cross-product', 'linear-algebra', '向量叉积', 'Cross product', [
    field('left', '向量 a', 'Vector a', '\\vec a'),
    field('right', '向量 b', 'Vector b', '\\vec b'),
    field('angle', '夹角', 'Angle', '\\theta'),
  ], values => `\\lVert${values.left}\\times${values.right}\\rVert=\\lVert${values.left}\\rVert\\lVert${values.right}\\rVert\\sin ${values.angle}`),
  mathTemplate('determinant2', 'linear-algebra', '2×2 行列式', '2×2 determinant', [
    field('a11', '第 1 行第 1 列', 'Row 1, column 1', 'a'),
    field('a12', '第 1 行第 2 列', 'Row 1, column 2', 'b'),
    field('a21', '第 2 行第 1 列', 'Row 2, column 1', 'c'),
    field('a22', '第 2 行第 2 列', 'Row 2, column 2', 'd'),
  ], values => `\\begin{vmatrix}${values.a11}&${values.a12}\\\\${values.a21}&${values.a22}\\end{vmatrix}=${formulaProduct(values.a11, values.a22)}-${formulaProduct(values.a12, values.a21)}`),
  mathTemplate('matrix3', 'linear-algebra', '3×3 矩阵', '3×3 matrix', [
    field('row1', '第 1 行', 'Row 1', 'a,b,c'),
    field('row2', '第 2 行', 'Row 2', 'd,e,f'),
    field('row3', '第 3 行', 'Row 3', 'g,h,i'),
  ], values => `\\begin{bmatrix}${values.row1.replaceAll(',', '&')}\\\\${values.row2.replaceAll(',', '&')}\\\\${values.row3.replaceAll(',', '&')}\\end{bmatrix}`),
  mathTemplate('inverse2', 'linear-algebra', '2×2 逆矩阵', '2×2 inverse matrix', [
    field('a', '元素 a', 'Element a', 'a'),
    field('b', '元素 b', 'Element b', 'b'),
    field('c', '元素 c', 'Element c', 'c'),
    field('d', '元素 d', 'Element d', 'd'),
  ], values => `A^{-1}=\\frac{1}{${formulaProduct(values.a, values.d)}-${formulaProduct(values.b, values.c)}}\\begin{bmatrix}${values.d}&-${formulaOperand(values.b)}\\\\-${formulaOperand(values.c)}&${values.a}\\end{bmatrix}`),
  mathTemplate('eigenvalue', 'linear-algebra', '特征值方程', 'Eigenvalue equation', [
    field('matrix', '矩阵', 'Matrix', 'A'),
    field('eigenvalue', '特征值', 'Eigenvalue', '\\lambda'),
    field('identity', '单位矩阵', 'Identity matrix', 'I'),
  ], values => `\\det\\left(${values.matrix}-${values.eigenvalue}\\,${values.identity}\\right)=0`),
  mathTemplate('cases', 'algebra', '分段函数', 'Piecewise function', [
    field('result1', '第一段结果', 'First result', 'x^2'),
    field('condition1', '第一段条件', 'First condition', 'x \\ge 0'),
    field('result2', '第二段结果', 'Second result', '-x'),
    field('condition2', '第二段条件', 'Second condition', 'x < 0'),
  ], values => `f(x)=\\begin{cases}${values.result1}, & ${values.condition1} \\\\ ${values.result2}, & ${values.condition2}\\end{cases}`),

  mathTemplate('mean', 'probability', '算术平均数', 'Arithmetic mean', [
    field('variable', '数据符号', 'Data symbol', 'x'),
    field('count', '样本数', 'Sample count', 'n'),
  ], values => `\\bar{${values.variable}}=\\frac{1}{${values.count}}\\sum_{i=1}^{${values.count}}${values.variable}_i`),
  mathTemplate('weighted-mean', 'probability', '加权平均数', 'Weighted mean', [
    field('value', '数据符号', 'Value symbol', 'x'),
    field('weight', '权重符号', 'Weight symbol', 'w'),
    field('count', '样本数', 'Sample count', 'n'),
  ], values => `\\bar{${values.value}}=\\frac{\\sum_{i=1}^{${values.count}}${values.weight}_i${values.value}_i}{\\sum_{i=1}^{${values.count}}${values.weight}_i}`),
  mathTemplate('variance', 'probability', '方差', 'Variance', [
    field('variable', '随机变量', 'Random variable', 'X'),
    field('mean', '均值', 'Mean', '\\mu'),
  ], values => `\\operatorname{Var}(${values.variable})=\\mathbb{E}\\left[(${formulaOperand(values.variable)}-${formulaOperand(values.mean)})^2\\right]`),
  mathTemplate('standard-deviation', 'probability', '标准差', 'Standard deviation', [
    field('variance', '方差', 'Variance', '\\operatorname{Var}(X)'),
  ], values => `\\sigma=\\sqrt{${values.variance}}`),
  mathTemplate('normal-distribution', 'probability', '正态分布', 'Normal distribution', [
    field('mean', '均值', 'Mean', '\\mu'),
    field('deviation', '标准差', 'Standard deviation', '\\sigma'),
  ], values => `f(x)=\\frac{1}{${formulaOperand(values.deviation)}\\cdot \\sqrt{2\\pi}}\\exp\\left[-\\frac{(x-${formulaOperand(values.mean)})^2}{2\\cdot ${formulaPower(values.deviation, '2')}}\\right]`),
  mathTemplate('binomial-distribution', 'probability', '二项分布', 'Binomial distribution', [
    field('trials', '试验次数', 'Trials', 'n'),
    field('successes', '成功次数', 'Successes', 'k'),
    field('probability', '成功概率', 'Probability', 'p'),
  ], values => `P(X=${values.successes})=\\binom{${values.trials}}{${values.successes}}\\cdot ${formulaPower(values.probability, values.successes)}\\cdot (1-${formulaOperand(values.probability)})^{${formulaOperand(values.trials)}-${formulaOperand(values.successes)}}`),
  mathTemplate('conditional-probability', 'probability', '条件概率', 'Conditional probability', [
    field('eventA', '事件 A', 'Event A', 'A'),
    field('eventB', '事件 B', 'Event B', 'B'),
  ], values => `P(${values.eventA}\\mid ${values.eventB})=\\frac{P(${values.eventA}\\cap ${values.eventB})}{P(${values.eventB})}`),
  mathTemplate('bayes', 'probability', '贝叶斯公式', 'Bayes theorem', [
    field('eventA', '事件 A', 'Event A', 'A'),
    field('eventB', '事件 B', 'Event B', 'B'),
  ], values => `P(${values.eventA}\\mid ${values.eventB})=\\frac{P(${values.eventB}\\mid ${values.eventA})P(${values.eventA})}{P(${values.eventB})}`),
  mathTemplate('correlation', 'probability', '相关系数', 'Correlation coefficient', [
    field('x', '变量 X', 'Variable X', 'X'),
    field('y', '变量 Y', 'Variable Y', 'Y'),
  ], values => `\\rho_{${values.x},${values.y}}=\\frac{\\operatorname{Cov}(${values.x},${values.y})}{\\sigma_{${values.x}}\\sigma_{${values.y}}}`),

  mathTemplate('newton-second-law', 'physics', '牛顿第二定律', "Newton's second law", [
    field('force', '合力', 'Force', 'F'),
    field('mass', '质量', 'Mass', 'm'),
    field('acceleration', '加速度', 'Acceleration', 'a'),
  ], values => `${values.force}=${formulaProduct(values.mass, values.acceleration)}`),
  mathTemplate('kinetic-energy', 'physics', '动能', 'Kinetic energy', [
    field('mass', '质量', 'Mass', 'm'),
    field('velocity', '速度', 'Velocity', 'v'),
  ], values => `E_k=\\frac{1}{2}\\cdot ${formulaOperand(values.mass)}\\cdot ${formulaPower(values.velocity, '2')}`),
  mathTemplate('potential-energy', 'physics', '重力势能', 'Gravitational potential energy', [
    field('mass', '质量', 'Mass', 'm'),
    field('gravity', '重力加速度', 'Gravity', 'g'),
    field('height', '高度', 'Height', 'h'),
  ], values => `E_p=${formulaProduct(values.mass, values.gravity, values.height)}`),
  mathTemplate('mass-energy', 'physics', '质能方程', 'Mass-energy equivalence', [
    field('mass', '质量', 'Mass', 'm'),
    field('lightSpeed', '光速', 'Speed of light', 'c'),
  ], values => `E=${formulaOperand(values.mass)}\\cdot ${formulaPower(values.lightSpeed, '2')}`),
  mathTemplate('ohms-law', 'physics', '欧姆定律', "Ohm's law", [
    field('voltage', '电压', 'Voltage', 'U'),
    field('current', '电流', 'Current', 'I'),
    field('resistance', '电阻', 'Resistance', 'R'),
  ], values => `${values.voltage}=${formulaProduct(values.current, values.resistance)}`),
  mathTemplate('electric-power', 'physics', '电功率', 'Electric power', [
    field('voltage', '电压', 'Voltage', 'U'),
    field('current', '电流', 'Current', 'I'),
  ], values => `P=${formulaProduct(values.voltage, values.current)}`),
  mathTemplate('wave-relation', 'physics', '波速关系', 'Wave relation', [
    field('speed', '波速', 'Wave speed', 'v'),
    field('frequency', '频率', 'Frequency', 'f'),
    field('wavelength', '波长', 'Wavelength', '\\lambda'),
  ], values => `${values.speed}=${formulaProduct(values.frequency, values.wavelength)}`),
  mathTemplate('ideal-gas', 'physics', '理想气体状态方程', 'Ideal gas law', [
    field('pressure', '压强', 'Pressure', 'p'),
    field('volume', '体积', 'Volume', 'V'),
    field('amount', '物质的量', 'Amount', 'n'),
    field('constant', '气体常数', 'Gas constant', 'R'),
    field('temperature', '温度', 'Temperature', 'T'),
  ], values => `${formulaProduct(values.pressure, values.volume)}=${formulaProduct(values.amount, values.constant, values.temperature)}`),

  chemistryTemplate('chem-custom', 'chemistry', '自定义化学式', 'Custom chemistry', [
    field('formula', 'mhchem 内容', 'mhchem source', '2H2 + O2 -> 2H2O'),
  ], values => `\\ce{${values.formula}}`),
  chemistryTemplate('molecule', 'chemistry', '分子式', 'Molecular formula', [
    field('formula', '分子式', 'Formula', 'H2SO4'),
  ], values => `\\ce{${values.formula}}`),
  chemistryTemplate('ion', 'chemistry', '离子与电荷', 'Ion and charge', [
    field('formula', '离子式', 'Ion', 'SO4^2-'),
  ], values => `\\ce{${values.formula}}`),
  mathTemplate('amount-of-substance', 'chemistry', '物质的量', 'Amount of substance', [
    field('mass', '物质质量', 'Mass', 'm'),
    field('molarMass', '摩尔质量', 'Molar mass', 'M'),
  ], values => `n=\\frac{${values.mass}}{${values.molarMass}}`),
  mathTemplate('molar-concentration', 'chemistry', '物质的量浓度', 'Molar concentration', [
    field('amount', '物质的量', 'Amount', 'n'),
    field('volume', '溶液体积', 'Solution volume', 'V'),
  ], values => `c=\\frac{${values.amount}}{${values.volume}}`),
  mathTemplate('mass-fraction', 'chemistry', '质量分数', 'Mass fraction', [
    field('soluteMass', '溶质质量', 'Solute mass', 'm_{\\text{solute}}'),
    field('solutionMass', '溶液质量', 'Solution mass', 'm_{\\text{solution}}'),
  ], values => `w=\\frac{${values.soluteMass}}{${values.solutionMass}}\\times100\\%`),
  mathTemplate('ph', 'chemistry', 'pH 计算', 'pH calculation', [
    field('concentration', '氢离子浓度', 'Hydrogen ion concentration', '[\\ce{H+}]'),
  ], values => `\\mathrm{pH}=-\\log_{10}${values.concentration}`),
  chemistryTemplate('reaction', 'chemical-reaction', '化学反应方程式', 'Chemical reaction', [
    field('reactants', '反应物', 'Reactants', '2H2 + O2'),
    field('products', '生成物', 'Products', '2H2O'),
  ], values => `\\ce{${values.reactants} -> ${values.products}}`),
  chemistryTemplate('reversible', 'chemical-reaction', '可逆反应', 'Reversible reaction', [
    field('reactants', '反应物', 'Reactants', 'N2 + 3H2'),
    field('products', '生成物', 'Products', '2NH3'),
    field('condition', '反应条件（可空）', 'Condition (optional)', 'heat', ''),
  ], values => `\\ce{${values.reactants} <=>${values.condition ? `[${values.condition}]` : ''} ${values.products}}`),
  chemistryTemplate('states', 'chemical-reaction', '带物态反应', 'Reaction with states', [
    field('reactants', '反应物（含物态）', 'Reactants with states', 'CaCO3(s)'),
    field('products', '生成物（含物态）', 'Products with states', 'CaO(s) + CO2(g)'),
  ], values => `\\ce{${values.reactants} -> ${values.products}}`),
  chemistryTemplate('precipitate', 'chemical-reaction', '沉淀反应', 'Precipitation reaction', [
    field('reactants', '反应物', 'Reactants', 'Ag+ + Cl-'),
    field('product', '沉淀物', 'Precipitate', 'AgCl v'),
  ], values => `\\ce{${values.reactants} -> ${values.product}}`),
  chemistryTemplate('gas', 'chemical-reaction', '气体生成反应', 'Gas evolution', [
    field('reactants', '反应物', 'Reactants', '2H+ + CO3^2-'),
    field('products', '生成物', 'Products', 'H2O + CO2 ^'),
  ], values => `\\ce{${values.reactants} -> ${values.products}}`),
  mathTemplate('equilibrium-constant', 'chemical-reaction', '化学平衡常数', 'Equilibrium constant', [
    field('products', '生成物浓度乘积', 'Product concentrations', '[C]^c[D]^d'),
    field('reactants', '反应物浓度乘积', 'Reactant concentrations', '[A]^a[B]^b'),
  ], values => `K_c=\\frac{${values.products}}{${values.reactants}}`),
  mathTemplate('reaction-rate', 'chemical-reaction', '化学反应速率', 'Reaction rate', [
    field('concentration', '浓度变化', 'Concentration change', '\\Delta c'),
    field('time', '时间变化', 'Time change', '\\Delta t'),
  ], values => `v=-\\frac{${values.concentration}}{${values.time}}`),
];

export const FORMULA_GROUP_LABELS = {
  mathematics: { zh: '基础数学', en: 'Mathematics' },
  algebra: { zh: '代数与函数', en: 'Algebra & functions' },
  geometry: { zh: '几何', en: 'Geometry' },
  calculus: { zh: '微积分', en: 'Calculus' },
  'linear-algebra': { zh: '线性代数', en: 'Linear algebra' },
  probability: { zh: '概率统计', en: 'Probability & statistics' },
  physics: { zh: '物理', en: 'Physics' },
  chemistry: { zh: '基础化学', en: 'Chemistry' },
  'chemical-reaction': { zh: '化学反应', en: 'Chemical reactions' },
};

export const FORMULA_DISCIPLINES = [
  { id: 'all', name: { zh: '全部', en: 'All' } },
  ...Object.entries(FORMULA_GROUP_LABELS).map(([id, name]) => ({ id, name })),
];

export function formulaTemplatesForDiscipline(discipline = 'all') {
  if (discipline !== 'all') return FORMULA_TEMPLATES.filter(template => template.group === discipline);
  return FORMULA_DISCIPLINES
    .filter(item => item.id !== 'all')
    .flatMap(item => FORMULA_TEMPLATES.filter(template => template.group === item.id));
}

const FORMULA_SEARCH_ALIASES = {
  power: '平方 立方 指数 exponent square cube', root: '平方根 开方 sqrt radical',
  fraction: '分式 frac', quadratic: '二次方程 判别式 quadratic discriminant',
  pythagorean: '毕达哥拉斯 pythagoras', derivative: '求导 differentiation',
  integral: '积分 integration', 'normal-distribution': '高斯 gaussian',
  'newton-second-law': '牛顿 力 force newton', 'ohms-law': '欧姆 电阻 ohm',
  'chem-custom': '化学式 mhchem ce',
};
const searchText = value => String(value).normalize('NFKC').toLowerCase().replace(/[-_]/g, ' ').trim();
const formulaSearchIndex = new Map();

export function searchFormulaTemplates(discipline = 'all', query = '') {
  const terms = searchText(query).split(/\s+/).filter(Boolean);
  const templates = formulaTemplatesForDiscipline(discipline);
  if (!terms.length) return templates;
  return templates.filter(template => {
    if (!formulaSearchIndex.has(template.id)) {
      const group = FORMULA_GROUP_LABELS[template.group] || {};
      formulaSearchIndex.set(template.id, searchText([
        template.name.zh, template.name.en, template.id, group.zh, group.en,
        template.kind === 'chemistry' ? 'chemistry mhchem 化学' : 'math latex 数学',
        FORMULA_SEARCH_ALIASES[template.id] || '',
        ...template.fields.flatMap(item => [item.label.zh, item.label.en]),
      ].join(' ')));
    }
    return terms.every(term => formulaSearchIndex.get(template.id).includes(term));
  });
}

export function formulaTemplatesForMode(mode) {
  return FORMULA_TEMPLATES.filter(template => template.modes.includes(mode));
}

export function formulaTemplateById(id) {
  return FORMULA_TEMPLATES.find(template => template.id === id);
}

// A compound/negative operand needs visible grouping, not just TeX braces.
export function formulaOperand(value) {
  const text = String(value).trim();
  return /^(?:[A-Za-z]|\d+(?:\.\d+)?|\\[A-Za-z]+)(?:_(?:\{[^{}]*\}|[A-Za-z0-9]))?$/.test(text)
    ? text : `\\left(${text}\\right)`;
}

export function formulaProduct(...values) {
  return values.map(formulaOperand).join('\\cdot ');
}

export function formulaPower(value, exponent) {
  return `${formulaOperand(value)}^{${exponent}}`;
}

// Template variables are names, not arbitrary expressions or argument lists.
function formulaVariable(value) {
  const text = String(value).trim();
  if (!/^(?:[A-Za-z]|\\[A-Za-z]+)(?:_(?:\{[A-Za-z0-9]+\}|[A-Za-z0-9]))?$/.test(text)) throw new Error('FORMULA_VARIABLE_INVALID');
  return text;
}

export function formulaInlineHasNewline(expression) {
  return /[\r\n]/.test(String(expression).trim());
}

export function formulaValues(template, values = {}) {
  return Object.fromEntries(template.fields.map(item => {
    const supplied = values[item.key];
    return [item.key, supplied === undefined ? item.value : String(supplied)];
  }));
}

export function buildFormulaExpression(template, values = {}) {
  if (!template) return '';
  return template.build(formulaValues(template, values)).trim();
}

export function safeEquationTag(value = '1') {
  return String(value).replace(/[{}\\$]/g, '').trim().slice(0, 24) || '1';
}

export function formulaPreviewExpression(mode, expression, equationTag = '1') {
  return mode === 'numbered' ? `${expression} \\tag{${safeEquationTag(equationTag)}}` : expression;
}

// Only a leading, whole style declaration belongs to this control. Never
// rewrite nested groups, commands, comments or user-authored formula structure.
export function formulaInlineLayout(expression) {
  const source = String(expression);
  const declaration = source.match(/^\s*\\(displaystyle|textstyle)(?![A-Za-z])\s*/);
  return {
    layout: declaration?.[1] === 'displaystyle' ? 'large' : 'normal',
    expression: declaration ? source.slice(declaration[0].length) : source,
  };
}

export function applyFormulaInlineLayout(expression, layout) {
  if (!['normal', 'large'].includes(layout)) throw new Error('FORMULA_LAYOUT_INVALID');
  const parsed = formulaInlineLayout(expression);
  return layout === 'large' && parsed.expression.trim()
    ? `\\displaystyle ${parsed.expression}` : parsed.expression;
}

export function buildFormulaMarkdown(mode, expression, equationTag = '1') {
  const source = String(expression).trim();
  if (mode === 'inline') {
    if (formulaInlineHasNewline(source)) throw new Error('FORMULA_INLINE_MULTILINE');
    return `$${source}$`;
  }
  const rendered = formulaPreviewExpression(mode, source, equationTag);
  return `$$\n${rendered}\n$$`;
}

export function parseFormulaMarkdown(source = '') {
  const markdown = String(source).trim();
  if (!markdown) return { expression: '', displayMode: false };
  if (markdown.startsWith('$$') && markdown.endsWith('$$')) {
    return { expression: markdown.slice(2, -2).trim(), displayMode: true };
  }
  if (markdown.startsWith('\\[') && markdown.endsWith('\\]')) {
    return { expression: markdown.slice(2, -2).trim(), displayMode: true };
  }
  if (markdown.startsWith('\\(') && markdown.endsWith('\\)')) {
    return { expression: markdown.slice(2, -2).trim(), displayMode: false };
  }
  if (markdown.startsWith('$') && markdown.endsWith('$')) {
    return { expression: markdown.slice(1, -1).trim(), displayMode: false };
  }
  return { expression: markdown, displayMode: true };
}

// Preview and every save path validate exactly the Markdown that will be written.
export function resolveFormulaOutput(source, mode, equationTag = '1') {
  const input = String(source).trim();
  const delimited = /^(\$\$[\s\S]*\$\$|\$[\s\S]*\$|\\\[[\s\S]*\\\]|\\\([\s\S]*\\\))$/.test(input);
  const parsed = parseFormulaMarkdown(input);
  const markdown = delimited ? input : buildFormulaMarkdown(mode, parsed.expression, equationTag);
  return { ...parseFormulaMarkdown(markdown), markdown, delimited };
}
