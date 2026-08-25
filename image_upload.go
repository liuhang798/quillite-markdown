package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	imageUploadModeLocal       = "local"
	imageUploadModePicGoCloud  = "picgo-cloud"
	imageUploadModePicGo       = "picgo"
	defaultPicGoServerURL      = "http://127.0.0.1:36677"
	picGoCloudAPIBaseURL       = "https://api.picgo.app"
	picGoCloudLoginBaseURL     = "https://cloud.picgo.app"
	maxPicGoResponseSize       = 1 << 20
	picGoCloudMultipartMinimum = 10 * 1024 * 1024
	imageUploadProgressEvent   = "image-upload:progress"
)

type imageUploadProgress struct {
	Phase string `json:"phase"`
	Done  int64  `json:"done"`
	Total int64  `json:"total"`
}

type uploadProgressReader struct {
	reader     io.Reader
	total      int64
	done       int64
	lastReport time.Time
	onProgress func(done, total int64)
}

func (reader *uploadProgressReader) Read(buffer []byte) (int, error) {
	count, err := reader.reader.Read(buffer)
	if count > 0 {
		reader.done += int64(count)
		now := time.Now()
		if reader.onProgress != nil && (reader.done >= reader.total || reader.lastReport.IsZero() || now.Sub(reader.lastReport) >= 80*time.Millisecond) {
			reader.lastReport = now
			reader.onProgress(reader.done, reader.total)
		}
	}
	return count, err
}

func newUploadProgressReader(reader io.Reader, total int64, onProgress func(done, total int64)) io.Reader {
	if onProgress == nil {
		return reader
	}
	return &uploadProgressReader{reader: reader, total: total, onProgress: onProgress}
}

func (a *App) emitImageUploadProgress(phase string, done, total int64) {
	a.mu.RLock()
	ctx := a.ctx
	a.mu.RUnlock()
	if ctx == nil {
		return
	}
	wailsruntime.EventsEmit(ctx, imageUploadProgressEvent, imageUploadProgress{Phase: phase, Done: done, Total: total})
}

type ImageUploadSettings struct {
	Mode          string `json:"mode"`
	ServerURL     string `json:"serverUrl"`
	HasSecret     bool   `json:"hasSecret"`
	HasCloudToken bool   `json:"hasCloudToken"`
}

type ImageUploadSettingsInput struct {
	Mode        string `json:"mode"`
	ServerURL   string `json:"serverUrl"`
	Secret      string `json:"secret"`
	ClearSecret bool   `json:"clearSecret"`
}

type picGoResponse struct {
	Success bool     `json:"success"`
	Result  []string `json:"result"`
}

type picGoHeartbeatResponse struct {
	Success bool `json:"success"`
}

type PicGoCloudStatus struct {
	Connected bool   `json:"connected"`
	User      string `json:"user,omitempty"`
	Plan      int    `json:"plan,omitempty"`
}

type picGoCloudWhoAmIResponse struct {
	User   *string `json:"user"`
	Plan   int     `json:"plan"`
	Avatar *string `json:"avatar"`
}

type picGoCloudTokenExchangeResponse struct {
	Success bool   `json:"success"`
	Token   string `json:"token"`
	Message string `json:"message"`
}

type picGoCloudPresignResponse struct {
	Success   bool              `json:"success"`
	ObjectKey string            `json:"objectKey"`
	PublicID  string            `json:"publicId"`
	UploadURL string            `json:"uploadUrl"`
	Method    string            `json:"method"`
	Headers   map[string]string `json:"headers"`
	Message   string            `json:"message"`
}

type picGoCloudCompleteResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    struct {
		Item struct {
			ImageURL string `json:"imgUrl"`
		} `json:"item"`
	} `json:"data"`
}

type picGoCloudMultipartPart struct {
	PartNumber int               `json:"partNumber"`
	URL        string            `json:"url"`
	Method     string            `json:"method"`
	Headers    map[string]string `json:"headers"`
}

type picGoCloudMultipartInitiateResponse struct {
	Success   bool                      `json:"success"`
	UploadID  string                    `json:"uploadId"`
	ObjectKey string                    `json:"objectKey"`
	PublicID  string                    `json:"publicId"`
	URL       string                    `json:"url"`
	PartSize  int                       `json:"partSize"`
	PartCount int                       `json:"partCount"`
	Parts     []picGoCloudMultipartPart `json:"parts"`
	Message   string                    `json:"message"`
}

