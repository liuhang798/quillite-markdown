package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestImageUploadProgressKeepsOperationIdentity(t *testing.T) {
	var events []imageUploadProgress
	emit := func(event imageUploadProgress) { events = append(events, event) }
	first, second := imageUploadReporter("first", emit), imageUploadReporter("second", emit)
	second("uploading", 30, 100)
	first("uploading", 90, 100)
	first("complete", 100, 100)
	second("complete", 100, 100)
	for i, id := range []string{"second", "first", "first", "second"} {
		if events[i].OperationID != id {
			t.Fatalf("event %d belongs to %q, want %q", i, events[i].OperationID, id)
		}
		data, err := json.Marshal(events[i])
		if err != nil || !strings.Contains(string(data), `"operationId":"`+id+`"`) {
			t.Fatalf("missing wire identity: %s, %v", data, err)
		}
	}
	if events[0].Done != 30 || events[1].Done != 90 || events[3].Total != 100 {
		t.Fatalf("progress payload changed: %#v", events)
	}
}

func TestTrackedImageUploadRejectsInvalidIDsBeforeFileAccess(t *testing.T) {
	app := &App{}
	for _, id := range []string{"", strings.Repeat("x", 65), "../secret", "with space", "中文", "a\n"} {
		if validImageUploadOperationID(id) {
			t.Fatalf("accepted invalid ID %q", id)
		}
		for _, call := range []func(string, string, string) (string, error){app.UploadImageToPicGoWithProgress, app.UploadImageToPicGoCloudWithProgress} {
			if _, err := call("must-not-read.md", "must-not-read.png", id); err == nil || err.Error() != "invalid image upload operation ID" {
				t.Fatalf("bad validation: %v", err)
			}
		}
	}
	for _, id := range []string{"a", strings.Repeat("x", 64), "AB_019-uuid"} {
		if !validImageUploadOperationID(id) {
			t.Fatalf("rejected ID %q", id)
		}
	}
}
