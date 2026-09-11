//go:build !windows

package main

func isWindowsUninstallerSafe() bool {
	return true
}
