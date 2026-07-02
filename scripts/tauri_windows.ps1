param(
    [ValidateSet("dev", "build")]
    [string]$Mode = "dev"
)

$ErrorActionPreference = "Stop"

function Test-CommandExists {
    param([string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-VcVarsPath {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path -LiteralPath $vswhere)) {
        return $null
    }

    $path = & $vswhere `
        -latest `
        -products * `
        -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
        -find "VC\Auxiliary\Build\vcvars64.bat" |
        Select-Object -First 1

    if ($path -and (Test-Path -LiteralPath $path)) {
        return $path
    }

    return $null
}

function Invoke-Tauri {
    param(
        [string]$TauriMode,
        [string]$VcVarsPath
    )

    # ── Pre-launch cleanup ──────────────────────────────────────────────
    # Kill any leftover otif-desktop.exe that would lock the build output
    $null = taskkill /F /IM "otif-desktop.exe" /T 2>$null
    # Kill any process hogging the backend port (18765) so the sidecar can start
    $portPid = (netstat -ano | Select-String "127.0.0.1:18765 " | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1)
    if ($portPid -match '^\d+$') {
        Write-Host "[OTIF] Clearing stale backend on port 18765 (PID $portPid)"
        $null = taskkill /F /PID $portPid 2>$null
    }
    Start-Sleep -Milliseconds 500

    $tauriCommand = if ($TauriMode -eq "build") { "npm exec tauri -- build" } else { "npm exec tauri -- dev" }

    if ($VcVarsPath) {
        Write-Host "Loading Visual C++ build environment from: $VcVarsPath"
        & cmd.exe /d /c "call `"$VcVarsPath`" && $tauriCommand"
    } else {
        & cmd.exe /d /c $tauriCommand
    }

    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}


$hasMsvcLinker = Test-CommandExists "link.exe"
if ($hasMsvcLinker) {
    Invoke-Tauri -TauriMode $Mode -VcVarsPath $null
    exit 0
}

$vcvars = Get-VcVarsPath
if ($vcvars) {
    Invoke-Tauri -TauriMode $Mode -VcVarsPath $vcvars
    exit 0
}

Write-Host ""
Write-Host "OTIF desktop needs the Microsoft C++ linker (link.exe) to run Tauri on Windows." -ForegroundColor Yellow
Write-Host ""
Write-Host "Install Visual Studio Build Tools 2022, then select:" -ForegroundColor Yellow
Write-Host "  - Desktop development with C++"
Write-Host "  - MSVC v143 C++ build tools"
Write-Host "  - Windows 10/11 SDK"
Write-Host ""
Write-Host "After installation, close this terminal and run again:" -ForegroundColor Yellow
Write-Host "  npm run desktop:dev"
Write-Host ""
exit 1
