$ErrorActionPreference = 'Stop'
$name = 'com.smilekritik.browser_watchkit'
$key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$name"
if (Test-Path -LiteralPath $key) { Remove-Item -LiteralPath $key }
$directory = Join-Path $env:LOCALAPPDATA 'BrowserWatchKit'
foreach ($file in 'browser-watchkit-host.exe', "$name.json") {
    $path = Join-Path $directory $file
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
}
Write-Host 'Browser WatchKit bridge removed.'
