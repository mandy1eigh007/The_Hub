# bridge.ps1 - Hub bridge daemon wrapper.
# Reads HUB_SERVICE_KEY from Windows user env vars and launches bridge.py.
# Run once manually or add to Windows Task Scheduler.
#
# Scheduled task setup (run at logon, repeat every 1 min):
#   $action  = New-ScheduledTaskAction -Execute "python" -Argument "C:\imp\scripts\bridge.py"
#   $trigger = New-ScheduledTaskTrigger -AtLogOn
#   Register-ScheduledTask -TaskName "HubBridge" -Action $action -Trigger $trigger -RunLevel Highest

$key = [System.Environment]::GetEnvironmentVariable("HUB_SERVICE_KEY", "User")
if (-not $key) {
    Write-Output "bridge: HUB_SERVICE_KEY not set - skipping"
    exit 0
}
$env:HUB_SERVICE_KEY = $key

$py = "C:\imp\scripts\bridge.py"
if (-not (Test-Path $py)) {
    $src = Join-Path $PSScriptRoot "bridge.py"
    if (Test-Path $src) {
        Copy-Item $src $py
        Write-Output "bridge: installed bridge.py to $py"
    } else {
        Write-Output "bridge: bridge.py not found at $py or $src"
        exit 1
    }
}

$arg = if ($args -contains "--once") { "--once" } else { "" }
python $py $arg
