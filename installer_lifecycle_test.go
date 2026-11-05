package main

import (
	"os"
	"strings"
	"testing"
)

func TestInstallerLifecycleUsesFreshDestinationAfterInPlaceUninstall(t *testing.T) {
	data, err := os.ReadFile("scripts/test-windows-install-lifecycle.ps1")
	if err != nil {
		t.Fatal(err)
	}
	source := string(data)
	const uninstallCall = `$p = Start-Process -FilePath $uninstall -ArgumentList "/S _?=$destination" -WindowStyle Hidden -PassThru`
	firstUninstall := strings.Index(source, uninstallCall)
	switchDestination := strings.Index(source, "$previousDestination = $destination")
	if firstUninstall < 0 || switchDestination <= firstUninstall {
		t.Fatal("fresh destination must be selected after the actual installed uninstaller finishes")
	}
	secondPhase := source[switchDestination:]
	install := strings.Index(secondPhase, "$p = Start-Process -FilePath $installer")
	if install < 0 {
		t.Fatal("machine-default installation missing")
	}
	beforeInstall := secondPhase[:install]
	for _, required := range []string{
		"$destination = Join-Path $sandbox 'machine-default-install'",
		"[string]::Equals($destination, $previousDestination, [StringComparison]::OrdinalIgnoreCase)",
		"Test-Path -LiteralPath $destination",
		"$env:QUILLITE_INSTALL_DIR = $destination",
	} {
		if !strings.Contains(beforeInstall, required) {
			t.Fatalf("second installation must use a fresh synchronized destination: missing %s", required)
		}
	}
	secondUninstall := strings.Index(secondPhase, uninstallCall)
	if secondUninstall <= install {
		t.Fatal("newer-candidate check must uninstall the second installation")
	}
	beforeUninstall := secondPhase[install:secondUninstall]
	for _, required := range []string{
		"$uninstall = Join-Path $destination 'uninstall.exe'",
		`$expectedUninstall = '"' + $uninstall + '" _?=' + $destination`,
		".UninstallString -ne $expectedUninstall",
		"Assert-Documents",
		"$expected[$secondDocument] =",
	} {
		if !strings.Contains(beforeUninstall, required) {
			t.Fatalf("second phase must preserve original fixtures and verify its own installed uninstaller: missing %s", required)
		}
	}
	if strings.Contains(secondPhase, "$expected =") || strings.Contains(source, "Remove-Item -LiteralPath $uninstall") || strings.Contains(source, "Remove-Item -LiteralPath $previousDestination") {
		t.Fatal("lifecycle test must not reset document fixtures or delete the residual installed uninstaller")
	}
}
