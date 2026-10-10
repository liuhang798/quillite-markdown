import { Facet, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import { alignedImageSource, imageAlignment, editorImageItems, editorImageGroups, imageSourceKind, canJoinImageGroups, imageRowSource, separateImageChanges, alignImageChanges, imageDimensions, imageDimensionStyle, resizeImageChanges } from './image-layout.js';

// Keep the public helpers available to existing regression fixtures.
export { alignedImageSource, imageAlignment };
export const embeddedImageItems = editorImageItems;
export const imagePreviewContext = Facet.define({ combine: values => values[0] || {} });
const displayedSources = new WeakMap();
const displayedSessions = new WeakMap();
export const imagePreviewPhrases = {
  'Embedded image': '内嵌图片', 'Local image': '本地图片', 'Online image': '在线图片', 'Image group': '图片组',
  '$ images': '$ 张图片', 'Show source': '查看源码', 'Hide source': '收起源码',
  'Align left': '左对齐', 'Align center': '居中', 'Align right': '右对齐',
  'L': '左', 'C': '中', 'R': '右',
  'Width': '宽度', 'Height': '高度', 'Auto': '自动', 'Keep ratio': '保持比例',
  'Image size': '尺寸', 'Apply size': '应用尺寸', 'Reset size': '原始尺寸', 'Image controls': '图片操作',
  'Join next image': '与下一张同排', 'Separate images': '拆成单张',
  'Only adjacent image-only blocks can join; up to six images per row': '仅可合并相邻的纯图片段落；每排最多 6 张',
  'Loading image…': '图片加载中…',
  'Image could not be displayed; view source to inspect it': '图片无法显示，请展开源码检查'
};
export const toggleImageSource = StateEffect.define();
export const refreshImagePreviews = StateEffect.define();
export const updateImagePreviewDirectory = StateEffect.define();

// Local paths never become file:// DOM sources. The document-scoped bridge
// resolves them with the existing MIME/size/bookmark protections. At most four
// reads run concurrently, repeated visible references share in-flight reads.
function createSession(state, context = state.facet(imagePreviewContext)) {
  const session = { active: true, context, pending: [], inFlight: new Map(), running: 0 };
  const drain = () => {
    while (session.active && session.running < 4 && session.pending.length) {
      const task = session.pending.shift(); session.running++;
      Promise.resolve().then(() => context.readImageData?.(task.ref, context.directory || '')).then(value => {
        if (imageSourceKind(value || '') !== 'embedded') throw new Error('IMAGE_UNAVAILABLE');
        task.resolve(value);
      }).catch(task.reject).finally(() => { session.running--; session.inFlight.delete(task.ref); drain(); });
    }
  };
  session.load = ref => {
    if (!session.active) return Promise.reject(new Error('IMAGE_SESSION_CLOSED'));
    if (session.inFlight.has(ref)) return session.inFlight.get(ref);
    const promise = new Promise((resolve, reject) => session.pending.push({ ref, resolve, reject }));
    session.inFlight.set(ref, promise); drain(); return promise;
  };
  session.dispose = () => {
    session.active = false;
    for (const task of session.pending.splice(0)) { session.inFlight.delete(task.ref); task.reject(new Error('IMAGE_SESSION_CLOSED')); }
  };
  return session;
}

function sameGroup(first, second) {
  return first.from === second.from && first.to === second.to && first.images.length === second.images.length
    && first.images.every((image, index) => image.ref === second.images[index].ref && image.from === second.images[index].from && image.to === second.images[index].to);
}

function applyImageChanges(view, changes) {
  const enclosing = view.state.field(imagePreviewField).items.find(item => item.from <= changes.from && item.to >= changes.to);
  // A child image ends inside a row. Keep the caret after the whole row so a
  // toolbar alignment click does not inadvertently trigger source editing.
  const end = Math.max(changes.to, enclosing?.to || 0);
  const transaction = view.state.update({ changes, annotations: isolateHistory.of('full'), userEvent: 'input.image-layout', selection: { anchor: end + changes.insert.length - (changes.to - changes.from) } });
  const items = editorImageGroups(transaction.newDoc.toString());
  view.dispatch(transaction);
  view.dispatch({ effects: refreshImagePreviews.of({ doc: view.state.doc, items }) });
}

class ImageWidget extends WidgetType {
  constructor(item, state, session, next) {
    super(); this.item = item; this.session = session; this.next = next;
    this.labels = Object.fromEntries(Object.keys(imagePreviewPhrases).map(key => [key, state.phrase(key)]));
    this.joinable = canJoinImageGroups(state.doc, item, next);
  }
  eq(other) {
    return this.session === other.session && sameGroup(this.item, other.item) && this.item.open === other.item.open
      && this.joinable === other.joinable && this.labels['Show source'] === other.labels['Show source']
      && this.item.images.every((image, index) => image.alignment === other.item.images[index].alignment && image.alt === other.item.images[index].alt
        && JSON.stringify(imageDimensions(image)) === JSON.stringify(imageDimensions(other.item.images[index])));
  }
  get estimatedHeight() { return this.item.open ? 36 : 280; }
  ignoreEvent() { return true; }
  current(view) {
    const field = view.state.field(imagePreviewField, false);
    if (!field || field.session !== this.session) return null;
    return field.items.find(item => sameGroup(item, this.item)) || null;
  }
  toDOM(view) {
    const root = document.createElement('div'); root.className = 'cm-embedded-image'; root.setAttribute('contenteditable', 'false');
    const toolbar = document.createElement('div'); toolbar.className = 'cm-image-tools'; root.append(toolbar);
    const caption = document.createElement('span'); caption.className = 'cm-image-caption'; toolbar.append(caption);
    for (const action of ['source', 'join', 'split']) { const button = document.createElement('button'); button.type = 'button'; button.dataset.imageAction = action; toolbar.append(button); }
    const cards = document.createElement('div'); cards.className = 'cm-image-cards'; root.append(cards);
    for (const image of this.item.images) {
      const card = document.createElement('div'); card.className = 'cm-image-card'; cards.append(card);
      card.tabIndex = 0; card.setAttribute('role', 'group');
      card.addEventListener('pointerdown', event => {
        if (!event.target.closest('button, input, select, a')) card.focus({ preventScroll: true });
      });
      card.addEventListener('mouseleave', () => { if (!card.matches(':focus-within')) card.classList.remove('is-size-open'); });
      card.addEventListener('focusout', () => queueMicrotask(() => {
        if (!card.matches(':focus-within') && !card.matches(':hover')) card.classList.remove('is-size-open');
      }));
      const tools = document.createElement('div'); tools.className = 'cm-image-tools cm-image-align-tools'; card.append(tools);
      for (const action of ['left', 'center', 'right', 'size']) { const button = document.createElement('button'); button.type = 'button'; button.dataset.imageAction = action; tools.append(button); }
      const sizeTools = document.createElement('div'); sizeTools.className = 'cm-image-size-tools'; card.append(sizeTools);
      const widthLabel = document.createElement('label'); widthLabel.className = 'cm-image-size-field'; sizeTools.append(widthLabel);
      const widthText = document.createElement('span'); widthText.dataset.imageSizeLabel = 'width'; widthLabel.append(widthText);
      const widthInput = document.createElement('input'); widthInput.type = 'number'; widthInput.min = '1'; widthInput.inputMode = 'numeric'; widthInput.dataset.imageSize = 'width'; widthLabel.append(widthInput);
      const widthUnit = document.createElement('select'); widthUnit.dataset.imageSizeUnit = 'width'; widthUnit.setAttribute('aria-label', 'Image width unit');
      for (const unit of ['%', 'px']) { const option = document.createElement('option'); option.value = unit; option.textContent = unit; widthUnit.append(option); }
      widthLabel.append(widthUnit);
      const ratioLabel = document.createElement('label'); ratioLabel.className = 'cm-image-ratio-field'; sizeTools.append(ratioLabel);
      const ratioInput = document.createElement('input'); ratioInput.type = 'checkbox'; ratioInput.dataset.imageKeepRatio = 'true'; ratioLabel.append(ratioInput);
      const ratioText = document.createElement('span'); ratioText.dataset.imageSizeLabel = 'ratio'; ratioLabel.append(ratioText);
      const heightLabel = document.createElement('label'); heightLabel.className = 'cm-image-size-field'; sizeTools.append(heightLabel);
      const heightText = document.createElement('span'); heightText.dataset.imageSizeLabel = 'height'; heightLabel.append(heightText);
      const heightInput = document.createElement('input'); heightInput.type = 'number'; heightInput.min = '1'; heightInput.max = '4096'; heightInput.inputMode = 'numeric'; heightInput.dataset.imageSize = 'height'; heightLabel.append(heightInput);
      const px = document.createElement('span'); px.className = 'cm-image-size-unit'; px.textContent = 'px'; heightLabel.append(px);
      for (const action of ['apply-size', 'reset-size']) { const button = document.createElement('button'); button.type = 'button'; button.dataset.imageSizeAction = action; sizeTools.append(button); }
      const frame = document.createElement('div'); frame.className = 'cm-image-frame'; card.append(frame);
      const img = document.createElement('img'); img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; frame.append(img);
      const status = document.createElement('span'); status.className = 'cm-image-error'; frame.append(status);
      img.addEventListener('load', () => { if (!img.isConnected || !this.session.active) return; img.hidden = false; status.hidden = true; view.requestMeasure(); });
      img.addEventListener('error', () => { if (!img.isConnected || !this.session.active) return; img.hidden = true; status.hidden = false; status.textContent = view.state.phrase('Image could not be displayed; view source to inspect it'); view.requestMeasure(); });
    }
    this.updateDOM(root, view); return root;
  }
  updateDOM(root, view) {
    // Load/error handlers belong to the DOM's creating session. Recreate on
    // Save As rather than letting stale listeners settle a different session.
    if (displayedSessions.has(root) && displayedSessions.get(root) !== this.session) return false;
    displayedSessions.set(root, this.session);
    if (root.querySelectorAll('.cm-image-card').length !== this.item.images.length) return false;
    const group = this.item;
    root.classList.toggle('is-source-open', group.open); root.classList.toggle('is-image-row', group.row);
    const first = group.images[0];
    const label = this.labels[first.sourceKind === 'embedded' ? 'Embedded image' : first.sourceKind === 'remote' ? 'Online image' : 'Local image'];
    const size = first.sourceKind === 'embedded' ? ` · ${Math.ceil((first.ref.length - first.ref.indexOf(',') - 1) * 3 / 4 / 1024)} KiB` : '';
    root.querySelector('.cm-image-caption').textContent = group.row ? `${this.labels['Image group']} · ${view.state.phrase('$ images', group.images.length)}` : `${label}${size}`;
    const toolbar = root.querySelector('.cm-image-tools');
    toolbar.querySelectorAll('button').forEach(button => {
      const action = button.dataset.imageAction;
      button.textContent = this.labels[action === 'source' ? (group.open ? 'Hide source' : 'Show source') : action === 'join' ? 'Join next image' : 'Separate images'];
      button.hidden = action === 'split' && !group.row;
      button.disabled = action === 'join' && !this.joinable;
      if (action === 'join') button.title = this.labels['Only adjacent image-only blocks can join; up to six images per row'];
      button.onmousedown = event => event.preventDefault();
      button.onclick = () => {
        const current = this.current(view); if (!current) return;
        if (action === 'source') { view.dispatch({ effects: toggleImageSource.of({ from: current.from, to: current.to }), selection: { anchor: current.to } }); return; }
        const source = view.state.doc.toString();
        if (action === 'split') {
          const changes = separateImageChanges(source, current);
          if (changes) applyImageChanges(view, changes);
        } else {
          const items = view.state.field(imagePreviewField).items, next = items[items.indexOf(current) + 1];
          if (!canJoinImageGroups(source, current, next)) return;
          applyImageChanges(view, { from: current.from, to: next.to, insert: `\n\n${imageRowSource(source, [...current.images, ...next.images])}\n\n` });
        }
      };
    });
    root.querySelectorAll('.cm-image-card').forEach((card, index) => {
      const image = group.images[index], frame = card.querySelector('.cm-image-frame'), img = card.querySelector('img'), status = card.querySelector('.cm-image-error');
      const dimensions = imageDimensions(image), widthPercent = dimensions.width.endsWith('%');
      card.setAttribute('aria-label', `${image.alt || label} · ${this.labels['Image controls']}`);
      frame.style.justifyContent = { left: 'flex-start', center: 'center', right: 'flex-end' }[image.alignment];
      img.alt = image.alt; img.style.width = imageDimensionStyle(dimensions.width); img.style.height = imageDimensionStyle(dimensions.height);
      const previous = displayedSources.get(img);
      if (!group.open && (!previous || previous.ref !== image.ref || previous.session !== this.session)) {
        const record = { ref: image.ref, session: this.session }; displayedSources.set(img, record);
        img.removeAttribute('src'); img.hidden = false; status.hidden = false; status.textContent = this.labels['Loading image…'];
        const apply = value => {
          if (!img.isConnected || displayedSources.get(img) !== record || !record.session.active || view.state.field(imagePreviewField, false)?.session !== record.session) return;
          img.src = value;
        };
        if (image.sourceKind === 'local') {
          this.session.load(image.ref).then(apply).catch(() => {
            if (!img.isConnected || displayedSources.get(img) !== record || !this.session.active) return;
            img.hidden = true; status.hidden = false; status.textContent = this.labels['Image could not be displayed; view source to inspect it']; view.requestMeasure();
          });
        } else {
          img.src = image.ref.startsWith('//') ? `https:${image.ref}` : image.ref;
        }
      }
      card.querySelectorAll('.cm-image-align-tools button').forEach(button => {
        const action = button.dataset.imageAction, sizeAction = action === 'size';
        const shortAlignment = { left: 'L', center: 'C', right: 'R' }[action];
        button.textContent = sizeAction ? this.labels['Image size'] : group.row ? this.labels[shortAlignment] : this.labels[`Align ${action}`];
        button.title = `${image.alt || label} · ${button.textContent}`;
        button.setAttribute('aria-pressed', String(sizeAction ? card.classList.contains('is-size-open') : action === image.alignment));
        button.onmousedown = event => event.preventDefault();
        button.onclick = () => {
          if (sizeAction) {
            card.classList.toggle('is-size-open');
            button.setAttribute('aria-pressed', String(card.classList.contains('is-size-open')));
            if (card.classList.contains('is-size-open')) {
              const panel = card.querySelector('.cm-image-size-tools'), root = card.closest('.cm-embedded-image');
              panel.style.left = ''; panel.style.right = '8px'; panel.style.maxWidth = `${Math.max(240, root.clientWidth - 16)}px`;
              const panelRect = panel.getBoundingClientRect(), rootRect = root.getBoundingClientRect(), cardRect = card.getBoundingClientRect();
              const left = Math.max(rootRect.left + 8, Math.min(panelRect.left, rootRect.right - panelRect.width - 8));
              panel.style.left = `${left - cardRect.left}px`; panel.style.right = 'auto';
              card.querySelector('[data-image-size="width"]').focus({ preventScroll: true });
            }
            return;
          }
          const current = this.current(view); if (!current) return;
          const source = view.state.doc.toString(), changes = alignImageChanges(source, current, index, action);
          if (changes && source.slice(changes.from, changes.to) !== changes.insert) applyImageChanges(view, changes);
        };
      });
      const widthInput = card.querySelector('[data-image-size="width"]'), widthUnit = card.querySelector('[data-image-size-unit="width"]');
      const heightInput = card.querySelector('[data-image-size="height"]'), ratioInput = card.querySelector('[data-image-keep-ratio]');
      card.querySelector('[data-image-size-label="width"]').textContent = this.labels.Width;
      card.querySelector('[data-image-size-label="height"]').textContent = this.labels.Height;
      card.querySelector('[data-image-size-label="ratio"]').textContent = this.labels['Keep ratio'];
      widthInput.value = dimensions.width.replace('%', ''); widthUnit.value = widthPercent ? '%' : 'px';
      widthInput.max = widthPercent ? '100' : '4096'; widthInput.placeholder = this.labels.Auto;
      heightInput.value = dimensions.height; heightInput.placeholder = this.labels.Auto;
      widthInput.setAttribute('aria-label', this.labels.Width); widthUnit.setAttribute('aria-label', `${this.labels.Width} % / px`);
      heightInput.setAttribute('aria-label', this.labels.Height); ratioInput.setAttribute('aria-label', this.labels['Keep ratio']);
      ratioInput.checked = !dimensions.height; heightInput.disabled = ratioInput.checked;
      widthUnit.onchange = () => { widthInput.max = widthUnit.value === '%' ? '100' : '4096'; if (Number(widthInput.value) > Number(widthInput.max)) widthInput.value = widthInput.max; };
      ratioInput.onchange = () => { heightInput.disabled = ratioInput.checked; if (ratioInput.checked) heightInput.value = ''; };
      card.querySelectorAll('[data-image-size-action]').forEach(button => {
        const action = button.dataset.imageSizeAction;
        button.textContent = this.labels[action === 'apply-size' ? 'Apply size' : 'Reset size'];
        button.disabled = action === 'reset-size' && !dimensions.width && !dimensions.height;
        button.onmousedown = event => event.preventDefault();
        button.onclick = () => {
          const current = this.current(view); if (!current) return;
          const source = view.state.doc.toString();
          const bounded = (input, maximum) => {
            if (!input.value) return '';
            const value = Math.max(1, Math.min(maximum, Math.round(Number(input.value) || 1)));
            input.value = String(value); return String(value);
          };
          const size = action === 'reset-size' ? { width: '', height: '' } : {
            width: (() => { const value = bounded(widthInput, widthUnit.value === '%' ? 100 : 4096); return value ? `${value}${widthUnit.value === '%' ? '%' : ''}` : ''; })(),
            height: ratioInput.checked ? '' : bounded(heightInput, 4096)
          };
          let changes;
          try { changes = resizeImageChanges(source, current, index, size); } catch { return; }
          if (changes && source.slice(changes.from, changes.to) !== changes.insert) applyImageChanges(view, changes);
        };
      });
    });
    return true;
  }
}

function decorate(items, state, session) {
  const decorations = [], atoms = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index], widget = new ImageWidget(item, state, session, items[index + 1]);
    if (item.open) decorations.push(Decoration.widget({ widget, block: true, side: -1 }).range(item.from));
    else {
      const replacement = Decoration.replace({ widget, block: true, inclusive: false }).range(item.from, item.to);
      decorations.push(replacement); atoms.push(replacement);
    }
  }
  return { items, session, decorations: Decoration.set(decorations, true), atoms: Decoration.set(atoms, true) };
}

