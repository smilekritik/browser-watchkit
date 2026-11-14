$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $root
try {
    $toolchain = 'llvm-mingw-20250613-msvcrt-x86_64'
    $null = New-Item -ItemType Directory -Force -Path .deps,build

    function Get-Dependency([string]$Path, [string]$Url, [string]$Sha256) {
        if (!(Test-Path -LiteralPath $Path)) {
            $partial = "$Path.partial"
            & curl.exe --fail --location --silent --show-error --retry 2 $Url -o $partial
            if ($LASTEXITCODE) { throw "Download failed for $Url" }
            if ((Get-FileHash -LiteralPath $partial).Hash -ne $Sha256) { throw "Invalid checksum for $Url" }
            Move-Item -LiteralPath $partial -Destination $Path -Force
        }
        if ((Get-FileHash -LiteralPath $Path).Hash -ne $Sha256) {
            throw "Invalid checksum for $Path. Remove that file and retry."
        }
    }

    Get-Dependency ".deps/$toolchain.zip" "https://github.com/mstorsjo/llvm-mingw/releases/download/20250613/$toolchain.zip" F2013506C56F3DC9C48D6A1229A1099EB9056A929E5FF79ECC574AFEA0EB75C4
    $compiler = ".deps/$toolchain/bin/clang++.exe"
    if (!(Test-Path -LiteralPath $compiler)) {
        & tar.exe -xf ".deps/$toolchain.zip" -C .deps
        if ($LASTEXITCODE) { throw 'Could not extract llvm-mingw.' }
    }
    Get-Dependency '.deps/json.hpp' 'https://raw.githubusercontent.com/nlohmann/json/v3.12.0/single_include/nlohmann/json.hpp' AAF127C04CB31C406E5B04A63F1AE89369FCCDE6D8FA7CDDA1ED4F32DFC5DE63
    & $compiler -std=c++20 -O2 -DNDEBUG -Wall -Wextra -Werror -static '-Wl,--no-insert-timestamp' -s -DWIN32_LEAN_AND_MEAN -DNOMINMAX -D_WIN32_WINNT=0x0A00 -isystem .deps native/main.cpp native/discord.cpp -o build/browser-watchkit-host.exe
    if ($LASTEXITCODE) { throw 'Could not build the native bridge.' }
    Write-Host 'Built build/browser-watchkit-host.exe'
} finally { Pop-Location }
