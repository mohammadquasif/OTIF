$ErrorActionPreference = "Stop"

function Test-Command($Name) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) {
        Write-Host "OK: $Name -> $($cmd.Source)"
        return $true
    }
    Write-Host "MISSING: $Name"
    return $false
}

$ok = $true
$ok = (Test-Command "node.exe") -and $ok
$ok = (Test-Command "npm.cmd") -and $ok
$ok = (Test-Command "rustc.exe") -and $ok
$ok = (Test-Command "cargo.exe") -and $ok

if (-not (Test-Path -LiteralPath "backend\.venv\Scripts\python.exe")) {
    Write-Output "MISSING: backend\.venv\Scripts\python.exe"
    $ok = $false
} else {
    Write-Host "OK: backend\.venv\Scripts\python.exe"
    & "backend\.venv\Scripts\python.exe" -m ensurepip --version | Out-Host
    & "backend\.venv\Scripts\python.exe" -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('PyInstaller') else 1)" *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "MISSING: PyInstaller in backend virtual environment"
        $ok = $false
    } else {
        Write-Host "OK: PyInstaller"
    }
}

if (-not $ok) {
    throw "Desktop build prerequisites are missing. Install Rust/Cargo and prepare the backend virtual environment."
}

Write-Output "All desktop prerequisites are present."
