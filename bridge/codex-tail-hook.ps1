param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("UserPromptSubmit", "Stop")]
  [string]$Event,
  [string]$OutputPath = (Join-Path $env:USERPROFILE ".codex\hub-tail.jsonl")
)

# Codex passes hook input as one JSON object on stdin. This hook deliberately
# captures only Mandy's prompt and Codex's final message — never tool inputs,
# results, environment output, or the transcript file itself.
function Complete-StopHook {
  if ($Event -eq "Stop") { '{"continue":true}' }
}

function Protect-FeedText([string]$Text) {
  $protected = $Text
  $protected = [regex]::Replace(
    $protected,
    '(?i)\b(?:sk|rk|ghp|github_pat|sbp)_[A-Za-z0-9_-]{8,}\b',
    '[REDACTED_TOKEN]'
  )
  $protected = [regex]::Replace(
    $protected,
    '(?im)\b(password|api[ _-]?key|access[ _-]?token|secret)\b(\s*[:=]\s*)\S+',
    '$1$2[REDACTED]'
  )
  return $protected
}

try {
  $raw = [Console]::In.ReadToEnd()
  if ([string]::IsNullOrWhiteSpace($raw)) {
    Complete-StopHook
    exit 0
  }
  $payload = $raw | ConvertFrom-Json

  if ($Event -eq "UserPromptSubmit") {
    $speaker = "mandy"
    $role = "user_prompt"
    $content = [string]$payload.prompt
  } else {
    $speaker = "codex"
    $role = "assistant_final"
    $content = [string]$payload.last_assistant_message
  }

  if (-not [string]::IsNullOrWhiteSpace($content)) {
    $directory = Split-Path -Parent $OutputPath
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    $safeContent = Protect-FeedText $content
    $record = [ordered]@{
      ts         = [DateTime]::UtcNow.ToString("o")
      session_id = [string]$payload.session_id
      turn_id    = [string]$payload.turn_id
      speaker    = $speaker
      role       = $role
      content    = $safeContent.Substring(0, [Math]::Min($safeContent.Length, 4000))
    }
    $line = $record | ConvertTo-Json -Compress -Depth 4
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::AppendAllText($OutputPath, "$line`n", $utf8NoBom)
  }
} catch {
  # A feed failure must never block Mandy from using Codex.
}

Complete-StopHook
