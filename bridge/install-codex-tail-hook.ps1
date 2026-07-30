param(
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$ConfigPath = (Join-Path $env:USERPROFILE ".codex\hooks.json")
)

$hookScript = Join-Path $RepoRoot "bridge\codex-tail-hook.ps1"

if (-not (Test-Path -LiteralPath $configPath)) {
  throw "Codex hooks configuration was not found: $configPath"
}
if (-not (Test-Path -LiteralPath $hookScript)) {
  throw "Codex tail hook was not found: $hookScript"
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if (-not $config.hooks) {
  $config | Add-Member -NotePropertyName hooks -NotePropertyValue ([pscustomobject]@{})
}

function Add-CodexTailHook([string]$EventName) {
  $command = "powershell.exe -NoProfile -NonInteractive -File `"$hookScript`" -Event $EventName"
  $existing = @($config.hooks.$EventName)
  foreach ($group in $existing) {
    if ($group.hooks -and @($group.hooks | Where-Object { $_.command -eq $command }).Count -gt 0) {
      return
    }
  }

  # Older installer versions placed the handler directly in the event array.
  # Codex requires a matcher group with a nested `hooks` array, so remove only
  # that malformed duplicate before adding the valid group below.
  $existing = @($existing | Where-Object { $_.command -ne $command })
  $entry = [pscustomobject]@{
    type = "command"
    command = $command
    timeout = 10
  }
  $group = [pscustomobject]@{
    hooks = @($entry)
  }
  $updated = @($existing) + $group
  if ($config.hooks.PSObject.Properties.Name -contains $EventName) {
    $config.hooks.$EventName = @($updated)
  } else {
    $config.hooks | Add-Member -NotePropertyName $EventName -NotePropertyValue @($updated)
  }
}

Add-CodexTailHook "UserPromptSubmit"
Add-CodexTailHook "Stop"

$tempPath = "$configPath.new"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($tempPath, ($config | ConvertTo-Json -Depth 12), $utf8NoBom)
Move-Item -LiteralPath $tempPath -Destination $configPath -Force
Write-Output "Codex Tail hooks installed. Start a fresh Codex session and approve the new hook in /hooks."
