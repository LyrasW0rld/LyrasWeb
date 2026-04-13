$ErrorActionPreference = "Stop"

param(
  [int]$IntervalSeconds = 30
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Has-TrackedChanges {
  $changes = git status --porcelain -- AI Recherchen data content.config.json
  return -not [string]::IsNullOrWhiteSpace($changes)
}

while ($true) {
  try {
    if (Has-TrackedChanges) {
      Write-Host "Änderungen erkannt - regeneriere Archivdaten..."
      py -3.10 (Join-Path $root "scripts\\generate_archive.py")

      git add AI Recherchen data content.config.json
      git diff --cached --quiet
      if ($LASTEXITCODE -ne 0) {
        $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        git commit -m "chore: auto-sync content ($timestamp)"
        git push
        Write-Host "Änderungen wurden nach GitHub gepusht."
      }
    }
  } catch {
    Write-Host "Auto-Sync Fehler: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds $IntervalSeconds
}
