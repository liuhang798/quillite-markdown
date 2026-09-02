param(
    [Parameter(Mandatory = $true)]
    [string]$CoreInstaller,

    [Parameter(Mandatory = $true)]
    [string]$Output,

    [string]$GoExecutable = "go"
)

$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$launcherDirectory = Join-Path $repositoryRoot "cmd\installer-launcher"
$iconPath = Join-Path $repositoryRoot "build\windows\icon.ico"
$manifestPath = Join-Path $launcherDirectory "launcher.manifest"
$resourcePath = Join-Path $launcherDirectory "rsrc_windows_amd64.syso"
$visualAssetBudget = 800KB

$visualAssetFiles = @(
    Get-ChildItem -LiteralPath $launcherDirectory -Recurse -File |
        Where-Object { $_.Extension -ne ".syso" }
)
$visualAssetFiles += Get-Item -LiteralPath $iconPath
$visualAssetBytes = ($visualAssetFiles | Measure-Object -Property Length -Sum).Sum
if ($visualAssetBytes -gt $visualAssetBudget) {
    throw "Installer artwork and text sources exceed the 800 KB budget: $visualAssetBytes bytes."
}

$resolvedCore = (Resolve-Path -LiteralPath $CoreInstaller).Path
$resolvedOutput = [IO.Path]::GetFullPath($Output)
$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ("quillite-launcher-" + [Guid]::NewGuid().ToString("N"))
$temporaryCore = Join-Path $temporaryDirectory "installer-core.exe"
$temporaryLauncher = Join-Path $temporaryDirectory "installer-launcher.exe"
$temporaryOutput = Join-Path $temporaryDirectory "installer-complete.exe"

New-Item -ItemType Directory -Path $temporaryDirectory -Force | Out-Null

try {
    Copy-Item -LiteralPath $resolvedCore -Destination $temporaryCore -Force

    Push-Location $repositoryRoot
    try {
        & $GoExecutable run github.com/akavel/rsrc@v0.10.2 `
            -arch amd64 `
            -ico $iconPath `
            -manifest $manifestPath `
            -o $resourcePath
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to generate Windows launcher resources (exit code $LASTEXITCODE)."
        }

        & $GoExecutable build `
            -trimpath `
            -ldflags "-s -w -H=windowsgui" `
            -o $temporaryLauncher `
            ./cmd/installer-launcher
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to build the Windows installer launcher (exit code $LASTEXITCODE)."
        }
    } finally {
        Pop-Location
    }

    $outputStream = [IO.File]::Open($temporaryOutput, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        foreach ($sourcePath in @($temporaryLauncher, $temporaryCore)) {
            $inputStream = [IO.File]::OpenRead($sourcePath)
            try {
                $inputStream.CopyTo($outputStream)
            } finally {
                $inputStream.Dispose()
            }
        }

        $payloadLength = [uint64](Get-Item -LiteralPath $temporaryCore).Length
        $lengthBytes = [BitConverter]::GetBytes($payloadLength)
        if (-not [BitConverter]::IsLittleEndian) {
            [Array]::Reverse($lengthBytes)
        }
        $outputStream.Write($lengthBytes, 0, $lengthBytes.Length)

        $markerBytes = [Text.Encoding]::ASCII.GetBytes("QUILLITE_PAYLOAD")
        $outputStream.Write($markerBytes, 0, $markerBytes.Length)
    } finally {
        $outputStream.Dispose()
    }

    $outputDirectory = Split-Path -Parent $resolvedOutput
    if ($outputDirectory) {
        New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    }
    Move-Item -LiteralPath $temporaryOutput -Destination $resolvedOutput -Force

    $coreSize = (Get-Item -LiteralPath $temporaryCore).Length
    $launcherSize = (Get-Item -LiteralPath $temporaryLauncher).Length
    $finalSize = (Get-Item -LiteralPath $resolvedOutput).Length
    Write-Host "Custom installer launcher created successfully."
    Write-Host "  UI asset budget: $visualAssetBytes / $visualAssetBudget bytes"
    Write-Host "  Core installer : $coreSize bytes"
    Write-Host "  Launcher       : $launcherSize bytes"
    Write-Host "  Final installer: $finalSize bytes"
    Write-Host "  Output         : $resolvedOutput"
} finally {
    Remove-Item -LiteralPath $resourcePath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