type picGoCloudCompletedPart struct {
	PartNumber int    `json:"partNumber"`
	ETag       string `json:"etag"`
}

func normaliseImageUploadMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case imageUploadModePicGoCloud:
		return imageUploadModePicGoCloud
	case imageUploadModePicGo:
		return imageUploadModePicGo
	}
	return imageUploadModeLocal
}

func normalisePicGoServerURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		raw = defaultPicGoServerURL
	}
	parsed, err := url.Parse(raw)
	if err != nil || !strings.EqualFold(parsed.Scheme, "http") || parsed.Host == "" {
		return "", errors.New("PicGo server must be a local HTTP address")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Path != "" && parsed.Path != "/") {
		return "", errors.New("PicGo server address must contain only scheme, host, and port")
	}
	hostname := strings.TrimSpace(parsed.Hostname())
	allowed := strings.EqualFold(hostname, "localhost")
	if address := net.ParseIP(hostname); address != nil {
		allowed = address.IsLoopback()
	}
	if !allowed {
		return "", errors.New("PicGo server must use localhost or a loopback IP address")
	}
	parsed.Scheme = "http"
	parsed.Path = ""
	parsed.RawPath = ""
	return strings.TrimRight(parsed.String(), "/"), nil
}

func normalisePicGoSecret(raw string) (string, error) {
	secret := strings.TrimSpace(raw)
	if len(secret) > 4096 || strings.ContainsAny(secret, "\r\n") {
		return "", errors.New("PicGo server secret is invalid")
	}
	return secret, nil
}

func (a *App) picGoSecretPath() string {
	return filepath.Join(filepath.Dir(a.preferencePath()), "picgo-server-secret")
}

func (a *App) picGoCloudTokenPath() string {
	return filepath.Join(filepath.Dir(a.preferencePath()), "picgo-cloud-token")
}

func readPrivateText(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func writePrivateText(path, value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		return nil
	}
	if len(value) > 16*1024 || strings.ContainsAny(value, "\r\n") {
		return errors.New("stored credential is invalid")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(path, []byte(value), 0o600); err != nil {
		return err
	}
	return os.Chmod(path, 0o600)
}

func (a *App) readPicGoSecret() string {
	return readPrivateText(a.picGoSecretPath())
}

func (a *App) writePicGoSecret(secret string) error {
	secret, err := normalisePicGoSecret(secret)
	if err != nil {
		return err
	}
	return writePrivateText(a.picGoSecretPath(), secret)
}

func (a *App) readPicGoCloudToken() string {
	return readPrivateText(a.picGoCloudTokenPath())
}

func (a *App) writePicGoCloudToken(token string) error {
	return writePrivateText(a.picGoCloudTokenPath(), token)
}

func (a *App) GetImageUploadSettings() (ImageUploadSettings, error) {
	prefs, err := a.readPreferences()
	if err != nil {
		return ImageUploadSettings{}, err
	}
	return ImageUploadSettings{
		Mode:          normaliseImageUploadMode(prefs.ImageUploadMode),
		ServerURL:     prefs.PicGoServerURL,
		HasSecret:     a.readPicGoSecret() != "",
		HasCloudToken: a.readPicGoCloudToken() != "",
	}, nil
}

func (a *App) SetImageUploadSettings(input ImageUploadSettingsInput) (ImageUploadSettings, error) {
	mode := normaliseImageUploadMode(input.Mode)
	if mode == imageUploadModePicGoCloud && a.readPicGoCloudToken() == "" {
		return ImageUploadSettings{}, errors.New("sign in to PicGo Cloud before enabling online uploads")
	}
	serverURL, err := normalisePicGoServerURL(input.ServerURL)
	if err != nil {
		return ImageUploadSettings{}, err
	}
	if input.ClearSecret {
		if err := a.writePicGoSecret(""); err != nil {
			return ImageUploadSettings{}, err
		}
	} else if strings.TrimSpace(input.Secret) != "" {
		if err := a.writePicGoSecret(input.Secret); err != nil {
			return ImageUploadSettings{}, err
		}
	}
	prefs, err := a.updatePreferences(func(prefs *Preferences) {
		prefs.ImageUploadMode = mode
		prefs.PicGoServerURL = serverURL
	})
	if err != nil {
		return ImageUploadSettings{}, err
	}
	return ImageUploadSettings{
		Mode:          prefs.ImageUploadMode,
		ServerURL:     prefs.PicGoServerURL,
		HasSecret:     a.readPicGoSecret() != "",
		HasCloudToken: a.readPicGoCloudToken() != "",
	}, nil
}

func (a *App) effectivePicGoSettings(input ImageUploadSettingsInput) (ImageUploadSettings, string, error) {
	serverURL, err := normalisePicGoServerURL(input.ServerURL)
	if err != nil {
		return ImageUploadSettings{}, "", err
	}
	secret, err := normalisePicGoSecret(input.Secret)
	if err != nil {
		return ImageUploadSettings{}, "", err
	}
	if input.ClearSecret {
		secret = ""
	} else if secret == "" {
		secret = a.readPicGoSecret()
	}
	return ImageUploadSettings{Mode: normaliseImageUploadMode(input.Mode), ServerURL: serverURL, HasSecret: secret != ""}, secret, nil
}

func picGoHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			Proxy:       nil,
			DialContext: (&net.Dialer{Timeout: 3 * time.Second, KeepAlive: 15 * time.Second}).DialContext,
		},
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

