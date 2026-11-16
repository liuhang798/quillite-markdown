package main

import (
	"encoding/binary"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Optional native-stream / real Chromium integration. Keep codec tools out of
// the product and the required Go suite. Chrome records a synthetic H.264 clip
// for this test; a legal ISO-BMFF 'free' box places the media data 128 MiB away.
func TestLocalVideoBrowserSeek(t *testing.T) {
	if os.Getenv("PLAYWRIGHT_MODULE") == "" || os.Getenv("BROWSER_EXECUTABLE") == "" {
		t.Skip("set PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE to run browser/video integration")
	}
	app, doc, folder := localVideoFixture(t)
	recording := filepath.Join(folder, "fixture-original.mp4")
	runVideoBrowserScript(t, recordH264Video, recording)
	encoded, err := os.ReadFile(recording)
	if err != nil || len(encoded) < 20 || string(encoded[4:8]) != "ftyp" {
		t.Fatalf("browser did not generate an MP4 fixture: %d bytes, %v", len(encoded), err)
	}
	ftyp := int(binary.BigEndian.Uint32(encoded[:4]))
	if ftyp < 16 || ftyp >= len(encoded) {
		t.Fatalf("invalid fixture ftyp size: %d", ftyp)
	}
	media := filepath.Join(folder, "fixture-large.mp4")
	file, err := os.Create(media)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	const spacer = 128 * 1024 * 1024
	if _, err := file.Write(encoded[:ftyp]); err != nil {
		t.Fatal(err)
	}
	free := [8]byte{0, 0, 0, 0, 'f', 'r', 'e', 'e'}
	binary.BigEndian.PutUint32(free[:4], spacer)
	if _, err := file.Write(free[:]); err != nil {
		t.Fatal(err)
	}
	if _, err := file.WriteAt(encoded[ftyp:], int64(ftyp+spacer)); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	privatePath, err := app.BeginLocalVideo(doc, "fixture-large.mp4")
	if err != nil {
		t.Fatal(err)
	}
	defer app.EndLocalVideo(privatePath)
	server := httptest.NewServer(app.localVideoMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; media-src 'self'")
		_, _ = w.Write([]byte("<!doctype html><title>Local video</title>"))
	})))
	defer server.Close()
	origin := server.URL
	if os.Getenv("LOCAL_VIDEO_BROWSER_ENGINE") != "webkit" {
		origin = strings.Replace(origin, "127.0.0.1", "wails.localhost", 1)
	}
	runVideoBrowserScript(t, seekH264Video, origin+privatePath)
}

// Optional real-file probe from the Go authorization to the media decoder.
// The fixture is a synthetic finite-duration VP8 WebM longer than two seconds.
func TestLocalWebMBrowserSeek(t *testing.T) {
	fixture := os.Getenv("LOCAL_WEBM_TEST_FILE")
	if fixture == "" || os.Getenv("PLAYWRIGHT_MODULE") == "" || os.Getenv("BROWSER_EXECUTABLE") == "" {
		t.Skip("set LOCAL_WEBM_TEST_FILE, PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE to run WebM integration")
	}
	app, doc, folder := localVideoFixture(t)
	contents, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, "fixture.webm"), contents, 0o600); err != nil {
		t.Fatal(err)
	}
	privatePath, err := app.BeginLocalVideo(doc, "fixture.webm")
	if err != nil {
		t.Fatal(err)
	}
	defer app.EndLocalVideo(privatePath)
	server := httptest.NewServer(app.localVideoMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; media-src 'self'")
		_, _ = w.Write([]byte("<!doctype html><title>Local WebM</title>"))
	})))
	defer server.Close()
	origin := server.URL
	if os.Getenv("LOCAL_VIDEO_BROWSER_ENGINE") != "webkit" {
		origin = strings.Replace(origin, "127.0.0.1", "wails.localhost", 1)
	}
	runVideoBrowserScript(t, seekWebMVideo, origin+privatePath)
}

func runVideoBrowserScript(t *testing.T, script, argument string) {
	t.Helper()
	cmd := exec.Command("node", "-e", videoBrowserPreamble+script, argument)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("real Chromium video test: %v\n%s", err, output)
	} else {
		t.Logf("%s", output)
	}
}

const videoBrowserPreamble = `
const {chromium,webkit} = require(process.env.PLAYWRIGHT_MODULE);
const assert = require("node:assert/strict");
async function run(task, origin, engine) {
  const browser = engine === 'webkit' ? await webkit.launch() :
    await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,
      args:['--host-resolver-rules=MAP wails.localhost 127.0.0.1']});
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    if (!origin) {
      origin = 'http://wails.localhost';
      await page.route(origin+'/', route => route.fulfill({
        contentType:'text/html', body:'<!doctype html><title>Video test generator</title>'
      }));
    }
    await page.goto(origin+'/');
    await task(page);
  } finally { await browser.close(); }
}
`

