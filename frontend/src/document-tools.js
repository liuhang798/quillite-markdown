import { BUILTIN_TEMPLATES, TOOL_LIMITS, checkMarkdown, diagnosticSummary, parseCustomTemplates, renderDocumentTemplate } from './document-tools-core.js';

// Native modal keeps the editor inert and traps focus. Render all document,
// filename and diagnostic data as text, never as HTML.
export function createDocumentTools(host) {
  const dialog = document.createElement('dialog');
  dialog.id = 'documentToolsDialog'; dialog.className = 'document-tools';
  document.body.append(dialog);
  let generation = 0, busy = false, tab = 'check', context;
  const en = () => host.context().language === 'en';
  const text = (zh, english) => en() ? english : zh;
  const node = (tag, value, cls) => { const n = document.createElement(tag); if (value != null) n.textContent = value; if (cls) n.className = cls; return n; };
  const button = (label, fn, primary = false) => { const b = node('button', label, primary ? 'primary' : 'secondary'); b.type = 'button'; b.addEventListener('click', () => run(fn)); return b; };
  let body, status;
  const message = value => { status.textContent = value; };
  const current = () => { const now = host.context(); return now.session === context.session && now.path === context.path; };
  async function run(fn) {
    if (busy) return;
    busy = true; dialog.setAttribute('aria-busy', 'true');
    message(text('正在处理…', 'Working…'));
    const inputs = [...dialog.querySelectorAll('input,textarea,select')].map(el => [el, el.disabled]);
    inputs.forEach(([el]) => { el.disabled = true; });
    const request = generation;
    try { await fn(); } catch (error) { if (request === generation) message(text('操作未完成，原文件未被强制覆盖。请检查权限或重新预览。', 'Operation incomplete; no forced overwrite. Check access or refresh the preview.') + ` (${String(error).match(/[A-Z][A-Z_]{5,}/)?.[0] || 'ERROR'})`); }
    finally { inputs.forEach(([el, disabled]) => { if (el.isConnected) el.disabled = disabled; }); busy = false; dialog.removeAttribute('aria-busy'); }
  }
  function close() { if (busy) return; generation++; dialog.close(); host.focus(); }
  async function leaveForDocument(action) {
    // Release the native top layer BEFORE permission/conflict UI can open.
    // Do not reopen it or steal focus if the document action needs user input.
    dialog.close(); generation++;
    try {
      if (await action()) host.focusDocument();
      else if (current() && !host.hasBlockingDialog()) {
        dialog.showModal(); // Cancellation must retain unsaved template fields.
        message(text('操作已取消或未完成，输入内容已保留。', 'Operation cancelled or incomplete; your input is retained.'));
      }
    }
    catch {
      if (current() && !host.hasBlockingDialog()) {
        dialog.showModal();
        message(text('操作失败，输入内容已保留，请重试。', 'Operation failed; your input is retained. Please retry.'));
      } else host.notifyFailure();
    }
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('keydown', event => { event.stopPropagation(); if ((event.ctrlKey || event.metaKey) && ['s', 'o', 'n'].includes(event.key.toLowerCase())) event.preventDefault(); });
  const field = (label, input) => { const wrap = node('label', null, 'tools-field'); wrap.append(node('span', label), input); return wrap; };
  const input = (value = '', multiline = false) => { const el = document.createElement(multiline ? 'textarea' : 'input'); if (!multiline) el.type = 'text'; el.value = value; return el; };
  function preview(value, full = false) { const pre = node('pre', !full && value.length > 200000 ? value.slice(0, 200000) + text('\n…预览已截断，另存副本保留全文。', '\n…Preview truncated; Save Copy retains all content.') : value, 'tools-preview'); return pre; }
  function show(tabName = tab) {
    tab = tabName; generation++; context = host.context(); dialog.replaceChildren();
    const head = node('header'); head.append(node('h2', text('文档工具', 'Document tools')), button(text('关闭', 'Close'), () => { busy = false; close(); }));
    const nav = node('nav'); nav.setAttribute('aria-label', text('工具分类', 'Tool categories'));
    for (const [key, zh, english] of [['check','文档检查','Check'],['search','全文搜索 / 替换','Search / Replace'],['safety','文档安全','Safety'],['templates','模板中心','Templates'],['diagnostics','诊断报告','Diagnostics']]) {
      const b = button(text(zh, english), () => show(key)); b.setAttribute('aria-current', key === tab ? 'page' : 'false'); nav.append(b);
    }
    status = node('p', '', 'tools-status'); status.setAttribute('role', 'status');
    body = node('section', null, 'tools-body'); dialog.append(head, nav, status, body);
    if (!dialog.open) dialog.showModal();
    if (tab === 'check') checkView();
    if (tab === 'search') searchView();
    if (tab === 'safety') safetyView();
    if (tab === 'templates') templateView();
    if (tab === 'diagnostics') diagnosticsView();
  }
  function checkView() {
    body.append(node('p', text('只检查当前文本，不自动修改。支持常见 Markdown 语法；本地图片无法访问也会列为待核对。最多检查 2 MiB / 128 张图片。', 'Checks current text without changing it. Common Markdown syntax; inaccessible local images need review. Limit: 2 MiB / 128 images.')));
    body.append(button(text('检查当前文档', 'Check document'), async () => {
      context = host.context(); if (!context.path) return message(text('请先打开文档。', 'Open a document first.'));
      const result = checkMarkdown(context.content, host.checkAnchors), missing = await host.api.checkDocumentAssets(context.path, result.assets.map(a => a.ref));
      if (!current()) return message(text('文档已切换，请重新检查。', 'Document changed; check again.'));
      for (const asset of result.assets) if (missing.includes(asset.ref)) result.issues.push({ code: 'image', line: asset.line, detail: asset.ref });
      list.replaceChildren();
      const names = { fence: text('代码围栏未闭合', 'Unclosed code fence'), heading: text('标题层级跳跃', 'Skipped heading level'), table: text('表格列数不一致', 'Inconsistent table columns'), anchor: text('锚点未找到（按本应用标题 ID）', 'Anchor not found (application heading IDs)'), image: text('本地图片缺失或无权访问', 'Missing or inaccessible local image') };
      for (const issue of result.issues) list.append(button(`${issue.line} · ${names[issue.code]} ${issue.detail || ''}`, async () => {
        if (!current() || host.context().content !== context.content) return message(text('文本已改变，请重新检查。', 'Text changed; check again.'));
        await leaveForDocument(() => host.locate(context.path, issue.line));
      }));
      message(`${result.issues.length} ${text('项待核对', 'items to review')}${result.limited ? text('（已达检查上限）', ' (limit reached)') : ''}`);
    }, true));
    const list = node('div', null, 'tools-list'); body.append(list);
  }
  function searchView() {
    let root = context.root || '', plan = null;
    const rootLabel = node('p', root || text('尚未选择文件夹', 'No folder selected'));
    const choose = button(text('选择文件夹', 'Choose folder'), async () => { const f = await host.api.openFolder(); if (f) { root = f.root; rootLabel.textContent = root; invalidate(); } });
    const query = input(), replacement = input(), filter = input(), extension = document.createElement('select');
    for (const [value,label] of [['',text('全部文本类型','All text types')],['.md','Markdown (.md)'],['.txt','Text (.txt)'],['.markdown','.markdown'],['.mdown','.mdown'],['.mkd','.mkd']]) { const o = node('option', label); o.value=value; extension.append(o); }
    query.maxLength = 4096; replacement.maxLength = 65536; filter.maxLength = 1024;
    const form = node('div', null, 'tools-grid'); form.append(field(text('查找（区分大小写、纯文本）','Find (case-sensitive, literal)'), query), field(text('替换为（允许为空）','Replace with (may be empty)'), replacement), field(text('文件名 / 相对目录包含','Filename / relative path contains'), filter), field(text('文件类型','File type'), extension));
    const list = node('div', null, 'tools-list'), actions = node('div', null, 'tools-actions');
    function invalidate() { plan = null; apply.disabled = true; list.replaceChildren(); message(text('条件已改变，请重新搜索或预览。','Options changed; search or preview again.')); }
    const payload = () => ({ root, query: query.value, replacement: replacement.value, filter: filter.value, extension: extension.value, excludePath: host.context().path || '' });
    const apply = button(text('确认替换已勾选文件','Replace selected files'), async () => {
      if (!plan || !current()) return message(text('会话已改变，请重新预览。','Session changed; preview again.'));
      const selected = [...list.querySelectorAll('input[type=checkbox]:checked')].map(n => n.value);
      if (!selected.length) return message(text('请先逐项勾选。','Select files first.'));
      if (!window.confirm(text(`确认替换 ${selected.length} 个文件？保存历史版本后写入；有冲突的文件会跳过。`, `Replace ${selected.length} files? History is captured first; conflicting files are skipped.`))) return;
      const token = plan.token; plan = null; apply.disabled = true;
      const result = await host.api.applyWorkspaceReplace(token, selected);
      list.replaceChildren();
      const names = { saved: text('已保存','Saved'), conflict: text('冲突，已跳过','Conflict — skipped'), failed: text('失败，未确认保存；请重新检查','Failed — inspect before retrying') };
      for (const row of result) list.append(node('p', `${names[row.status]} · ${row.path}`));
      message(text('批次已结束，未自动重试。历史版本可在打开对应文件后查看。','Batch finished without automatic retries. Open a file to view its history.'));
    }, true); apply.disabled = true;
    actions.append(button(text('搜索','Search'), async () => {
      invalidate(); const r = await host.api.searchWorkspace(payload()); list.replaceChildren();
      for (const match of r.matches) list.append(button(`${match.relativePath}:${match.line}\n${match.text}`, () => leaveForDocument(() => host.locate(match.path, match.line))));
      message(`${r.matches.length} ${text('条结果','matches')} · ${r.scanned} ${text('个文件已检查','files scanned')} · ${r.skipped} ${text('个跳过','skipped')}${r.limited ? text(' · 已达上限，结果不完整',' · Limit reached; incomplete') : ''}`);
    }), button(text('预览批量替换','Preview replacements'), async () => {
      invalidate(); context = host.context(); const r = await host.api.previewWorkspaceReplace(payload());
      if (!current()) return;
      plan = r; list.replaceChildren();
      for (const change of r.changes) {
        const item = node('details'), summary = node('summary'), check = input(); check.type = 'checkbox'; check.value = change.path;
        const label = node('label'); label.append(check, document.createTextNode(`${change.relativePath} · ${change.count}`)); summary.append(label);
        const pair = node('div', null, 'tools-grid');
        item.addEventListener('toggle', () => { if (item.open && !pair.childNodes.length) pair.append(field(text('修改前','Before'), preview(change.before, true)), field(text('修改后','After'), preview(change.after, true))); });
        item.append(summary, pair); list.append(item);
      }
      apply.disabled = !r.changes.length;
      message(`${r.changes.length} ${text('个文件可选择','files available')} · ${r.skipped} ${text('个跳过','skipped')}${r.limited ? text(' · 已达上限',' · Limit reached') : ''}`);
    }), apply);
    for (const el of [query, replacement, filter, extension]) el.addEventListener('input', invalidate);
    body.append(choose, rootLabel, node('p', text('搜索磁盘内容，跳过当前打开的文档、链接及不可读文件。搜索：每文件 2 MiB / 500 条结果。替换：每文件 256 KiB / 每批 40 个文件；预览 10 分钟有效。','Searches disk content; skips the open document, links and unreadable files. Search: 2 MiB/file, 500 results. Replace: 256 KiB/file, 40 files/batch; preview expires after 10 minutes.')), form, actions, list);
  }
  function safetyView() {
    if (context.saveBlocked) body.append(node('p', text('保存受阻：请先处理当前冲突或另存副本；不执行强制覆盖。','Saving is blocked: resolve the conflict or save a copy; no forced overwrite.')));
    body.append(node('p', text('当前文档状态：','Current document: ') + (context.conflict ? text('冲突未解决，自动保存暂停','Conflict unresolved — autosave paused') : context.dirty ? text('存在未保存编辑','Unsaved edits') : text('无待保存编辑','No pending edits'))));
    body.append(button(text('查看当前冲突','Review current conflict'), async () => { if (!host.context().conflict) return message(text('当前没有冲突。','No active conflict.')); dialog.close(); await host.conflict(); }), button(text('打开备份目录','Open backup directory'), () => host.api.showDocumentBackupDirectory()));
    const list = node('div', null, 'tools-list'); body.append(button(text('读取恢复备份与当前文档历史','Load recovery and current history'), async () => {
      context = host.context(); list.replaceChildren();
      const snapshot = await host.api.getRecoveryBackup();
      if (snapshot) {
        const item = node('details'); item.append(node('summary', `${text('恢复备份','Recovery')} · ${snapshot.name} · ${snapshot.updatedAt}`), preview(snapshot.content), button(text('另存恢复副本（不覆盖）','Save recovery copy (no overwrite)'), async () => { const copy = await host.api.saveConflictCopy(snapshot.path, snapshot.content); if (copy) message(text('副本已保存：','Copy saved: ') + copy.path); })); list.append(item);
      } else list.append(node('p', text('暂无待恢复备份。','No recovery snapshot.')));
      if (!context.path) return;
      const versions = await host.api.listDocumentVersions(context.path);
      for (const version of versions) {
        const item = node('details'), content = node('div'); item.append(node('summary', `${text('历史版本','History')} · ${version.createdAt} · ${version.size} B`), content);
        item.addEventListener('toggle', () => { if (item.open && !content.childNodes.length) void run(async () => { const v = await host.api.getDocumentVersion(context.path, version.id); content.append(preview(v.content), button(text('另存历史副本（不覆盖）','Save history copy (no overwrite)'), async () => { const copy = await host.api.saveConflictCopy(version.path, v.content); if (copy) message(text('副本已保存：','Copy saved: ') + copy.path); })); }); }); list.append(item);
      }
      if (!versions.length) list.append(node('p', text('当前文档暂无历史版本。','No history for the current document.')));
    }, true)); body.append(list);
  }
  function templateView() {
    const key = 'quilliteCustomTemplatesV1';
    const custom = parseCustomTemplates(localStorage.getItem(key));
    const choose = document.createElement('select');
    const all = [...BUILTIN_TEMPLATES.map(t => ({ ...t, name: en() ? t.en : t.zh })), ...custom];
    for (let i = 0; i < all.length; i++) { const o = node('option', all[i].name); o.value = i; choose.append(o); }
    const name = input(all[0].name), content = input(all[0].content, true); name.maxLength = 80; content.rows = 12; content.maxLength = TOOL_LIMITS.templateBytes;
    choose.addEventListener('change', () => { name.value = all[choose.value].name; content.value = all[choose.value].content; });
    body.append(node('p', text('模板只保存在本机。支持 {{title}}、{{date}}；使用模板会新建文档，不替换当前文档。','Templates stay on this device. Variables: {{title}}, {{date}}. Creates a new document, never replaces the current one.')), field(text('选择模板','Template'),choose),field(text('模板名称 / 文档标题','Template name / title'),name),field(text('模板正文','Template body'),content));
    const actions = node('div',null,'tools-actions');
    actions.append(button(text('保存为自定义模板','Save custom template'), () => {
      if (!name.value.trim() || name.value.length > 80 || custom.length >= TOOL_LIMITS.templates) throw new Error('TEMPLATE_LIMIT');
      renderDocumentTemplate(content.value, name.value);
      custom.push({ id: crypto.randomUUID(), name: name.value.trim(), content: content.value });
      localStorage.setItem(key, JSON.stringify(custom)); show('templates'); message(text('模板已保存。','Template saved.'));
    }), button(text('新建文档','Create document'), async () => {
      if (!name.value.trim()) return message(text('请填写标题。','Enter a title.'));
      const markdown = renderDocumentTemplate(content.value, name.value);
      await leaveForDocument(() => host.create(markdown));
    }, true)); body.append(actions);
  }
  function diagnosticsView() {
    const report = diagnosticSummary({ ...host.context(), platform: document.documentElement.dataset.platform });
    body.append(node('p', text('仅包含版本、平台、当前状态布尔值和本次会话错误分类计数。不包含正文、文件名、路径、密钥或错误堆栈；不会上传。','Contains version, platform, status flags and session error-category counts only. No content, filenames, paths, keys or stacks. Nothing is uploaded.')), preview(JSON.stringify(report, null, 2)), button(text('导出诊断报告（新文件）','Export diagnostic report (new file)'), async () => { const path = await host.api.saveDiagnosticReport(report); if (path) message(text('已导出：','Exported: ') + path); }, true));
  }
  return { open: show };
}