type picGoCloudAPIError struct {
	Status  int
	Message string
}

func (e *picGoCloudAPIError) Error() string {
	if strings.TrimSpace(e.Message) != "" {
		return e.Message
	}
	return fmt.Sprintf("PicGo Cloud returned HTTP %d", e.Status)
}

func picGoCloudHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			Proxy:                 http.ProxyFromEnvironment,
			DialContext:           (&net.Dialer{Timeout: 8 * time.Second, KeepAlive: 20 * time.Second}).DialContext,
			TLSHandshakeTimeout:   8 * time.Second,
			ResponseHeaderTimeout: 15 * time.Second,
		},
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func picGoCloudEndpoint(apiBase, endpoint string) (string, error) {
	base, err := url.Parse(strings.TrimRight(apiBase, "/") + "/")
	if err != nil || base.Host == "" || (base.Scheme != "https" && base.Scheme != "http") {
		return "", errors.New("PicGo Cloud API address is invalid")
	}
	resolved, err := base.Parse(strings.TrimLeft(endpoint, "/"))
	if err != nil || resolved.Host != base.Host || resolved.Scheme != base.Scheme {
		return "", errors.New("PicGo Cloud API endpoint is invalid")
	}
	return resolved.String(), nil
}

func picGoCloudRequest(ctx context.Context, apiBase, method, endpoint, token string, body any) (*http.Request, error) {
	requestURL, err := picGoCloudEndpoint(apiBase, endpoint)
	if err != nil {
		return nil, err
	}
	var reader io.Reader
	if body != nil {
		payload, marshalErr := json.Marshal(body)
		if marshalErr != nil {
			return nil, marshalErr
		}
		reader = bytes.NewReader(payload)
	}
	request, err := http.NewRequestWithContext(ctx, method, requestURL, reader)
	if err != nil {
		return nil, err
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if strings.TrimSpace(token) != "" {
		request.Header.Set("Authorization", "Bearer "+strings.TrimSpace(token))
	}
	request.Header.Set("Accept", "application/json")
	return request, nil
}

func decodePicGoCloudResponse(response *http.Response, output any) error {
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, maxPicGoResponseSize))
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var detail struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(data, &detail)
		return &picGoCloudAPIError{Status: response.StatusCode, Message: strings.TrimSpace(detail.Message)}
	}
	if output == nil {
		return nil
	}
	if err := json.Unmarshal(data, output); err != nil {
		return errors.New("PicGo Cloud returned an invalid response")
	}
	return nil
}

func doPicGoCloudJSON(ctx context.Context, client *http.Client, apiBase, method, endpoint, token string, body, output any) error {
	request, err := picGoCloudRequest(ctx, apiBase, method, endpoint, token, body)
	if err != nil {
		return err
	}
	response, err := client.Do(request)
	if err != nil {
		return errors.New("unable to connect to PicGo Cloud")
	}
	return decodePicGoCloudResponse(response, output)
}

func picGoCloudStatus(ctx context.Context, client *http.Client, apiBase, token string) (PicGoCloudStatus, error) {
	if strings.TrimSpace(token) == "" {
		return PicGoCloudStatus{}, errors.New("PicGo Cloud sign-in is required")
	}
	var whoami picGoCloudWhoAmIResponse
	if err := doPicGoCloudJSON(ctx, client, apiBase, http.MethodGet, "/api/whoami", token, nil, &whoami); err != nil {
		return PicGoCloudStatus{}, err
	}
	user := ""
	if whoami.User != nil {
		user = strings.TrimSpace(*whoami.User)
	}
	return PicGoCloudStatus{Connected: true, User: user, Plan: whoami.Plan}, nil
}

