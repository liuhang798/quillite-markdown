import test from 'node:test';
import assert from 'node:assert/strict';
import { toastBottomInset, createToastPlacement } from '../src/toast-placement.js';

const toast = { left: 485, right: 915, height: 62 };
const panel = { left: 805, right: 1400, top: 805, bottom: 960, width: 595, height: 155 };
test('toast retains the existing bottom inset without visible panels', () => {
  assert.equal(toastBottomInset(1000, toast, []), 28);
  assert.equal(toastBottomInset(1000, toast, [{ ...panel, width: 0 }]), 28);
  assert.equal(toastBottomInset(1000, toast, [{ ...panel, height: 0 }]), 28);
  assert.equal(toastBottomInset(1000, toast, [{ ...panel, top: 1000, bottom: 1100 }]), 28);
});
test('toast clears the whole search panel, not just the focused field', () => {
  assert.equal(toastBottomInset(1000, toast, [panel]), 207);
  assert.equal(toastBottomInset(720, { left: 265, right: 695, height: 62 }, [
    { left: 598, right: 960, top: 440, bottom: 680, width: 362, height: 240 },
  ]), 292);
});
test('non-overlapping panels do not move the toast', () => {
  assert.equal(toastBottomInset(1000, toast, [{ ...panel, left: 920 }]), 28);
  assert.equal(toastBottomInset(1000, toast, [{ ...panel, top: 400, bottom: 500 }]), 28);
});
test('stacked panels are avoided in either input order without mutation', () => {
  const upper = { ...panel, top: 700, bottom: 800, height: 100 };
  assert.equal(toastBottomInset(1000, toast, [upper, panel]), 312);
  assert.equal(toastBottomInset(1000, toast, [panel, upper]), 312);
  assert.equal(panel.top, 805);
});
test('oversized panels cannot move the notification off the viewport top', () => {
  assert.equal(toastBottomInset(720, toast, [{ ...panel, top: 0, bottom: 720, height: 720 }]), 646);
});

test('placement observes only while visible and releases queued work on hide', () => {
  const frames = new Map(), listeners = new Map(), observers = []; let nextFrame = 0, panels = [panel];
  const win = {
    innerHeight: 1000,
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
      observe(el) { this.targets.push(el); }
      disconnect() { this.targets = []; }
    },
  };
  const style = { removeProperty(key) { delete this[key]; } };
  const notification = { ownerDocument: { defaultView: win }, classList: { contains: () => false },
    style, offsetHeight: 62, getBoundingClientRect: () => toast };
  const scroller = {};
  const editor = { querySelectorAll(selector) {
    return selector === '.cm-panels-bottom' ? panels.map(p => ({ getBoundingClientRect: () => p })) : [scroller];
  } };
  const placement = createToastPlacement({ toast: notification, editor });
  placement.schedule(); assert.equal(frames.size, 0); assert.equal(observers.length, 0);
  placement.start(); assert.equal(style.bottom, '207px'); assert.equal(observers[0].targets.length, 3);
  panels = []; placement.schedule(); placement.schedule(); assert.equal(frames.size, 1);
  const callback = [...frames.values()][0]; frames.clear(); callback(); assert.equal(style.bottom, '28px');
  placement.schedule(); placement.stop(); assert.equal(frames.size, 0); assert.equal(listeners.size, 0);
  assert.equal(observers[0].targets.length, 0); assert.equal(style.bottom, undefined);
  placement.start(); assert.equal(observers.length, 2); assert.equal(style.bottom, '28px'); placement.stop();
});
