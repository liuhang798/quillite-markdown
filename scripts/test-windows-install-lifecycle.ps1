param([Parameter(Mandatory = $true)][string]$CoreInstaller)
$ErrorActionPreference = 'Stop'
# Real installation changes registry/associations. Never run on a user's desktop
# or a self-hosted runner, even if a caller supplies a temporary destination.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or -not $env:RUNNER_TEMP) {
    throw 'Lifecycle test is restricted to a disposable GitHub-hosted Windows runner.'
}
if ($env:OS -ne 'Windows_NT') { throw 'Windows is required.' }
$installer = (Resolve-Path -LiteralPath $CoreInstaller).Path
$registry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Quillite Open Source轻阅 Markdown'
if (Test-Path -LiteralPath $registry) { throw 'Existing installation registration: refusing lifecycle test.' }
$tempRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')
$sandbox = [IO.Path]::GetFullPath((Join-Path $tempRoot ('quillite-lifecycle-' + [Guid]::NewGuid().ToString('N'))))
if (-not $sandbox.StartsWith($tempRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid sandbox.' }
$destination = Join-Path $sandbox '轻阅 Markdown'
New-Item -ItemType Directory -Path $sandbox | Out-Null
$parentDocument = Join-Path $sandbox 'parent-user-document.md'
Set-Content -LiteralPath $parentDocument -Value 'User-owned parent document — must survive.' -Encoding utf8
$expected = @{}
$expected[$parentDocument] = (Get-FileHash -LiteralPath $parentDocument).Hash
function Stop-TestApplication {
    $expectedExe = Join-Path $destination 'QuilliteMarkdown.exe'
    Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and [string]::Equals($_.Path, $expectedExe, [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force
}
function Assert-Documents {
    foreach ($path in $expected.Keys) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-FileHash -LiteralPath $path).Hash -ne $expected[$path]) { throw "User document damaged: $path" }
    }
}
$oldDestination = $env:QUILLITE_INSTALL_DIR
try {
    $env:QUILLITE_INSTALL_DIR = $destination
    foreach ($phase in @('install', 'upgrade')) {
        $p = Start-Process -FilePath $installer -ArgumentList '/S' -WindowStyle Hidden -PassThru
        if (-not $p.WaitForExit(120000)) { throw "$phase timed out" }
        if ($p.ExitCode -ne 0) { throw "$phase exited $($p.ExitCode)" }
        Stop-TestApplication
        if (-not (Test-Path -LiteralPath (Join-Path $destination 'QuilliteMarkdown.exe'))) { throw 'Wrong destination.' }
        if ((Get-ItemProperty -LiteralPath $registry).InstallLocation -ne $destination) { throw 'Wrong registered destination.' }
        Assert-Documents
        if ($phase -eq 'install') {
            $nested = Join-Path $destination '用户文档\子目录'
            New-Item -ItemType Directory -Path $nested -Force | Out-Null
            foreach ($path in @((Join-Path $destination 'user.md'), (Join-Path $nested 'notes.txt'), (Join-Path $destination 'unrelated.bin'))) {
                Set-Content -LiteralPath $path -Value 'User content, not product-owned.' -Encoding utf8
                $expected[$path] = (Get-FileHash -LiteralPath $path).Hash
            }
        }
    }
    $uninstall = Join-Path $destination 'uninstall.exe'
    $registeredUninstall = (Get-ItemProperty -LiteralPath $registry).UninstallString
    $expectedUninstall = '"' + $uninstall + '" _?=' + $destination
    if ($registeredUninstall -ne $expectedUninstall) {
        throw "Unsafe or unusable uninstall registration: $registeredUninstall"
    }
    # Exercise the same in-place mode registered for Apps & Features while
    # adding /S only to keep the disposable CI run non-interactive.
    $p = Start-Process -FilePath $uninstall -ArgumentList "/S _?=$destination" -WindowStyle Hidden -PassThru
    if (-not $p.WaitForExit(60000)) { throw 'Uninstall timed out' }
    if ($p.ExitCode -ne 0) { throw "Uninstall exited $($p.ExitCode)" }
    Assert-Documents
    if (Test-Path -LiteralPath $registry) { throw 'Uninstall left product registration behind.' }
    if (Test-Path -LiteralPath (Join-Path $destination 'QuilliteMarkdown.exe')) { throw 'Uninstall did not remove the owned executable.' }
    Write-Output 'PASS: install, upgrade and uninstall preserved all fixture files and nested directories.'
} finally {
    Stop-TestApplication
    $env:QUILLITE_INSTALL_DIR = $oldDestination
    # Deliberately retain fixtures on failure; disposable runner cleanup owns them.
    Write-Output "Lifecycle fixtures: $sandbox"
}
