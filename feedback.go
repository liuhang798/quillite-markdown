package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var feedbackEndpoint = "https://qm.ssssa.cn/api/v1/feedback"

const (
	maxFeedbackImages    = 5
	maxFeedbackImageSize = 5 << 20
)

type FeedbackSystemInfo struct {
	AppVersion    string `json:"appVersion"`
	OS            string `json:"os"`
	SystemVersion string `json:"systemVersion"`
}

type FeedbackImageSelection struct {
	Path string `json:"path"`
	Name string `json:"name"`
	Size int64  `json:"size"`
}

type FeedbackSubmission struct {
	Category   string   `json:"category"`
	Message    string   `json:"message"`
	Email      string   `json:"email"`
	Phone      string   `json:"phone"`
	ImagePaths []string `json:"imagePaths"`
}

func (a *App) GetFeedbackSystemInfo() FeedbackSystemInfo {
	return FeedbackSystemInfo{AppVersion: appVersion, OS: feedbackOS(), SystemVersion: detailedSystemVersion()}
}

func (a *App) SelectFeedbackImages() ([]FeedbackImageSelection, error) {
	a.mu.RLock()
	ctx := a.ctx
	a.mu.RUnlock()
	paths, err := wailsruntime.OpenMultipleFilesDialog(ctx, wailsruntime.OpenDialogOptions{
		Title: "选择反馈截图",
		Filters: []wailsruntime.FileFilter{
			{DisplayName: "图片文件 (*.png;*.jpg;*.jpeg;*.webp)", Pattern: "*.png;*.jpg;*.jpeg;*.webp"},
		},
	})
	if err != nil {
		return nil, err
	}
	if len(paths) > maxFeedbackImages {
		return nil, errors.New("最多只能选择 5 张图片")
	}
	result := make([]FeedbackImageSelection, 0, len(paths))
	for _, selectedPath := range paths {
		info, err := os.Stat(selectedPath)
		if err != nil {
			return nil, fmt.Errorf("无法读取图片 %s", filepath.Base(selectedPath))
		}
		if info.Size() <= 0 || info.Size() > maxFeedbackImageSize {
			return nil, fmt.Errorf("图片 %s 超过 5 MB", filepath.Base(selectedPath))
		}
		result = append(result, FeedbackImageSelection{Path: selectedPath, Name: filepath.Base(selectedPath), Size: info.Size()})
	}
	return result, nil
}

func (a *App) SubmitFeedback(input FeedbackSubmission) error {
	input.Category = strings.TrimSpace(input.Category)
	input.Message = strings.TrimSpace(input.Message)
	input.Email = strings.TrimSpace(input.Email)
	input.Phone = strings.TrimSpace(input.Phone)
	if input.Category != "feature" && input.Category != "bug" {
		return errors.New("请选择反馈类型")
	}
	if len([]rune(input.Message)) < 5 {
		return errors.New("请至少填写 5 个字的反馈说明")
	}
	if len(input.ImagePaths) > maxFeedbackImages {
		return errors.New("最多只能上传 5 张图片")
	}
	info := a.GetFeedbackSystemInfo()
	return submitFeedback(feedbackEndpoint, input, info, &http.Client{Timeout: 30 * time.Second})
}

func submitFeedback(endpoint string, input FeedbackSubmission, info FeedbackSystemInfo, client *http.Client) error {
	if endpoint == "" || client == nil {
		return errors.New("反馈服务地址不可用")
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	fields := map[string]string{
		"category": input.Category, "message": input.Message, "email": input.Email, "phone": input.Phone,
		"appVersion": info.AppVersion, "os": info.OS, "systemVersion": info.SystemVersion,
	}
	for name, value := range fields {
		if err := writer.WriteField(name, value); err != nil {
			return err
		}
	}
	var total int64
	for _, imagePath := range input.ImagePaths {
		cleanPath, err := filepath.Abs(filepath.Clean(imagePath))
		if err != nil {
			return errors.New("图片路径无效")
		}
		info, err := os.Stat(cleanPath)
		if err != nil || !info.Mode().IsRegular() {
			return fmt.Errorf("无法读取图片 %s", filepath.Base(cleanPath))
		}
		if info.Size() <= 0 || info.Size() > maxFeedbackImageSize {
			return fmt.Errorf("图片 %s 超过 5 MB", filepath.Base(cleanPath))
		}
		total += info.Size()
		if total > 15<<20 {
			return errors.New("图片总大小不能超过 15 MB")
		}
		file, err := os.Open(cleanPath)
		if err != nil {
			return fmt.Errorf("无法读取图片 %s", filepath.Base(cleanPath))
		}
		part, err := writer.CreateFormFile("images", filepath.Base(cleanPath))
		if err == nil {
			_, err = io.Copy(part, io.LimitReader(file, maxFeedbackImageSize+1))
		}
		file.Close()
		if err != nil {
			return fmt.Errorf("无法添加图片 %s", filepath.Base(cleanPath))
		}
	}
	if err := writer.Close(); err != nil {
		return err
	}
	request, err := http.NewRequest(http.MethodPost, endpoint, &body)
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("User-Agent", "QuilliteMarkdown/"+appVersion)
	response, err := client.Do(request)
	if err != nil {
		return errors.New("无法连接反馈服务，请检查网络后重试")
	}
	defer response.Body.Close()
	if response.StatusCode >= 200 && response.StatusCode < 300 {
		return nil
	}
	var failure struct {
		Error string `json:"error"`
	}
	_ = json.NewDecoder(io.LimitReader(response.Body, 16<<10)).Decode(&failure)
	if failure.Error == "" {
		failure.Error = "提交失败，请稍后重试"
	}
	return errors.New(failure.Error)
}

func feedbackOS() string {
	if goruntime.GOOS == "darwin" {
		return "macos"
	}
	if goruntime.GOOS == "windows" || goruntime.GOOS == "linux" {
		return goruntime.GOOS
	}
	return "linux"
}

func detailedSystemVersion() string {
	var value string
	switch goruntime.GOOS {
	case "windows":
		// Do not use `cmd /C ver` here. Its output follows the active Windows
		// OEM code page (for example GBK on Simplified Chinese systems), while
		// Wails expects UTF-8 strings. Passing those bytes through directly made
		// labels such as "版本" appear as replacement characters in the UI.
		value = windowsSystemVersion()
	case "darwin":
		if output, err := feedbackSystemCommand("sw_vers", "-productVersion").CombinedOutput(); err == nil {
			value = "macOS " + string(output)
		}
	case "linux":
		if content, err := os.ReadFile("/etc/os-release"); err == nil {
			for _, line := range strings.Split(string(content), "\n") {
				if strings.HasPrefix(line, "PRETTY_NAME=") {
					value = strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), `"`)
					break
				}
			}
		}
	}
	value = strings.Join(strings.Fields(value), " ")
	if value == "" {
		value = goruntime.GOOS
	}
	return value + " · " + goruntime.GOARCH
}
