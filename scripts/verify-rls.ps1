# Verifies the RLS blind rule against a local PostgreSQL (no Docker needed).
#
# Prereq: a Postgres server running on -Port with a superuser named postgres
# (trust auth). See scripts/verify-rls/README.md for the one-time setup using
# the portable EDB binaries.
#
# Usage:  powershell -File scripts\verify-rls.ps1 [-PgBin <path>] [-Port 5433]

param(
  [string]$PgBin = "C:\Users\thede\pg17-portable\pgsql\bin",
  [int]$Port = 5433,
  [string]$DbName = "mash_rls_check"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
$psql = Join-Path $PgBin "psql.exe"

function Invoke-Sql([string]$Label, [string]$File) {
  Write-Host "=== $Label ($([System.IO.Path]::GetFileName($File))) ==="
  & $psql -h 127.0.0.1 -p $Port -U postgres -d $DbName -v ON_ERROR_STOP=1 -q -f $File
  if ($LASTEXITCODE -ne 0) {
    Write-Host "!!! FAILED at: $Label" -ForegroundColor Red
    exit 1
  }
}

# Fresh database every run.
& (Join-Path $PgBin "dropdb.exe") -h 127.0.0.1 -p $Port -U postgres --if-exists $DbName
& (Join-Path $PgBin "createdb.exe") -h 127.0.0.1 -p $Port -U postgres $DbName
if ($LASTEXITCODE -ne 0) { Write-Host "!!! could not create $DbName"; exit 1 }

Invoke-Sql "Supabase stubs" (Join-Path $repo "scripts\verify-rls\00-stubs.sql")

# Apply every migration, in filename (= timestamp) order — verbatim.
Get-ChildItem (Join-Path $repo "supabase\migrations\*.sql") | Sort-Object Name | ForEach-Object {
  Invoke-Sql "migration" $_.FullName
}

Invoke-Sql "API-role grants" (Join-Path $repo "scripts\verify-rls\20-grants.sql")
Invoke-Sql "BLIND-RULE TEST" (Join-Path $repo "scripts\verify-rls\30-blind-rule-test.sql")
Invoke-Sql "SAVED-TITLES TEST" (Join-Path $repo "scripts\verify-rls\40-saved-titles-test.sql")

Write-Host ""
Write-Host "RLS verification complete - the blind rule holds." -ForegroundColor Green
