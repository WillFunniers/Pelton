# Known issues

Limits of this upgrade, things that were not verified, and the one place this line
deliberately differs from upstream.

## Not verified by the automated suite

The upgrade was built and tested on Linux, which is not a runtime target for this line. These
were **not** exercised, and should not be read as passing:

| Item | Why |
|---|---|
| Application start and quit | no Windows / WebView2 on the build host |
| PDF viewer rendering | same; only the code path was compiled |
| Data persistence across a restart | same |
| Tray behaviour | same |
| Any real mailbox operation | out of scope by design |

The maintainer's hands-on check is recorded separately in
[WINDOWS-ACCEPTANCE.md](WINDOWS-ACCEPTANCE.md). It covers some of these; it does not cover all
of them, and it is not a substitute for a test suite.

## Deliberate divergence from upstream

### The Sent-copy implementation

This line keeps its own `appendSentFor` rather than upstream's `appendToSent`. The reason is a
deadlock that upstream's version still has: the sync engine yields to the outbox while a row is
mid-send, and a row stays mid-send until the append completes, so an append that takes `syncMu`
waits on the thing that is waiting on it. Upstream's `lockWithin` adds a ten-minute timeout,
which turns the hang into a logged failure rather than fixing it.

The cost is one extra short-lived IMAP connection per sent message. Full reasoning in
[MERGE-DECISIONS.md](MERGE-DECISIONS.md#the-sent-copy-conflict).

**Do not "align with upstream" here** without first re-reading that section and checking
whether the engine still yields to the outbox.

## Build and packaging limits

| Item | Status |
|---|---|
| Windows binaries are unsigned | upstream added SignPath signing, but only in its own CI; local builds do not participate. SmartScreen may warn. |
| Installer payload not byte-compared | no extraction tool on the build host. After installing, compare the installed `Pelton.exe` against the published SHA-256. |
| `internal/desktop` needs GTK to build on Linux | the Linux-only files are parked for local builds. They are `//go:build linux`, so Windows output is unaffected. |

## Migration paths not exercised

| Path | Status |
|---|---|
| Windows → Windows, different machine | not tested; no second machine |
| Windows → Linux | not tested; path rules differ |
| Windows → macOS | not tested |
| 4.6 → 4.8 in place | **tested**, against a database built at the old schema |
| 4.8 → 4.6 downgrade | not tested; expected to work, with the feature loss described in [MIGRATION-OVERVIEW.md](MIGRATION-OVERVIEW.md#rolling-back) |

## Upstream behaviour worth knowing about

These are not defects in this line, but they change what a user sees after upgrading:

- **Remote content filtering moved to parsed HTML.** Upstream now filters after parsing rather
  than before, which closes a splice-back bypass. Printing and PDF export are covered too.
- **Ordinary images are no longer flagged as tracking pixels.** If a message was previously
  showing a blocked-content banner for a plain image, it will not any more.
- **Inline images now appear in the body.** They used to be dropped or read as the text body.
  A test in this line asserted the old behaviour on purpose and was updated.
- **The outbox sends each account's queue independently.** One stuck send no longer holds up
  every other account.

## Open questions for the next upgrade

1. Whether upstream fixes the Sent-copy deadlock, which would let this line drop its own
   implementation.
2. Whether the pdf.js viewer behaves acceptably on a real Windows machine — compiled, not
   rendered, here.
3. Whether the Chinese catalogue still reads correctly in the UI after upstream's string
   additions. Parity is checked mechanically (12 catalogs, 1833 strings); layout is not.
