//go:build !darwin && !windows

package main

import "fmt"

// applyUpdate is a safe no-op fallback for platforms without a self-update
// asset (for example Linux, which keeps the manual download flow).
func applyUpdate(downloadPath string) error {
	return fmt.Errorf("in-app updates are not supported on this platform")
}

// runUpdateHelperIfRequested is a no-op on platforms without self-update.
func runUpdateHelperIfRequested() {}

func cleanupUpdateHelperAfterRestart() {}
