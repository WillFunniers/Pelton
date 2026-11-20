# Restore procedure

How to put a backed-up data directory back. Written for the maintainer; Windows PowerShell,
matching where this line is built and tested.

## Order of operations

Each step depends on the one before it, so do not reorder them.

```
1. Confirm Pelton is not running
2. Confirm the target build is at least as new as the backup's source build
3. Move any existing data directory aside (never delete it)
4. Copy the backup in
5. Launch once and let the migrations run
6. Re-enter the account passwords
7. Verify
```

## Preconditions

| Condition | Why |
|---|---|
| Pelton is not running | a running instance holds the database open |
| The target data directory is empty, or has been moved aside | otherwise this overwrites live data |
| Free space ≥ backup size × 1.2 | SQLite needs room to work |
| Target build ≥ backup's source build | upgrades are supported; downgrades are limited (see below) |

### If the target directory already has data

Move it, do not delete it:

```powershell
if (Test-Path "$env:APPDATA\Pelton") {
    $ts = Get-Date -Format "yyyyMMdd-HHmmss"
    Rename-Item "$env:APPDATA\Pelton" "Pelton.old-$ts"
    Write-Host "existing data moved to Pelton.old-$ts"
}
```

## Restoring

```powershell
Get-Process Pelton -ErrorAction SilentlyContinue   # must print nothing

$dst    = "$env:APPDATA\Pelton"
$backup = "$env:USERPROFILE\Pelton-backup-20261120-1200"   # your path
New-Item -ItemType Directory -Path $dst -Force | Out-Null

foreach ($item in @("pelton.db", "pelton.db-wal", "pelton.db-shm")) {
    $p = Join-Path $backup $item
    if (Test-Path $p) { Copy-Item $p $dst -Force }
}
foreach ($dir in @("themes", "locales")) {
    $p = Join-Path $backup $dir
    if (Test-Path $p) { Copy-Item $p $dst -Recurse -Force }
}
```

Do **not** copy `search.bleve\` (it rebuilds) or `logs\` (they are the old machine's).
`attachments\` is optional: copying it saves a re-download.

## Version compatibility

| Backup from → target | Result |
|---|---|
| 4.6 → 4.8 | supported; migrations 0039/0040 apply on first launch |
| 4.8 → 4.8 | supported |
| 4.8 → 4.6 (downgrade) | works, with limits — see below |
| earlier → 4.8 | supported; migrations apply in order |

### Downgrading

An older build opens a migrated database without complaint: SQLite ignores columns it does not
know. What it loses is the features that read them — reply threading, and the finer-grained
flag push. Nothing is corrupted.

The trap is rolling back by restoring an old snapshot instead of by installing the old build:
that discards everything the new build wrote in between. Pick which copy of the data you want
before you start.

## Verifying

| # | Check | Expected |
|---|---|---|
| 1 | App launches | window appears, no error dialog |
| 2 | Account list | same accounts as before |
| 3 | `SELECT COUNT(*) FROM messages` | matches the count taken at backup time |
| 4 | `SELECT COUNT(*) FROM accounts` | matches |
| 5 | A cached message opens | body renders |
| 6 | Search | returns results, possibly after the index rebuilds |
| 7 | Custom themes | present in the theme list |
| 8 | Custom locales | present in the language list |
| 9 | Outbox and scheduled queue | still there |
| 10 | Folder tree | intact, including Local Folders |

```powershell
sqlite3 "$env:APPDATA\Pelton\pelton.db" "SELECT COUNT(*) FROM messages;"
sqlite3 "$env:APPDATA\Pelton\pelton.db" "SELECT COUNT(*) FROM accounts;"
```

**Passwords will be asked for again.** The keyring is not part of the data directory, so a
restored install starts with no stored credentials. That is expected, not corruption.

## When something goes wrong

### The app will not start

```powershell
Remove-Item "$env:APPDATA\Pelton" -Recurse -Force
Rename-Item "$env:APPDATA\Pelton.old-<timestamp>" "Pelton"
```

Then reinstall the previous build.

### The database is reported as damaged

```powershell
sqlite3 "$env:APPDATA\Pelton\pelton.db" "PRAGMA integrity_check;"
```

If it is not `ok`: delete `pelton.db-wal` and `pelton.db-shm` (they may no longer match the
database), then copy `pelton.db` in again from the backup.

### Search misbehaves

```powershell
Remove-Item "$env:APPDATA\Pelton\search.bleve" -Recurse -Force
```

The index rebuilds on next use.

### Attachments will not open

```powershell
Remove-Item "$env:APPDATA\Pelton\attachments" -Recurse -Force
```

They re-download from the server.

### Full rollback

```powershell
Remove-Item "$env:APPDATA\Pelton" -Recurse -Force
Rename-Item "$env:APPDATA\Pelton.old-<timestamp>" "Pelton"
```

Do this before letting the new build run again, or it may write data the old build cannot see.

## Done when

- [ ] the app launches cleanly
- [ ] message and account counts match the backup
- [ ] at least one cached message opens
- [ ] search works
- [ ] custom themes and locales are listed
- [ ] outbox and scheduled queue are intact
- [ ] every account has been given its password and syncs
