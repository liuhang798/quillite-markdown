package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func uploadRunnerFixture(t *testing.T, action string) (string, string) {
	t.Helper()
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("Node required")
	}
	dir := t.TempDir()
	entry := filepath.Join(dir, "runtime", managedPicGoEntry)
	pkg := filepath.Join(dir, "cli", "node_modules", "picgo")
	if err := os.MkdirAll(pkg, 0700); err != nil {
		t.Fatal(err)
	}
	source := `exports.PicGo=class { constructor(config) { this.cmd={program:{parseAsync: async(argv)=>{` + action + `}}}; } registerCommands() {} };`
	if err := os.WriteFile(filepath.Join(pkg, "index.js"), []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	return node, entry
}

func TestPicGoUploadRunnerAwaitsFullActionNotIdleHandles(t *testing.T) {
	node, entry := uploadRunnerFixture(t, `
 if(argv[2]!=='--config'||argv[4]!=='upload'||argv[5]!=='image space.png') throw Error('bad argv');
 console.log('[PicGo SUCCESS]:\nhttps://example.org/image.png');
 await new Promise(r=>setTimeout(r,250));
 console.log('AFTER_UPLOAD_FINISHED');
 setInterval(()=>{},10000);`)
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	start := time.Now()
	output, err := exec.CommandContext(ctx, node, "-e", picGoUploadRunner, entry, "--config", "config space.json", "upload", "image space.png").CombinedOutput()
	if err != nil || !strings.Contains(string(output), "AFTER_UPLOAD_FINISHED") || time.Since(start) < 250*time.Millisecond {
		t.Fatalf("did not await full action: %v", err)
	}
	if ctx.Err() != nil {
		t.Fatal("waited on idle timer")
	}
	if _, err := picGoCLIImageURL(string(output), false); err != nil {
		t.Fatal(err)
	}
	t.Logf("full action + exit: %s (synthetic idle timer remains 10s)", time.Since(start))
}

func TestPicGoUploadRunnerPreservesLateFailures(t *testing.T) {
	for _, action := range []string{
		`console.log('[PicGo SUCCESS]:\nhttps://example.org/image.png'); await new Promise(r=>setTimeout(r,50)); throw Error('SYNTHETIC_SECRET');`,
		`console.log('[PicGo SUCCESS]:\nhttps://example.org/image.png'); await new Promise(r=>setTimeout(r,50)); console.error('[PicGo ERROR]: late failure');`,
	} {
		node, entry := uploadRunnerFixture(t, action)
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		output, err := exec.CommandContext(ctx, node, "-e", picGoUploadRunner, entry, "upload", "image.png").CombinedOutput()
		cancel()
		if strings.Contains(string(output), "SYNTHETIC_SECRET") {
			t.Fatal("exception leaked")
		}
		if _, parseErr := picGoCLIImageURL(string(output), false); err == nil && parseErr == nil {
			t.Fatal("late error became success")
		}
	}
}

func TestPicGoCustomCLIStillRequiresExit(t *testing.T) {
	cli := fakePicGoCLI(t, `console.log('[PicGo SUCCESS]:\nhttps://example.org/x');setInterval(()=>{},10000);`)
	ctx, cancel := context.WithTimeout(context.Background(), 400*time.Millisecond)
	defer cancel()
	_, err := runPicGoCLI(ctx, cli, "upload", "image.png")
	if err == nil || err.Error() != "PICGO_CLI_TIMEOUT" {
		t.Fatal("unverified CLI got early success", err)
	}
}

func TestPicGoUploadPhaseStreamIsBoundedAndAllowlisted(t *testing.T) {
	var phases []string
	b := picGoCLIOutput{onPhase: func(phase string, _, _ int64) { phases = append(phases, phase) }}
	for _, s := range []string{"SECRET\nQUILLITE_CLI_PHA", "SE uploading\nQUILLITE_CLI_PHASE fake\n", "QUILLITE_CLI_PHASE finalizing\n", strings.Repeat("x", 2048)} {
		b.Write([]byte(s))
	}
	if !reflect.DeepEqual(phases, []string{"uploading", "finalizing"}) || len(b.phaseLine) > 1024 {
		t.Fatal("invalid phase or unbounded partial line")
	}
}
