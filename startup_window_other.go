//go:build !windows && !linux

package main

import "context"

func startupWindowReady(_ *App) func(context.Context) { return nil }
