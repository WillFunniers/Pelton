# Windows acceptance

The maintainer's hands-on check of the Windows build, recorded separately from the automated
results on purpose. Everything in this file was done by a person on a real Windows machine;
nothing here was produced by the build host, which has no Windows and no WebView2.

## What was checked

| | |
|---|---|
| Build | `v2026.4.8_zh.1`, portable `.exe` |
| Platform | Windows, x86-64, portable (no installer) |
| Result | **launches and runs; no blocking problem found** |

The portable build was run directly, without installing. The maintainer reported that it works
and that nothing obvious was wrong with it.

## What this does and does not establish

**Establishes:** the binary starts on a real Windows machine and is usable for ordinary work.
That is the check that matters most, because it is the one the build host cannot do.

**Does not establish:** that every feature was exercised. This was a general "does it work"
pass, not a scripted acceptance run. In particular, the following were not individually
confirmed:

- the bundled PDF viewer rendering a real attachment
- reply threading showing the ancestry chain
- `.eml` export producing a file another client can open
- keyboard selection and the vim visual mode
- the link-address hover bar
- data surviving a restart

Those are covered by the automated suite only as far as compilation and unit tests go. See
[REGRESSION-TESTS.md](REGRESSION-TESTS.md#what-was-not-run) for the list of what the suite did
not run.

## Why this file exists

Because "the tests pass" and "it works on the machine it ships to" are different claims, and
conflating them is how a broken release gets published. The automated results are in
[REGRESSION-TESTS.md](REGRESSION-TESTS.md); this file is the human check, with its own limits
stated.

## If something turns out to be wrong

Record it here rather than in the test report, so the two stay distinguishable:

| Date | Build | Symptom | Status |
|---|---|---|---|
| — | — | none reported | — |