const recordH264Video = `
run(async page => {
  const data = await page.evaluate(async () => {
    const cvs = document.createElement('canvas');
    cvs.width = 480; cvs.height = 270;
    const context = cvs.getContext('2d');
    context.fillRect(0,0,480,270);
    const stream = cvs.captureStream(20);
    const chunks = [];
    const recorder = new MediaRecorder(stream,{mimeType:'video/mp4;codecs=avc1.42001e'});
    recorder.ondataavailable = event => chunks.push(event.data);
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start(500);
    for (let frame=0; frame<76; frame++) {
      context.fillStyle = 'hsl(' + (frame * 21 % 360) + ' 95% 50%)';
      context.fillRect(0,0,480,270);
      context.fillStyle = '#000';
      context.fillRect(frame*6,0,20,270);
      await new Promise(resolve => setTimeout(resolve,50));
    }
    recorder.stop();
    await stopped;
    for (const track of stream.getTracks()) track.stop();
    return Array.from(new Uint8Array(await new Blob(chunks, {type:'video/mp4'}).arrayBuffer()));
  });
  require('node:fs').writeFileSync(process.argv[1], Buffer.from(data), {flag:'wx'});
  console.log('Chromium recorded ' + data.length + ' bytes of synthetic H.264');
}).catch(error => { console.error(error); process.exitCode = 1; });
`

const seekH264Video = `
run(async page => {
  const source = process.argv[1];
  const ranges = [];
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  page.on('requestfailed', request => { if (request.url() === source) console.error('Media request failed', request.failure()); });
  page.on('response', response => {
    if (response.url() === source) {
      ranges.push([response.status(), response.headers()['content-range']]);
      console.log('Media response', ranges.at(-1));
    }
  });
  const observed = await page.evaluate(async uri => {
    const video = document.createElement('video');
    video.preload = 'none';
    video.muted = true;
    document.body.append(video);
    const once = event => new Promise((resolve,reject) => {
      const timeout = setTimeout(() => reject(new Error(event+' timed out: '+video.error?.message)),12000);
      video.addEventListener(event,() => { clearTimeout(timeout); resolve(); },{once:true});
      video.addEventListener('error',() => { clearTimeout(timeout); reject(new Error(video.error?.message || 'video decode error')); },{once:true});
    });
    video.src = uri;
    const ready = once('loadeddata');
    await video.play();
    await ready;
    video.pause();
    const target = 2.4;
    const seek = once('seeked');
    video.currentTime = target;
    await seek;
    return {time:video.currentTime,width:video.videoWidth};
  },source);
  assert.ok(observed.width === 480 && Math.abs(observed.time - 2.4) < 0.1, JSON.stringify(observed));
  assert.ok(ranges.some(([status,header]) => status === 206 && /bytes [1-9][0-9]{7,}-/.test(header || '')), JSON.stringify(ranges));
  console.log('128 MiB H.264 playable, sought to ' + observed.time + 's; range replies: ' + JSON.stringify(ranges));
},new URL(process.argv[1]).origin,process.env.LOCAL_VIDEO_BROWSER_ENGINE)
  .catch(error => { console.error(error); process.exitCode = 1; });
`

const seekWebMVideo = `
run(async page => {
  const source = process.argv[1];
  const responses = [];
  page.on('response', response => {
    if (response.url() === source) responses.push([response.status(), response.headers()['content-type']]);
  });
  const observed = await page.evaluate(async uri => {
    const video = document.createElement('video');
    video.preload = 'none';
    video.muted = true;
    document.body.append(video);
    const once = event => new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => finish(new Error(event+' timed out')), 8000);
      const finish = error => { clearTimeout(timer); controller.abort(); error ? reject(error) : resolve(); };
      video.addEventListener(event, () => finish(), {signal: controller.signal, once: true});
      video.addEventListener('error', () => finish(new Error(video.error?.message || 'decode error')),
        {signal: controller.signal, once: true});
    });
    video.src = uri;
    const ready = once('loadeddata');
    await Promise.all([ready, video.play()]);
    video.pause();
    if (!Number.isFinite(video.duration) || video.duration < 2) throw new Error('invalid fixture duration');
    const seek = once('seeked');
    video.currentTime = 1.8;
    await seek;
    return {time:video.currentTime,width:video.videoWidth};
  }, source);
  assert.ok(observed.width > 0 && Math.abs(observed.time - 1.8) < 0.15, JSON.stringify(observed));
  assert.ok(responses.some(([status,type]) => status === 206 && type === 'video/webm'), JSON.stringify(responses));
  console.log('Real WebM playback and seek: ' + JSON.stringify({observed,responses}));
}, new URL(process.argv[1]).origin, process.env.LOCAL_VIDEO_BROWSER_ENGINE)
  .catch(error => { console.error(error); process.exitCode = 1; });
`
