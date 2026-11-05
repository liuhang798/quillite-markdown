//go:build windows

package main

import (
	"errors"
	"os"
	"syscall"

	"golang.org/x/sys/windows/registry"
)

type nativeDocumentAssociationRegistry struct{}

func (nativeDocumentAssociationRegistry) Read(merged bool, path, name string) (string, error) {
	root := registry.CURRENT_USER
	if merged {
		root = registry.CLASSES_ROOT
	}
	key, err := registry.OpenKey(root, path, registry.QUERY_VALUE)
	if errors.Is(err, syscall.ERROR_FILE_NOT_FOUND) || errors.Is(err, syscall.ERROR_PATH_NOT_FOUND) {
		return "", errAssociationValueMissing
	}
	if err != nil {
		return "", err
	}
	defer key.Close()
	value, _, err := key.GetStringValue(name)
	if errors.Is(err, syscall.ERROR_FILE_NOT_FOUND) || errors.Is(err, syscall.ERROR_PATH_NOT_FOUND) {
		return "", errAssociationValueMissing
	}
	return value, err
}

func (nativeDocumentAssociationRegistry) Exists(path string) (bool, error) {
	key, err := registry.OpenKey(registry.CURRENT_USER, path, registry.QUERY_VALUE)
	if errors.Is(err, syscall.ERROR_FILE_NOT_FOUND) || errors.Is(err, syscall.ERROR_PATH_NOT_FOUND) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	key.Close()
	return true, nil
}

func (nativeDocumentAssociationRegistry) Write(path, name, value string) error {
	key, _, err := registry.CreateKey(registry.CURRENT_USER, path, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer key.Close()
	return key.SetStringValue(name, value)
}

func registerCurrentDocumentApplication() error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	if err := registerDocumentApplication(nativeDocumentAssociationRegistry{}, executable); err != nil {
		return err
	}
	// Notify Explorer after all candidate entries exist. This only refreshes
	// association caches; it never selects a default application.
	shell32 := syscall.NewLazyDLL("shell32.dll")
	_, _, _ = shell32.NewProc("SHChangeNotify").Call(0x08000000, 0, 0, 0)
	return nil
}
