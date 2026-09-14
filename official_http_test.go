package main

import (
	"net/http"
	"net/url"
	"testing"
	"time"
)

func TestOfficialUpdateRedirectPolicy(t *testing.T) {
	client := officialHTTPClient(time.Second)
	for _, raw := range []string{"http://qm.ssssa.cn/file", "https://example.com/file", "https://user:secret@qm.ssssa.cn/file", "https://qm.ssssa.cn:8443/file"} {
		u, _ := url.Parse(raw)
		if client.CheckRedirect(&http.Request{URL: u}, nil) == nil {
			t.Errorf("unsafe redirect accepted: %s", raw)
		}
	}
	u, _ := url.Parse("https://qm.ssssa.cn/file")
	if err := client.CheckRedirect(&http.Request{URL: u}, nil); err != nil {
		t.Fatal(err)
	}
}
