# Requires: PowerShell
# Usage: From project root or forecast_service folder, run:
#   powershell -ExecutionPolicy Bypass -File forecast_service\run_tests.ps1

param(
    [switch]$Upgrade
)

$ErrorActionPreference = "Stop"

# Determine forecast_service directory (this script's directory)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Ensure pytest is installed in the active interpreter
$packages = @("pytest", "httpx")
foreach ($pkg in $packages) {
    try {
        python -c "import $pkg" | Out-Null
    } catch {
        Write-Host "Installing missing package: $pkg" -ForegroundColor Yellow
        if ($Upgrade) {
            pip install --upgrade $pkg
        } else {
            pip install $pkg
        }
    }
}

Write-Host "Running pytest in $ScriptDir" -ForegroundColor Cyan
pytest -q
