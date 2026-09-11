package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const maxRecoverySnapshotSize = 24 * 1024 * 1024

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

func (a *App) recoverySnapshotPath() string {
	return filepath.Join(filepath.Dir(a.preferencePath()), "document-recovery.json")
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
	data, err := json.Marshal(snapshot)
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
	if info.IsDir() || info.Size() > maxRecoverySnapshotSize+4096 {
		return nil, errors.New("recovery snapshot is too large")
	}
	data, err := os.ReadFile(recoveryPath)
	if err != nil {
		return nil, err
	}
	var snapshot RecoverySnapshot
	if err := json.Unmarshal(data, &snapshot); err != nil {
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
