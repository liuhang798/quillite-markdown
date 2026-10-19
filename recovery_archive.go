package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const maxRecoveryArchiveBytes int64 = 256 * 1024 * 1024
const maxRecoveryArchives = 64

type RecoveryArchive struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	UpdatedAt string `json:"updatedAt"`
	Size      int    `json:"size"`
}

func (a *App) recoveryArchiveDirectory() string {
	return filepath.Join(filepath.Dir(a.preferencePath()), "recovery-archives")
}

// No archive is automatically replaced or deleted. A failed preservation must
// prevent clearing/overwriting the original startup snapshot.
func (a *App) captureStartupRecoveryLocked() error {
	if a.startupRecoveryReady {
		return nil
	}
	path := a.recoverySnapshotPath()
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		a.startupRecoveryReady = true
		return nil
	}
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return errors.New("RECOVERY_INVALID_FILE")
	}
	snapshot, err := decodeRecoverySnapshot(path, info.Size())
	if err != nil {
		return err
	}
	if strings.TrimSpace(snapshot.Path) == "" || strings.TrimSpace(snapshot.UpdatedAt) == "" {
		return errors.New("RECOVERY_INVALID_SNAPSHOT")
	}
	// Only a known non-conflicting copy equal to disk is already resolved.
	diskInfo, statErr := os.Stat(snapshot.Path)
	if !snapshot.Conflict && statErr == nil && diskInfo.Mode().IsRegular() && diskInfo.Size() == int64(len(snapshot.Content)) {
		if disk, readErr := os.ReadFile(snapshot.Path); readErr == nil && string(disk) == snapshot.Content {
			a.startupRecoveryReady = true
			return nil
		}
	}
	data, err := encodeRecoverySnapshot(snapshot)
	if err != nil {
		return err
	}
	sum := sha256.Sum256(data)
	id := hex.EncodeToString(sum[:])
	dir := a.recoveryArchiveDirectory()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	if err := validateRecoveryArchiveDirectory(dir); err != nil {
		return err
	}
	target := filepath.Join(dir, id+".qmr")
	if existing, err := readRecoveryArchiveFile(target, id); err == nil {
		if existing.Content != snapshot.Content {
			return errors.New("RECOVERY_ARCHIVE_MISMATCH")
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	} else {
		entries, err := os.ReadDir(dir)
		if err != nil {
			return err
		}
		var total int64
		for _, entry := range entries {
			info, err := entry.Info()
			if err != nil {
				return err
			}
			total += info.Size()
		}
		if len(entries) >= maxRecoveryArchives || total+int64(len(data)) > maxRecoveryArchiveBytes {
			return errors.New("RECOVERY_ARCHIVE_LIMIT")
		}
		file, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if err != nil {
			return err
		}
		_, writeErr := file.Write(data)
		if writeErr == nil {
			writeErr = file.Sync()
		}
		closeErr := file.Close()
		if writeErr != nil {
			return writeErr
		}
		if closeErr != nil {
			return closeErr
		}
		// Keep partial/invalid material on any failure, alongside the original.
		if _, err := readRecoveryArchiveFile(target, id); err != nil {
			return err
		}
	}
	a.startupRecovery = &snapshot
	a.startupRecoveryReady = true
	return nil
}

func validateRecoveryArchiveDirectory(dir string) error {
	info, err := os.Lstat(dir)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return errors.New("RECOVERY_INVALID_DIRECTORY")
	}
	return nil
}

func readRecoveryArchiveFile(path, id string) (*RecoverySnapshot, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > maxRecoverySnapshotSize+maxRecoveryMetadataSize {
		return nil, errors.New("RECOVERY_INVALID_ARCHIVE")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxRecoverySnapshotSize+maxRecoveryMetadataSize+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxRecoverySnapshotSize+maxRecoveryMetadataSize {
		return nil, errors.New("RECOVERY_INVALID_ARCHIVE")
	}
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != id {
		return nil, errors.New("RECOVERY_ARCHIVE_MISMATCH")
	}
	snapshot, err := decodeRecoverySnapshotReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	return &snapshot, nil
}

// Stable for this process even if the current editor's recovery slot changes.
func (a *App) GetStartupRecoverySnapshot() (*RecoverySnapshot, error) {
	a.recoveryMu.Lock()
	defer a.recoveryMu.Unlock()
	if err := a.captureStartupRecoveryLocked(); err != nil {
		return nil, err
	}
	if a.startupRecovery == nil {
		return nil, nil
	}
	snapshot := *a.startupRecovery
	return &snapshot, nil
}

func (a *App) ListRecoveryArchives() ([]RecoveryArchive, error) {
	a.recoveryMu.Lock()
	defer a.recoveryMu.Unlock()
	dir := a.recoveryArchiveDirectory()
	if err := validateRecoveryArchiveDirectory(dir); errors.Is(err, os.ErrNotExist) {
		return []RecoveryArchive{}, nil
	} else if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	if len(entries) > maxRecoveryArchives {
		return nil, errors.New("RECOVERY_ARCHIVE_LIMIT")
	}
	result := []RecoveryArchive{}
	var total int64
	for _, entry := range entries {
		id := strings.TrimSuffix(entry.Name(), ".qmr")
		if !validRecoveryArchiveID(id) || !strings.HasSuffix(entry.Name(), ".qmr") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return nil, err
		}
		total += info.Size()
		if total > maxRecoveryArchiveBytes {
			return nil, errors.New("RECOVERY_ARCHIVE_LIMIT")
		}
		snapshot, err := readRecoveryArchiveFile(filepath.Join(dir, entry.Name()), id)
		if err != nil {
			return nil, err
		}
		result = append(result, RecoveryArchive{ID: id, Name: snapshot.Name, UpdatedAt: snapshot.UpdatedAt, Size: len(snapshot.Content)})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].UpdatedAt > result[j].UpdatedAt })
	return result, nil
}

func validRecoveryArchiveID(id string) bool {
	if len(id) != 64 || strings.ToLower(id) != id {
		return false
	}
	_, err := hex.DecodeString(id)
	return err == nil
}

func (a *App) ReadRecoveryArchive(id string) (*RecoverySnapshot, error) {
	a.recoveryMu.Lock()
	defer a.recoveryMu.Unlock()
	if !validRecoveryArchiveID(id) {
		return nil, errors.New("RECOVERY_INVALID_ID")
	}
	if err := validateRecoveryArchiveDirectory(a.recoveryArchiveDirectory()); err != nil {
		return nil, err
	}
	return readRecoveryArchiveFile(filepath.Join(a.recoveryArchiveDirectory(), id+".qmr"), id)
}
