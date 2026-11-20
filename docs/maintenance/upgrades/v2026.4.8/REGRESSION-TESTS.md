# Regression tests

What was run after the merge, and — just as importantly — what was not. A test that was not
run is not a test that passed.

## Environment

| | |
|---|---|
| Host | Linux x86-64 (build machine, not a runtime target) |
| Go | 1.26.8 |
| Node | 24.20.0 |
| pnpm | 10.24.0 |
| Wails CLI | 2.17.0 |
| Cross-compiler | mingw-w64 gcc 13 → `windows/amd64` |

Two environment notes that affect how the commands are run, not what they test:

- **`internal/desktop` needs GTK**, which this host does not have. Its Linux-only files
  (`window_linux.go`, `tray_linux.go`, `tray_linux_test.go`) are moved aside and replaced by a
  `//go:build linux` stub for the duration of a build or test run, then restored. They are
  `//go:build linux`, so the Windows binary is unaffected.
- **The project's build environment targets Windows** (`GOOS=windows`, mingw `CC`), so Go test
  binaries cannot execute on this host. Tests are run with `GOOS=linux CC=/usr/bin/gcc`
  overridden for that command only.

## Automated results

| Check | Command | Result |
|---|---|---|
| Go build, all packages | `go build ./...` | **pass** |
| Go tests, 26 packages | `go test ./internal/...` | **pass** |
| Go tests, `internal/desktop` | same, with GTK files parked | **pass** |
| Frontend type check | `svelte-check` | **0 errors, 0 warnings** |
| Frontend tests | `vitest run` | **57 files, 697 cases, pass** |
| Locale parity | `node scripts/check-locales.mjs` | **12 catalogs, 1833 strings, agree** |
| Frontend build | `vite build` | **pass** |
| Windows cross-build | `wails build -platform windows/amd64 -trimpath` | **pass** |

## Build verification

| Check | Result |
|---|---|
| Output | `Pelton.exe`, 50,401,280 B |
| Version string | `v2026.4.8_zh.1` present once; no `v2026.4.6` left |
| `-trimpath` | build-machine paths: **0** occurrences |
| PE header | `PE32+ executable for MS Windows 6.01 (GUI), x86-64` |
| Reproducibility | two independent builds, **identical SHA-256** |

The size grew by about 5 MB over the previous build, which is the bundled pdf.js viewer.

## Targeted checks

These are the areas the upgrade could plausibly have broken, so they were checked by name
rather than only as part of the full suite.

| Area | Test | Result |
|---|---|---|
| Date picker | `DateTimePicker.test.ts` (7 cases) | pass |
| Send-later menu | `Compose.sendlater.test.ts` (4 cases) | pass |
| Scheduled preview | `ScheduledPreview.test.ts` | pass |
| Sent copy vs sync lock | `TestTransmitDoesNotWaitForASync` and neighbours | pass |
| Remote content | 6 cases in `internal/mailview` | pass |
| Tracking pixels | `TestTrackerBlockingLoadsNoTracker`, `TestInlineMediaIsKeptEvenWithRemoteContentOff` | pass |
| Phishing / own domains | 3 cases in `internal/phishing` | pass |
| Mail rendering | 37 cases in `internal/mailview` | pass |
| Database migrations | `TestThreadingMigrationPreservesLegacyMessages`, `TestMigrationCreatesTheMainProfile` | pass |
| Chinese catalogue | locale parity check above | pass |

## Database upgrade, tested against a real old schema

The migrations were not only read, they were exercised. A database was built at the
`v2026.4.6` schema level (the two new columns dropped, the migration rows removed), a message
was inserted, and the current migrations were then run over it:

```
migrations re-applied cleanly
legacy row: subject="old subject" in_reply_to={ false} references={ false} mask=0
PASS: v2026.4.6 schema upgrades to v2026.4.8 without losing rows
```

The legacy row survived, and the new columns are `NULL` / `0` on it, which is what the
migrations declare.

## What was not run

| Item | Why |
|---|---|
| Application start and quit | No Windows / WebView2 on this host |
| PDF viewer rendering | Same; only the code path was compiled |
| Data persistence across a restart | Same |
| Tray behaviour | Same |
| Any real mailbox operation | Out of scope by design; no real account was touched |

These are covered, where they are covered at all, by the maintainer's hands-on check in
[WINDOWS-ACCEPTANCE.md](WINDOWS-ACCEPTANCE.md). They are **not** covered by the results above,
and should not be read as if they were.

## Nothing was weakened to make this pass

No test was deleted, skipped, or had its assertions relaxed. The one test whose expectation
changed (`TestScheduledPreviewLeavesInlineCIDUnresolved` → `TestScheduledPreviewResolvesInlineCID`)
changed because upstream fixed the behaviour that test existed to detect; its own comment said
it should fail when that happened. See [UPGRADE-REPORT.md](UPGRADE-REPORT.md#one-test-that-was-supposed-to-fail).
