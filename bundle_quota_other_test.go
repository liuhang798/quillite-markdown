//go:build !windows

package main

import (
	"os"
	"testing"
)

// Unix filesystems create a sparse extent when a new file is truncated upward.
func bundleQuotaMakeSparse(t *testing.T, file *os.File) {}
