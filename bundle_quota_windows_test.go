//go:build windows

package main

import (
	"os"
	"testing"

	"golang.org/x/sys/windows"
)

func bundleQuotaMakeSparse(t *testing.T, file *os.File) {
	t.Helper()
	var returned uint32
	if err := windows.DeviceIoControl(windows.Handle(file.Fd()), windows.FSCTL_SET_SPARSE, nil, 0, nil, 0, &returned, nil); err != nil {
		t.Skipf("filesystem cannot create the sparse quota fixture: %v", err)
	}
}
