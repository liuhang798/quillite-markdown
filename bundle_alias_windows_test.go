//go:build windows

package main

import (
	"os"
	"os/exec"
	"testing"
)

func bundleAuditDirectoryAlias(t *testing.T, target, alias string) {
	t.Helper()
	// Junctions do not require Developer Mode/admin symlink privileges. Both
	// paths are isolated test-owned TempDir fixtures; no installer or registry
	// operation is involved. Environment arguments avoid shell interpolation.
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; New-Item -ItemType Junction -Path $env:QUILLITE_TEST_ALIAS -Target $env:QUILLITE_TEST_TARGET | Out-Null")
	cmd.Env = append(os.Environ(), "QUILLITE_TEST_ALIAS="+alias, "QUILLITE_TEST_TARGET="+target)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("cannot create isolated junction fixture: %v %s", err, output)
	}
}
