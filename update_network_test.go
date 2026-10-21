package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestUpdateRetriesTruncatedDownloadFromStart(t *testing.T) {
	var calls atomic.Int32
	content := "verified complete update"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Range") != "" {
			t.Error("must not append unverified partial data")
		}
		if calls.Add(1) == 1 {
			w.Header().Set("Content-Length", "100")
			fmt.Fprint(w, "stale partial bytes")
			return
		}
		fmt.Fprint(w, content)
	}))
	defer server.Close()
	dir := t.TempDir()
	path := filepath.Join(dir, "private-update.bin")
	sentinel := filepath.Join(dir, "user.md")
	os.WriteFile(sentinel, []byte("preserve"), 0600)
	if err := (&App{}).downloadFileWithRetry(context.Background(), server.URL, path, server.Client(), 0); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(path)
	if string(data) != content || calls.Load() != 2 {
		t.Fatalf("got %q after %d attempts", data, calls.Load())
	}
	if data, _ := os.ReadFile(sentinel); string(data) != "preserve" {
		t.Fatal("unrelated file changed")
	}
}

func TestUpdateRetriesAreBoundedAndNeverRetryDiskOrHTTPFailures(t *testing.T) {
	for _, scenario := range []string{"truncated", "404", "disk"} {
		t.Run(scenario, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if scenario == "404" {
					http.NotFound(w, r)
					return
				}
				if scenario == "truncated" {
					w.Header().Set("Content-Length", "100")
				}
				fmt.Fprint(w, "partial")
			}))
			defer server.Close()
			dir := t.TempDir()
			path := filepath.Join(dir, "update.bin")
			if scenario == "disk" {
				path = dir
			}
			err := (&App{}).downloadFileWithRetry(context.Background(), server.URL, path, server.Client(), 0)
			if err == nil {
				t.Fatal("expected failure")
			}
			want := int32(1)
			if scenario == "truncated" {
				want = 3
				if !errors.Is(err, errUpdateDownloadInterrupted) {
					t.Fatal(err)
				}
			}
			if calls.Load() != want {
				t.Fatalf("attempts=%d want=%d", calls.Load(), want)
			}
		})
	}
}

func TestUpdateRetryWaitHonorsCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Length", "100")
		fmt.Fprint(w, "short")
		cancel()
	}))
	defer server.Close()
	err := (&App{}).downloadFileWithRetry(ctx, server.URL, filepath.Join(t.TempDir(), "update.bin"), server.Client(), time.Hour)
	if err == nil || !strings.Contains(err.Error(), "canceled") || calls.Load() != 1 {
		t.Fatalf("calls=%d err=%v", calls.Load(), err)
	}
}
