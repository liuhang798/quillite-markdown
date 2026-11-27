//go:build linux

package main

import (
	"context"
)

func startupWindowReady(app *App) func(context.Context) {
	// Wails sends DomReady at WEBKIT_LOAD_FINISHED, after the parser-blocking
	// appearance script and critical stylesheet have completed. Show once only:
	// a later reload must not unhide a window the user deliberately minimised.
	return func(ctx context.Context) { app.startupWindow.ready(ctx, nil) }
}
