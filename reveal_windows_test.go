//go:build windows

package main

import (
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"syscall"
	"testing"
	"unsafe"
)

func TestNativeRevealPathParsingWithoutOpeningExplorer(t *testing.T) {
	path := filepath.Join(t.TempDir(), "新建, 文档.md")
	if err := os.WriteFile(path, []byte("# test"), 0600); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		api := nativeRevealShell()
		// Exercise real COM initialization, UTF-16/PIDL parsing and cleanup,
		// but never open or focus a user's desktop window during automated tests.
		api.open = func(pidl uintptr) uint32 {
			if pidl == 0 {
				return 0x80004005
			}
			return 0
		}
		done <- revealWithShell(path, api)
	}()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestRevealExactPathAndCleanup(t *testing.T) {
	for _, path := range []string{`D:\项目 A\docs\新建, 文档.md`, `D:\项目 B\docs\新建, 文档.md`, `\\server\共享\docs\文档.md`} {
		t.Run(path, func(t *testing.T) {
			var calls []string
			api := revealShellAPI{
				initialize: func() uint32 { calls = append(calls, "init"); return 1 },
				close:      func() { calls = append(calls, "close") },
				parse: func(ptr *uint16) (uintptr, uint32) {
					want, _ := syscall.UTF16FromString(filepath.Clean(path))
					if !reflect.DeepEqual(unsafe.Slice(ptr, len(want)), want) {
						t.Fatal("shell did not receive the exact full Unicode path")
					}
					calls = append(calls, "parse")
					return 123, 0
				},
				free: func(p uintptr) {
					calls = append(calls, "free")
					if p != 123 {
						t.Fatal(p)
					}
				},
				open: func(p uintptr) uint32 {
					calls = append(calls, "open")
					if p != 123 {
						t.Fatal(p)
					}
					return 0
				},
			}
			if err := revealWithShell(path, api); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(calls, []string{"init", "parse", "open", "free", "close"}) {
				t.Fatal(calls)
			}
		})
	}
}

func TestRevealFailuresDoNotActivateOtherWindows(t *testing.T) {
	for _, stage := range []string{"init", "parse", "empty", "open"} {
		t.Run(stage, func(t *testing.T) {
			closed, freed, opened := 0, 0, 0
			api := revealShellAPI{
				initialize: func() uint32 {
					if stage == "init" {
						return 0x80010106
					}
					return 0
				},
				close: func() { closed++ },
				parse: func(*uint16) (uintptr, uint32) {
					if stage == "parse" {
						return 123, 0x80004005
					}
					if stage == "empty" {
						return 0, 0
					}
					return 123, 0
				},
				free: func(uintptr) { freed++ },
				open: func(uintptr) uint32 { opened++; return 0x80004005 },
			}
			if err := revealWithShell(`D:\docs\a.md`, api); err == nil {
				t.Fatal("expected error")
			}
			wantClose, wantFree, wantOpen := 1, 1, 0
			if stage == "init" {
				wantClose, wantFree = 0, 0
			}
			if stage == "empty" {
				wantFree = 0
			}
			if stage == "open" {
				wantOpen = 1
			}
			if closed != wantClose || freed != wantFree || opened != wantOpen {
				t.Fatalf("close/free/open = %d/%d/%d", closed, freed, opened)
			}
		})
	}
	for _, path := range []string{"", " ", `docs\a.md`, "D:\\docs\\a\x00.md"} {
		if err := revealWithShell(path, revealShellAPI{}); err == nil {
			t.Fatalf("accepted %q", path)
		}
	}
}
