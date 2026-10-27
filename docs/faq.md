---
title: FAQ
description: Frequently asked questions about Pelton.
---

# FAQ

??? question "Which email providers does Pelton support?"
    Pelton supports standard IMAP and SMTP, which covers the vast majority
    of providers out of the box, see
    [Setting up a mailbox](mailbox/index.md). Gmail, iCloud, Outlook,
    Yahoo, Fastmail, and Purelymail all get a dedicated setup flow on top
    of that. Because Pelton is FOSS, the community can add support for
    more providers too.

??? question "Does Pelton work offline?"
    Yes. You can configure Pelton to cache your newest emails locally (you
    choose the timeframe), and you can explicitly mark specific emails to
    be kept offline permanently.

??? question "Does Pelton support PGP/GPG encryption?"
    Yes. See [Encryption keys](features/encryption.md).

??? question "Where is my data actually stored?"
    Your data stays entirely in your control. It's stored in a local
    SQLite database on your machine, and on your original email provider's
    server. Pelton doesn't host or route your data through any
    third-party servers.

??? question "Why use Wails and Go instead of Electron?"
    Speed and memory efficiency. Go and Wails use significantly less RAM
    than heavy Electron wrappers, while still giving a snappy,
    cross-platform UI.

??? question "How does Pelton handle tracking pixels and remote images?"
    This is entirely configurable. By default, remote images and tracking
    pixels are blocked (similar to Thunderbird). A banner appears letting
    you know images were blocked, and you can choose to load them for that
    email if you want to.

??? question "Can I self-host or use a custom database path for sync?"
    Pointing Pelton's SQLite database at a custom path (like a network
    share) isn't recommended or fully tested yet, but it's planned.

??? question "Is there any telemetry or automated crash reporting?"
    No. Pelton has zero telemetry. If you hit a crash or a bug, please
    help out by [opening an issue](reporting-an-issue.md) yourself, Pelton
    won't report it for you.

## Need help?

See [Support](support.md).
