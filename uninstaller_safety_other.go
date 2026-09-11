//go:build !windows

package main

func isWindowsUninstallerSafe() bool {
	return true
}

func prepareWindowsUninstallerForUpdate() bool {
	return true
}
