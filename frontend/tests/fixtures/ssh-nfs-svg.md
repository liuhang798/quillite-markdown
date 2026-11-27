# SVG 拓扑

<svg width="680" viewBox="0 0 680 340" style="max-width:100%;height:auto" xmlns="http://www.w3.org/2000/svg" role="img" font-family="var(--font-sans)">
<title>网段切换到 192.168.3.0/24 后的 SSH 与 NFS 拓扑</title>
<desc>开发 PC 通过 SSH 连接开发板，开发板通过 NFS 挂载桥接虚拟机。</desc>
<defs>
<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</marker>
</defs>
<text x="40" y="42" font-size="18" font-weight="500" fill="#2C2C2A">网段切换后的拓扑 · 192.168.3.0/24</text>

<rect x="40" y="70" width="220" height="60" rx="10" fill="#E6F1FB" stroke="#185FA5" stroke-width="0.5"/>
<text x="150" y="94" text-anchor="middle">Windows 开发 PC</text>
<text x="150" y="114" text-anchor="middle">192.168.3.15 · 以太网 3</text>

<rect x="420" y="70" width="220" height="60" rx="10" fill="#E6F1FB" stroke="#185FA5"/>
<text x="530" y="94" text-anchor="middle">开发板 eth0</text>
<text x="530" y="114" text-anchor="middle">192.168.3.50 · S52app</text>

<rect x="40" y="230" width="220" height="60" rx="10" fill="#E1F5EE" stroke="#0F6E56"/>
<text x="150" y="254" text-anchor="middle">桥接 VM · ens36</text>

<rect x="420" y="230" width="220" height="60" rx="10" fill="#FAEEDA" stroke="#BA7517"/>
<text x="530" y="254" text-anchor="middle">NAT 虚拟机 ens33</text>

<path d="M262 100 L416 100" fill="none" stroke="#0F6E56" marker-end="url(#arrow)"/>
<text x="339" y="90" text-anchor="middle">SSH :22</text>

<path d="M430 132 L430 190 L262 190 L262 228" fill="none" stroke="#0F6E56" marker-end="url(#arrow)"/>
<text x="346" y="182" text-anchor="middle">NFS mount · 板子主动发起</text>

<path d="M100 132 L100 226" fill="none" stroke="#888780" stroke-dasharray="4 4" marker-end="url(#arrow)"/>
<text x="110" y="182">VMnet0 桥接</text>

<text x="40" y="320" font-size="13" fill="#993C1D">关键：NFS 服务器是桥接 VM 的 ens36，不是 Windows PC。</text>
</svg>

## 图后的标题
