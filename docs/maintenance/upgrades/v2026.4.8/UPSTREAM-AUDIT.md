# Upstream version audit

What the upgrade target actually is, and how that was established. Everything else in this
directory depends on this being right, so it was verified four independent ways rather than
carried over from an earlier note.

## Result

| | |
|---|---|
| Latest **stable** release | **`v2026.4.8`** |
| Published | 2026-11-14T13:30:04Z |
| Tag object | `3c2b5435e29aba987c43cb4a9be2675e46f1407c` |
| Commit | `31ca1d3e08ed7171c30791d7db5fb0dc4c1581ac` |
| Pre-release? | No |
| Draft? | No |

The base this customization was written against:

| | |
|---|---|
| Base release | `v2026.4.6` |
| Commit | `79c985811980af7c1c0058321c0854c313b0f994` |
| Published | 2026-10-26T15:32:20Z |

## How it was verified

Four sources, all agreeing:

1. **GitHub Releases API** — `GET /repos/peltonapp/Pelton/releases?per_page=30`, HTTP 200,
   25 entries. `v2026.4.8` carries `prerelease: false`, `draft: false`.
2. **GitHub Tags API** — `GET /repos/peltonapp/Pelton/tags?per_page=50`, HTTP 200, 28 entries.
   `v2026.4.8` → `31ca1d3e08ed`.
3. **`git ls-remote --tags`** — the annotated tag object and the commit it points at:

   ```
   3c2b5435e29aba987c43cb4a9be2675e46f1407c	refs/tags/v2026.4.8
   31ca1d3e08ed7171c30791d7db5fb0dc4c1581ac	refs/tags/v2026.4.8^{}
   89d45733cb04d5b0779d918de6eed9cf58e77f3a	refs/tags/v2026.4.6
   79c985811980af7c1c0058321c0854c313b0f994	refs/tags/v2026.4.6^{}
   ```

4. **`git ls-remote HEAD refs/heads/main`** — the default branch, for contrast:

   ```
   011aeb6f0e3fd4063037fa0d1fe83b1f528e1897	HEAD
   011aeb6f0e3fd4063037fa0d1fe83b1f528e1897	refs/heads/main
   ```

## What was deliberately not used

| Candidate | Why not |
|---|---|
| `nightly-2026.11.15` | `prerelease: true`. Its own release title says "untested, not a release". |
| `main` HEAD `011aeb6f` | Development commits after the tag. Not a release; would ship unreleased work. |
| `v2026.4.7` | A real stable release, but superseded two days later by `v2026.4.8`. |

## A note on an earlier discrepancy

An earlier note in this line's history recorded that the public releases page did not match
the `v2026.4.7` / `v2026.4.8` versions being discussed. Both do exist and both are stable
releases — `v2026.4.7` on 2026-11-13, `v2026.4.8` on 2026-11-14. The earlier mismatch was a
matter of when the page was read, or of a nightly being read as a release. The four checks
above are the record that counts.

## Scope of the upgrade

`v2026.4.6..v2026.4.8` is **93 commits**, 133 files, +7476 / −1214, with no files deleted.

| Area | Files | +/− |
|---|---|---|
| `internal/desktop` | 24 | +1673 / −119 |
| `frontend/src` | 35 | +1611 / −126 |
| `frontend/pnpm-lock.yaml` | 1 | +644 / −577 |
| `internal/mailview` | 6 | +497 / −106 |
| `internal/messageid` (new package) | 4 | +403 / −0 |
| `internal/smtp` | 7 | +390 / −62 |
| `internal/sync` | 9 | +368 / −50 |
| `internal/storage` | 8 | +320 / −24 |
| `internal/rfc822` | 2 | +301 / −15 |
| `internal/imap` | 5 | +278 / −2 |
| `internal/phishing` | 3 | +223 / −7 |
| `internal/outbox` | 3 | +133 / −14 |
| `internal/mailimport` | 2 | +81 / −0 |
| `.github` | 4 | +190 / −19 |
| `packaging` | 5 | +82 / −2 |
| `go.mod` / `go.sum` | 2 | +69 / −69 |
| `build` (NSIS) | 1 | +28 / −2 |
| `docs` | 2 | +27 / −3 |

