package main

import (
	"errors"
	"net/http"
	"time"
)

func officialHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{Timeout: timeout, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 || !isOfficialWebsiteURL(req.URL.String()) {
			return errors.New("update redirect left the official HTTPS origin")
		}
		return nil
	}}
}
