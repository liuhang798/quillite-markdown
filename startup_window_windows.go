//go:build windows

package main

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"sync"
	"syscall"
	"unsafe"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var (
	startupWindowPID        = user32DLL.NewProc("GetWindowThreadProcessId")
	startupMonitor          = user32DLL.NewProc("MonitorFromWindow")
	startupMonitorInfo      = user32DLL.NewProc("GetMonitorInfoW")
	startupWindowRect       = user32DLL.NewProc("GetWindowRect")
	startupWindowDPI        = user32DLL.NewProc("GetDpiForWindow")
	startupDPIContext       = user32DLL.NewProc("GetWindowDpiAwarenessContext")
	startupThreadDPIContext = user32DLL.NewProc("SetThreadDpiAwarenessContext")
)

func startupWindowReady() func(context.Context) {
	var once sync.Once
	return func(ctx context.Context) {
		once.Do(func() {
			// StartHidden prevents a visible oversized-window -> fitted-window jump.
			// Always show even if native discovery fails; never strand a hidden app.
			defer wailsruntime.WindowShow(ctx)
			if err := fitNativeStartupWindow(ctx); err != nil {
				wailsruntime.LogWarningf(ctx, "startup window placement: %v", err)
			}
		})
	}
}

func fitNativeStartupWindow(ctx context.Context) error {
	var hwnd uintptr
	callback := syscall.NewCallback(func(candidate, _ uintptr) uintptr {
		var pid uint32
		startupWindowPID.Call(candidate, uintptr(unsafe.Pointer(&pid)))
		if pid == uint32(os.Getpid()) && windowString(candidate, getClassNameProc) == "wailsWindow" {
			hwnd = candidate
			return 0
		}
		return 1
	})
	enumWindowsProc.Call(callback, 0)
	if hwnd == 0 {
		return fmt.Errorf("main window not found")
	}
	// Match the window's DPI awareness while querying and applying coordinates.
	// Restore before releasing this Go thread so unrelated calls are unaffected.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if startupDPIContext.Find() == nil && startupThreadDPIContext.Find() == nil {
		dpiContext, _, _ := startupDPIContext.Call(hwnd)
		previous, _, _ := startupThreadDPIContext.Call(dpiContext)
		if previous != 0 {
			defer startupThreadDPIContext.Call(previous)
		}
	}
	monitor, _, _ := startupMonitor.Call(hwnd, 2 /* MONITOR_DEFAULTTONEAREST */)
	info := struct {
		size          uint32
		monitor, work startupRect
		flags         uint32
	}{}
	info.size = uint32(unsafe.Sizeof(info))
	ok, _, err := startupMonitorInfo.Call(monitor, uintptr(unsafe.Pointer(&info)))
	if ok == 0 {
		return fmt.Errorf("get monitor work area: %w", err)
	}
	var rect startupRect
	ok, _, err = startupWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&rect)))
	if ok == 0 {
		return fmt.Errorf("get window bounds: %w", err)
	}
	dpi := uintptr(96)
	if startupWindowDPI.Find() == nil {
		if value, _, _ := startupWindowDPI.Call(hwnd); value != 0 {
			dpi = value
		}
	}
	fit := fitStartupWindow(rect, info.work, int(dpi))
	w, h := int(fit.right-fit.left), int(fit.bottom-fit.top)
	// The normal minimum must not force the window outside a high-DPI small
	// display. This only lowers minimums; no maximum limits are imposed.
	wailsruntime.WindowSetMinSize(ctx, min(920, w*96/int(dpi)), min(620, h*96/int(dpi)))
	ok, _, err = setWindowPosProc.Call(hwnd, 0, uintptr(fit.left), uintptr(fit.top), uintptr(w), uintptr(h), 0x0004|0x0010 /* NOZORDER | NOACTIVATE */)
	if ok == 0 {
		return fmt.Errorf("fit window to work area: %w", err)
	}
	return nil
}
