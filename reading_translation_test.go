package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

func TestReadingTranslationCopyNeverOverwrites(t *testing.T) {
	app, _ := aiTestApp(t)
	dir := t.TempDir()
	src := filepath.Join(dir, "guide.md")
	out := filepath.Join(dir, "guide.zh-CN.md")
	if err := os.WriteFile(src, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := app.writeTranslationCopy(src, src, "bad"); err == nil {
		t.Fatal("overwrote source")
	}
	if err := app.writeTranslationCopy(src, out, "译文"); err != nil {
		t.Fatal(err)
	}
	if err := app.writeTranslationCopy(src, out, "bad"); err == nil {
		t.Fatal("overwrote previous translation")
	}
	for path, want := range map[string]string{src: "original", out: "译文"} {
		b, e := os.ReadFile(path)
		if e != nil || string(b) != want {
			t.Fatal("file changed")
		}
	}
	pkg := filepath.Join(dir, "guide.textbundle")
	if err := os.Mkdir(pkg, 0700); err != nil {
		t.Fatal(err)
	}
	if err := app.writeTranslationCopy(src, filepath.Join(pkg, "new.md"), "bad"); err == nil {
		t.Fatal("modified package")
	}
}

func TestReadingTranslationResponse(t *testing.T) {
	got, err := decodeReadingTranslation("[{\"id\":2,\"text\":\"乙\"},{\"id\":1,\"text\":\"甲\"}]", 2)
	if err != nil || strings.Join(got, "") != "甲乙" {
		t.Fatalf("%v %v", got, err)
	}
	for _, s := range []string{"[]", "null", "[{\"id\":1,\"text\":\"ok\"},{\"id\":1,\"text\":\"again\"}]", "[{\"id\":1,\"text\":\"\"},{\"id\":2,\"text\":\"x\"}]"} {
		if _, err := decodeReadingTranslation(s, 2); err == nil {
			t.Fatal("accepted incomplete translation")
		}
	}
}

func TestReadingTranslationDoesNotFollowProviderRedirect(t *testing.T) {
	app, _ := aiTestApp(t)
	var forwarded atomic.Int32
	dest := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { forwarded.Add(1); w.WriteHeader(200) }))
	defer dest.Close()
	first := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, dest.URL, http.StatusTemporaryRedirect)
	}))
	defer first.Close()
	cfg, err := app.SetAISettings(AISettingsInput{Provider: aiProviderCustom, BaseURL: first.URL + "/v1", Model: "model", APIKey: "dummy"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = app.TranslateReadingParts(ReadingTranslationRequest{RequestID: "redirect", Provider: cfg.Provider, BaseURL: cfg.BaseURL, Model: cfg.Model, Parts: []string{"fixture"}})
	if err == nil || forwarded.Load() != 0 {
		t.Fatalf("redirect must not transmit text: %v", err)
	}
}

func TestReadingTranslationUsesConfirmedProviderOnly(t *testing.T) {
	app, _ := aiTestApp(t)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer test-key" {
			t.Error("wrong request destination")
		}
		var body struct {
			Messages []struct{ Role, Content string }
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Messages) != 2 || body.Messages[1].Content != "[{\"id\":1,\"text\":\"Test phrase\"}]" {
			t.Error("expected only the approved prose")
		}
		_, _ = w.Write([]byte("{\"choices\":[{\"message\":{\"content\":\"[{\\\"id\\\":1,\\\"text\\\":\\\"译文\\\"}]\"}}]}"))
	}))
	defer server.Close()
	cfg, err := app.SetAISettings(AISettingsInput{Provider: aiProviderCustom, BaseURL: server.URL + "/v1", Model: "test-model", APIKey: "test-key"})
	if err != nil {
		t.Fatal(err)
	}
	req := ReadingTranslationRequest{RequestID: "batch", Provider: cfg.Provider, BaseURL: cfg.BaseURL, Model: "not-confirmed", Parts: []string{"Test phrase"}}
	if _, err = app.TranslateReadingParts(req); err == nil || calls.Load() != 0 {
		t.Fatal("changed model should be rejected before sending")
	}
	req.Model = cfg.Model
	got, err := app.TranslateReadingParts(req)
	if err != nil || len(got) != 1 || got[0] != "译文" || calls.Load() != 1 {
		t.Fatalf("%v %v", got, err)
	}
}