func (a *App) TestPicGoCloud() (PicGoCloudStatus, error) {
	token := a.readPicGoCloudToken()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	client := picGoCloudHTTPClient(15 * time.Second)
	defer client.CloseIdleConnections()
	status, err := picGoCloudStatus(ctx, client, picGoCloudAPIBaseURL, token)
	var apiErr *picGoCloudAPIError
	if errors.As(err, &apiErr) && apiErr.Status == http.StatusUnauthorized {
		_ = a.writePicGoCloudToken("")
	}
	return status, err
}

func randomBase64URL(byteCount int) (string, error) {
	data := make([]byte, byteCount)
	if _, err := rand.Read(data); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func picGoCloudPKCE() (verifier, challenge, state string, err error) {
	verifier, err = randomBase64URL(32)
	if err != nil {
		return "", "", "", err
	}
	digest := sha256.Sum256([]byte(verifier))
	challenge = base64.RawURLEncoding.EncodeToString(digest[:])
	state, err = randomBase64URL(24)
	return verifier, challenge, state, err
}

func exchangePicGoCloudToken(ctx context.Context, client *http.Client, apiBase, code, verifier string) (string, error) {
	var exchange picGoCloudTokenExchangeResponse
	if err := doPicGoCloudJSON(ctx, client, apiBase, http.MethodPost, "/api/tokens/exchange", "", map[string]string{
		"code": code, "verifier": verifier,
	}, &exchange); err != nil {
		return "", err
	}
	token := strings.TrimSpace(exchange.Token)
	if !exchange.Success || token == "" {
		if strings.TrimSpace(exchange.Message) != "" {
			return "", errors.New(strings.TrimSpace(exchange.Message))
		}
		return "", errors.New("PicGo Cloud sign-in did not return a token")
	}
	return token, nil
}

func picGoCloudLoginPage(success bool, message string) string {
	title := "PicGo Cloud 登录失败"
	color := "#cf4545"
	if success {
		title = "PicGo Cloud 登录成功"
		color = "#159a67"
	}
	return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>` + title + `</title><style>body{font-family:system-ui,"Microsoft YaHei",sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f7f4;color:#1f2924}.card{width:min(420px,calc(100% - 48px));padding:36px;border-radius:18px;background:#fff;box-shadow:0 18px 60px #19352a22;text-align:center}h1{margin:0 0 12px;color:` + color + `;font-size:24px}p{margin:0;color:#66716b;line-height:1.7}</style></head><body><main class="card"><h1>` + title + `</h1><p>` + html.EscapeString(message) + `</p></main></body></html>`
}

type picGoCloudLoginResult struct {
	status PicGoCloudStatus
	err    error
}

func (a *App) LoginPicGoCloud() (PicGoCloudStatus, error) {
	if !a.picGoCloudLoginMu.TryLock() {
		return PicGoCloudStatus{}, errors.New("PicGo Cloud sign-in is already in progress")
	}
	defer a.picGoCloudLoginMu.Unlock()

	verifier, challenge, loginState, err := picGoCloudPKCE()
	if err != nil {
		return PicGoCloudStatus{}, err
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return PicGoCloudStatus{}, errors.New("unable to start the secure PicGo Cloud sign-in callback")
	}
	defer listener.Close()
	callbackURL := fmt.Sprintf("http://127.0.0.1:%d/auth/callback", listener.Addr().(*net.TCPAddr).Port)
	resultChannel := make(chan picGoCloudLoginResult, 1)
	var callbackOnce sync.Once
	mux := http.NewServeMux()
	mux.HandleFunc("/auth/callback", func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Query().Get("state") != loginState {
			http.Error(response, "Invalid sign-in state", http.StatusForbidden)
			return
		}
		code := strings.TrimSpace(request.URL.Query().Get("code"))
		if code == "" {
			http.Error(response, "Missing sign-in code", http.StatusBadRequest)
			return
		}
		callbackOnce.Do(func() {
			ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
			defer cancel()
			client := picGoCloudHTTPClient(25 * time.Second)
			defer client.CloseIdleConnections()
			token, exchangeErr := exchangePicGoCloudToken(ctx, client, picGoCloudAPIBaseURL, code, verifier)
			if exchangeErr == nil {
				var status PicGoCloudStatus
				status, exchangeErr = picGoCloudStatus(ctx, client, picGoCloudAPIBaseURL, token)
				if exchangeErr == nil {
					exchangeErr = a.writePicGoCloudToken(token)
				}
				if exchangeErr == nil {
					response.Header().Set("Content-Type", "text/html; charset=utf-8")
					_, _ = io.WriteString(response, picGoCloudLoginPage(true, "可以关闭此页面，返回轻阅 Markdown。"))
					resultChannel <- picGoCloudLoginResult{status: status}
					return
				}
			}
			response.Header().Set("Content-Type", "text/html; charset=utf-8")
			response.WriteHeader(http.StatusBadGateway)
			_, _ = io.WriteString(response, picGoCloudLoginPage(false, exchangeErr.Error()))
			resultChannel <- picGoCloudLoginResult{err: exchangeErr}
		})
	})
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() { _ = server.Serve(listener) }()

	authURL, _ := url.Parse(picGoCloudLoginBaseURL)
	query := authURL.Query()
	query.Set("callback", callbackURL)
	query.Set("state", loginState)
	query.Set("challenge", challenge)
	authURL.RawQuery = query.Encode()
	if err := a.OpenExternal(authURL.String()); err != nil {
		_ = server.Close()
		return PicGoCloudStatus{}, err
	}

	var result picGoCloudLoginResult
	select {
	case result = <-resultChannel:
	case <-time.After(3 * time.Minute):
		result.err = errors.New("PicGo Cloud sign-in timed out")
	}
	shutdownContext, cancelShutdown := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelShutdown()
	_ = server.Shutdown(shutdownContext)
	return result.status, result.err
}

func (a *App) LogoutPicGoCloud() (ImageUploadSettings, error) {
	if err := a.writePicGoCloudToken(""); err != nil {
		return ImageUploadSettings{}, err
	}
	if _, err := a.updatePreferences(func(prefs *Preferences) {
		if normaliseImageUploadMode(prefs.ImageUploadMode) == imageUploadModePicGoCloud {
			prefs.ImageUploadMode = imageUploadModeLocal
		}
	}); err != nil {
		return ImageUploadSettings{}, err
	}
	return a.GetImageUploadSettings()
}

func newPicGoRequest(ctx context.Context, method, serverURL, endpoint, secret string, body io.Reader) (*http.Request, error) {
	base, err := normalisePicGoServerURL(serverURL)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, method, base+endpoint, body)
	if err != nil {
		return nil, err
	}
	secret, err = normalisePicGoSecret(secret)
	if err != nil {
		return nil, err
	}
	if secret != "" {
		request.Header.Set("Authorization", "Bearer "+secret)
	}
	return request, nil
}

