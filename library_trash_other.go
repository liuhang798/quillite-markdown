//go:build (!windows && !darwin && !linux) || (darwin && !cgo)

package main

func moveDocumentToTrash(string) error { return errTrashUnavailable }
