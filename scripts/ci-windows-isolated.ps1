$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:OS -ne 'Windows_NT') {
    throw 'Only a disposable GitHub-hosted Windows runner is permitted.'
}
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location $taskRoot
$evidence = Join-Path $taskRoot 'audit-evidence'
New-Item -ItemType Directory -Path $evidence -ErrorAction Stop | Out-Null
function Invoke-Checked([string]$Name, [string]$Command, [string[]]$Arguments) {
    Write-Host "START $Name"
    & $Command @Arguments *> (Join-Path $evidence "$Name.log")
    $result = $LASTEXITCODE
    Get-Content -LiteralPath (Join-Path $evidence "$Name.log") -Tail 18
    if ($result -ne 0) { throw "$Name failed with exit $result" }
    Write-Host "PASS $Name"
}
@{Commit=$env:GITHUB_SHA;Runner=$env:RUNNER_OS;Environment=$env:RUNNER_ENVIRONMENT;Started=[DateTimeOffset]::UtcNow.ToString('o');Scope='Tests only; no release; native IME not covered'} | ConvertTo-Json | Out-File (Join-Path $evidence 'run.json') -Encoding utf8
Invoke-Checked 'source-before' 'node' @('--input-type=module','-e',"import {liveSourceFingerprint} from './scripts/live-source-fingerprint.mjs';const h=await liveSourceFingerprint();console.log(h);if(h!=='5d47b53cb33845096f6e52f9fda94baa5fd72e7f1e7682c043218921f063c0e6')throw Error('Source fingerprint mismatch');")
Push-Location frontend
try {
    Invoke-Checked 'npm-ci' 'npm.cmd' @('ci')
    Invoke-Checked 'frontend-tests' 'npm.cmd' @('test')
    Invoke-Checked 'frontend-build' 'npm.cmd' @('run','build')
} finally { Pop-Location }
Invoke-Checked 'go-full' 'go' @('test','./...','-count=1','-json')
Invoke-Checked 'updater-five' 'go' @('test','./...','-run','^TestRunUpdateHelperEndToEnd$','-count=5','-json')
Invoke-Checked 'go-vet' 'go' @('vet','./...')
Invoke-Checked 'source-safety' 'node' @('scripts/test-release-safety.mjs')

# Independent Chromium context, no profile or real documents, same existing tests.
$playwrightRoot = Join-Path $env:RUNNER_TEMP 'quillite-playwright'
Invoke-Checked 'playwright-install' 'npm.cmd' @('install','--prefix',$playwrightRoot,'--no-package-lock','--no-audit','--no-fund','playwright@1.62.1')
$env:PLAYWRIGHT_MODULE = Join-Path $playwrightRoot 'node_modules/playwright'
Invoke-Checked 'chromium-install' 'node' @((Join-Path $env:PLAYWRIGHT_MODULE 'cli.js'),'install','chromium')
foreach ($case in @('browser-image-controls','browser-image-source','browser-image-fast-click','browser-image-storage-settings','browser-image-settings-async','browser-mermaid-structured-controls')) {
    $env:AUDIT_OUTPUT = Join-Path $evidence $case
    New-Item -ItemType Directory -Path $env:AUDIT_OUTPUT | Out-Null
    Invoke-Checked $case 'node' @("frontend/tests/$case.mjs")
}

Invoke-Checked 'wails-install' 'go' @('install','github.com/wailsapp/wails/v2/cmd/wails@v2.13.0')
$nsis = Get-Command makensis.exe -ErrorAction SilentlyContinue
if (-not $nsis) {
    $knownNSIS = @('C:/Program Files (x86)/NSIS/makensis.exe','C:/Program Files/NSIS/makensis.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $knownNSIS) {
        Invoke-Checked 'nsis-install' 'choco.exe' @('install','nsis','--yes','--no-progress')
        $knownNSIS = @('C:/Program Files (x86)/NSIS/makensis.exe','C:/Program Files/NSIS/makensis.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    }
    if (-not $knownNSIS) { throw 'NSIS compiler not found' }
    $env:PATH = (Split-Path -Parent $knownNSIS) + ';' + $env:PATH
}
$env:PATH = (Join-Path (& go env GOPATH) 'bin') + ';' + $env:PATH
Invoke-Checked 'wails-build' 'wails.exe' @('build','-clean','-platform','windows/amd64','-o','QuilliteMarkdown.exe','-nsis','-installscope','user','-webview2','embed','-trimpath','-nocolour')
$version = (Get-Content wails.json -Raw | ConvertFrom-Json).info.productVersion
$installer = Join-Path $taskRoot "build/bin/quillite-markdown-$version-windows-amd64.exe"
# Same explicit scope flags as the release workflow. This job never publishes.
Push-Location build/windows/installer
try {
    Invoke-Checked 'nsis-core' 'makensis.exe' @('-DWAILS_INSTALL_SCOPE=user','-DREQUEST_EXECUTION_LEVEL=user','-DARG_WAILS_AMD64_BINARY=..\..\bin\QuilliteMarkdown.exe','project.nsi')
} finally { Pop-Location }
Invoke-Checked 'install-upgrade-uninstall' 'pwsh.exe' @('-NoProfile','-File','scripts/test-windows-install-lifecycle.ps1','-CoreInstaller',$installer)
Invoke-Checked 'custom-launcher' 'pwsh.exe' @('-NoProfile','-File','scripts/build-windows-launcher.ps1','-CoreInstaller',$installer,'-Output',$installer)
$bytes = [IO.File]::ReadAllBytes($installer)
if ($bytes.Length -lt 24) { throw 'Truncated installer' }
$marker = [Text.Encoding]::ASCII.GetString($bytes,$bytes.Length-16,16)
$core = [BitConverter]::ToUInt64($bytes,$bytes.Length-24)
$launcher = $bytes.Length-$core-24
if ($marker -ne 'QUILLITE_PAYLOAD' -or $core -le 0 -or $launcher -le 0) { throw 'Invalid payload footer' }
if ($bytes[$launcher] -ne 77 -or $bytes[$launcher+1] -ne 90) { throw 'Invalid core executable header' }
$file=Get-Item -LiteralPath $installer
@{Name=$file.Name;Bytes=$file.Length;Modified=$file.LastWriteTimeUtc.ToString('o');SHA256=(Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash;CoreBytes=$core;LauncherBytes=$launcher;Marker=$marker;Commit=$env:GITHUB_SHA} | ConvertTo-Json | Out-File (Join-Path $evidence 'installer.json') -Encoding utf8
Invoke-Checked 'source-after' 'node' @('--input-type=module','-e',"import {liveSourceFingerprint} from './scripts/live-source-fingerprint.mjs';const h=await liveSourceFingerprint();console.log(h);if(h!=='5d47b53cb33845096f6e52f9fda94baa5fd72e7f1e7682c043218921f063c0e6')throw Error('Build changed source');")
Write-Host 'PASS: independent Windows gates and full installer packaging; no release performed.'
