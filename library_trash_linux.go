package main

import "os/exec"

// GIO has a separate trash operation; unsupported mounts fail without unlinking.
func moveDocumentToTrash(path string) error {
	return exec.Command("/usr/bin/gio", "trash", "--", path).Run()
}
