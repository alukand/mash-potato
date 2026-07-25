# GRANTS LAW lint. Reads migration TEXT, not a database.
#
# Why this exists: on 2026-07-25 a migration revoked execute `from public`
# only. Both test suites passed — locally `anon` has no baseline function
# grant, so has_function_privilege('anon', ...) is false either way — and the
# function still answered 200 to the anon key on hosted, because default
# privileges differ between a local `db reset` and a hosted `db push`.
# NEITHER SUITE CAN CATCH THAT. This lint can, because it checks what the
# migration SAYS.
#
# The law (CLAUDE.md):
#   client RPC / RLS helper:  revoke all on function public.fn(args) from public, anon;
#                             grant execute on function public.fn(args) to authenticated;
#   trigger internal:         revoke all on function public.fn() from public, anon, authenticated;
#                             (and no grant, ever)
#
# Usage: powershell -File scripts\check-grants.ps1

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$migrations = Join-Path $repo 'supabase\migrations'

# Migrations up to and including this one predate the law: they were sealed
# retroactively by the 20260717160000 sweep (and its 20260725120000 fix),
# which revokes from public+anon across every function by name, rather than
# each migration doing it inline. Their runtime posture is correct and is
# asserted by account_test.sql + the twin's 20-grants.sql; only their TEXT
# does not match the pattern. Everything after this must comply in-file.
$baseline = '20260725120000'

$problems = @()
$checked = 0
$skipped = 0

foreach ($file in Get-ChildItem -Path $migrations -Filter '*.sql' | Sort-Object Name) {
    $stamp = ($file.Name -split '_')[0]
    if ($stamp -le $baseline) { $skipped++; continue }
    $text = Get-Content -Path $file.FullName -Raw

    # Every function this migration defines, by bare name.
    $defined = [regex]::Matches(
        $text,
        '(?im)^\s*create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\('
    ) | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique

    foreach ($fn in $defined) {
        $checked++
        # A revoke naming this function AND anon, in the same statement.
        $revokePattern = '(?is)revoke\s+[^;]*?on\s+function\s+public\.' +
                         [regex]::Escape($fn) + '\s*\([^;]*?\bfrom\b[^;]*?\banon\b[^;]*?;'
        if ($text -notmatch $revokePattern) {
            $problems += [pscustomobject]@{
                File     = $file.Name
                Function = $fn
                Problem  = 'no `revoke ... from ..., anon` naming this function'
            }
            continue
        }

        # If it is granted to authenticated it is a client-facing RPC; if not,
        # it should be sealed from authenticated too (a trigger internal).
        $grantPattern = '(?is)grant\s+execute\s+on\s+function\s+public\.' +
                        [regex]::Escape($fn) + '\s*\([^;]*?\bto\b[^;]*?\bauthenticated\b[^;]*?;'
        $sealedPattern = '(?is)revoke\s+[^;]*?on\s+function\s+public\.' +
                         [regex]::Escape($fn) + '\s*\([^;]*?\bfrom\b[^;]*?\bauthenticated\b[^;]*?;'
        if (($text -notmatch $grantPattern) -and ($text -notmatch $sealedPattern)) {
            $problems += [pscustomobject]@{
                File     = $file.Name
                Function = $fn
                Problem  = 'neither granted to authenticated nor revoked from it'
            }
        }
    }
}

Write-Host ""
Write-Host "Checked $checked function definitions in migrations after $baseline" -ForegroundColor Cyan
Write-Host "($skipped earlier migrations are grandfathered - sealed by the hardening sweep)." -ForegroundColor DarkGray

if ($problems.Count -gt 0) {
    Write-Host ""
    Write-Host "GRANTS LAW violations:" -ForegroundColor Red
    $problems | Format-Table -AutoSize | Out-String | Write-Host
    Write-Host "Every function migration must name anon in its revoke." -ForegroundColor Red
    exit 1
}

Write-Host "GRANTS LAW holds: every function names anon in its revoke." -ForegroundColor Green
