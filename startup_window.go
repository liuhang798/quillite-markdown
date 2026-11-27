package main

import (
	"context"
	goruntime "runtime"
	"sync"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Linux's native WebView otherwise becomes visible before the head bootstrap
// can restore the saved appearance. Windows already waits for native sizing;
// keep macOS's existing native window lifecycle unchanged.
func hideStartupWindowUntilReady(platform string) bool {
	return platform == "windows" || platform == "linux"
}

func showStartupWindowOnce(show func(context.Context)) func(context.Context) {
	var once sync.Once
	return func(ctx context.Context) {
		once.Do(func() { show(ctx) })
	}
}

type startupWindowPhase uint8

const (
	startupWindowWaiting startupWindowPhase = iota
	startupWindowInitializing
	startupWindowVisible
)

// Native calls are deliberately outside the state lock: platform callbacks can
// reenter the app. Initializing remains a closed gate until initial Show returns.
type startupWindowState struct {
	mu                sync.Mutex
	phase             startupWindowPhase
	activationPending bool
	actions           startupWindowActions
}

type startupWindowActions struct {
	show       func(context.Context)
	unminimise func(context.Context)
}

func (s *startupWindowState) nativeActions() startupWindowActions {
	actions := s.actions
	if actions.show == nil {
		actions.show = wailsruntime.WindowShow
	}
	if actions.unminimise == nil {
		actions.unminimise = wailsruntime.WindowUnminimise
	}
	return actions
}

func (s *startupWindowState) requestActivation(ctx context.Context, waitForReady bool) {
	s.mu.Lock()
	if waitForReady && s.phase != startupWindowVisible {
		s.activationPending = true
		s.mu.Unlock()
		return
	}
	s.mu.Unlock()
	if ctx != nil {
		actions := s.nativeActions()
		actions.unminimise(ctx)
		actions.show(ctx)
	}
}

func (s *startupWindowState) ready(ctx context.Context, initialize func(context.Context)) {
	s.mu.Lock()
	if s.phase != startupWindowWaiting {
		s.mu.Unlock()
		return
	}
	s.phase = startupWindowInitializing
	s.mu.Unlock()
	// Preserve the existing Windows guarantee: failure to place the native
	// window cannot strand an otherwise initialized application off screen.
	defer func() {
		actions := s.nativeActions()
		actions.show(ctx)
		s.mu.Lock()
		activate := s.activationPending
		s.activationPending = false
		s.phase = startupWindowVisible
		s.mu.Unlock()
		if activate {
			// Initial Show already handled visibility. Coalesce pre-ready
			// activation requests into one restore, not another initial Show.
			actions.unminimise(ctx)
		}
	}()
	if initialize != nil {
		initialize(ctx)
	}
}

func (a *App) requestWindowActivation() {
	a.mu.RLock()
	ctx := a.ctx
	a.mu.RUnlock()
	a.startupWindow.requestActivation(ctx, hideStartupWindowUntilReady(goruntime.GOOS))
}

// startupRect uses signed desktop coordinates: secondary monitors may be to
// the left of or above the primary monitor. All values use the same DPI space.
type startupRect struct {
	left, top, right, bottom int32
}

func fitStartupWindow(window, work startupRect, dpi int) startupRect {
	if work.right <= work.left || work.bottom <= work.top {
		return window
	}
	if dpi <= 0 {
		dpi = 96
	}
	margin := int32(16 * dpi / 96)
	availableW, availableH := work.right-work.left, work.bottom-work.top
	// Keep a modest gap without making extremely small desktops unusable.
	gapX, gapY := min(margin, availableW/20), min(margin, availableH/20)
	w := min(max(1, window.right-window.left), availableW-2*gapX)
	h := min(max(1, window.bottom-window.top), availableH-2*gapY)
	x, y := work.left+(availableW-w)/2, work.top+(availableH-h)/2
	return startupRect{x, y, x + w, y + h}
}
