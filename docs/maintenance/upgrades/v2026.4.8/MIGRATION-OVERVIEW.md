# Migration overview

What happens to a user's data across this upgrade, and what to do if it goes wrong. Written
for the maintainer, not for end users — the user-facing story is that upgrading is a normal
install.

## The short version

**Nothing needs to be moved.** The data directory, the database filename and the cache layout
are all unchanged. Installing the new build over the old one and launching it applies two
additive migrations and carries on.

## Where the data lives

| Platform | Path |
|---|---|
| Windows | `%AppData%\Pelton\` |
| macOS | `~/Library/Application Support/Pelton/` |
| Linux | `~/.config/Pelton/` |

Development runs (`PELTON_DEV`) use `Pelton-dev` and nightly builds use `Pelton-nightly` in the
same parent directory. Those are separate data sets; this upgrade does not touch them.

| Path | Contents | Replaceable? |
|---|---|---|
| `pelton.db` | accounts, mail cache, settings, views, flags, outbox, drafts | **no** |
| `pelton.db-wal`, `pelton.db-shm` | SQLite WAL and shared memory | regenerate, but copy them with the db |
| `attachments/` | attachment cache | yes, re-downloaded |
| `search.bleve/` | full-text index | yes, rebuilt |
| `themes/` | user-installed themes | **no** |
| `locales/` | user-provided language packs | **no** |
| `logs/` | logs and crash reports, only if enabled | yes, and best left behind |

Credentials are **not** in the data directory. Passwords and OAuth tokens live in the OS
keyring (Keychain / Credential Manager / Secret Service). A copied data directory therefore
contains no passwords, and a restored one will ask for them again.

## What the upgrade does to the database

Two migrations, both `ADD COLUMN`:

| Migration | Change |
|---|---|
| `0039_pending_flag_mask.sql` | `messages.pending_flag_mask INTEGER NOT NULL DEFAULT 0` |
| `0040_message_threading.sql` | `messages.in_reply_to TEXT`, `messages.[references] TEXT` |

They run on first launch, through the same `RunMigrations` that has always been there. The
runner itself did not change. Existing rows get `0` and `NULL` for the new columns.

Nothing is dropped, renamed, retyped, or rewritten. There is no point at which the old data is
converted and the new data is the only copy.

### Rolling back

An older build can open a database that has had these migrations applied. SQLite ignores
columns it does not know about, so `v2026.4.6` reads the file fine; it simply does not see the
new columns. Reply threading and the finer-grained flag push are the features that depend on
them, so those degrade — but nothing is corrupted and nothing is lost.

The one thing to be careful about: if you roll back by **restoring a pre-upgrade snapshot**
rather than by installing the old build, you lose whatever the new build wrote in the meantime.
Decide which copy of the data you want before rolling back.

## Backup

The full procedure is in [BACKUP-PROCEDURE.md](BACKUP-PROCEDURE.md). The two things that
matter most:

1. **Quit Pelton first.** The database is in WAL mode; copying it while the app runs can
   capture a snapshot that is missing recent transactions.
2. **The backup contains mail.** Encrypt it if it leaves the machine, and keep the password
   somewhere other than next to the archive.

## Restore

The full procedure is in [RESTORE-PROCEDURE.md](RESTORE-PROCEDURE.md). In order: quit the app,
move any existing data directory aside rather than deleting it, copy the backup in, launch,
re-enter passwords, verify.

## Verifying a restore

| Check | Expected |
|---|---|
| App launches | no error dialog |
| Account list | same accounts as before |
| `SELECT COUNT(*) FROM messages` | matches the count taken at backup time |
| `SELECT COUNT(*) FROM accounts` | matches |
| A cached message opens | body renders |
| Search returns results | yes, possibly after the index rebuilds |
| Custom themes and locales | present in their lists |
| Outbox and scheduled queue | still there |

## What this document deliberately does not contain

No mailbox addresses, no message content, no credentials, no tokens, and no paths from the
machine this upgrade was built on. The procedures are written to be run by the person who owns
the data, on their own machine.
