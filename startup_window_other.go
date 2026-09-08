//go:build !windows

package main

import "context"

func startupWindowReady() func(context.Context) { return nil }
