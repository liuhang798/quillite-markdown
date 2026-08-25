//go:build !windows

package main

import "os/exec"

func feedbackSystemCommand(name string, args ...string) *exec.Cmd {
	return exec.Command(name, args...)
}

func windowsSystemVersion() string {
	return "Windows"
}
