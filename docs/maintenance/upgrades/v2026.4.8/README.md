# Upgrading this customization to upstream v2026.4.8

This directory records how the WyMok-maintained customization of Pelton was brought from
upstream `v2026.4.6` to `v2026.4.8`, and what was decided along the way. It is maintenance
history, not user documentation: nothing here is part of the published docs site.

> **This is not an official Pelton release.** It is an unofficial, community-maintained
> customization. Pelton itself is authored and maintained by the peltonapp contributors;
> see [peltonapp/Pelton](https://github.com/peltonapp/Pelton) for the original project,
> its authorship and its history. Nothing here implies upstream endorsement.

## What this covers

| | |
|---|---|
| From | upstream `v2026.4.6` (commit `79c9858`) |
| To | upstream `v2026.4.8` (commit `31ca1d3e`) |
| Upstream commits brought in | 93 |
| Files changed | 137 (+7480 / −1234) |
| Conflicts | 5, of which 1 was substantive |
| Licence | GPL-3.0-or-later, unchanged from upstream |

## Reading order

1. **[UPSTREAM-AUDIT.md](UPSTREAM-AUDIT.md)** — what the upstream release actually is, and
   how that was verified. Start here: everything else depends on the version being right.
2. **[UPGRADE-REPORT.md](UPGRADE-REPORT.md)** — how the upgrade was performed, what broke,
   and what the test results were.
3. **[MERGE-DECISIONS.md](MERGE-DECISIONS.md)** — the two decisions that needed judgement:
   how to merge without a shared ancestor, and which side's Sent-copy implementation to keep.
4. **[REGRESSION-TESTS.md](REGRESSION-TESTS.md)** — what was actually run, and what was not.
5. **[WINDOWS-ACCEPTANCE.md](WINDOWS-ACCEPTANCE.md)** — the maintainer's hands-on check of
   the Windows build, kept separate from the automated results on purpose.
6. **[MIGRATION-OVERVIEW.md](MIGRATION-OVERVIEW.md)** — what a user's data does across this
   upgrade, with [BACKUP-PROCEDURE.md](BACKUP-PROCEDURE.md) and
   [RESTORE-PROCEDURE.md](RESTORE-PROCEDURE.md) for the operational steps.
7. **[KNOWN-ISSUES.md](KNOWN-ISSUES.md)** — limits, unverified paths, and the one place this
   line deliberately differs from upstream.

## Scope

These documents describe **this customization's** upgrade. They are not a guide to upgrading
stock Pelton, and they do not replace upstream's own release notes. Where a behaviour comes
from upstream, it is attributed to upstream; where it is specific to this line, it says so.

## What is deliberately not here

- Build artefacts. Binaries are not committed to this repository; see
  [PELTON-PERSONAL.md](../../../../PELTON-PERSONAL.md) for how to build one.
- The pre-upgrade backup. It is a full copy of the repository and lives outside it.
- Any user data, mailbox content, credential or token. None was ever read.
