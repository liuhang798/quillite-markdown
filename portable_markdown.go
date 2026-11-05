package main

import (
	"encoding/base64"
	"errors"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

func (a *App) embedsImages() bool {
	p, err := a.readPreferences()
	return err == nil && normaliseImageUploadMode(p.ImageUploadMode) == imageUploadModeEmbedded
}

func validateEmbeddedRaster(data []byte, declared string) error {
	actual := http.DetectContentType(data)
	switch actual {
	case "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp":
	default:
		return errors.New("IMAGE_EMBED_TYPE: only raster images can be embedded")
	}
	if actual != declared {
		return errors.New("IMAGE_EMBED_TYPE: image contents do not match its type")
	}
	return nil
}

func (a *App) embeddedImage(ref, directory string) (string, error) {
	var dataURL string
	path, err := resolveLocalImagePath(ref, directory)
	if err != nil {
		return "", err
	}
	read := func(accessible string) (err error) { dataURL, err = a.ReadImageData(accessible, directory); return err }
	_, found, err := a.withMacSecurityScopedPath(path, read)
	if !found {
		err = read(path)
	}
	if err != nil {
		return "", err
	}
	meta, encoded, _ := strings.Cut(dataURL, ",")
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	if err = validateEmbeddedRaster(data, strings.TrimSuffix(strings.TrimPrefix(meta, "data:"), ";base64")); err != nil {
		return "", err
	}
	return dataURL, nil
}

func (a *App) ReadPortableImage(ref, directory string) (string, error) {
	if parsed, err := url.Parse(ref); err == nil && strings.EqualFold(parsed.Scheme, "file") && parsed.Host != "" && !strings.EqualFold(parsed.Host, "localhost") {
		return "", errors.New("PORTABLE_UNSUPPORTED_IMAGE") // Do not misread a remote host as a local path.
	}
	if strings.HasPrefix(strings.ToLower(ref), "data:image/") {
		if len(ref) > int(maxImportedImageSize*4/3)+256 {
			return "", errors.New("IMAGE_EMBED_TYPE: image exceeds 25 MiB")
		}
		meta, encoded, ok := strings.Cut(ref, ",")
		if !ok || !strings.HasSuffix(strings.ToLower(meta), ";base64") {
			return "", errors.New("IMAGE_EMBED_TYPE")
		}
		data, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil || int64(len(data)) > maxImportedImageSize {
			return "", errors.New("IMAGE_EMBED_TYPE")
		}
		if err = validateEmbeddedRaster(data, strings.TrimSuffix(strings.TrimPrefix(strings.ToLower(meta), "data:"), ";base64")); err != nil {
			return "", err
		}
		return ref, nil
	}
	data, err := a.embeddedImage(ref, directory)
	if err != nil && !strings.Contains(err.Error(), "IMAGE_EMBED_TYPE") {
		return "", errors.New("PORTABLE_IMAGE_MISSING")
	}
	return data, err
}

func readImageBytes(path string) ([]byte, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > maxImportedImageSize {
		return nil, errors.New("image is not a regular file or exceeds the 25 MB limit")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	info, err = file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		return nil, errors.New("image is not a regular file")
	}
	data, err := io.ReadAll(io.LimitReader(file, maxImportedImageSize+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxImportedImageSize {
		return nil, errors.New("image exceeds the 25 MB limit")
	}
	return data, nil
}

func (a *App) ExportPortableMarkdown(sourcePath, content string) (string, error) {
	if len(content) > maxSupportedDocumentBytes {
		return "", errors.New("DOCUMENT_TOO_LARGE")
	}
	origin := a.bundleResourceOrigin(sourcePath)
	options := a.documentSaveDialogOptions(origin)
	options.DefaultFilename = strings.TrimSuffix(filepath.Base(origin), filepath.Ext(origin)) + "-portable.md"
	options.Filters = []wailsruntime.FileFilter{{DisplayName: a.text("portableMarkdown"), Pattern: "*.md"}}
	target, err := wailsruntime.SaveFileDialog(a.ctx, options)
	if err != nil || target == "" {
		return "", err
	}
	_ = a.rememberMacSecurityScopedPath(target, false)
	return a.exportPortableMarkdownTo(sourcePath, target, content)
}

func (a *App) exportPortableMarkdownTo(sourcePath, target, content string) (string, error) {
	if len(content) > maxSupportedDocumentBytes {
		return "", errors.New("DOCUMENT_TOO_LARGE")
	}
	if err := a.validateDocumentCopyTarget(sourcePath, target); err != nil {
		return "", err
	}
	write := func(path string) error {
		if err := a.validateDocumentCopyTarget(sourcePath, path); err != nil {
			return err
		}
		if isEditableBundlePath(path) {
			return textPackError("BUNDLE_SESSION_REQUIRED")
		}
		if err := validateTextPackPath(filepath.Base(path), false); err != nil {
			return err
		}
		// Anchor publication to the verified directory handle. A parent alias
		// swap after validation cannot redirect this create-only write into an
		// original package or a managed recovery workspace.
		root, err := textPackOpenRoot(filepath.Dir(path))
		if err != nil {
			return err
		}
		defer root.Close()
		return textPackWriteNew(root, filepath.Base(path), []byte(content))
	}
	_, found, err := a.withMacSecurityScopedPath(target, write)
	if !found {
		err = write(target)
	}
	if err != nil {
		return "", err
	}
	a.rememberSaveDirectory(filepath.Dir(target))
	return target, nil
}
