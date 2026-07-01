param(
    [string]$BackendDir = "backend",
    [string]$OutputDir = "apps\desktop\src-tauri\binaries"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$backendPath = Resolve-Path -LiteralPath (Join-Path $root $BackendDir)
$outputPath = Join-Path $root $OutputDir
$python = Join-Path $backendPath ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $python)) {
    throw "Python virtual environment not found at $python. Create backend\.venv before building the desktop sidecar."
}

New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

& $python -m pip --version 2>$null
if ($LASTEXITCODE -ne 0) {
    & $python -m ensurepip --upgrade
}

& $python -c "import PyInstaller" 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller is not installed in backend\.venv. Install it before packaging: .\backend\.venv\Scripts\python.exe -m pip install pyinstaller"
}

$workDir = Join-Path $backendPath "build\pyinstaller"
$distDir = Join-Path $backendPath "dist\pyinstaller"
$seedsDir = Join-Path $root "skill-seeds"

& $python -m PyInstaller `
    --clean `
    --onefile `
    --name "otif-backend" `
    --workpath $workDir `
    --distpath $distDir `
    --paths $backendPath `
    --add-data "$seedsDir;skill-seeds" `
    --collect-all app `
    --collect-submodules uvicorn `
    --collect-submodules fastapi `
    --collect-submodules pydantic `
    (Join-Path $backendPath "run_desktop.py")

$exe = Join-Path $distDir "otif-backend.exe"
if (-not (Test-Path -LiteralPath $exe)) {
    throw "Expected backend sidecar was not created: $exe"
}

Copy-Item -LiteralPath $exe -Destination (Join-Path $outputPath "otif-backend.exe") -Force
Write-Output "Backend sidecar ready: $(Join-Path $outputPath 'otif-backend.exe')"
