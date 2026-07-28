# install-bridge-task.ps1
# Installs the HubBridge Windows scheduled task.
#
# The task runs bridge.py at sign-in, hidden (pythonw.exe), and restarts
# automatically on failure. Secrets are read from Windows user environment
# variables at runtime; nothing sensitive is stored in this script or in
# Task Scheduler.
#
# Prerequisites:
#   - HUB_SERVICE_KEY must be set as a Windows user env var
#   - pythonw.exe must be on PATH (ships with the standard Python installer)
#   - bridge.py must be deployed to C:\imp\scripts\bridge.py
#
# Usage (Windows PowerShell 5.1 compatible):
#   powershell -ExecutionPolicy Bypass -File install-bridge-task.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$TaskName = "HubBridge"
$BridgePy = "C:\imp\scripts\bridge.py"

# Verify HUB_SERVICE_KEY is present before installing
$serviceKey = [System.Environment]::GetEnvironmentVariable("HUB_SERVICE_KEY", "User")
if (-not $serviceKey) {
    Write-Error "HUB_SERVICE_KEY is not set. Run this first:`n  [System.Environment]::SetEnvironmentVariable('HUB_SERVICE_KEY', '<value>', 'User')"
    exit 1
}

# Require pythonw.exe — do NOT fall back to python.exe (would show a console window)
$pythonWCmd = Get-Command pythonw.exe -ErrorAction SilentlyContinue
if (-not $pythonWCmd) {
    Write-Error "pythonw.exe not found on PATH. Ensure Python 3 is installed with the standard Windows installer (pythonw.exe ships alongside python.exe)."
    exit 1
}
$PythonW = $pythonWCmd.Source

if (-not (Test-Path $BridgePy)) {
    Write-Error "bridge.py not found at $BridgePy. Deploy it first:`n  copy /Y <repo>\bridge\bridge.py $BridgePy"
    exit 1
}

# Remove existing task cleanly
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Register via XML for full control over settings not exposed by PS 5.1 cmdlets:
#   - DisallowStartIfOnBatteries = false  (battery-safe: starts on battery)
#   - StopIfGoingOnBatteries = false      (battery-safe: does not stop on battery)
#   - RunLevel = LeastPrivilege           (no elevation — bridge only reads files + calls HTTPS)
#   - RestartOnFailure: 3 retries, 1-minute interval
#   - ExecutionTimeLimit = PT0S           (no time limit)
$TaskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Hub bridge daemon -- syncs Room, Wire, Tail, IMP to Supabase. Obsidian sync requires --with-obsidian flag.</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
    <StartWhenAvailable>true</StartWhenAvailable>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$PythonW</Command>
      <Arguments>&quot;$BridgePy&quot;</Arguments>
    </Exec>
  </Actions>
</Task>
"@

Register-ScheduledTask -TaskName $TaskName -Xml $TaskXml -Force | Out-Null

Write-Host "HubBridge task installed successfully."
Write-Host "  Executable : $PythonW"
Write-Host "  Script     : $BridgePy"
Write-Host "  Syncs      : Room, Wire, Tail, IMP (Obsidian: off)"
Write-Host "  Starts at next sign-in. To start now:"
Write-Host "    Start-ScheduledTask -TaskName HubBridge"
Write-Host ""
Write-Host "To enable Obsidian sync, re-run bridge.py manually with --with-obsidian"
Write-Host "after setting OBSIDIAN_VAULT_PATH as a Windows user env var."
