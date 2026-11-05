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
$classes = 'HKCU:\Software\Classes'
$packClass = Join-Path $classes 'QuilliteMarkdown.textpack'
$packExtension = Join-Path $classes '.textpack'
$applicationClass = Join-Path $classes 'Applications\QuilliteMarkdown.exe'
$capabilities = 'HKCU:\Software\QuilliteMarkdown\Capabilities'
$registeredApps = 'HKCU:\Software\RegisteredApplications'
$otherProgId = 'QuilliteLifecycle.Other'
$machineProgId = 'QuilliteLifecycle.MachineOther'
function Read-Default([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return '' }
    return [string](Get-Item -LiteralPath $Path).GetValue('')
}
function Read-UserChoice {
    $path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.textpack\UserChoice'
    if (-not (Test-Path -LiteralPath $path)) { return '' }
    $key = Get-Item -LiteralPath $path
    return ([string]$key.GetValue('ProgId')) + '|' + ([string]$key.GetValue('Hash'))
}
$originalUserChoice = Read-UserChoice
function Assert-UserChoice {
    if ((Read-UserChoice) -cne $originalUserChoice) { throw 'Protected Windows user choice changed.' }
}
function Assert-Associations {
    $command = '"' + (Join-Path $destination 'QuilliteMarkdown.exe') + '" "%1"'
    if ((Read-Default (Join-Path $packClass 'shell\open\command')) -cne $command) { throw 'TextPack handler command is missing or unquoted.' }
    if (-not (Get-Item -LiteralPath (Join-Path $packExtension 'OpenWithProgids')).GetValueNames().Contains('QuilliteMarkdown.textpack')) { throw 'TextPack Open With candidate is missing.' }
    if (-not (Get-Item -LiteralPath (Join-Path $applicationClass 'SupportedTypes')).GetValueNames().Contains('.textpack')) { throw 'Application SupportedTypes is missing TextPack.' }
    if ((Get-Item -LiteralPath (Join-Path $capabilities 'FileAssociations')).GetValue('.textpack') -ne 'QuilliteMarkdown.textpack') { throw 'Default Apps capabilities are missing TextPack.' }
    if ((Get-Item -LiteralPath $registeredApps).GetValue('Quillite Markdown') -ne 'Software\QuilliteMarkdown\Capabilities') { throw 'Default Apps application is not registered.' }
    Assert-UserChoice
}
foreach ($path in @($packClass, $applicationClass, $capabilities)) {
    if (Test-Path -LiteralPath $path) { throw "Pre-existing application candidate: refusing lifecycle test: $path" }
}
if ((Read-Default 'Registry::HKEY_CLASSES_ROOT\.textpack') -ne '') { throw 'Pre-existing TextPack default: refusing lifecycle test.' }
New-Item -Path (Join-Path $packExtension 'OpenWithProgids') -Force | Out-Null
New-ItemProperty -LiteralPath (Join-Path $packExtension 'OpenWithProgids') -Name $otherProgId -Value '' -PropertyType String -Force | Out-Null
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
        Assert-Associations
        if ($phase -eq 'install' -and (Read-Default $packExtension) -ne 'QuilliteMarkdown.textpack') { throw 'Unassociated TextPack did not receive its handler.' }
        if ($phase -eq 'upgrade' -and (Read-Default $packExtension) -ne $otherProgId) { throw 'Upgrade replaced another TextPack default.' }
        if ($phase -eq 'install') {
            # A user's different default must survive the next upgrade/uninstall.
            Set-Item -LiteralPath $packExtension -Value $otherProgId
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
    if ((Read-Default $packExtension) -ne $otherProgId) { throw 'Uninstall replaced the user-selected default.' }
    $remaining = (Get-Item -LiteralPath (Join-Path $packExtension 'OpenWithProgids')).GetValueNames()
    if ($remaining.Contains('QuilliteMarkdown.textpack') -or -not $remaining.Contains($otherProgId)) { throw 'Uninstall damaged Open With candidates.' }
    foreach ($path in @($packClass, $applicationClass, $capabilities)) { if (Test-Path -LiteralPath $path) { throw "Owned candidate was not removed: $path" } }
    Assert-UserChoice

    # Exercise a machine-wide existing default, not just a per-user one. Only
    # this disposable GitHub-hosted runner may create these fixture entries.
    $machineExtension = 'HKLM:\Software\Classes\.textpack'
    if (Test-Path -LiteralPath $machineExtension) { throw 'Machine TextPack fixture is not pristine.' }
    if ((Read-Default $packExtension) -ne $otherProgId) { throw 'Unexpected fixture default before machine-wide test.' }
    Remove-ItemProperty -LiteralPath $packExtension -Name '(default)'
    New-Item -Path $machineExtension -Force | Out-Null
    Set-Item -LiteralPath $machineExtension -Value $machineProgId
    # The registered _?= mode runs the installed uninstaller in place, so it
    # cannot remove its own executable. Keep that directory and its document
    # fixtures intact; production correctly rejects reinstalling over the
    # remaining unowned executable after the ownership marker is removed.
    $previousDestination = $destination
    $destination = Join-Path $sandbox 'machine-default-install'
    if ([string]::Equals($destination, $previousDestination, [StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $destination)) { throw 'Machine-default installation requires a fresh isolated destination.' }
    $env:QUILLITE_INSTALL_DIR = $destination
    $p = Start-Process -FilePath $installer -ArgumentList '/S' -WindowStyle Hidden -PassThru
    if (-not $p.WaitForExit(120000) -or $p.ExitCode -ne 0) { throw 'Machine-default reinstall failed.' }
    Stop-TestApplication
    if (-not (Test-Path -LiteralPath (Join-Path $destination 'QuilliteMarkdown.exe'))) { throw 'Wrong machine-default destination.' }
    if ((Get-ItemProperty -LiteralPath $registry).InstallLocation -ne $destination) { throw 'Wrong registered machine-default destination.' }
    $uninstall = Join-Path $destination 'uninstall.exe'
    $expectedUninstall = '"' + $uninstall + '" _?=' + $destination
    if ((Get-ItemProperty -LiteralPath $registry).UninstallString -ne $expectedUninstall) { throw 'Wrong machine-default uninstall registration.' }
    Assert-Documents
    Assert-Associations
    if ((Read-Default $packExtension) -ne '' -or (Read-Default 'Registry::HKEY_CLASSES_ROOT\.textpack') -ne $machineProgId) { throw 'Per-user registration shadowed a machine-wide TextPack default.' }
    $secondDocument = Join-Path $destination 'machine-default-user.md'
    Set-Content -LiteralPath $secondDocument -Value 'User content in the second installation must survive.' -Encoding utf8
    $expected[$secondDocument] = (Get-FileHash -LiteralPath $secondDocument).Hash

    # A later portable/installed copy may explicitly take over our candidates.
    # The old installation must not delete those newer-path registrations.
    $newerDirectory = Join-Path $sandbox 'newer-copy'
    New-Item -ItemType Directory -Path $newerDirectory | Out-Null
    $newerExe = Join-Path $newerDirectory 'QuilliteMarkdown.exe'
    Copy-Item -LiteralPath (Join-Path $destination 'QuilliteMarkdown.exe') -Destination $newerExe
    $newerCommand = '"' + $newerExe + '" "%1"'
    foreach ($ext in @('md', 'markdown', 'mdown', 'mkd', 'txt', 'textpack')) {
        Set-Item -LiteralPath (Join-Path $classes "QuilliteMarkdown.$ext\shell\open\command") -Value $newerCommand
    }
    Set-Item -LiteralPath (Join-Path $applicationClass 'shell\open\command') -Value $newerCommand
    Set-ItemProperty -LiteralPath $capabilities -Name 'QuilliteCommand' -Value $newerCommand
    $p = Start-Process -FilePath $uninstall -ArgumentList "/S _?=$destination" -WindowStyle Hidden -PassThru
    if (-not $p.WaitForExit(60000) -or $p.ExitCode -ne 0) { throw 'Newer-candidate uninstall check failed.' }
    if ((Read-Default (Join-Path $packClass 'shell\open\command')) -cne $newerCommand -or (Read-Default (Join-Path $applicationClass 'shell\open\command')) -cne $newerCommand) { throw 'Old uninstaller removed a newer candidate.' }
    if ((Get-Item -LiteralPath $capabilities).GetValue('QuilliteCommand') -cne $newerCommand) { throw 'Old uninstaller removed newer capabilities.' }
    if (-not (Get-Item -LiteralPath (Join-Path $packExtension 'OpenWithProgids')).GetValueNames().Contains('QuilliteMarkdown.textpack')) { throw 'Old uninstaller removed newer Open With reference.' }
    Assert-Documents
    Assert-UserChoice
    Write-Output 'PASS: install, upgrade and uninstall preserved documents, other defaults/candidates, protected user choice and newer registration paths.'
} finally {
    Stop-TestApplication
    $env:QUILLITE_INSTALL_DIR = $oldDestination
    # Deliberately retain fixtures on failure; disposable runner cleanup owns them.
    Write-Output "Lifecycle fixtures: $sandbox"
}
