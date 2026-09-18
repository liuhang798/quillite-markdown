//go:build windows

package main

import "crypto/sha256"

// Intentionally empty: no independently verified historical uninstall.exe
// sample is currently available. Do NOT add installer EXE hashes, version
// strings, filename matches, or hashes learned from a user's machine.
// Each future entry requires the uninstaller's full-file SHA-256, exact release
// provenance and a documented review confirming its destructive behavior.
// Unknown files are preserved even when stale registry entries still match.
var verifiedRiskyWindowsUninstallers = map[[sha256.Size]byte]string{}
