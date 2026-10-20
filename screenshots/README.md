# Product screenshots

Updated 2026-10-19 for Quillite Markdown 3.0.0. Captured from the maintained application's actual frontend (`frontend/src/main.js` and `renderer.js`), using isolated browser preferences and bilingual sample Markdown documents. These are application UI captures, not a recreated marketing mockup. Native window controls and file-system operations are not exercised by this capture method.

Reviewed against the current V3.0.0 interface on 2026-10-20. The main README files present live editing first and select light/dark images using `<picture>`.

Each image is 1600 × 1000 pixels, with matching Chinese / English and light / dark variants:

- `01-home.png`: Home and example-document entry points.
- `02-reader.png`: Reading view and outline.
- `03-split-editor.png`: Markdown source with a separate preview.
- `04-live-editor.png`: Live-rendered editing and the Live editing / Source switch.

Chinese light images are in this directory; dark images are in `dark/`. English images are in `en/` and `en/dark/`. Preserve native aspect ratio when displaying them.

| View | 中文 · 浅色 | 中文 · 深色 | English · Light | English · Dark |
|---|---|---|---|---|
| Home | [首页](01-home.png) | [首页](dark/01-home.png) | [Home](en/01-home.png) | [Home](en/dark/01-home.png) |
| Reader | [阅读](02-reader.png) | [阅读](dark/02-reader.png) | [Reader](en/02-reader.png) | [Reader](en/dark/02-reader.png) |
| Source + preview | [源码分栏](03-split-editor.png) | [源码分栏](dark/03-split-editor.png) | [Source + preview](en/03-split-editor.png) | [Source + preview](en/dark/03-split-editor.png) |
| Live editing | [即时渲染](04-live-editor.png) | [即时渲染](dark/04-live-editor.png) | [Live editing](en/04-live-editor.png) | [Live editing](en/dark/04-live-editor.png) |
