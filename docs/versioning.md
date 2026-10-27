---
title: Versioning
description: How Pelton's version numbers work.
---

# Versioning

Up to and including **1.0.9**, Pelton used semantic versioning. From the
next release onward it uses [Calendar Versioning](https://calver.org/)
instead, in the form:

```
YYYY.Q.INCR
```

- **YYYY**, the full calendar year (e.g. `2026`).
- **Q**, the calendar quarter, `1`-`4` (Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 =
  Jul-Sep, Q4 = Oct-Dec).
- **INCR**, the release counter within that quarter. It starts at `0` and
  resets to `0` at the start of each quarter.

The first release of a quarter (`INCR` `0`) drops the trailing `.0`, so it
reads as just `YYYY.Q`. For example:

| Release                             | Version     |
| ------------------------------------ | ----------- |
| First release of Q4 2026 (flagship)  | `2026.4`    |
| Next release that quarter            | `2026.4.1`  |
| The one after                        | `2026.4.2`  |
| First release of Q1 2027             | `2027.1`    |

## Need help?

See [Support](support.md).
