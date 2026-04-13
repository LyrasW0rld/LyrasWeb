$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
py -3.10 (Join-Path $root "scripts\\generate_archive.py")
