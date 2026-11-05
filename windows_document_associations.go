package main

import (
	"errors"
	"fmt"
	"strings"
)

const documentAssociationOwner = "cn.ssssa.quillite-markdown"
const documentAssociationCapabilities = `Software\QuilliteMarkdown\Capabilities`
const documentAssociationApplication = "Quillite Markdown"

var errAssociationValueMissing = errors.New("association value is missing")

// Read operations distinguish merged HKCR from per-user data. Never probe or
// mutate Explorer's protected UserChoice; Windows owns the user's final choice.
type documentAssociationRegistry interface {
	Read(merged bool, key, name string) (string, error)
	Exists(key string) (bool, error)
	Write(key, name, value string) error
}

type documentAssociationType struct{ extension, description string }

var documentAssociationTypes = []documentAssociationType{
	{"md", "Markdown 文档"}, {"markdown", "Markdown 文档"},
	{"mdown", "Markdown 文档"}, {"mkd", "Markdown 文档"},
	{"txt", "文本文档"}, {"textpack", "TextPack 文档包"},
}

func associationString(reg documentAssociationRegistry, merged bool, key, name string) (string, error) {
	value, err := reg.Read(merged, key, name)
	if errors.Is(err, errAssociationValueMissing) {
		return "", nil
	}
	return value, err
}

func associationOwnedOrVacant(reg documentAssociationRegistry, key string) (bool, error) {
	owner, err := associationString(reg, false, key, "QuilliteOwner")
	if err != nil {
		return false, err
	}
	if owner == documentAssociationOwner {
		return true, nil
	}
	if owner != "" {
		return false, nil
	}
	exists, err := reg.Exists(key)
	return !exists && err == nil, err
}

// registerDocumentApplication is used only by the user's explicit Default Apps
// action, including portable EXEs. It advertises candidates, never sets defaults.
// Tests use an in-memory registry so they cannot change the developer desktop.
func registerDocumentApplication(reg documentAssociationRegistry, executable string) error {
	if strings.ContainsAny(executable, "\x00\r\n\"") || !(len(executable) > 3 && executable[1] == ':' && (executable[2] == '\\' || executable[2] == '/') || strings.HasPrefix(executable, `\\`)) {
		return errors.New("invalid application executable path")
	}
	base := executable[strings.LastIndexAny(executable, `\/`)+1:]
	if !strings.HasSuffix(strings.ToLower(base), ".exe") || len(base) < 5 {
		return errors.New("invalid application executable name")
	}
	command := `"` + executable + `" "%1"`
	application := `Software\Classes\Applications\` + base
	// Validate every owned namespace before making the first change. An
	// unmarked existing key (even one containing only unknown values) is not ours.
	keys := []string{documentAssociationCapabilities}
	for _, kind := range documentAssociationTypes {
		keys = append(keys, `Software\Classes\QuilliteMarkdown.`+kind.extension)
	}
	for _, key := range keys {
		owned, err := associationOwnedOrVacant(reg, key)
		if err != nil {
			return err
		}
		if !owned {
			return fmt.Errorf("application registration is owned by another application: %s", key)
		}
	}
	applicationWritable, err := associationOwnedOrVacant(reg, application)
	if err != nil {
		return err
	}
	registered, err := associationString(reg, false, `Software\RegisteredApplications`, documentAssociationApplication)
	if err != nil {
		return err
	}
	if registered != "" && registered != documentAssociationCapabilities {
		return errors.New("registered application name belongs to another application")
	}
	write := func(key, name, value string) error { return reg.Write(key, name, value) }
	for _, kind := range documentAssociationTypes {
		progID := "QuilliteMarkdown." + kind.extension
		class := `Software\Classes\` + progID
		for _, value := range [][3]string{
			{class, "", kind.description},
			{class, "QuilliteOwner", documentAssociationOwner},
			{class + `\DefaultIcon`, "", `"` + executable + `",0`},
			{class + `\shell`, "", "open"},
			{class + `\shell\open\command`, "", command},
			{`Software\Classes\.` + kind.extension + `\OpenWithProgids`, progID, ""},
		} {
			if err := write(value[0], value[1], value[2]); err != nil {
				return err
			}
		}
	}
	// Explorer may have created an unmarked Applications entry after an older
	// manual Open With action. Leave it entirely untouched, but still advertise
	// our independent ProgIDs and capabilities instead of blocking TextPack.
	if applicationWritable {
		for _, value := range [][3]string{
			{application, "QuilliteOwner", documentAssociationOwner},
			{application, "FriendlyAppName", "轻阅 Markdown"},
			{application + `\DefaultIcon`, "", `"` + executable + `",0`},
			{application + `\shell\open\command`, "", command},
		} {
			if err := write(value[0], value[1], value[2]); err != nil {
				return err
			}
		}
		for _, kind := range documentAssociationTypes {
			if err := write(application+`\SupportedTypes`, "."+kind.extension, ""); err != nil {
				return err
			}
		}
	}
	for _, value := range [][3]string{
		{documentAssociationCapabilities, "QuilliteOwner", documentAssociationOwner},
		{documentAssociationCapabilities, "ApplicationName", "轻阅 Markdown"},
		{documentAssociationCapabilities, "ApplicationDescription", "Markdown、文本和 TextPack 文档阅读与编辑"},
		{documentAssociationCapabilities, "ApplicationIcon", `"` + executable + `",0`},
		{documentAssociationCapabilities, "QuilliteCommand", command},
		{`Software\RegisteredApplications`, documentAssociationApplication, documentAssociationCapabilities},
	} {
		if err := write(value[0], value[1], value[2]); err != nil {
			return err
		}
	}
	for _, kind := range documentAssociationTypes {
		if err := write(documentAssociationCapabilities+`\FileAssociations`, "."+kind.extension, "QuilliteMarkdown."+kind.extension); err != nil {
			return err
		}
	}
	return nil
}
