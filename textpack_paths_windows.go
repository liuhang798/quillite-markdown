//go:build windows

package main

import "golang.org/x/sys/windows"

func textPackCheckReparse(name string) error {
	p, err := windows.UTF16PtrFromString(name)
	if err != nil {
		return err
	}
	attributes, err := windows.GetFileAttributes(p)
	if err != nil {
		return err
	}
	if attributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
		return textPackError("TEXTPACK_UNSAFE_PATH")
	}
	return nil
}
