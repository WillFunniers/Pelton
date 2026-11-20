# Upgrade report

How the customization was moved from upstream `v2026.4.6` to `v2026.4.8`, what broke on the
way, and what the tests said afterwards.

## Shape of the work

| | |
|---|---|
| Upstream commits brought in | 93 |
| Files changed | 137 (+7480 / −1234) |
| Files deleted | 0 |
| Conflicted files | 5 |
| Substantive conflicts | 1 |
| Commits added by this line | 4 |

The four commits, in order:

```
322f0115  chore: record upstream v2026.4.6 as the base of this line
b6ac97ab  merge: upstream v2026.4.8
aa24bc91  fix: repair what the upstream merge left behind
8ccb6f66  docs: point this line at upstream v2026.4.8
```

## The merge could not be a plain merge

This repository had **no shared ancestor** with `peltonapp/Pelton`. The import commit
(`9fdf4b0`) was created from a source tree rather than by cloning upstream, so git saw two
unrelated histories and refused the merge outright:

```
fatal: refusing to merge unrelated histories
```

The fix, and why it was done that way, is in [MERGE-DECISIONS.md](MERGE-DECISIONS.md).
In short: one `-s ours` merge against `v2026.4.6` recorded the ancestor without touching a
single file, after which `v2026.4.8` merged as a real three-way merge.

## The five conflicts

| File | Kind | Resolution |
|---|---|---|
| `internal/desktop/bind_sync.go` | **Substantive** | Kept this line's `appendSentFor`; took upstream's `WithBackground` |
| `internal/imap/folders.go` | Additive | Kept upstream's `StripInboxNamespace` and this line's capability notes |
| `internal/rfc822/rfc822_test.go` | Additive | Both sides added tests; kept both |
| `frontend/src/components/detail/MailBody.svelte` | Additive | Both sides added an import; kept both |
| `frontend/src/components/detail/MessageDetail.svelte` | Duplicate | This line already carried upstream's stale-tab branch; kept it once |

Only the first needed a judgement call. It is written up in
[MERGE-DECISIONS.md](MERGE-DECISIONS.md#the-sent-copy-conflict).

## What the automatic merge got wrong

Four defects, all found by running the suites rather than by reading the diff:

| # | Defect | File | Fix |
|---|---|---|---|
| 1 | Lost `strings` import; package did not compile | `internal/storage/outbox.go` | Restored the import |
| 2 | Lost a closing brace where the two sides' tests met | `internal/rfc822/rfc822_test.go` | Restored the brace |
| 3 | Asserted on `appended`, which is what `AppendToSent` records | `internal/desktop/bind_sync_sent_test.go` | Assert on `appendedSent`, which is what this line's `AppendToSentUnlessPresent` records |
| 4 | Checked the Sent copy before the background goroutine had run it | `internal/desktop/bind_sync_sent_test.go` | Wait on `app.sentCopies` |

Defect 3 is worth noting: it is not a typo, it is the test suite noticing that this line and
upstream call different append methods. Defect 4 follows from upstream moving the copy off the
send path (`smtp.WithBackground`), which this line adopted.

## One test that was supposed to fail

`TestScheduledPreviewLeavesInlineCIDUnresolved` asserted that an inline image stays
unresolved, and said so in its own comment:

> This is asserted rather than merely tolerated so that the limit is visible: if the parser
> ever starts surfacing inline parts, this test fails and the resolution path can be turned on
> deliberately.

Upstream `4b1b466` did exactly that. The test now asserts the reference is resolved to a
`data:` URI, and is named `TestScheduledPreviewResolvesInlineCID`. This is the test doing its
job, not a regression.

## Test results

Full detail, including what was **not** run, is in [REGRESSION-TESTS.md](REGRESSION-TESTS.md).

| Check | Result |
|---|---|
| Go build, all packages | pass |
| Go tests, 26 packages | pass |
| Frontend type check | 0 errors, 0 warnings |
| Frontend tests | 57 files, 697 cases, pass |
| Locale parity | 12 catalogs, 1833 strings, agree |
| Frontend build | pass |
| Windows cross-build | pass, 50,401,280 B |
| Build reproducibility | two builds, identical SHA-256 |
| `-trimpath` path leaks | 0 |
| Old-schema database upgrade | pass, no rows lost |

## Customisations

Nothing was lost.

| | |
|---|---|
| Files this line adds | 42 |
| Files this line modifies | 78 |
| Files this line deletes (`.idea/`) | 7 |
| Overlap with upstream's changes to *this line's* files | **0** |
| Customised files byte-identical to before the upgrade | **yes** |

What this line adds, in outline: the scheduled-send panel and preview, the mail body and theme
rendering helpers (`maildark`, `mailbg`, `mailbody`, `mailpalette`, `maildoc`, `mailcolor`,
`glass`), the legacy TLS and IMAP `ID` support older servers need, the date-picker and
send-later menu rework, and the test fixtures and tests that go with them. What upstream
absorbed in the meantime — the Chinese catalogue, keyboard selection, the link hover bar, the
`INBOX.` namespace handling, credential-free Local Folders, and the PDF viewer — is upstream's
work, not this line's.

Upstream never touched `DateTimePicker.svelte`, `Compose.svelte` or `portal.ts`, which is why
the date-picker fix and the send-later menu rework came through untouched.

## What this upgrade did not do

- No behaviour was changed on purpose beyond the merge decisions recorded elsewhere.
- No dependency was upgraded beyond what upstream's own `go.mod` / `pnpm-lock.yaml` specify.
- No test was deleted, skipped or weakened to make the suite pass.
