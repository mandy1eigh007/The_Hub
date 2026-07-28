# install-bridge-task.ps1
# Installs the HubBridge Windows scheduled task.
#
# The task runs bridge.py at sign-in, hidden, and restarts automatically on
# failure. Secrets are read from Windows user environment variables at runtime;
# nothing sensitive is stored in this script or in Task Scheduler.
#
# Prerequisites:
#   - HUB_SERVICE_KEY must be set as a Windows user env var
#   - Python must be on PATH (pythonw.exe for no-console window)
#   - bridge.py must be deployed to C:\imp\scripts\bridge.py
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File install-bridge-task.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$TaskName  = "HubBridge"
$BridgePy  = "C:\imp\scripts\bridge.py"

# Verify secret is present before installing — fail loudly if not
$serviceKey = [System.Environment]::GetEnvironmentVariable("HUB_SERVICE_KEY", "User")
if (-not $serviceKey) {
    Write-Error "HUB_SERVICE_KEY is not set. Run this first:`n  [System.Environment]::SetEnvironmentVariable('HUB_SERVICE_KEY', '<value>', 'User')"
    exit 1
}

# Find pythonw.exe (no console window) — fall back to python.exe
$pythonW = (Get-Command pythonw.exe -ErrorAction SilentlyContinue)?.Source
if (-not $pythonW) {
    $pythonW = (Get-Command python.exe -ErrorAction SilentlyContinue)?.Source
}
if (-not $pythonW) {
    Write-Error "Python not found on PATH. Install Python 3 and ensure it is on PATH."
    exit 1
}

if (-not (Test-Path $BridgePy)) {
    Write-Error "bridge.py not found at $BridgePy. Deploy it first:`n  copy /Y <repo>\bridge\bridge.py $BridgePy"
    exit 1
}

# Remove existing task cleanly
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute $pythonW -Argument "`"$BridgePy`""

$trigger = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName    $TaskName `
    -Action      $action `
    -Trigger     $trigger `
    -Settings    $settings `
    -RunLevel    Highest `
    -Description "Hub bridge daemon — syncs Room, Wire, Tail, IMP to Supabase at sign-in. Obsidian sync requires explicit --with-obsidian flag." `
    | Out-Null

Write-Host "HubBridge task installed successfully."
Write-Host "  Syncs: Room, Wire, Tail, IMP (Obsidian: off)"
Write-Host "  Starts at next sign-in. To start now:"
Write-Host "    Start-ScheduledTask -TaskName HubBridge"
Write-Host ""
Write-Host "To enable Obsidian sync, update the task action argument to include --with-obsidian"
Write-Host "and set OBSIDIAN_VAULT_PATH as a Windows user env var."
