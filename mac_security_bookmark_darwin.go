//go:build darwin && cgo

package main

/*
#cgo LDFLAGS: -framework Foundation -framework UniformTypeIdentifiers
#include <stdlib.h>

char* qm_create_security_scoped_bookmark(const char* path, char** error_out);
char* qm_start_accessing_security_scoped_bookmark(const char* bookmark_base64, char** resolved_path_out, int* stale_out, char** error_out);
void qm_stop_accessing_security_scoped_bookmark(const char* token);
void qm_free_bookmark_string(char* value);
*/
import "C"

import (
	"errors"
	"unsafe"
)

func takeMacBookmarkString(value *C.char) string {
	if value == nil {
		return ""
	}
	defer C.qm_free_bookmark_string(value)
	return C.GoString(value)
}

func createMacSecurityScopedBookmark(path string) (string, error) {
	cPath := C.CString(path)
	defer C.free(unsafe.Pointer(cPath))
	var cError *C.char
	bookmark := C.qm_create_security_scoped_bookmark(cPath, &cError)
	message := takeMacBookmarkString(cError)
	if bookmark == nil {
		if message == "" {
			message = "unable to create macOS security-scoped bookmark"
		}
		return "", errors.New(message)
	}
	return takeMacBookmarkString(bookmark), nil
}

func startAccessingMacSecurityScopedBookmark(bookmark string) (string, bool, func(), error) {
	cBookmark := C.CString(bookmark)
	defer C.free(unsafe.Pointer(cBookmark))
	var cResolvedPath *C.char
	var cError *C.char
	var stale C.int
	token := C.qm_start_accessing_security_scoped_bookmark(cBookmark, &cResolvedPath, &stale, &cError)
	message := takeMacBookmarkString(cError)
	resolvedPath := takeMacBookmarkString(cResolvedPath)
	if token == nil || resolvedPath == "" {
		if token != nil {
			C.qm_free_bookmark_string(token)
		}
		if message == "" {
			message = "unable to resolve macOS security-scoped bookmark"
		}
		return "", stale != 0, func() {}, errors.New(message)
	}
	tokenValue := takeMacBookmarkString(token)
	release := func() {
		if tokenValue == "" {
			return
		}
		cToken := C.CString(tokenValue)
		defer C.free(unsafe.Pointer(cToken))
		C.qm_stop_accessing_security_scoped_bookmark(cToken)
	}
	return resolvedPath, stale != 0, release, nil
}
