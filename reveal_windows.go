//go:build windows

package main

import (
	"fmt"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"unsafe"
)

// These user32 helpers are also used to fit the application's startup window.
var (
	user32DLL        = syscall.NewLazyDLL("user32.dll")
	enumWindowsProc  = user32DLL.NewProc("EnumWindows")
	getClassNameProc = user32DLL.NewProc("GetClassNameW")
	setWindowPosProc = user32DLL.NewProc("SetWindowPos")
	shell32Reveal    = syscall.NewLazyDLL("shell32.dll")
	ole32Reveal      = syscall.NewLazyDLL("ole32.dll")
	parseRevealPath  = shell32Reveal.NewProc("SHParseDisplayName")
	openRevealItem   = shell32Reveal.NewProc("SHOpenFolderAndSelectItems")
	initRevealCOM    = ole32Reveal.NewProc("CoInitializeEx")
	closeRevealCOM   = ole32Reveal.NewProc("CoUninitialize")
	freeRevealItem   = ole32Reveal.NewProc("CoTaskMemFree")
)

type revealShellAPI struct {
	initialize func() uint32
	close      func()
	parse      func(*uint16) (uintptr, uint32)
	free       func(uintptr)
	open       func(uintptr) uint32
}

func nativeRevealShell() revealShellAPI {
	return revealShellAPI{
		initialize: func() uint32 {
			hr, _, _ := initRevealCOM.Call(0, 2 /* COINIT_APARTMENTTHREADED */)
			return uint32(hr)
		},
		close: func() { closeRevealCOM.Call() },
		parse: func(path *uint16) (uintptr, uint32) {
			var pidl uintptr
			hr, _, _ := parseRevealPath.Call(uintptr(unsafe.Pointer(path)), 0, uintptr(unsafe.Pointer(&pidl)), 0, 0)
			return pidl, uint32(hr)
		},
		free: func(pidl uintptr) { freeRevealItem.Call(pidl) },
		open: func(pidl uintptr) uint32 {
			// cidl=0: the absolute PIDL identifies the file, not its parent.
			// Windows opens its parent and selects that exact item.
			hr, _, _ := openRevealItem.Call(pidl, 0, 0, 0)
			return uint32(hr)
		},
	}
}

func revealInFolder(filePath string) error {
	// COM initialization, use and cleanup must all run on the same thread.
	// A dedicated goroutine avoids changing an existing UI thread's apartment.
	done := make(chan error, 1)
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		done <- revealWithShell(filePath, nativeRevealShell())
	}()
	return <-done
}

func revealWithShell(filePath string, api revealShellAPI) error {
	if strings.TrimSpace(filePath) == "" || !filepath.IsAbs(filePath) {
		return fmt.Errorf("reveal requires an absolute file path")
	}
	path, err := syscall.UTF16PtrFromString(filepath.Clean(filePath))
	if err != nil {
		return fmt.Errorf("invalid reveal path: %w", err)
	}
	if hr := api.initialize(); int32(hr) < 0 {
		return fmt.Errorf("initialize folder selection: HRESULT 0x%08X", hr)
	}
	defer api.close() // S_OK and S_FALSE both require CoUninitialize.
	pidl, hr := api.parse(path)
	if pidl != 0 {
		defer api.free(pidl)
	}
	if int32(hr) < 0 || pidl == 0 {
		return fmt.Errorf("resolve folder selection: HRESULT 0x%08X", hr)
	}
	if hr = api.open(pidl); int32(hr) < 0 {
		return fmt.Errorf("open folder selection: HRESULT 0x%08X", hr)
	}
	// No title matching or arbitrary Explorer window activation: same-named
	// folders and Explorer tabs cannot redirect focus to an unrelated directory.
	return nil
}

func windowString(hwnd uintptr, proc *syscall.LazyProc) string {
	buffer := make([]uint16, 512)
	length, _, _ := proc.Call(hwnd, uintptr(unsafe.Pointer(&buffer[0])), uintptr(len(buffer)))
	if length == 0 {
		return ""
	}
	return syscall.UTF16ToString(buffer[:length])
}
