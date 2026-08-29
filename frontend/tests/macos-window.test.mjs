import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('../../main.go', import.meta.url), 'utf8');
const macNativeSource = await readFile(new URL('../../mac_close_darwin.go', import.meta.url), 'utf8');
const bridgeSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const rendererSource = await readFile(new URL('../src/renderer.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('macOS uses the native inset title bar so AppKit keeps traffic lights aligned', () => {
  assert.match(mainSource, /TitleBar:\s*mac\.TitleBarHiddenInset\(\)/);
  assert.doesNotMatch(mainSource, /TitleBar:\s*mac\.TitleBarHidden\(\)/);
  assert.match(styles, /:root\[data-platform="darwin"\]\s*\{\s*--titlebar-height:\s*42px;/s);
  assert.match(styles, /\.app-shell\s*\{[^}]*100vh\s*-\s*var\(--titlebar-height\)/s);
});

test('macOS title bar has dedicated light and dark surfaces', () => {
  assert.match(styles, /:root\[data-color-mode="light"\][^{]*\{[^}]*--mac-titlebar-bg:\s*#fafafa;/s);
  assert.match(styles, /:root\[data-color-mode="dark"\][^{]*\{[^}]*--mac-titlebar-bg:\s*#1b1c1b;/s);
  assert.match(styles, /:root\[data-platform="darwin"\]\s+\.titlebar\s*\{[^}]*background:\s*var\(--mac-titlebar-bg\)/s);
});

test('native macOS traffic lights stay vertically centered in the custom title bar', () => {
  assert.match(macNativeSource, /const CGFloat titlebarHeight = 42\.0/);
  assert.match(macNativeSource, /targetCenterY = NSHeight\(window\.frame\) - titlebarHeight \/ 2\.0/);
  assert.match(macNativeSource, /NSWindowCloseButton[\s\S]*NSWindowMiniaturizeButton[\s\S]*NSWindowZoomButton/);
  assert.match(macNativeSource, /NSWindowDidResizeNotification/);
  assert.match(macNativeSource, /NSWindowDidExitFullScreenNotification/);
  assert.match(macNativeSource, /mdaRefreshWindowChrome/);
  assert.match(macNativeSource, /250 \* NSEC_PER_MSEC/);
  assert.doesNotMatch(macNativeSource, /mdaScheduleTrafficLightCentering/);
  assert.match(macNativeSource, /usingBlock:[\s\S]*mdaCenterTrafficLights\(window\);/);
});

test('macOS fullscreen moves the brand left and restores windowed spacing automatically', () => {
  assert.match(bridgeSource, /WindowIsFullscreen/);
  assert.match(bridgeSource, /isWindowFullscreen:\s*\(\)\s*=>/);
  assert.match(rendererSource, /document\.documentElement\.dataset\.windowFullscreen = fullscreen \? 'true' : 'false'/);
  assert.match(rendererSource, /window\.addEventListener\('resize', scheduleMacWindowModeSync\)/);
  assert.match(rendererSource, /macWindowModePollDeadline = performance\.now\(\) \+ 1800/);
  assert.match(rendererSource, /macWindowModePollTimer = setTimeout\(poll, 32\)/);
  assert.match(styles, /data-platform="darwin"\]\[data-window-fullscreen="true"\]\s+\.titlebar\s*\{\s*padding-left:\s*14px;/);
  assert.doesNotMatch(styles, /transition:\s*padding-left/);
});

test('fullscreen close waits for the native exit notification before hiding the window', () => {
  assert.match(macNativeSource, /notification\.name isEqualToString:NSWindowDidExitFullScreenNotification/);
  assert.match(macNativeSource, /mdaFinishFullscreenClose\(window\)/);
  assert.match(macNativeSource, /\[NSApp hide:nil\]/);
  assert.match(macNativeSource, /mdaScheduleFullscreenCloseFallback\(window\)/);
  assert.match(macNativeSource, /mdaFullscreenClosePending && window == mdaFullscreenCloseWindow/);
  assert.doesNotMatch(macNativeSource, /mdaHideAfterFullscreenExit/);
  // The fullscreen close must hide the app only (like a windowed close).
  // Ordering the window out here leaves it in a stale fullscreen space and
  // breaks the Dock reopen path, so it must not appear in this function.
  assert.doesNotMatch(macNativeSource, /mdaFinishFullscreenClose[\s\S]*\[window orderOut:nil\]/);
});

test('clicking the macOS Dock icon restores and foregrounds the reader window', () => {
  assert.match(macNativeSource, /applicationShouldHandleReopen:hasVisibleWindows:/);
  assert.match(macNativeSource, /class_addMethod\(delegateClass, selector, \(IMP\)mdaApplicationShouldHandleReopen/);
  assert.match(macNativeSource, /for \(NSWindow \*candidate in NSApp\.windows\)/);
  assert.match(macNativeSource, /\[window deminiaturize:nil\]/);
  assert.match(macNativeSource, /\[window makeKeyAndOrderFront:nil\]/);
  assert.match(macNativeSource, /\[application activateIgnoringOtherApps:YES\]/);
  assert.match(macNativeSource, /mdaInstallApplicationReopenHandler\(\)/);
});

test('Dock reopen unhides the application first so a fullscreen-closed window can appear again', () => {
  assert.match(macNativeSource, /static void mdaBringApplicationWindowToFront[\s\S]*?\[NSApp unhide:nil\][\s\S]*?\[window makeKeyAndOrderFront:nil\]/);
  assert.match(macNativeSource, /static void mdaBringApplicationWindowToFront[\s\S]*?mdaWindowIsFullscreen\(window\)[\s\S]*?\[window toggleFullScreen:nil\][\s\S]*?\[window makeKeyAndOrderFront:nil\]/);
  assert.match(macNativeSource, /static void mdaBringApplicationWindowToFront[\s\S]*?\[NSApp unhide:nil\]/);
});
