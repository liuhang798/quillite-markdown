//go:build windows

package main

import (
	"fmt"
	"os/exec"
	"syscall"

	"golang.org/x/sys/windows"
)

const createNoWindow = 0x08000000

// feedbackSystemCommand prevents short-lived console windows from flashing
// when the GUI application collects Windows version information.
func feedbackSystemCommand(name string, args ...string) *exec.Cmd {
	command := exec.Command(name, args...)
	command.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: createNoWindow,
	}
	return command
}

// windowsSystemVersion reads the native version structure directly so the
// result never depends on the console code page or the user's UI language.
func windowsSystemVersion() string {
	version := windows.RtlGetVersion()
	if version == nil {
		return "Windows"
	}

	name := "Windows"
	if version.MajorVersion == 10 {
		if version.BuildNumber >= 22000 {
			name = "Windows 11"
		} else {
			name = "Windows 10"
		}
	}

	return fmt.Sprintf("%s %d.%d.%d", name, version.MajorVersion, version.MinorVersion, version.BuildNumber)
}
