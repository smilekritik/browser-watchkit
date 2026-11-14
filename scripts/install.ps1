param(
    [ValidatePattern('^[a-p]{32}$')]
    [string]$ExtensionId = 'eohflcpmoebbejkcihlbmnakgoolhmdn'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$binary = Join-Path $root 'build/browser-watchkit-host.exe'
if (!(Test-Path -LiteralPath $binary -PathType Leaf)) { throw 'Download the release ZIP or run ./scripts/build.ps1 first.' }

$name = 'com.smilekritik.browser_watchkit'
$directory = Join-Path $env:LOCALAPPDATA 'BrowserWatchKit'
$null = New-Item -ItemType Directory -Force -Path $directory
$installedBinary = Join-Path $directory 'browser-watchkit-host.exe'
$sameBinary = $false
if (Test-Path -LiteralPath $installedBinary -PathType Leaf) {
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $sourceHash = [Convert]::ToBase64String($sha256.ComputeHash([IO.File]::ReadAllBytes($binary)))
        $installedHash = [Convert]::ToBase64String($sha256.ComputeHash([IO.File]::ReadAllBytes($installedBinary)))
        $sameBinary = $sourceHash -ceq $installedHash
    } finally {
        $sha256.Dispose()
    }
}
if (!$sameBinary) {
    try {
        Copy-Item -LiteralPath $binary -Destination $installedBinary -Force
    } catch [IO.IOException] {
        throw "Could not update the bridge. Exit Chrome completely and run the installer again. $($_.Exception.Message)"
    }
}
$manifest = Join-Path $directory "$name.json"
$json = @{
    name = $name
    description = 'Browser WatchKit Discord bridge'
    path = $installedBinary
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json
[IO.File]::WriteAllText($manifest, $json, [Text.UTF8Encoding]::new($false))

$key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$name"
if (!(Test-Path -LiteralPath $key)) { $null = New-Item -Path $key -Force }
Set-Item -LiteralPath $key -Value $manifest
Write-Host 'Browser WatchKit bridge registered for your Windows account.'
