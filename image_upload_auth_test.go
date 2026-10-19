package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// Exercise the same credential, preference, asset and network path as the public
// upload API, without contacting a real account or changing the user's files.
func TestPicGoCloudUploadFailurePreservesCredentialsAndAssets(t *testing.T) {
	for _, stage := range []string{"presign", "album", "initiate", "multipart-complete"} {
		for _, status := range []int{401, 500} {
			for _, session := range []string{"unchanged", "new-login", "logout"} {
				t.Run(fmt.Sprintf("%s/%d/%s", stage, status, session), func(t *testing.T) {
					app := testApp(t)
					if err := app.writePicGoCloudToken("old-synthetic-token"); err != nil {
						t.Fatal(err)
					}
					if _, err := app.SetImageUploadSettings(ImageUploadSettingsInput{Mode: imageUploadModePicGoCloud, ServerURL: defaultPicGoServerURL}); err != nil {
						t.Fatal(err)
					}
					root := t.TempDir()
					doc, asset := filepath.Join(root, "test.md"), filepath.Join(root, "assets", "test.png")
					data, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
					if err != nil {
						t.Fatal(err)
					}
					if stage == "initiate" || stage == "multipart-complete" {
						data = append(data, make([]byte, picGoCloudMultipartMinimum)...)
					}
					if err := os.Mkdir(filepath.Dir(asset), 0o700); err != nil {
						t.Fatal(err)
					}
					if err := os.WriteFile(doc, []byte("original document"), 0o600); err != nil {
						t.Fatal(err)
					}
					if err := os.WriteFile(asset, data, 0o600); err != nil {
						t.Fatal(err)
					}
					endpoint := map[string]string{"presign": "/api/upload/presign", "album": "/api/album-items/complete", "initiate": "/api/upload/multipart/initiate", "multipart-complete": "/api/upload/multipart/complete"}[stage]
					started, release := make(chan struct{}), make(chan struct{})
					var once sync.Once
					unblock := func() { once.Do(func() { close(release) }) }
					requests := make(map[string]int)
					var server *httptest.Server
					server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
						requests[r.URL.Path]++
						if strings.HasPrefix(r.URL.Path, "/api/") && r.Header.Get("Authorization") != "Bearer old-synthetic-token" {
							t.Error("upload lost its original credential snapshot")
						}
						if r.URL.Path == endpoint {
							if requests[r.URL.Path] == 1 {
								close(started)
							}
							select {
							case <-release:
							case <-r.Context().Done():
								return
							}
							http.Error(w, `{"message":"synthetic failure"}`, status)
							return
						}
						w.Header().Set("Content-Type", "application/json")
						switch r.URL.Path {
						case "/api/upload/presign":
							fmt.Fprintf(w, `{"success":true,"objectKey":"object","publicId":"public","uploadUrl":%q,"method":"PUT"}`, server.URL+"/storage/image")
						case "/api/upload/multipart/initiate":
							fmt.Fprintf(w, `{"success":true,"uploadId":"upload","objectKey":"object","publicId":"public","partSize":%d,"partCount":1,"parts":[{"partNumber":1,"url":%q,"method":"PUT"}]}`, len(data), server.URL+"/storage/image")
						case "/storage/image":
							body, err := io.ReadAll(r.Body)
							if err != nil || !bytes.Equal(body, data) {
								t.Error("uploaded image bytes changed")
							}
							w.Header().Set("ETag", "synthetic-etag")
							w.WriteHeader(200)
						default:
							t.Errorf("unexpected request %s", r.URL.Path)
							http.NotFound(w, r)
						}
					}))
					defer server.Close()
					defer unblock()
					ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
					defer cancel()
					result := make(chan error, 1)
					go func() {
						url, err := app.uploadImageToPicGoCloudWithClient(ctx, server.Client(), server.URL, doc, "assets/test.png", "test-operation")
						if url != "" {
							t.Error("failure returned a success URL")
						}
						result <- err
					}()
					select {
					case <-started:
					case <-ctx.Done():
						t.Fatal("upload did not reach expected stage")
					}
					wantToken := "old-synthetic-token"
					if session == "new-login" {
						wantToken = "new-synthetic-token"
						if err := app.writePicGoCloudToken(wantToken); err != nil {
							t.Fatal(err)
						}
					} else if session == "logout" {
						wantToken = ""
						if _, err := app.LogoutPicGoCloud(); err != nil {
							t.Fatal(err)
						}
					}
					prefsBefore, err := os.ReadFile(app.preferencePath())
					if err != nil {
						t.Fatal(err)
					}
					unblock()
					var uploadErr error
					select {
					case uploadErr = <-result:
					case <-ctx.Done():
						t.Fatal("upload did not finish")
					}
					var apiErr *picGoCloudAPIError
					if !errors.As(uploadErr, &apiErr) || apiErr.Status != status {
						t.Fatalf("wrong upload failure: %v", uploadErr)
					}
					if app.readPicGoCloudToken() != wantToken {
						t.Error("upload failure changed the stored login")
					}
					prefsAfter, err := os.ReadFile(app.preferencePath())
					if err != nil || !bytes.Equal(prefsAfter, prefsBefore) {
						t.Error("upload failure changed preferences")
					}
					assetAfter, err := os.ReadFile(asset)
					if err != nil || !bytes.Equal(assetAfter, data) {
						t.Error("fallback asset lost or altered")
					}
					docAfter, err := os.ReadFile(doc)
					if err != nil || string(docAfter) != "original document" {
						t.Error("upload changed the document")
					}
					for endpoint, count := range requests {
						if count != 1 {
							t.Errorf("automatic retry at %s: %d requests", endpoint, count)
						}
					}
				})
			}
		}
	}
}
