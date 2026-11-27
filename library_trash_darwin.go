//go:build darwin && cgo

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Foundation
#import <Foundation/Foundation.h>
#include <stdlib.h>
static int recycleLocalDocument(const char *path) {
	@autoreleasepool {
		NSURL *url = [NSURL fileURLWithFileSystemRepresentation:path isDirectory:NO relativeToURL:nil];
		return [[NSFileManager defaultManager] trashItemAtURL:url resultingItemURL:NULL error:NULL] ? 1 : 0;
	}
}
*/
import "C"
import "unsafe"

func moveDocumentToTrash(path string) error {
	p := C.CString(path)
	defer C.free(unsafe.Pointer(p))
	if C.recycleLocalDocument(p) == 0 {
		return errTrashUnavailable
	}
	return nil
}
