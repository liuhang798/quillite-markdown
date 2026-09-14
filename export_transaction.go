package main

import (
	"errors"
	"io"
	"os"
	"path/filepath"
)

// External converters only receive a temporary path. A failed conversion cannot
// truncate a user's existing output. Cleanup is limited to this exact temp file.
func stageExternalExport(target string, convert func(string) error) error {
	temp, err := os.CreateTemp(filepath.Dir(target), ".quillite-export-*"+filepath.Ext(target))
	if err != nil {
		return err
	}
	name := temp.Name()
	defer os.Remove(name)
	if err := temp.Close(); err != nil {
		return err
	}
	if err := convert(name); err != nil {
		return err
	}
	f, err := os.Open(name)
	if err != nil {
		return err
	}
	defer f.Close()
	const limit = 256 * 1024 * 1024
	info, err := f.Stat()
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Size() == 0 || info.Size() > limit {
		return errors.New("invalid or oversized export output")
	}
	data, err := io.ReadAll(io.LimitReader(f, limit+1))
	if err != nil {
		return err
	}
	if len(data) > limit {
		return errors.New("export output exceeds 256 MiB")
	}
	return writeDocumentAtomically(target, data)
}
