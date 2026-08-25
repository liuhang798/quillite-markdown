const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const [basePath, svgPath, pngPath] = process.argv.slice(2);

if (!basePath || !svgPath || !pngPath) {
  throw new Error('Usage: node render-typora-alternative-poster.cjs <base.png> <output.svg> <output.png>');
}

const base64 = fs.readFileSync(basePath).toString('base64');
const svg = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8f3cff"/>
      <stop offset="1" stop-color="#287cff"/>
    </linearGradient>
    <style>
      .cn { font-family: "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; }
      .latin { font-family: "Segoe UI", Arial, sans-serif; }
      .title { font-weight: 700; fill: #111318; }
      .desc { font-weight: 400; fill: #25272c; }
      .icon { fill: none; stroke: #fff; stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; }
    </style>
  </defs>
  <image href="data:image/png;base64,${base64}" width="1080" height="1440"/>

  <text x="540" y="158" text-anchor="middle" class="cn" font-size="39" font-weight="700" fill="#ff5138">免费开源的 Typora 平替</text>
  <text x="540" y="330" text-anchor="middle" class="cn" font-size="99" font-weight="700" letter-spacing="-3" fill="url(#brand)">轻阅 Markdown</text>
  <g class="cn" font-size="35" font-weight="600" fill="#15171c" text-anchor="middle">
    <text x="342" y="449">约 9 MB</text>
    <circle cx="458" cy="438" r="5" fill="#ff5b42"/>
    <text x="548" y="449">本地优先</text>
    <circle cx="638" cy="438" r="5" fill="#ff5b42"/>
    <text x="738" y="449">三端可用</text>
  </g>

  <!-- Download -->
  <g class="icon" transform="translate(153 622)">
    <path d="M0 -43V16"/><path d="M-22 -6L0 17L22 -6"/><path d="M-35 22V39H35V22"/>
  </g>
  <!-- Chart -->
  <g class="icon" transform="translate(654 622)">
    <path d="M-37 -37V38H39"/><path d="M-25 20V5M-5 20V-11M15 20V-26"/>
    <path d="M-27 -2L-8 -20L7 -10L34 -38"/><path d="M22 -38H34V-26"/>
  </g>
  <!-- Formula -->
  <g transform="translate(153 844)">
    <rect x="-39" y="-39" width="78" height="78" rx="13" class="icon"/>
    <text x="0" y="12" text-anchor="middle" class="latin" font-size="39" font-style="italic" fill="#fff">f(x)</text>
  </g>
  <!-- Book -->
  <g class="icon" transform="translate(654 844)">
    <path d="M0 -30C-12 -39 -29 -42 -42 -38V27C-26 23 -12 27 0 37Z"/>
    <path d="M0 -30C12 -39 29 -42 42 -38V27C26 23 12 27 0 37Z"/>
    <path d="M0 -30V37"/>
  </g>
  <!-- Word document -->
  <g class="icon" transform="translate(153 1066)">
    <path d="M-32 -43H13L34 -22V43H-32Z"/><path d="M13 -43V-22H34"/>
    <text x="1" y="20" text-anchor="middle" class="latin" font-size="39" font-weight="700" fill="#fff" stroke="none">W</text>
  </g>
  <!-- Folder with star -->
  <g class="icon" transform="translate(654 1066)">
    <path d="M-42 29V-29H-8L2 -18H42V14"/>
    <path d="M16 7L22 20L37 22L26 32L29 46L16 39L3 46L6 32L-5 22L10 20Z" stroke-width="5"/>
  </g>

  <!-- Card copy -->
  <g class="cn">
    <text x="254" y="610" class="title" font-size="36">约 9 MB</text>
    <text x="254" y="658" class="desc" font-size="25">Windows 安装包</text>
    <text x="753" y="610" class="title" font-size="36">37 类图表</text>
    <text x="753" y="658" class="desc latin" font-size="24">22 Mermaid + 15 ECharts</text>

    <text x="254" y="832" class="title" font-size="35">79 种学科公式</text>
    <text x="254" y="880" class="desc" font-size="25">填写参数，一键插入</text>
    <text x="753" y="832" class="title" font-size="36">阅读优先</text>
    <text x="753" y="880" class="desc" font-size="24">独立阅读页 · 目录跟随</text>

    <text x="254" y="1054" class="title" font-size="35">Word 原生公式</text>
    <text x="254" y="1102" class="desc" font-size="25">导出后仍可编辑</text>
    <text x="753" y="1054" class="title" font-size="36">文档库体验</text>
    <text x="753" y="1102" class="desc" font-size="24">最近阅读 · 置顶 · 收藏</text>
  </g>

  <text x="540" y="1261" text-anchor="middle" class="cn" font-size="65" font-weight="700">
    <tspan fill="url(#brand)">轻量</tspan><tspan fill="#111318">，但不简单</tspan>
  </text>
  <g class="latin" font-size="34" font-weight="500" fill="#202228" text-anchor="middle">
    <text x="386" y="1332">Windows</text>
    <circle cx="480" cy="1321" r="4.5" fill="#ff5b42"/>
    <text x="554" y="1332">macOS</text>
    <circle cx="631" cy="1321" r="4.5" fill="#ff5b42"/>
    <text x="699" y="1332">Linux</text>
  </g>
  <g class="cn" font-size="29" font-weight="500" fill="#555960" text-anchor="middle">
    <text x="333" y="1391">能读</text>
    <circle cx="391" cy="1381" r="4" fill="#ff5b42"/>
    <text x="449" y="1391">能写</text>
    <circle cx="507" cy="1381" r="4" fill="#ff5b42"/>
    <text x="579" y="1391">能画图</text>
    <circle cx="651" cy="1381" r="4" fill="#ff5b42"/>
    <text x="737" y="1391">能写公式</text>
  </g>
</svg>`;

fs.mkdirSync(path.dirname(svgPath), { recursive: true });
fs.writeFileSync(svgPath, svg);

sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toFile(pngPath)
  .then(() => console.log(pngPath));
