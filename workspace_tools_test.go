package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func workspaceFixture(t *testing.T) (*App, string, string) {
	t.Helper()
	a := testApp(t)
	root := t.TempDir()
	path := filepath.Join(root, "中文.md")
	if err := os.WriteFile(path, []byte("# 中文\nneedle one\nneedle two\n"), 0600); err != nil {
		t.Fatal(err)
	}
	return a, root, path
}
func TestWorkspaceSearchIsReadOnlyAndBounded(t *testing.T) {
	a, root, path := workspaceFixture(t)
	q := WorkspaceQuery{Root: root, Query: "needle"}
	r, err := a.SearchWorkspace(q)
	if err != nil || len(r.Matches) != 2 || r.Matches[0].Line != 2 {
		t.Fatalf("%+v %v", r, err)
	}
	q.ExcludePath = path
	r, err = a.SearchWorkspace(q)
	if err != nil || len(r.Matches) != 0 || r.Skipped != 1 {
		t.Fatal(r, err)
	}
	q.ExcludePath = ""
	q.Filter = "not-there"
	r, _ = a.SearchWorkspace(q)
	if len(r.Matches) != 0 {
		t.Fatal(r)
	}
	q.Filter = ""
	q.Extension = ".txt"
	r, _ = a.SearchWorkspace(q)
	if len(r.Matches) != 0 {
		t.Fatal(r)
	}
	data, _ := os.ReadFile(path)
	if !strings.Contains(string(data), "needle one") {
		t.Fatal("search changed file")
	}
	q.Query = ""
	if _, err = a.SearchWorkspace(q); err == nil {
		t.Fatal("empty query allowed")
	}
}
func TestWorkspaceReplaceRequiresSingleUsePreviewAndPreservesConflicts(t *testing.T) {
	a, root, path := workspaceFixture(t)
	q := WorkspaceQuery{Root: root, Query: "needle", Replacement: "new"}
	p, err := a.PreviewWorkspaceReplace(q)
	if err != nil || len(p.Changes) != 1 || p.Changes[0].Count != 2 {
		t.Fatal(p, err)
	}
	before, _ := os.ReadFile(path)
	if string(before) != p.Changes[0].Before {
		t.Fatal("preview wrote file")
	}
	if _, err = a.ApplyWorkspaceReplace(p.Token, []string{filepath.Join(root, "other.md")}); err == nil {
		t.Fatal("unpreviewed path accepted")
	}
	if err = os.WriteFile(path, []byte("external"), 0600); err != nil {
		t.Fatal(err)
	}
	r, err := a.ApplyWorkspaceReplace(p.Token, []string{path})
	if err != nil || r[0].Status != "conflict" {
		t.Fatal(r, err)
	}
	after, _ := os.ReadFile(path)
	if string(after) != "external" {
		t.Fatal("external edit lost")
	}
	if _, err = a.ApplyWorkspaceReplace(p.Token, []string{path}); err == nil {
		t.Fatal("token replay allowed")
	}
}
func TestWorkspaceReplaceCreatesHistoryAndRejectsExpiredPreview(t *testing.T) {
	a, root, path := workspaceFixture(t)
	q := WorkspaceQuery{Root: root, Query: "needle", Replacement: ""}
	p, _ := a.PreviewWorkspaceReplace(q)
	a.workspacePlan.expires = time.Now().Add(-time.Second)
	if _, err := a.ApplyWorkspaceReplace(p.Token, []string{path}); err == nil {
		t.Fatal("expired plan accepted")
	}
	p, _ = a.PreviewWorkspaceReplace(q)
	r, err := a.ApplyWorkspaceReplace(p.Token, []string{path})
	if err != nil || r[0].Status != "saved" {
		t.Fatal(r, err)
	}
	data, _ := os.ReadFile(path)
	if strings.Contains(string(data), "needle") {
		t.Fatal("replacement failed")
	}
	versions, err := a.ListDocumentVersions(path)
	if err != nil || len(versions) != 1 {
		t.Fatal(versions, err)
	}
	v, err := a.GetDocumentVersion(path, versions[0].ID)
	if err != nil || v.Content != p.Changes[0].Before {
		t.Fatal("history missing original", err)
	}
}
func TestWorkspaceRejectsLinksAndOutsidePaths(t *testing.T) {
	a, root, path := workspaceFixture(t)
	if workspaceRegularPath(root, filepath.Join(t.TempDir(), "outside.md")) || workspaceRegularPath(root, root) {
		t.Fatal("invalid scope accepted")
	}
	link := filepath.Join(root, "alias.md")
	if err := os.Symlink(path, link); err != nil {
		t.Skip(err)
	}
	if workspaceRegularPath(root, link) {
		t.Fatal("link accepted")
	}
	r, err := a.SearchWorkspace(WorkspaceQuery{Root: root, Query: "needle"})
	if err != nil || len(r.Matches) != 2 || r.Skipped != 1 {
		t.Fatal(r, err)
	}
}
func TestWorkspacePreviewDoesNotAllocateUnboundedReplacement(t *testing.T) {
	a, root, path := workspaceFixture(t)
	if err := os.WriteFile(path, []byte(strings.Repeat("a", 10000)), 0600); err != nil {
		t.Fatal(err)
	}
	p, err := a.PreviewWorkspaceReplace(WorkspaceQuery{Root: root, Query: "a", Replacement: strings.Repeat("b", 60000)})
	if err != nil || len(p.Changes) != 0 || p.Skipped != 1 {
		t.Fatal(p, err)
	}
}
func TestDiagnosticReportExcludesUntrustedFields(t *testing.T) {
	data, err := diagnosticReport(DiagnosticInput{Errors: map[string]int{"document": 2, "C:/secret/key": 5, "apiKey": 4, "frontend": -1}})
	if err != nil || strings.Contains(string(data), "secret") || strings.Contains(string(data), "apiKey") || !strings.Contains(string(data), `"document": 2`) {
		t.Fatal(string(data), err)
	}
}
func TestWorkspaceAssetCheckDoesNotWrite(t *testing.T) {
	a, root, path := workspaceFixture(t)
	image := filepath.Join(root, "a.png")
	if err := os.WriteFile(image, []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	missing, err := a.CheckDocumentAssets(path, []string{"a.png", "missing.png", "https://example.invalid/a.png"})
	if err != nil || len(missing) != 1 || missing[0] != "missing.png" {
		t.Fatal(missing, err)
	}
}

func TestRecoveryBackupInspectionNeverDeletesMatchingSnapshot(t *testing.T) {
	a, _, path := workspaceFixture(t)
	content, _ := os.ReadFile(path)
	if err := a.SaveRecoverySnapshot(RecoverySnapshotInput{Path: path, Content: string(content)}); err != nil {
		t.Fatal(err)
	}
	snapshot, err := a.GetRecoveryBackup()
	if err != nil || snapshot == nil || snapshot.Content != string(content) {
		t.Fatal(snapshot, err)
	}
	if _, err = os.Stat(a.recoverySnapshotPath()); err != nil {
		t.Fatal("inspection removed backup", err)
	}
}

func TestWorkspaceReplaceRejectsMissingFileAndKeepsUnselectedFiles(t *testing.T) {
	a, root, path := workspaceFixture(t)
	other := filepath.Join(root, "other.md")
	if err := os.WriteFile(other, []byte("needle"), 0600); err != nil {
		t.Fatal(err)
	}
	p, err := a.PreviewWorkspaceReplace(WorkspaceQuery{Root: root, Query: "needle", Replacement: "changed"})
	if err != nil {
		t.Fatal(err)
	}
	// Remove only this test's exact fixture to simulate an external deletion.
	if err = os.Remove(path); err != nil {
		t.Fatal(err)
	}
	r, err := a.ApplyWorkspaceReplace(p.Token, []string{path})
	if err != nil || r[0].Status == "saved" {
		t.Fatal(r, err)
	}
	if _, err = os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("deleted document recreated")
	}
	data, _ := os.ReadFile(other)
	if string(data) != "needle" {
		t.Fatal("unselected document changed")
	}
}

