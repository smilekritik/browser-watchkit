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
Copy-Item -LiteralPath $binary -Destination $installedBinary -Force
$manifest = Join-Path $directory "$name.json"
@{
    name = $name
    description = 'Browser WatchKit Discord bridge'
    path = $installedBinary
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json | Set-Content -LiteralPath $manifest -Encoding utf8

$key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$name"
$null = New-Item -Path $key -Force
Set-Item -LiteralPath $key -Value $manifest
Write-Host 'Browser WatchKit bridge registered for your Windows account.'