export const imagePreviewField = StateField.define({
  create(state) { return decorate(editorImageGroups(state.doc.toString()), state, createSession(state)); },
  update(value, transaction) {
    if (!transaction.docChanged && !transaction.effects.length && !transaction.selection && !transaction.reconfigured) return value;
    let items = value.items, session = value.session;
    if (transaction.docChanged) {
      const changed = []; transaction.changes.iterChangedRanges((from, to) => changed.push({ from, to }));
      const mapFrom = from => transaction.changes.mapPos(from, 1), mapTo = to => transaction.changes.mapPos(to, -1);
      items = items.filter(item => !changed.some(range => range.from < item.to && range.to > item.from || range.from === range.to && range.from > item.from && range.from < item.to))
        .map(item => ({ ...item, from: mapFrom(item.from), to: mapTo(item.to), images: item.images.map(image => ({ ...image, from: mapFrom(image.from), to: mapTo(image.to) })) }));
      if (transaction.isUserEvent('undo') || transaction.isUserEvent('redo')) items = editorImageGroups(transaction.newDoc.toString());
    }
    for (const effect of transaction.effects) {
      if (effect.is(updateImagePreviewDirectory) && effect.value !== session.context.directory) {
        session = createSession(transaction.state, { ...session.context, directory: effect.value });
        items = editorImageGroups(transaction.newDoc.toString());
      }
      if (effect.is(refreshImagePreviews) && effect.value.doc === transaction.newDoc) items = effect.value.items.map(item => ({ ...item, open: items.find(previous => previous.from === item.from && previous.to === item.to)?.open || false }));
      if (effect.is(toggleImageSource)) items = items.map(item => item.from === effect.value.from && item.to === effect.value.to ? { ...item, open: !item.open } : item);
    }
    if (transaction.selection || transaction.effects.some(effect => effect.is(refreshImagePreviews))) items = items.map(item => transaction.newSelection.ranges.some(range => range.head > item.from && range.head < item.to || range.anchor > item.from && range.anchor < item.to) ? { ...item, open: true } : item);
    return decorate(items, transaction.state, session);
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations)
});

const imagePreviewScanner = ViewPlugin.fromClass(class {
  constructor(view) { this.view = view; this.session = view.state.field(imagePreviewField).session; this.timer = null; }
  update(update) {
    const session = update.state.field(imagePreviewField).session;
    if (session !== this.session) { this.session.dispose(); this.session = session; }
    if (update.transactions.some(transaction => transaction.effects.some(effect => effect.is(refreshImagePreviews) && effect.value.doc === update.state.doc))) { clearTimeout(this.timer); return; }
    if (!update.docChanged) return;
    clearTimeout(this.timer);
    if (update.transactions.some(transaction => transaction.isUserEvent('undo') || transaction.isUserEvent('redo'))) return;
    this.timer = setTimeout(() => {
      const doc = this.view.state.doc, items = editorImageGroups(doc.toString());
      this.view.dispatch({ effects: refreshImagePreviews.of({ doc, items }) });
    }, 250);
  }
  destroy() { clearTimeout(this.timer); this.session.dispose(); }
});

export const embeddedImagePreview = [imagePreviewField, imagePreviewScanner, EditorView.atomicRanges.of(view => view.state.field(imagePreviewField).atoms)];
