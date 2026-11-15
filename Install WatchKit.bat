@echo off
setlocal
if not exist "%~dp0scripts\install.ps1" (
  echo WatchKit for Chrome setup cannot find its files.
  echo Right-click the release ZIP, select Extract All, then run this file from the extracted folder.
  echo Download: https://github.com/smilekritik/browser-watchkit/releases/latest
  pause
  exit /b 1
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" %*
set "install_result=%ERRORLEVEL%"
echo.
if "%install_result%"=="0" (
  echo 1. In Chrome, open chrome://extensions.
  echo 2. Enable Developer mode, click Load unpacked, and choose:
  echo    "%~dp0extension"
  echo    Already using this folder? Click Reload on the WatchKit card instead.
  echo 3. Open the WatchKit popup, choose Set up Discord, and save your Application ID.
) else (
  echo Setup failed. Follow the instructions above, then run this file again.
)
pause
exit /b %install_result%
