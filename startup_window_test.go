package main

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
)

func TestHideStartupWindowUntilReady(t *testing.T) {
	for _, platform := range []string{"windows", "linux", "darwin", "freebsd", ""} {
		want := platform == "windows" || platform == "linux"
		if got := hideStartupWindowUntilReady(platform); got != want {
			t.Errorf("platform %q: got %v, want %v", platform, got, want)
		}
	}
}

func TestShowStartupWindowOnce(t *testing.T) {
	var calls atomic.Int32
	ctx := context.WithValue(context.Background(), struct{}{}, "startup-context")
	show := showStartupWindowOnce(func(got context.Context) {
		if got != ctx {
			t.Errorf("show callback did not receive startup context")
		}
		calls.Add(1)
	})
	var group sync.WaitGroup
	for range 8 {
		group.Add(1)
		go func() { defer group.Done(); show(ctx) }()
	}
	group.Wait()
	show(context.Background()) // A later page reload must not show it again.
	if calls.Load() != 1 {
		t.Fatalf("startup window was shown %d times, want once", calls.Load())
	}
}

func TestFitStartupWindow(t *testing.T) {
	for _, tt := range []struct {
		name               string
		window, work, want startupRect
		dpi                int
	}{
		{"low resolution", startupRect{0, -96, 1440, 824}, startupRect{0, 0, 1366, 728}, startupRect{16, 16, 1350, 712}, 96},
		{"150 percent scaling", startupRect{0, 0, 2160, 1380}, startupRect{0, 0, 1920, 1040}, startupRect{24, 24, 1896, 1016}, 144},
		{"large screen preserves size", startupRect{0, 0, 1440, 920}, startupRect{0, 0, 2560, 1400}, startupRect{560, 240, 2000, 1160}, 96},
		{"negative monitor origin", startupRect{-2560, -1440, -400, -60}, startupRect{-2560, -1440, 0, -40}, startupRect{-2360, -1424, -200, -56}, 96},
		{"top and left taskbar", startupRect{0, 0, 1440, 920}, startupRect{60, 48, 1366, 768}, startupRect{76, 64, 1350, 752}, 96},
		{"invalid work area", startupRect{1, 2, 1441, 922}, startupRect{}, startupRect{1, 2, 1441, 922}, 96},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := fitStartupWindow(tt.window, tt.work, tt.dpi); got != tt.want {
				t.Fatalf("got %+v; want %+v", got, tt.want)
			}
		})
	}
}
