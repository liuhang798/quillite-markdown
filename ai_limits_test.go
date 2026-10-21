package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestAIProviderLimitsAreTypedWithoutLeakingProviderDetails(t *testing.T) {
	for _, tc := range []struct {
		status int
		body   string
		want   error
	}{
		{429, `{"error":{"message":"free users upgrade plan private-detail"}}`, errAIRateLimited},
		{429, `{"error":{"code":"insufficient_quota"}}`, errAIQuotaExceeded},
		{429, `{"error":{"type":"billing_hard_limit_reached"}}`, errAIQuotaExceeded},
		{402, `balance exhausted`, errAIQuotaExceeded},
		{429, `<html>busy</html>`, errAIRateLimited},
	} {
		err := aiHTTPStatusError(&http.Response{StatusCode: tc.status, Body: io.NopCloser(strings.NewReader(tc.body))})
		if !errors.Is(err, tc.want) || !stopAIChunkRetry(fmt.Errorf("wrapped: %w", err)) || strings.Contains(err.Error(), "private-detail") {
			t.Fatalf("unexpected limit error: %v", err)
		}
	}
}

func TestAIChunkLimitsStopSummaryRewriteAndReviewWithoutRetry(t *testing.T) {
	for _, kind := range []string{"summary", "rewrite", "review", "repair"} {
		t.Run(kind, func(t *testing.T) {
			app, store := aiTestApp(t)
			store.values[aiCredentialAccount] = "test-key"
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				call := calls.Add(1)
				w.Header().Set("Content-Type", "application/json")
				if kind == "repair" && call == 1 {
					fmt.Fprint(w, `{"choices":[{"message":{"content":"invalid review"}}]}`)
					return
				}
				w.WriteHeader(429)
				fmt.Fprint(w, `{"error":{"message":"Rate limit"}}`)
			}))
			defer server.Close()
			settings := AISettings{Provider: aiProviderDeepSeek, BaseURL: server.URL}
			text := strings.Repeat("document text ", aiChunkTargetCharacters)
			var err error
			if kind == "review" || kind == "repair" {
				_, err = app.reviewAIChunks(context.Background(), settings, "test", AIDocumentReviewRequest{Text: text})
			} else {
				action := "polish"
				if kind == "summary" {
					action = "summarize"
				}
				_, err = app.rewriteAIChunks(context.Background(), settings, "test", AIRewriteRequest{Text: text, Action: action}, "prompt")
			}
			want := int32(1)
			if kind == "repair" {
				want = 2
			}
			if !errors.Is(err, errAIRateLimited) || calls.Load() != want {
				t.Fatalf("requests=%d want=%d error=%v", calls.Load(), want, err)
			}
		})
	}
}
