//go:build windows

package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestUnknownUninstallerPreservedDespiteStaleMatchingRegistration(t *testing.T) {
	path := filepath.Join(t.TempDir(), "uninstall.exe")
	data := []byte("another product with a familiar filename and version 2.7.1")
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	active := testUninstallRegistration(t, true)
	oldRemove, oldRename := windowsRemoveUninstaller, windowsRenameUninstaller
	windowsRemoveUninstaller = func(*os.File) error { t.Fatal("unknown file reached deletion"); return nil }
	windowsRenameUninstaller = func(*os.File, string) error { t.Fatal("unknown file reached rename"); return nil }
	t.Cleanup(func() { windowsRemoveUninstaller, windowsRenameUninstaller = oldRemove, oldRename })
	if prepareTestUninstaller(path) {
		t.Fatal("unknown file considered safe")
	}
	if !*active {
		t.Fatal("unknown file's registration was changed")
	}
	got, err := os.ReadFile(path)
	if err != nil || string(got) != string(data) {
		t.Fatal("unknown file changed")
	}
	*active = false
	if isWindowsUninstallerReadyForExecutable(filepath.Join(filepath.Dir(path), windowsUpdateExecutableName)) {
		t.Fatal("missing registration bypassed unknown-file check")
	}
}

func TestKnownDigestStillRequiresRegistration(t *testing.T) {
	data := []byte("confirmed test specimen")
	confirmTestUninstaller(t, data)
	testUninstallRegistration(t, false)
	path := filepath.Join(t.TempDir(), "uninstall.exe")
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	if !prepareTestUninstaller(path) {
		t.Fatal("verified file without an uninstall entry should agree with updater readiness")
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal("unregistered specimen deleted")
	}
}

func TestModifiedKnownUninstallerIsUnknown(t *testing.T) {
	confirmTestUninstaller(t, []byte("confirmed test specimen"))
	active := testUninstallRegistration(t, true)
	path := filepath.Join(t.TempDir(), "uninstall.exe")
	data := []byte("confirmed test specimen with one extra byte!")
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	if prepareTestUninstaller(path) || !*active {
		t.Fatal("modified binary was authorized")
	}
	got, _ := os.ReadFile(path)
	if string(got) != string(data) {
		t.Fatal("modified file lost")
	}
}

func TestUninstallerInspectionLocksAgainstReplacement(t *testing.T) {
	path := filepath.Join(t.TempDir(), "uninstall.exe")
	data := []byte("confirmed locked specimen")
	confirmTestUninstaller(t, data)
	testUninstallRegistration(t, true)
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	sentinel := filepath.Join(filepath.Dir(path), "user-document.md")
	if err := os.WriteFile(sentinel, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	original := windowsRemoveUninstaller
	windowsRemoveUninstaller = func(file *os.File) error {
		if err := os.WriteFile(path, []byte("replacement"), 0600); err == nil {
			t.Fatal("verified bytes can change before action")
		}
		if err := os.Rename(path, path+".swapped"); err == nil {
			t.Fatal("verified path can change before action")
		}
		return deleteVerifiedUninstallerHandle(file)
	}
	t.Cleanup(func() { windowsRemoveUninstaller = original })
	if !prepareTestUninstaller(path) {
		t.Fatal("known file handling failed")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("known file not deleted")
	}
	got, _ := os.ReadFile(sentinel)
	if string(got) != "keep" {
		t.Fatal("unrelated document changed")
	}
}

func TestUninstallerRenameNeverOverwritesCollision(t *testing.T) {
	path := filepath.Join(t.TempDir(), "uninstall.exe")
	if err := os.WriteFile(path, []byte("specimen"), 0600); err != nil {
		t.Fatal(err)
	}
	destination := path + ".unsafe-disabled-existing"
	if err := os.WriteFile(destination, []byte("user file"), 0600); err != nil {
		t.Fatal(err)
	}
	file, _, err := openLockedUninstaller(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if err := renameVerifiedUninstallerHandle(file, destination); err == nil {
		t.Fatal("rename overwrote collision")
	}
	got, _ := os.ReadFile(destination)
	if string(got) != "user file" {
		t.Fatal("collision file changed")
	}
}

func TestUninstallerSpecialFilesRemainUntouched(t *testing.T) {
	for _, kind := range []string{"directory", "symlink", "hardlink", "oversized"} {
		t.Run(kind, func(t *testing.T) {
			data := []byte("known specimen")
			confirmTestUninstaller(t, data)
			active := testUninstallRegistration(t, true)
			root := t.TempDir()
			path := filepath.Join(root, "uninstall.exe")
			target := filepath.Join(root, "target.exe")
			if err := os.WriteFile(target, data, 0600); err != nil {
				t.Fatal(err)
			}
			switch kind {
			case "directory":
				if err := os.Mkdir(path, 0700); err != nil {
					t.Fatal(err)
				}
			case "symlink":
				if err := os.Symlink(target, path); err != nil {
					t.Skip(err)
				}
			case "hardlink":
				if err := os.Link(target, path); err != nil {
					t.Skip(err)
				}
			case "oversized":
				f, err := os.Create(path)
				if err != nil {
					t.Fatal(err)
				}
				err = f.Truncate(maxUninstallerInspectionBytes + 1)
				f.Close()
				if err != nil {
					t.Fatal(err)
				}
			}
			if prepareTestUninstaller(path) || !*active {
				t.Fatal("special file was treated as remediated")
			}
			if _, err := os.Lstat(path); err != nil {
				t.Fatal("special file deleted")
			}
			got, _ := os.ReadFile(target)
			if string(got) != string(data) {
				t.Fatal("target changed")
			}
		})
	}
}
