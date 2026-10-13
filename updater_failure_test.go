package main

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type updateFailureTransport struct {
	response *http.Response
	err      error
}

func (t updateFailureTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return t.response, t.err
}

type updateTimeoutBody struct{ closed bool }

func (*updateTimeoutBody) Read([]byte) (int, error) { return 0, context.DeadlineExceeded }
func (b *updateTimeoutBody) Close() error           { b.closed = true; return nil }

func TestDownloadTimeoutIsActionableAndPreservesExistingApplication(t *testing.T) {
	for _, phase := range []string{"headers", "body"} {
		t.Run(phase, func(t *testing.T) {
			dir := t.TempDir()
			original := filepath.Join(dir, "app.exe")
			if err := os.WriteFile(original, []byte("original"), 0600); err != nil {
				t.Fatal(err)
			}
			body := &updateTimeoutBody{}
			transport := updateFailureTransport{err: context.DeadlineExceeded}
			if phase == "body" {
				transport = updateFailureTransport{response: &http.Response{StatusCode: 200, Body: body, ContentLength: 123}}
			}
			err := (&App{}).downloadFileFromURL("https://example.test/update.bin", filepath.Join(dir, "candidate.bin"), &http.Client{Transport: transport})
			if err == nil || !strings.Contains(err.Error(), "UPDATE_DOWNLOAD_TIMEOUT") || !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("wrong timeout: %v", err)
			}
			if phase == "body" && !body.closed {
				t.Fatal("response body not closed")
			}
			data, err := os.ReadFile(original)
			if err != nil || string(data) != "original" {
				t.Fatal("original modified")
			}
		})
	}
}

func TestDownloadFailureRetainsUnderlyingError(t *testing.T) {
	if !errors.Is(updateDownloadError(io.ErrUnexpectedEOF), io.ErrUnexpectedEOF) {
		t.Fatal("lost stream failure")
	}
}
