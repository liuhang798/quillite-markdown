package main

import (
	"errors"
	"os"
)

// Safety-center inspection is strictly read-only, even if the recovered text
// already matches disk. Startup's separate deduplication must not run here.
func (a *App) GetRecoveryBackup() (*RecoverySnapshot, error) {
	a.recoveryMu.Lock()
	defer a.recoveryMu.Unlock()
	path := a.recoverySnapshotPath()
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("RECOVERY_INVALID_FILE")
	}
	snapshot, err := decodeRecoverySnapshot(path, info.Size())
	if err != nil {
		return nil, err
	}
	return &snapshot, nil
}
