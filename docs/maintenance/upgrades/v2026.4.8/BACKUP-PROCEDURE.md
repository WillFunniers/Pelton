# Backup procedure

How to take a copy of a Pelton data directory that is safe to restore. Written for the
maintainer; the commands are Windows PowerShell because that is where this line is built and
tested.

## Before anything: quit Pelton

This is not optional. The database runs in WAL mode, so recent writes may still be in
`pelton.db-wal` rather than in `pelton.db`. Copying while the app runs can capture a snapshot
that is missing transactions.

```powershell
Get-Process Pelton -ErrorAction SilentlyContinue
# no output means it is not running
```

Close the window normally, including any instance minimised to the tray. Do not kill it from
Task Manager: that leaves the same un-checkpointed WAL, for no benefit.

## What to copy

| | Path | Why |
|---|---|---|
| required | `pelton.db` | accounts, mail cache, settings, views, outbox, drafts |
| required | `pelton.db-wal`, `pelton.db-shm` | un-checkpointed transactions, if present |
| required | `themes\` | user-installed themes |
| required | `locales\` | user-provided language packs |
| optional | `attachments\` | attachment cache; large, and re-downloadable |
| skip | `search.bleve\` | rebuilt on demand |
| skip | `logs\` | may contain subjects and senders; not worth carrying |

## Full backup

```powershell
$src   = "$env:APPDATA\Pelton"
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$dst   = "$env:USERPROFILE\Pelton-backup-$stamp"

Copy-Item -Path $src -Destination $dst -Recurse -Force
Remove-Item -Path "$dst\logs" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "backup written to $dst"
```

## Minimal backup

Only the data that cannot be regenerated:

```powershell
$src   = "$env:APPDATA\Pelton"
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$dst   = "$env:USERPROFILE\Pelton-backup-$stamp"
New-Item -ItemType Directory -Path $dst | Out-Null

foreach ($item in @("pelton.db", "pelton.db-wal", "pelton.db-shm")) {
    $p = Join-Path $src $item
    if (Test-Path $p) { Copy-Item $p $dst }
}
foreach ($dir in @("themes", "locales")) {
    $p = Join-Path $src $dir
    if (Test-Path $p) { Copy-Item $p $dst -Recurse }
}
```

## Permissions

`Copy-Item` keeps content and timestamps but not ACLs. That is fine here — the data is only
ever read by the current user — but the backup should not be readable by anyone else:

```powershell
icacls "$dst" /inheritance:r /grant:r "$env:USERNAME:(OI)(CI)F"
```

If ACLs matter, use `robocopy` instead: `robocopy "$src" "$dst" /E /COPY:DAT /R:1 /W:1`.

## Encryption

The data directory contains cached mail bodies, which is personal correspondence.

| Where the backup goes | Requirement |
|---|---|
| stays on this machine | plain is acceptable, but restrict the ACL anyway |
| external drive, network share, another machine | **encrypt** |
| any online service | **encrypt**, and keep the password elsewhere |

```powershell
# 7-Zip, with the file names encrypted too
7z a -t7z -mhe=on -p "$env:USERPROFILE\Pelton-backup-$stamp.7z" "$dst\*"
```

The password is yours to choose and yours to keep. Nothing in this repository generates,
records, or suggests one. Losing it means losing the archive.

## Verifying the backup

### File hashes

```powershell
Get-ChildItem -Path "$dst" -Recurse -File |
  Get-FileHash -Algorithm SHA256 |
  Select-Object Hash, Path |
  Export-Csv "$dst-SHA256.csv" -NoTypeInformation -Encoding UTF8
```

### Database integrity — the check that matters

```powershell
sqlite3 "$dst\pelton.db" "PRAGMA integrity_check;"
# expect: ok

sqlite3 "$dst\pelton.db" "SELECT COUNT(*) FROM messages;"
sqlite3 "$dst\pelton.db" "SELECT COUNT(*) FROM accounts;"
```

Write both counts down. They are what a restore is verified against.

## Done when

- [ ] Pelton is not running
- [ ] `pelton.db` and its `-wal` / `-shm` companions are copied
- [ ] `themes\` and `locales\` are copied
- [ ] `PRAGMA integrity_check` returns `ok`
- [ ] message and account counts are recorded
- [ ] hashes are recorded
- [ ] if the backup leaves this machine, it is encrypted and the password is stored elsewhere
