# Merge decisions

Two decisions in this upgrade needed judgement rather than mechanics. Both are recorded here
so a future upgrade does not have to rediscover the reasoning.

---

## 1. Merging without a shared ancestor

### The problem

This repository and `peltonapp/Pelton` had **no common commit**. The import commit `9fdf4b0`
was created from a source tree, not by cloning upstream, so:

```
git merge-base HEAD upstream-v2026.4.8   →  (none)
git merge upstream-v2026.4.8             →  fatal: refusing to merge unrelated histories
```

This line had 4 commits; upstream had 869.

### Options considered

| Option | Why not |
|---|---|
| `git merge --allow-unrelated-histories` | Merges the trees, but every file becomes a conflict: git has no base to three-way against. 137 files, all conflicted. |
| Squash upstream into one commit | Loses upstream's history and provenance. The whole point of keeping the tag relationship is that a future upgrade is a normal merge. |
| Re-import from a fresh clone | Discards this line's 4 commits and its customisations. |
| **Graft the ancestor with `-s ours`** | **Chosen.** |

### What was done

```bash
git merge -s ours --no-ff --allow-unrelated-histories upstream-v2026.4.6 \
  -m "chore: record upstream v2026.4.6 as the base of this line"
```

`-s ours` records the merge but keeps **this side's tree entirely**. The result:

| | |
|---|---|
| Commit | `322f0115` |
| Tree before | `09ea71fbd87de7603226fc289d96560b165d4c87` |
| Tree after | `09ea71fbd87de7603226fc289d96560b165d4c87` |
| Files changed | **none** |

Then `v2026.4.8` merged normally, with `79c9858` (the `v2026.4.6` commit) as the merge base:

```bash
git merge --no-ff upstream-v2026.4.8
```

### Why this is safe

- **No history was rewritten.** Both histories are intact; the graft only adds a parent link.
- **No file was touched by the graft.** The tree hash is identical before and after, which is
  checkable: `git diff HEAD^ HEAD` on that commit is empty.
- **The base is honest.** `v2026.4.6` really is the version this line's customisations were
  written against; the commit message says so.
- **Future upgrades are ordinary merges.** With the ancestor recorded, the next upstream tag
  merges with a real three-way base and no special handling.

### What it costs

The repository now contains upstream's full 869-commit history as ancestors. That is the
intended outcome — it is what makes provenance checkable — but it does mean the clone is
larger than a squashed import would have been.

---

## 2. The Sent-copy conflict

### The problem

Both sides implement "put a copy of a sent message in the Sent folder", differently.

| | This line | Upstream v2026.4.8 |
|---|---|---|
| Entry point | `appendSentFor` | `appendToSent` |
| IMAP method | `AppendToSentUnlessPresent` | `AppendToSent` |
| Lock | **does not take `syncMu`** | `lockWithin(&syncMu, 10*time.Minute)` |
| Session | opens its own | `withIMAPSession` |
| Duplicate handling | skips if the server already saved a copy | none |

### Why this line does not take the lock

The comment on `appendSentFor` records a deadlock that was hit in practice:

> It deliberately does not take syncMu, and must not start: the sync holds that lock for a
> whole account and stands aside while the outbox has something ready to go out — a due queued
> message, or one mid-send — while a row stays mid-send until this append has run. Taking the
> lock here put the two in a cycle — the sync never finished because the outbox was busy, the
> outbox never finished because the sync held the lock — and a window in that state stops
> syncing with nothing to show for it.

Upstream's `lockWithin` is the same idea with a ten-minute timeout. A timeout does not break
the cycle; it turns a silent hang into a logged failure after ten minutes, and the send still
does not get its Sent copy.

### Decision

**Keep this line's `appendSentFor`.** Take upstream's `WithBackground` so the copy still runs
off the send path.

```go
psmtp.WithSentAppender(t.appendSentFor(*account)),
psmtp.WithBackground(func(fn func()) {
    t.app.sentCopies.Add(1)
    go func() {
        defer t.app.sentCopies.Done()
        fn()
    }()
}),
```

### What it costs

One extra short-lived IMAP connection per sent message, because the append opens its own
session instead of borrowing the sync engine's. The alternative is a deadlock, so this is the
cheaper of the two.

### If upstream fixes this

The condition to re-check is whether the sync engine still yields to the outbox
(`Engine.YieldTo` → `outboxPending` → `Queue.Pending`) while a row stays mid-send until the
append completes. If that changes, upstream's implementation may become safe to adopt, and this
line could drop its own. Until then, do not "align with upstream" here without re-reading that
comment.

### The test that guards it

`TestTransmitDoesNotWaitForASync` holds `syncMu` and asserts a send still completes. It is the
regression test for the deadlock, and it is why the merge could not simply take upstream's side.

---

## 3. Recommended approach for the next upgrade

With the ancestor now recorded, the next upgrade is:

```bash
git fetch https://github.com/peltonapp/Pelton.git \
  'refs/tags/vX.Y.Z:refs/tags/upstream-vX.Y.Z'
git checkout wymok/main
git merge --no-ff upstream-vX.Y.Z
```

No graft, no `--allow-unrelated-histories`, no special handling. Expect conflicts in
`internal/desktop/bind_sync.go` if upstream keeps touching the Sent-copy path — resolve by
re-reading the deadlock comment above rather than by taking either side wholesale.

Before merging, re-run the audit in [UPSTREAM-AUDIT.md](UPSTREAM-AUDIT.md): confirm the tag is
a stable release and not a nightly, and check whether the data directory or the migration
runner changed.
