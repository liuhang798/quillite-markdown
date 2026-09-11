package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	maxRecoverySnapshotSize = 24 * 1024 * 1024
	maxRecoveryMetadataSize = 64 * 1024
	recoverySnapshotMagic   = "QMR1\n"
)

// RecoverySnapshot is an emergency copy of the active editor buffer. It is
// deliberately stored outside preferences so a large document cannot bloat or
// corrupt ordinary application settings.
type RecoverySnapshot struct {
	Path      string `json:"path"`
	Name      string `json:"name"`
	Directory string `json:"directory"`
	Content   string `json:"content"`
	UpdatedAt string `json:"updatedAt"`
}

type RecoverySnapshotInput struct {
	Path      string `json:"path"`
	Name      string `json:"name"`
	Directory string `json:"directory"`
	Content   string `json:"content"`
}

type recoverySnapshotMetadata struct {
	Path      string `json:"path"`
	Name      string `json:"name"`
	Directory string `json:"directory"`
	UpdatedAt string `json:"updatedAt"`
	Size      int64  `json:"size"`
}

func (a *App) recoverySnapshotPath() string {
	return filepath.Join(filepath.Dir(a.preferencePath()), "document-recovery.json")
}

func encodeRecoverySnapshot(snapshot RecoverySnapshot) ([]byte, error) {
	metadata := recoverySnapshotMetadata{
		Path: snapshot.Path, Name: snapshot.Name, Directory: snapshot.Directory,
		UpdatedAt: snapshot.UpdatedAt, Size: int64(len(snapshot.Content)),
	}
	var output bytes.Buffer
	output.WriteString(recoverySnapshotMagic)
	if err := json.NewEncoder(&output).Encode(metadata); err != nil {
		return nil, err
	}
	output.WriteString(snapshot.Content)
	return output.Bytes(), nil
}

func decodeRecoverySnapshot(path string, fileSize int64) (RecoverySnapshot, error) {
	file, err := os.Open(path)
	if err != nil {
		return RecoverySnapshot{}, err
	}
	defer file.Close()
	reader := bufio.NewReaderSize(file, maxRecoveryMetadataSize+1)
	prefix, peekErr := reader.Peek(len(recoverySnapshotMagic))
	if peekErr == nil && string(prefix) == recoverySnapshotMagic {
		_, _ = reader.Discard(len(recoverySnapshotMagic))
		line, readErr := reader.ReadSlice('\n')
		if readErr != nil || len(line) > maxRecoveryMetadataSize {
			return RecoverySnapshot{}, errors.New("recovery snapshot metadata is invalid")
		}
		var metadata recoverySnapshotMetadata
		if err := json.Unmarshal(line, &metadata); err != nil {
			return RecoverySnapshot{}, err
		}
		if metadata.Size < 0 || metadata.Size > maxRecoverySnapshotSize {
			return RecoverySnapshot{}, errors.New("recovery snapshot is too large")
		}
		content, err := io.ReadAll(io.LimitReader(reader, maxRecoverySnapshotSize+1))
		if err != nil {
			return RecoverySnapshot{}, err
		}
		if int64(len(content)) != metadata.Size {
			return RecoverySnapshot{}, errors.New("recovery snapshot content size is invalid")
		}
		return RecoverySnapshot{Path: metadata.Path, Name: metadata.Name, Directory: metadata.Directory, Content: string(content), UpdatedAt: metadata.UpdatedAt}, nil
	}

	// Pre-2.7.3 development builds stored one JSON object. Account for the
	// worst-case sixfold JSON escaping without weakening the decoded limit.
	legacyLimit := int64(maxRecoverySnapshotSize*6 + maxRecoveryMetadataSize)
	if fileSize > legacyLimit {
		return RecoverySnapshot{}, errors.New("recovery snapshot is too large")
	}
	var snapshot RecoverySnapshot
	if err := json.NewDecoder(io.LimitReader(reader, legacyLimit+1)).Decode(&snapshot); err != nil {
		return RecoverySnapshot{}, err
	}
	if len(snapshot.Content) > maxRecoverySnapshotSize {
		return RecoverySnapshot{}, errors.New("recovery snapshot is too large")
	}
	return snapshot, nil
}

func (a *App) SaveRecoverySnapshot(input RecoverySnapshotInput) error {
	a.recoveryMu.Lock()
	defer a.recoveryMu.Unlock()

	path := strings.TrimSpace(input.Path)
	if path == "" {
		return errors.New("recovery document path is empty")
	}
	if len(input.Content) > maxRecoverySnapshotSize {
		return fmt.Errorf("recovery document exceeds %d bytes", maxRecoverySnapshotSize)
	}
	snapshot := RecoverySnapshot{
		Path:      filepath.Clean(path),
		Name:      strings.TrimSpace(input.Name),
		Directory: strings.TrimSpace(input.Directory),
		Content:   input.Content,
		UpdatedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
	if snapshot.Name == "" {
		snapshot.Name = filepath.Base(snapshot.Path)
	}
	if snapshot.Directory == "" {
		snapshot.Directory = filepath.Dir(snapshot.Path)
	}
	data, err := encodeRecoverySnapshot(snapshot)
	if err != nil {
		return err
	}
	return writeFileAtomically(a.recoverySnapshotPath(), data)
}

func (a *App) GetRecoverySnapshot() (*RecoverySnapshot, error) {
	a.recoveryMu.Lock()
	defer a.recoveryMu.Unlock()

	recoveryPath := a.recoverySnapshotPath()
	info, err := os.Stat(recoveryPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if info.IsDir() {
		return nil, errors.New("recovery snapshot is too large")
	}
	snapshot, err := decodeRecoverySnapshot(recoveryPath, info.Size())
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(snapshot.Path) == "" || strings.TrimSpace(snapshot.UpdatedAt) == "" {
		return nil, errors.New("recovery snapshot is incomplete")
	}
	// A crash can happen after an automatic save but before the frontend clears
	// the snapshot. Do not offer a recovery copy that is already on disk.
	currentPath := filepath.Clean(snapshot.Path)
	currentInfo, statErr := os.Stat(currentPath)
	if statErr == nil && !currentInfo.IsDir() && currentInfo.Size() == int64(len(snapshot.Content)) {
		current, readErr := os.ReadFile(currentPath)
		if readErr != nil || string(current) != snapshot.Content {
			return &snapshot, nil
		}
		if removeErr := os.Remove(a.recoverySnapshotPath()); removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
			return nil, removeErr
		}
		return nil, nil
	}
	return &snapshot, nil
}

func (a *App) ClearRecoverySnapshot() error {
	a.recoveryMu.Lock()
	defer a.recoveryMu.Unlock()
	if err := os.Remove(a.recoverySnapshotPath()); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
