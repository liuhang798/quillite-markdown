//go:build windows

package main

import "golang.org/x/sys/windows"

func openLocalVideoPlayer(path string) error {
	filename, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	return windows.ShellExecute(0, nil, filename, nil, nil, windows.SW_SHOWNORMAL)
}