## What the release contains

Grouped by what it means for this line, not by upstream's own ordering.

### Security

| Commit | Change |
|---|---|
| `a4ef8d2` | Filter remote content and trackers on **parsed** HTML, so they cannot be spliced back together |
| `b021c6b` | Keep blocked remote content out of printing and PDF export |
| `db560ef` | Stop calling ordinary images tracking pixels |
| `29540aa` | Stop warning about mail that links to the sender's own short and sister domains |
| `3bcc70f` | Reject non-UTF-8 sender domains before IDNA |

`internal/mailview/rewrite.go` (new, 187 lines) and `internal/phishing/own.go` (new, 66 lines)
carry most of this. New `bypass_test.go` (102 lines) and `own_test.go` (119 lines) guard it.

### Fixes

Reading pane showing the wrong message; one stuck send holding up the outbox; flag removals
re-adopted on sync instead of pushed; Local Folders needing credentials and not emptying the
trash; `INBOX.` namespace lookup for Sent and Drafts; inline images dropped or read as the
text body; a sender name with a comma splitting into two recipients; default themes lost on
backup import; per-user Windows installs missing from Apps and Features; SMTP `AUTH LOGIN`
fallback when the server does not offer `PLAIN`.

### Features

Bundled pdf.js attachment viewer; `.eml` export; reply ancestry from cached headers; keyboard
selection with a visual mode; link address on hover.

### Data

Two migrations, both additive:

| Migration | Change |
|---|---|
| `0039_pending_flag_mask.sql` | `messages.pending_flag_mask INTEGER NOT NULL DEFAULT 0` |
| `0040_message_threading.sql` | `messages.in_reply_to TEXT`, `messages.[references] TEXT` |

No dropped columns, no type changes, no table rebuilds, no data rewrites.

### Dependencies

Go: bleve 2.6.1→2.6.3, go-smtp 0.25.0→0.25.1, beeep 0.11.2→0.11.3, **wails 2.17.0→2.17.1**,
goldmark 1.8.6→1.8.7, x/image 0.47→0.48, x/net 0.61→0.62, x/oauth2 0.37→0.38, x/text 0.43→0.44,
**modernc.org/sqlite 1.60.1→1.62.0**.

Frontend: svelte 5.57.2→5.57.3, vite 8.3.4→8.3.7, vitest 5.0.5→5.1.0, **jsdom 30.1.3→31.0.0**,
tiptap 3.32→3.33, tabler 3.49→3.51, marked 18.1.1→18.2.0, turndown 7.2.4→7.2.5,
**new `pdfjs-dist@6.4.299`**.

### Build and CI

Release/nightly workflows reworked; new `winget.yml`; new `.signpath/` (Windows code signing
through the SignPath Foundation); new `packaging/winget/`; the NSIS uninstall entry moved from
`HKLM` to `SHCTX` so per-user installs appear in Apps and Features.

## Answers to the questions that decide whether an upgrade is safe

| Question | Answer |
|---|---|
| Did the data directory move? | **No.** `internal/storage/db.go` and `dataDirName()` are untouched across 4.6→4.8. |
| Did the database schema change? | **Yes**, two additive migrations. |
| Is there a first-launch data migration? | **Yes**, but only SQLite `ADD COLUMN`, run by the existing `RunMigrations`. The runner itself is unchanged. |
| Does the search index need rebuilding? | **No.** bleve moved a patch version; the index format is unchanged. |
| Did the local cache format change? | **No.** |
| Did credential storage change? | **No.** |
| Did sync or delete behaviour change? | **Yes**, as improvements: flag removals pushed to the server, per-account outbox queues, `INBOX.` namespace handling. |
| Did packaging or installation change? | **Yes**, but only in upstream's CI and the NSIS uninstall key. Local builds are unaffected. |
