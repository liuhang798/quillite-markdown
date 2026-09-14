package main

import (
	"errors"
	"net"
	"os"
	"path/filepath"
	"testing"
)

func TestDocumentRevisionConflictPreservesExternalChanges(t *testing.T) {
	p := filepath.Join(t.TempDir(), "document.md")
	if err := os.WriteFile(p, []byte("external"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := writeDocumentWithRevision(p, []byte("editor"), documentRevision([]byte("original"))); !errors.Is(err, errDocumentConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}
	data, _ := os.ReadFile(p)
	if string(data) != "external" {
		t.Fatal("external content lost")
	}
	if err := writeDocumentWithRevision(p, []byte("editor"), documentRevision(data)); err != nil {
		t.Fatal(err)
	}
	data, _ = os.ReadFile(p)
	if string(data) != "editor" {
		t.Fatal("valid revision not saved")
	}
	if err := os.Remove(p); err != nil {
		t.Fatal(err)
	}
	if err := writeDocumentWithRevision(p, []byte("editor"), documentRevision(data)); !errors.Is(err, errDocumentConflict) {
		t.Fatal("deleted file was recreated")
	}
}

func TestDocumentSizeAndRecoveryLimitsAgree(t *testing.T) {
	if maxRecoverySnapshotSize != maxSupportedDocumentBytes || maxDocumentVersionContent != maxSupportedDocumentBytes {
		t.Fatal("inconsistent limits")
	}
	p := filepath.Join(t.TempDir(), "huge.md")
	f, err := os.Create(p)
	if err != nil {
		t.Fatal(err)
	}
	err = f.Truncate(maxSupportedDocumentBytes + 1)
	f.Close()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := readDocumentBytes(p); err == nil {
		t.Fatal("oversized file accepted")
	}
}

func TestExternalExportFailurePreservesOutput(t *testing.T) {
	p := filepath.Join(t.TempDir(), "existing.rtf")
	for _, fail := range []bool{true, false} {
		if err := os.WriteFile(p, []byte("original"), 0600); err != nil {
			t.Fatal(err)
		}
		err := stageExternalExport(p, func(staged string) error {
			if staged == p {
				t.Fatal("converter received original path")
			}
			if fail {
				if err := os.WriteFile(staged, []byte("partial"), 0600); err != nil {
					t.Fatal(err)
				}
				return errors.New("conversion failed")
			}
			return nil // Empty output must also be rejected.
		})
		if err == nil {
			t.Fatal("invalid export accepted")
		}
		data, _ := os.ReadFile(p)
		if string(data) != "original" {
			t.Fatal("original export lost")
		}
	}
	if err := stageExternalExport(p, func(staged string) error { return os.WriteFile(staged, []byte("complete"), 0600) }); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(p)
	if string(data) != "complete" {
		t.Fatal("export not committed")
	}
	entries, _ := os.ReadDir(filepath.Dir(p))
	if len(entries) != 1 {
		t.Fatal("temporary files leaked")
	}
}

func TestRemoteImageAddressPolicy(t *testing.T) {
	for _, value := range []string{"127.0.0.1", "10.2.3.4", "172.16.1.1", "192.168.1.1", "169.254.169.254", "::1", "fc00::1", "fe80::1", "100.100.100.200", "0.0.0.0", "::ffff:127.0.0.1"} {
		if publicImageIP(net.ParseIP(value)) {
			t.Errorf("unsafe address accepted: %s", value)
		}
	}
	if !publicImageIP(net.ParseIP("8.8.8.8")) {
		t.Fatal("public address rejected")
	}
	client := newRemoteImageClient()
	if _, err := client.Get("http://127.0.0.1:1/image.png"); err == nil {
		t.Fatal("loopback request accepted")
	}
}
