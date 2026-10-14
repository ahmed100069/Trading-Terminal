$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"
$frontendEnvPath = Join-Path $frontendDir ".env.local"

if (Test-Path $frontendEnvPath) {
    $frontendEnvironment = @{}
    foreach ($line in Get-Content $frontendEnvPath) {
        if ($line -match '^\s*([^#=]+)\s*=\s*(.*)$') {
            $frontendEnvironment[$Matches[1].Trim()] = $Matches[2].Trim().Trim('"').Trim("'")
        }
    }

    $env:SUPABASE_URL = $frontendEnvironment["VITE_SUPABASE_URL"]
    $env:SUPABASE_PUBLISHABLE_KEY = $frontendEnvironment["VITE_SUPABASE_PUBLISHABLE_KEY"]
    if (-not $env:SUPABASE_PUBLISHABLE_KEY) {
        $env:SUPABASE_PUBLISHABLE_KEY = $frontendEnvironment["VITE_SUPABASE_ANON_KEY"]
    }
}

function Stop-PortProcesses {
    param(
        [int]$Port
    )

    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if (-not $connections) {
        return
    }

    foreach ($connection in $connections) {
        try {
            Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
        }
        catch {
            Write-Host "No process to stop on port $Port."
        }
    }
}

foreach ($port in 4173, 5173, 5174, 5175, 8000) {
    Stop-PortProcesses -Port $port
}

Write-Host "Starting backend on http://localhost:8000..."
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$backendDir'; .\\.venv\\Scripts\\python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
) -WorkingDirectory $backendDir

Write-Host "Starting frontend on http://localhost:5173..."
$nodePath = (Get-Command node -ErrorAction Stop).Source
$viteEntrypoint = Join-Path $frontendDir "node_modules\vite\bin\vite.js"
if (-not (Test-Path $viteEntrypoint)) {
    throw "Vite is not installed. Run npm install in $frontendDir first."
}
Start-Process -FilePath $nodePath -ArgumentList @($viteEntrypoint) -WorkingDirectory $frontendDir

Write-Host ""
Write-Host "Platform is starting..."
Write-Host "- Frontend: http://localhost:5173"
Write-Host "- Backend: http://localhost:8000/docs"
Write-Host "- Stop stale port conflicts automatically before launch."