func (a *App) TestPicGo(input ImageUploadSettingsInput) error {
	settings, secret, err := a.effectivePicGoSettings(input)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	request, err := newPicGoRequest(ctx, http.MethodPost, settings.ServerURL, "/heartbeat", secret, nil)
	if err != nil {
		return err
	}
	client := picGoHTTPClient(4 * time.Second)
	defer client.CloseIdleConnections()
	response, err := client.Do(request)
	if err != nil {
		return errors.New("unable to connect to the local PicGo server")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("PicGo heartbeat returned HTTP %d", response.StatusCode)
	}
	var heartbeat picGoHeartbeatResponse
	if err := json.NewDecoder(io.LimitReader(response.Body, maxPicGoResponseSize)).Decode(&heartbeat); err != nil || !heartbeat.Success {
		return errors.New("the local service did not return a valid PicGo heartbeat")
	}
	return nil
}

func imageAssetForUpload(currentFile, imagePath string) (string, []byte, string, error) {
	documentPath, err := filepath.Abs(filepath.Clean(currentFile))
	if err != nil || strings.TrimSpace(currentFile) == "" {
		return "", nil, "", errors.New("document path is invalid")
	}
	documentDirectory := filepath.Dir(documentPath)
	resolved, err := resolveLocalImagePath(imagePath, documentDirectory)
	if err != nil {
		return "", nil, "", err
	}
	assetsDirectory := filepath.Join(documentDirectory, "assets")
	realAssetsDirectory, err := filepath.EvalSymlinks(assetsDirectory)
	if err != nil {
		return "", nil, "", err
	}
	realResolved, err := filepath.EvalSymlinks(resolved)
	if err != nil {
		return "", nil, "", err
	}
	resolved = realResolved
	relative, err := filepath.Rel(realAssetsDirectory, resolved)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
		return "", nil, "", errors.New("only images copied to the document assets folder can be uploaded")
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", nil, "", err
	}
	if info.IsDir() || info.Size() > maxImportedImageSize {
		return "", nil, "", errors.New("image is a directory or exceeds the 25 MB limit")
	}
	data, err := os.ReadFile(resolved)
	if err != nil {
		return "", nil, "", err
	}
	extension := strings.ToLower(filepath.Ext(resolved))
	contentType := strings.Split(http.DetectContentType(data), ";")[0]
	if extension == ".svg" {
		preview := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(string(data[:min(len(data), 4096)]), "\ufeff")))
		if !strings.Contains(preview, "<svg") {
			return "", nil, "", errors.New("selected SVG does not contain an SVG root element")
		}
		contentType = "image/svg+xml"
	} else if !strings.HasPrefix(contentType, "image/") {
		return "", nil, "", errors.New("selected file is not a supported image")
	}
	return filepath.Base(resolved), data, contentType, nil
}