func TestWorkspaceNewPreviewInvalidatesOldAndRejectsDuplicates(t *testing.T) {
	a, root, path := workspaceFixture(t)
	q := WorkspaceQuery{Root: root, Query: "needle", Replacement: "next"}
	first, err := a.PreviewWorkspaceReplace(q)
	if err != nil {
		t.Fatal(err)
	}
	second, err := a.PreviewWorkspaceReplace(q)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = a.ApplyWorkspaceReplace(first.Token, []string{path}); err == nil {
		t.Fatal("old preview accepted")
	}
	if _, err = a.ApplyWorkspaceReplace(second.Token, []string{path, path}); err == nil {
		t.Fatal("duplicate accepted")
	}
	if _, err = a.ApplyWorkspaceReplace(second.Token, nil); err == nil {
		t.Fatal("empty selection accepted")
	}
	data, _ := os.ReadFile(path)
	if string(data) != second.Changes[0].Before {
		t.Fatal("invalid request wrote file")
	}
}

func TestWorkspaceBackupFailurePreventsReplacement(t *testing.T) {
	a, root, path := workspaceFixture(t)
	if err := os.WriteFile(a.documentHistoryRoot(), []byte("not a directory"), 0600); err != nil {
		t.Fatal(err)
	}
	p, err := a.PreviewWorkspaceReplace(WorkspaceQuery{Root: root, Query: "needle", Replacement: "new"})
	if err != nil {
		t.Fatal(err)
	}
	r, err := a.ApplyWorkspaceReplace(p.Token, []string{path})
	if err != nil || r[0].Status != "failed" {
		t.Fatal(r, err)
	}
	data, _ := os.ReadFile(path)
	if string(data) != p.Changes[0].Before {
		t.Fatal("wrote without history")
	}
}
