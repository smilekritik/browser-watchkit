param(
    [ValidatePattern('^[a-p]{32}$')]
    [string]$ExtensionId = 'eohflcpmoebbejkcihlbmnakgoolhmdn'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$binary = Join-Path $root 'build/browser-watchkit-host.exe'
$releaseUrl = 'https://github.com/smilekritik/browser-watchkit/releases/latest'

if (!(Test-Path -LiteralPath (Join-Path $root 'extension/manifest.json') -PathType Leaf) -or
    !(Test-Path -LiteralPath $binary -PathType Leaf)) {
    Write-Host 'The Chrome extension or its Windows bridge is missing.' -ForegroundColor Red
    Write-Host 'Download the Windows x64 ZIP under Assets, use Extract All, and run Install WatchKit.bat again.'
    Write-Host $releaseUrl
    exit 1
}

$name = 'com.smilekritik.browser_watchkit'
$directory = Join-Path $env:LOCALAPPDATA 'BrowserWatchKit'
$installedBinary = Join-Path $directory 'browser-watchkit-host.exe'
$nextStep = "Check that your Windows account can write to $directory."
try {
    $null = New-Item -ItemType Directory -Force -Path $directory
    $sameBinary = (Test-Path -LiteralPath $installedBinary -PathType Leaf) -and
        (Get-FileHash -LiteralPath $binary).Hash -eq (Get-FileHash -LiteralPath $installedBinary).Hash
    if (!$sameBinary) {
        $nextStep = 'Turn off sharing in WatchKit, exit Chrome completely, then run setup again under your usual Windows account.'
        Copy-Item -LiteralPath $binary -Destination $installedBinary -Force
    }

    $nextStep = "Check that your Windows account can write to $directory."
    $manifest = Join-Path $directory "$name.json"
    $json = @{
        name = $name
        description = 'Browser WatchKit Discord bridge'
        path = $installedBinary
        type = 'stdio'
        allowed_origins = @("chrome-extension://$ExtensionId/")
    } | ConvertTo-Json
    [IO.File]::WriteAllText($manifest, $json, [Text.UTF8Encoding]::new($false))

    $nextStep = 'Run setup under the same Windows account you use for Chrome. On a managed computer, check whether native messaging is blocked.'
    $key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$name"
    if (!(Test-Path -LiteralPath $key)) { $null = New-Item -Path $key -Force }
    Set-Item -LiteralPath $key -Value $manifest
} catch {
    Write-Host 'Could not install the WatchKit bridge.' -ForegroundColor Red
    Write-Host $nextStep
    Write-Host "Windows reported: $($_.Exception.Message)"
    exit 1
}

Write-Host 'Browser WatchKit bridge registered for your Windows account.'
