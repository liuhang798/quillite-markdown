//go:build windows

package main

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestFeedbackSystemCommandNeverShowsAConsoleWindow(t *testing.T) {
	command := feedbackSystemCommand("cmd", "/C", "ver")
	if command.SysProcAttr == nil {
		t.Fatal("expected Windows process attributes")
	}
	if !command.SysProcAttr.HideWindow {
		t.Fatal("feedback system command must hide its window")
	}
	if command.SysProcAttr.CreationFlags&createNoWindow == 0 {
		t.Fatal("feedback system command must use CREATE_NO_WINDOW")
	}
}

func TestWindowsSystemVersionIsUTF8AndDoesNotUseReplacementCharacters(t *testing.T) {
	version := windowsSystemVersion()
	if !utf8.ValidString(version) {
		t.Fatalf("system version is not valid UTF-8: %q", version)
	}
	if strings.ContainsRune(version, utf8.RuneError) {
		t.Fatalf("system version contains replacement characters: %q", version)
	}
	if !strings.HasPrefix(version, "Windows") {
		t.Fatalf("unexpected system version: %q", version)
	}
}
