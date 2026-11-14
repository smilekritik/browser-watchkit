@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" %*
set "install_result=%ERRORLEVEL%"
echo.
if "%install_result%"=="0" (
  echo Open chrome://extensions and load the extension folder from this ZIP.
  echo If WatchKit is already loaded, click Reload on its card.
) else (
  echo Installation failed. See the error above.
)
pause
exit /b %install_result%
