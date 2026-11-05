//go:build !windows

package main

import (
	"os"
	"testing"
)

func bundleAuditDirectoryAlias(t *testing.T, target, alias string) {
	t.Helper()
	if err := os.Symlink(target, alias); err != nil {
		t.Skipf("isolated directory symlinks unavailable: %v", err)
	}
}
