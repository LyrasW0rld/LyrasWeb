param(
    [int]$IntervalSeconds = 30
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Test-TrackedChanges {
    $changes = git status --porcelain -- "AI Recherchen" data content.config.json
    return -not [string]::IsNullOrWhiteSpace($changes)
}

while ($true) {
    try {
        if (Test-TrackedChanges) {
            Write-Host "Aenderungen erkannt - regeneriere Archivdaten..."
            py -3.10 (Join-Path $root "scripts\generate_archive.py")

            git add "AI Recherchen" data content.config.json
            git diff --cached --quiet
            if ($LASTEXITCODE -ne 0) {
                $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
                git commit -m "chore: auto-sync content ($timestamp)"
                git push
                Write-Host "Aenderungen wurden nach GitHub gepusht."
            }
        }
    } catch {
        Write-Host "Auto-Sync Fehler: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds $IntervalSeconds
}
