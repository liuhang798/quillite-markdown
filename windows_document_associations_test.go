package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type associationFixture struct {
	values map[string]string
	writes [][3]string
	fail   bool
}

func associationValueKey(merged bool, key, name string) string {
	root := "HKCU\\"
	if merged {
		root = "HKCR\\"
	}
	return strings.ToLower(root + key + "\x00" + name)
}
func (f *associationFixture) Read(merged bool, key, name string) (string, error) {
	if f.fail {
		return "", errors.New("denied")
	}
	value, ok := f.values[associationValueKey(merged, key, name)]
	if !ok {
		return "", errAssociationValueMissing
	}
	return value, nil
}
func (f *associationFixture) Exists(key string) (bool, error) {
	if f.fail {
		return false, errors.New("denied")
	}
	prefix := strings.ToLower("HKCU\\" + key)
	for name := range f.values {
		if strings.HasPrefix(name, prefix+"\x00") || strings.HasPrefix(name, prefix+"\\") {
			return true, nil
		}
	}
	return false, nil
}
func (f *associationFixture) Write(key, name, value string) error {
	f.writes = append(f.writes, [3]string{key, name, value})
	f.values[associationValueKey(false, key, name)] = value
	return nil
}
func associationMemory() *associationFixture {
	return &associationFixture{values: make(map[string]string)}
}

func TestDocumentAssociationPortableCandidatesDoNotSelectDefaults(t *testing.T) {
	for _, exe := range []string{`C:\Program Files\轻阅 Markdown\QuilliteMarkdown.exe`, `D:\便携\quillite-markdown-3.0.2-windows-amd64-portable.exe`} {
		reg := associationMemory()
		reg.values[associationValueKey(true, `.textpack`, "")] = "OtherEditor.TextPack"
		reg.values[associationValueKey(false, `Software\Classes\.md`, "")] = "Existing.Markdown"
		if err := registerDocumentApplication(reg, exe); err != nil {
			t.Fatal(err)
		}
		base := exe[strings.LastIndexAny(exe, `\/`)+1:]
		app := `Software\Classes\Applications\` + base
		if got, _ := reg.Read(false, app+`\shell\open\command`, ""); got != `"`+exe+`" "%1"` {
			t.Fatalf("unquoted portable command: %q", got)
		}
		for _, kind := range documentAssociationTypes {
			if _, err := reg.Read(false, app+`\SupportedTypes`, "."+kind.extension); err != nil {
				t.Fatalf("missing supported type: %s", kind.extension)
			}
			if got, _ := reg.Read(false, documentAssociationCapabilities+`\FileAssociations`, "."+kind.extension); got != "QuilliteMarkdown."+kind.extension {
				t.Fatal("capability points to wrong handler")
			}
		}
		for _, write := range reg.writes {
			if strings.Contains(strings.ToLower(write[0]), "userchoice") {
				t.Fatal("protected Windows selection was accessed")
			}
			if strings.HasPrefix(write[0], `Software\Classes\.`) && !strings.HasSuffix(write[0], `\OpenWithProgids`) {
				t.Fatalf("portable action changed default: %+v", write)
			}
		}
		if err := registerDocumentApplication(reg, exe); err != nil {
			t.Fatalf("repeat explicit registration failed: %v", err)
		}
	}
}

func TestDocumentAssociationUnknownNamespacesFailBeforeAnyWrite(t *testing.T) {
	exe := `D:\App\QuilliteMarkdown.exe`
	for _, key := range []string{`Software\Classes\QuilliteMarkdown.textpack`, documentAssociationCapabilities} {
		for _, suffix := range []string{"", `\unknown-child`} {
			reg := associationMemory()
			reg.values[associationValueKey(false, key+suffix, "Unknown")] = "foreign"
			if err := registerDocumentApplication(reg, exe); err == nil {
				t.Fatalf("adopted unmarked namespace %s", key+suffix)
			}
			if len(reg.writes) != 0 {
				t.Fatal("ownership preflight performed partial writes")
			}
		}
	}
	reg := associationMemory()
	reg.values[associationValueKey(false, `Software\RegisteredApplications`, documentAssociationApplication)] = `Software\Other\Capabilities`
	if err := registerDocumentApplication(reg, exe); err == nil || len(reg.writes) != 0 {
		t.Fatal("foreign registered application name overwritten")
	}
	reg = associationMemory()
	reg.fail = true
	if err := registerDocumentApplication(reg, exe); err == nil || len(reg.writes) != 0 {
		t.Fatal("read failure must stop registration")
	}
}

func TestDocumentAssociationPreservesExplorerCreatedApplicationEntry(t *testing.T) {
	reg := associationMemory()
	key := `Software\Classes\Applications\QuilliteMarkdown.exe`
	reg.values[associationValueKey(false, key+`\shell\open\command`, "")] = `"D:\Old\QuilliteMarkdown.exe" "%1"`
	reg.values[associationValueKey(false, key, "FriendlyAppName")] = "Previous manual choice"
	if err := registerDocumentApplication(reg, `D:\New\QuilliteMarkdown.exe`); err != nil {
		t.Fatal(err)
	}
	for _, write := range reg.writes {
		if strings.HasPrefix(write[0], key) {
			t.Fatalf("adopted unmarked Explorer application entry: %+v", write)
		}
	}
	if got, _ := reg.Read(false, `Software\Classes\QuilliteMarkdown.textpack\shell\open\command`, ""); got != `"D:\New\QuilliteMarkdown.exe" "%1"` {
		t.Fatal("old Applications metadata blocked independent TextPack registration")
	}
}

func TestDocumentAssociationRejectsMalformedExecutablePaths(t *testing.T) {
	for _, exe := range []string{"relative.exe", `C:relative.exe`, `C:\foo"bar.exe`, `C:\x.exe` + "\n", `C:\not-an-exe.txt`, ""} {
		reg := associationMemory()
		if err := registerDocumentApplication(reg, exe); err == nil || len(reg.writes) != 0 {
			t.Fatalf("accepted unsafe command path %q", exe)
		}
	}
}