func validatePicGoCloudUploadURL(rawURL string, allowHTTP bool) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" {
		return "", errors.New("PicGo Cloud returned an invalid upload address")
	}
	if parsed.Scheme != "https" && !(allowHTTP && parsed.Scheme == "http") {
		return "", errors.New("PicGo Cloud returned an unsafe upload address")
	}
	if address := net.ParseIP(parsed.Hostname()); address != nil && !allowHTTP && (address.IsLoopback() || address.IsPrivate() || address.IsUnspecified()) {
		return "", errors.New("PicGo Cloud returned an unsafe upload host")
	}
	return parsed.String(), nil
}

func putPicGoCloudBytes(ctx context.Context, client *http.Client, rawURL, method string, headers map[string]string, data []byte, contentType string, allowHTTP bool, onProgress func(done, total int64)) (string, error) {
	uploadURL, err := validatePicGoCloudUploadURL(rawURL, allowHTTP)
	if err != nil {
		return "", err
	}
	if method == "" {
		method = http.MethodPut
	}
	if !strings.EqualFold(method, http.MethodPut) {
		return "", errors.New("PicGo Cloud requested an unsupported upload method")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPut, uploadURL, newUploadProgressReader(bytes.NewReader(data), int64(len(data)), onProgress))
	if err != nil {
		return "", err
	}
	request.ContentLength = int64(len(data))
	hasContentType := false
	for name, value := range headers {
		if strings.ContainsAny(name+value, "\r\n") {
			return "", errors.New("PicGo Cloud returned an invalid upload header")
		}
		request.Header.Set(name, value)
		if strings.EqualFold(name, "Content-Type") {
			hasContentType = true
		}
	}
	if !hasContentType && contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	response, err := client.Do(request)
	if err != nil {
		return "", errors.New("unable to upload the image to PicGo Cloud storage")
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, maxPicGoResponseSize))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("PicGo Cloud storage returned HTTP %d", response.StatusCode)
	}
	return strings.TrimSpace(response.Header.Get("ETag")), nil
}

func completePicGoCloudAlbumItem(ctx context.Context, client *http.Client, apiBase, token, objectKey, publicID, filename string) (string, error) {
	var complete picGoCloudCompleteResponse
	if err := doPicGoCloudJSON(ctx, client, apiBase, http.MethodPost, "/api/album-items/complete", token, map[string]string{
		"objectKey": objectKey,
		"publicId":  publicID,
		"filename":  filename,
	}, &complete); err != nil {
		return "", err
	}
	imageURL := strings.TrimSpace(complete.Data.Item.ImageURL)
	if !complete.Success || imageURL == "" {
		if strings.TrimSpace(complete.Message) != "" {
			return "", errors.New(strings.TrimSpace(complete.Message))
		}
		return "", errors.New("PicGo Cloud did not return an uploaded image URL")
	}
	parsed, err := url.Parse(imageURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
		return "", errors.New("PicGo Cloud returned an unsafe image URL")
	}
	return imageURL, nil
}

