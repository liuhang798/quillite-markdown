package main

import (
	"context"
	"go/ast"
	"go/parser"
	"go/token"
	"reflect"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/wailsapp/wails/v2/pkg/options"
)

func TestStartupWindowActivationDoesNotBypassReadyGate(t *testing.T) {
	file, err := parser.ParseFile(token.NewFileSet(), "app.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, declaration := range file.Decls {
		fn, ok := declaration.(*ast.FuncDecl)
		if !ok || (fn.Name.Name != "onSecondInstanceLaunch" && fn.Name.Name != "openFileFromSystem") {
			continue
		}
		ast.Inspect(fn.Body, func(node ast.Node) bool {
			call, ok := node.(*ast.CallExpr)
			if !ok {
				return true
			}
			selector, ok := call.Fun.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			object, ok := selector.X.(*ast.Ident)
			if ok && object.Name == "wailsruntime" && (selector.Sel.Name == "WindowShow" || selector.Sel.Name == "WindowUnminimise") {
				t.Errorf("%s directly calls %s before the startup readiness gate", fn.Name.Name, selector.Sel.Name)
			}
			return true
		})
	}
}

func TestStartupWindowActivationQueuesUntilInitialShowThenRemainsUsable(t *testing.T) {
	ctx := context.Background()
	var calls []string
	state := startupWindowState{actions: startupWindowActions{
		show:       func(context.Context) { calls = append(calls, "show") },
		unminimise: func(context.Context) { calls = append(calls, "restore") },
	}}
	for range 3 {
		state.requestActivation(ctx, true)
	}
	if len(calls) != 0 {
		t.Fatalf("activation escaped before DomReady: %v", calls)
	}
	state.ready(ctx, func(context.Context) {
		calls = append(calls, "fit")
		state.requestActivation(ctx, true)
		if !reflect.DeepEqual(calls, []string{"fit"}) {
			t.Fatalf("activation escaped during placement: %v", calls)
		}
	})
	if !reflect.DeepEqual(calls, []string{"fit", "show", "restore"}) {
		t.Fatalf("queued activation not coalesced after first show: %v", calls)
	}
	state.ready(ctx, func(context.Context) { t.Fatal("reload repeated native placement") })
	if len(calls) != 3 {
		t.Fatalf("reload exposed a minimized window: %v", calls)
	}
	state.requestActivation(ctx, true)
	if !reflect.DeepEqual(calls, []string{"fit", "show", "restore", "restore", "show"}) {
		t.Fatalf("ready activation stopped working: %v", calls)
	}
}

func TestStartupWindowActivationNoPendingRequestDoesNotRestore(t *testing.T) {
	var shows, restores atomic.Int32
	state := startupWindowState{actions: startupWindowActions{
		show: func(context.Context) { shows.Add(1) }, unminimise: func(context.Context) { restores.Add(1) },
	}}
	state.ready(context.Background(), nil)
	state.ready(context.Background(), nil)
	if shows.Load() != 1 || restores.Load() != 0 {
		t.Fatalf("startup/reload changed minimized state: shows=%d restores=%d", shows.Load(), restores.Load())
	}
}

func TestStartupWindowConcurrentAndReentrantActivationCannotEscapeInitialization(t *testing.T) {
	ctx := context.Background()
	started, proceed, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
	var shows, restores atomic.Int32
	state := startupWindowState{}
	state.actions = startupWindowActions{
		show: func(context.Context) {
			shows.Add(1)
			state.requestActivation(ctx, true) // Native callbacks may reenter.
			state.ready(ctx, nil)              // Duplicate DomReady during first Show is ignored.
		},
		unminimise: func(context.Context) { restores.Add(1) },
	}
	go func() {
		defer close(done)
		state.ready(ctx, func(context.Context) { close(started); <-proceed })
	}()
	<-started
	var group sync.WaitGroup
	for range 32 {
		group.Add(1)
		go func() { defer group.Done(); state.requestActivation(ctx, true); state.ready(ctx, nil) }()
	}
	group.Wait()
	if shows.Load() != 0 || restores.Load() != 0 {
		t.Fatal("activation ran before initial placement completed")
	}
	close(proceed)
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("native reentry deadlocked startup")
	}
	if shows.Load() != 1 || restores.Load() != 1 {
		t.Fatalf("pre-ready requests were not coalesced: shows=%d restores=%d", shows.Load(), restores.Load())
	}
}

func TestStartupWindowInitializationFailureStillReleasesVisibility(t *testing.T) {
	var shows atomic.Int32
	state := startupWindowState{actions: startupWindowActions{show: func(context.Context) { shows.Add(1) }}}
	func() {
		defer func() {
			if recover() == nil {
				t.Error("initialization failure was silently swallowed")
			}
		}()
		state.ready(context.Background(), func(context.Context) { panic("placement failed") })
	}()
	if shows.Load() != 1 {
		t.Fatal("placement failure stranded hidden window")
	}
	state.ready(context.Background(), nil)
	if shows.Load() != 1 {
		t.Fatal("reload repeated first-show failure handling")
	}
}

func TestStartupWindowUngatedPlatformPreservesActivation(t *testing.T) {
	var calls []string
	state := startupWindowState{actions: startupWindowActions{
		show:       func(context.Context) { calls = append(calls, "show") },
		unminimise: func(context.Context) { calls = append(calls, "restore") },
	}}
	state.requestActivation(nil, false)
	if len(calls) != 0 {
		t.Fatal("native activation received missing lifecycle context")
	}
	state.requestActivation(context.Background(), false)
	if !reflect.DeepEqual(calls, []string{"restore", "show"}) {
		t.Fatalf("macOS-style native activation changed: %v", calls)
	}
}

func TestStartupWindowSecondInstanceQueuesDocumentAndActivation(t *testing.T) {
	if !hideStartupWindowUntilReady(runtime.GOOS) {
		t.Skip("native ungated platform tested separately")
	}
	ctx := context.Background()
	for _, contextReady := range []bool{false, true} {
		var shows, restores atomic.Int32
		app := NewApp()
		app.initialFile = "first.md"
		if contextReady {
			app.ctx = ctx
		}
		app.startupWindow.actions = startupWindowActions{
			show: func(context.Context) { shows.Add(1) }, unminimise: func(context.Context) { restores.Add(1) },
		}
		app.onSecondInstanceLaunch(options.SecondInstanceData{Args: []string{"QuilliteMarkdown", "second.md"}})
		app.onSecondInstanceLaunch(options.SecondInstanceData{})
		if app.initialFile != "second.md" || app.frontendReady {
			t.Fatalf("early file lost or prematurely opened: %q ready=%v", app.initialFile, app.frontendReady)
		}
		if shows.Load() != 0 || restores.Load() != 0 {
			t.Fatal("early second instance bypassed DomReady")
		}
		app.ctx = ctx
		app.startupWindow.ready(ctx, nil)
		if shows.Load() != 1 || restores.Load() != 1 {
			t.Fatalf("activation not flushed exactly once: shows=%d restores=%d", shows.Load(), restores.Load())
		}
		app.onSecondInstanceLaunch(options.SecondInstanceData{})
		if shows.Load() != 2 || restores.Load() != 2 {
			t.Fatal("ready second-instance activation no longer works")
		}
	}
}