func TestDocumentAssociationInstallerRegistersTextPackAndOwnedCleanup(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("build", "windows", "installer", "document_associations.nsh"))
	if err != nil {
		t.Fatal(err)
	}
	source := string(data)
	for _, required := range []string{
		`!insertmacro QuilliteRegisterFileType "textpack" "TextPack 文档包"`,
		`ReadRegStr $R6 HKCR ".textpack" ""`,
		`StrCmp $R6 "" 0 quilliteAssociationDone`,
		`Software\Classes\.${EXT}\OpenWithProgids`, `\SupportedTypes`, `Software\RegisteredApplications`,
		`RegOpenKeyExW`, `RegCloseKey`, `i 0x20119`,
		`*p.r0) i.r1`, `IntCmp $1 2 ${TAG}_namespaceReady`, `IntCmp $1 3 ${TAG}_namespaceReady`,
		`ReadRegStr $R0 HKCU "Software\Classes\QuilliteMarkdown.${EXT}" "QuilliteOwner"`,
		`StrCmp $R0 "$R8" 0 ${EXT}_associationRemoveDone`,
		`StrCmp $R0 "$R8" 0 quilliteApplicationRemoveDone`,
		`StrCmp $R0 "$R8" 0 quilliteCapabilitiesRemoveDone`,
		`!insertmacro QuilliteDeleteMatchingValue "Software\Classes\.${EXT}" "" "QuilliteMarkdown.${EXT}"`,
	} {
		if !strings.Contains(source, required) {
			t.Errorf("missing association safety rule %q", required)
		}
	}
	register := source[strings.Index(source, "!macro RegisterQuilliteDocumentApplication"):]
	if strings.Index(register, `ReadRegStr $R6 HKCR ".textpack" ""`) > strings.Index(register, `!insertmacro QuilliteRegisterFileType "md"`) {
		t.Fatal("merged default must be read before any extension writes")
	}
	for _, line := range strings.Split(source, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "DeleteRegKey ") && !strings.HasPrefix(trimmed, "DeleteRegKey /ifempty HKCU ") {
			t.Errorf("recursive or foreign registry deletion: %s", line)
		}
		if strings.Contains(trimmed, "UserChoice") && !strings.HasPrefix(trimmed, "#") {
			t.Fatal("installer must not access protected user selection")
		}
	}
	project, _ := os.ReadFile(filepath.Join("build", "windows", "installer", "project.nsi"))
	for _, required := range []string{`!include "document_associations.nsh"`, `!insertmacro RegisterQuilliteDocumentApplication`, `!insertmacro UnregisterQuilliteDocumentApplication`} {
		if !strings.Contains(string(project), required) {
			t.Errorf("actual installer does not invoke %s", required)
		}
	}
	app, _ := os.ReadFile("app.go")
	start := strings.Index(string(app), "func (a *App) OpenDefaultApps()")
	end := strings.Index(string(app)[start:], "func (a *App) Print()")
	if !strings.Contains(string(app)[start:start+end], "registerCurrentDocumentApplication()") {
		t.Fatal("portable explicit Default Apps action does not register candidates")
	}
}