func uploadSmallImageToPicGoCloud(ctx context.Context, client *http.Client, apiBase, token, filename string, data []byte, contentType string, onProgress func(done, total int64)) (string, error) {
	var presign picGoCloudPresignResponse
	if err := doPicGoCloudJSON(ctx, client, apiBase, http.MethodPost, "/api/upload/presign", token, map[string]string{
		"filename":    filename,
		"contentType": contentType,
	}, &presign); err != nil {
		return "", err
	}
	if !presign.Success || presign.ObjectKey == "" || presign.PublicID == "" || presign.UploadURL == "" {
		if strings.TrimSpace(presign.Message) != "" {
			return "", errors.New(strings.TrimSpace(presign.Message))
		}
		return "", errors.New("PicGo Cloud returned an invalid upload authorization")
	}
	allowHTTP := !strings.EqualFold(strings.TrimRight(apiBase, "/"), picGoCloudAPIBaseURL)
	if _, err := putPicGoCloudBytes(ctx, client, presign.UploadURL, presign.Method, presign.Headers, data, contentType, allowHTTP, onProgress); err != nil {
		return "", err
	}
	return completePicGoCloudAlbumItem(ctx, client, apiBase, token, presign.ObjectKey, presign.PublicID, filename)
}

func uploadLargeImageToPicGoCloud(ctx context.Context, client *http.Client, apiBase, token, filename string, data []byte, contentType string, onProgress func(done, total int64)) (string, error) {
	var initiate picGoCloudMultipartInitiateResponse
	if err := doPicGoCloudJSON(ctx, client, apiBase, http.MethodPost, "/api/upload/multipart/initiate", token, map[string]any{
		"filename":    filename,
		"contentType": contentType,
		"sizeBytes":   len(data),
	}, &initiate); err != nil {
		return "", err
	}
	if !initiate.Success || initiate.UploadID == "" || initiate.ObjectKey == "" || initiate.PublicID == "" || initiate.PartSize <= 0 || initiate.PartCount <= 0 {
		if strings.TrimSpace(initiate.Message) != "" {
			return "", errors.New(strings.TrimSpace(initiate.Message))
		}
		return "", errors.New("PicGo Cloud returned an invalid multipart upload authorization")
	}
	partsByNumber := make(map[int]picGoCloudMultipartPart, len(initiate.Parts))
	for _, part := range initiate.Parts {
		partsByNumber[part.PartNumber] = part
	}
	completed := make([]picGoCloudCompletedPart, 0, initiate.PartCount)
	allowHTTP := !strings.EqualFold(strings.TrimRight(apiBase, "/"), picGoCloudAPIBaseURL)
	for partNumber := 1; partNumber <= initiate.PartCount; partNumber++ {
		part, exists := partsByNumber[partNumber]
		if !exists {
			return "", errors.New("PicGo Cloud omitted a multipart upload address")
		}
		start := (partNumber - 1) * initiate.PartSize
		end := min(start+initiate.PartSize, len(data))
		if start < 0 || start >= len(data) || end <= start {
			return "", errors.New("PicGo Cloud returned invalid multipart boundaries")
		}
		partProgress := func(done, _ int64) {
			if onProgress != nil {
				onProgress(int64(start)+done, int64(len(data)))
			}
		}
		etag, err := putPicGoCloudBytes(ctx, client, part.URL, part.Method, part.Headers, data[start:end], "", allowHTTP, partProgress)
		if err != nil {
			return "", err
		}
		if etag == "" {
			return "", errors.New("PicGo Cloud multipart upload did not return an ETag")
		}
		completed = append(completed, picGoCloudCompletedPart{PartNumber: partNumber, ETag: etag})
	}
	var multipartComplete struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	if err := doPicGoCloudJSON(ctx, client, apiBase, http.MethodPost, "/api/upload/multipart/complete", token, map[string]any{
		"uploadId":  initiate.UploadID,
		"objectKey": initiate.ObjectKey,
		"parts":     completed,
	}, &multipartComplete); err != nil {
		return "", err
	}
	if !multipartComplete.Success {
		return "", errors.New(strings.TrimSpace(multipartComplete.Message))
	}
	return completePicGoCloudAlbumItem(ctx, client, apiBase, token, initiate.ObjectKey, initiate.PublicID, filename)
}

func uploadImageToPicGoCloud(ctx context.Context, client *http.Client, apiBase, token, filename string, data []byte, contentType string, onProgress ...func(done, total int64)) (string, error) {
	var progress func(done, total int64)
	if len(onProgress) > 0 {
		progress = onProgress[0]
	}
	if len(data) >= picGoCloudMultipartMinimum {
		return uploadLargeImageToPicGoCloud(ctx, client, apiBase, token, filename, data, contentType, progress)
	}
	return uploadSmallImageToPicGoCloud(ctx, client, apiBase, token, filename, data, contentType, progress)
}

func (a *App) UploadImageToPicGoCloud(currentFile, imagePath string) (string, error) {
	prefs, err := a.readPreferences()
	if err != nil {
		return "", err
	}
	if normaliseImageUploadMode(prefs.ImageUploadMode) != imageUploadModePicGoCloud {
		return "", errors.New("PicGo Cloud image uploading is disabled")
	}
	token := a.readPicGoCloudToken()
	if token == "" {
		return "", errors.New("PicGo Cloud sign-in is required")
	}
	name, data, contentType, err := imageAssetForUpload(currentFile, imagePath)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	client := picGoCloudHTTPClient(2 * time.Minute)
	defer client.CloseIdleConnections()
	total := int64(len(data))
	a.emitImageUploadProgress("preparing", 0, total)
	uploadedURL, err := uploadImageToPicGoCloud(ctx, client, picGoCloudAPIBaseURL, token, name, data, contentType, func(done, total int64) {
		a.emitImageUploadProgress("uploading", done, total)
	})
	if err == nil {
		a.emitImageUploadProgress("complete", total, total)
	} else {
		a.emitImageUploadProgress("failed", 0, total)
	}
	var apiErr *picGoCloudAPIError
	if errors.As(err, &apiErr) && apiErr.Status == http.StatusUnauthorized {
		_ = a.writePicGoCloudToken("")
	}
	return uploadedURL, err
}

func (a *App) UploadImageToPicGo(currentFile, imagePath string) (string, error) {
	prefs, err := a.readPreferences()
	if err != nil {
		return "", err
	}
	if normaliseImageUploadMode(prefs.ImageUploadMode) != imageUploadModePicGo {
		return "", errors.New("PicGo image uploading is disabled")
	}
	serverURL, err := normalisePicGoServerURL(prefs.PicGoServerURL)
	if err != nil {
		return "", err
	}
	name, data, contentType, err := imageAssetForUpload(currentFile, imagePath)
	if err != nil {
		return "", err
	}

	var payload bytes.Buffer
	writer := multipart.NewWriter(&payload)
	partHeader := make(map[string][]string)
	safeName := strings.NewReplacer(`"`, "", "\r", "", "\n", "").Replace(name)
	partHeader["Content-Disposition"] = []string{fmt.Sprintf(`form-data; name="files"; filename="%s"`, safeName)}
	partHeader["Content-Type"] = []string{contentType}
	part, err := writer.CreatePart(partHeader)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(data); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	payloadSize := int64(payload.Len())
	a.emitImageUploadProgress("preparing", 0, payloadSize)
	requestBody := newUploadProgressReader(bytes.NewReader(payload.Bytes()), payloadSize, func(done, total int64) {
		a.emitImageUploadProgress("uploading", done, total)
	})
	request, err := newPicGoRequest(ctx, http.MethodPost, serverURL, "/upload", a.readPicGoSecret(), requestBody)
	if err != nil {
		return "", err
	}
	request.ContentLength = payloadSize
	request.Header.Set("Content-Type", writer.FormDataContentType())
	client := picGoHTTPClient(30 * time.Second)
	defer client.CloseIdleConnections()
	response, err := client.Do(request)
	if err != nil {
		a.emitImageUploadProgress("failed", 0, payloadSize)
		return "", errors.New("unable to connect to the local PicGo server")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		a.emitImageUploadProgress("failed", 0, payloadSize)
		return "", fmt.Errorf("PicGo upload returned HTTP %d", response.StatusCode)
	}
	var result picGoResponse
	if err := json.NewDecoder(io.LimitReader(response.Body, maxPicGoResponseSize)).Decode(&result); err != nil {
		a.emitImageUploadProgress("failed", 0, payloadSize)
		return "", errors.New("PicGo returned an invalid upload response")
	}
	if !result.Success || len(result.Result) == 0 {
		a.emitImageUploadProgress("failed", 0, payloadSize)
		return "", errors.New("PicGo did not return an uploaded image URL")
	}
	uploadedURL := strings.TrimSpace(result.Result[0])
	parsed, err := url.Parse(uploadedURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		a.emitImageUploadProgress("failed", 0, payloadSize)
		return "", errors.New("PicGo returned an unsafe image URL")
	}
	a.emitImageUploadProgress("complete", payloadSize, payloadSize)
	return uploadedURL, nil
}
