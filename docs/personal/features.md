# Pelton Personal — customisations and what they must keep doing

Each entry says what was added, where it lives, and the behaviour a change must preserve.
Anything not listed here is upstream code.

---

## 1. Simplified Chinese interface

**What**: a `zh-CN` catalog, wired into the language picker and the native menu, so the
whole interface (including menus and notifications) reads in Chinese.

**Where**: `frontend/src/lib/locales/zh-CN.ts`, `frontend/src/lib/i18n.ts`,
`internal/desktop/{bind_locales.go,menu_i18n.go,notify.go}`.

**Must keep**: all 12 catalogs stay key-identical to `en.ts` (`pnpm check:locales` fails
otherwise), and switching language at runtime needs no restart.

## 2. Chinese mail provider presets

**What**: presets for QQ Mail, 163, 126 and 139 (China Mobile), each with its own server
names, ports, TLS mode, app-password warning text and a link to that provider's help page
for enabling IMAP/SMTP and generating an authorisation code.

**Where**: `frontend/src/lib/providers.ts`, `frontend/src/components/wizard/*`.

**Must keep**: every preset's `labelKey`, `noteKey`, `appPasswordKey` and `appPasswordLinkKey`
resolve in all catalogs (`providers.test.ts` asserts this), and the 139 preset keeps
`imap.139.com:993` / `smtp.139.com:465` with implicit TLS on both legs.

## 3. IMAP `ID` and legacy TLS

**What**: the `ID` command (RFC 2971) is sent after login when the server advertises it.
NetEase servers refuse `SELECT` without it, which otherwise shows up as "sync cannot select
anything" rather than as a rejected login. A cap on TLS options allows older servers that
still only speak pre-TLS-1.2 ciphers or use RSA-only suites.

**Where**: `internal/imap/id.go`, `internal/imap/client.go`, `internal/certtrust/legacytls.go`.

**Must keep**: no `ID` is sent to a server that does not advertise the capability (QQ answers
an unknown command with an untagged response and the connection becomes unusable), and the
relaxed cipher path is only used when the strict path fails.

## 4. Sent folder handling and duplicate-append protection

**What**: Sent resolves through the `\Sent` special-use attribute first, then through a name
list that includes the Chinese providers' own spellings (`Sent Messages`, `已发送`,
`已发送邮件`). Appending to Sent checks the folder for the message's `Message-ID` first, so a
provider that already saved its own copy (QQ does, when "save a copy" is on) does not end up
with two identical messages.

**Where**: `internal/imap/append.go`, `internal/desktop/bind_sync.go`.

**Must keep**: a search failure is never treated as "not present" (that would silently drop
the only copy); the append runs on its own short IMAP session and **must not** take the
sync lock — doing so deadlocks a send against a sync that is yielding to the outbox.

## 5. Scheduled send viewer

**What**: a read-only view of mail that is queued to go out later — when, to whom, subject,
full body and attachment list — with a cancel button that reuses the existing atomic cancel.
It reuses the existing MIME parser and sanitiser; it adds no new parser and no remote content.

**Where**: `frontend/src/components/common/{ScheduledPanel,ScheduledPreview}.svelte`,
`frontend/src/lib/scheduled.ts`, `internal/desktop/bind_compose.go`.

**Must keep**: no `innerHTML`, no remote images, encrypted messages preview as "encrypted"
rather than as ciphertext, and cancel stays available even when the preview fails to load.

## 6. A future scheduled message must not stall syncing

**What**: the sync engine stands aside while the outbox has something *ready* to send. A row
that is merely queued for a future time must not count as ready, or a single scheduled message
stops every account from syncing until its time comes.

**Where**: `internal/storage/outbox.go` (`CountOutboxReady`), `internal/outbox/outbox.go`
(`Pending`), `internal/desktop/bind_sync.go` (`outboxPending`).

**Must keep**: `Pending` counts `sending` plus `queued && next_attempt_at <= now`, matching what
the queue actually claims. Any change to that predicate must change both places together.

## 7. Reading pane wallpaper, glass panes and dark mail

**What**: an optional wallpaper behind the reading pane (read from a local file, never
uploaded), translucent list/sidebar glass with blur, a mask under the message so the message
text itself is never blurred, and a dark rendering pass for light HTML mail so it stays
readable over the wallpaper.

**Where**: `frontend/src/theme/{tokens.css,glass.ts}`, `frontend/src/stores/prefs.ts`,
`frontend/src/lib/{mailbg,mailbody,mailcolor,maildark,maildoc,mailpalette}.ts`,
`frontend/src/components/detail/MailBody.svelte`.

**Must keep**: the shipped defaults are deliberate and frozen —
reading-pane image opacity `20`, pane mask blur `0`, list glass density `50`, list glass blur
`16`, and the sidebar is always 12 % more solid than the list. There is no automatic
brightness tiering. Dark mail must not change a message's structure, only its colours.

## 8. Status bar popovers must be clickable

**What**: the status bar is its own stacking context, so its popovers need to sit above the
click-away scrim. A regression here made every control in a popover unclickable while the
backend worked perfectly.

**Where**: `frontend/src/components/common/StatusBar.svelte` (`.statusbar` carries
`isolation: isolate` and `z-index: 100`; `.popover` is `90`, the scrim `80`).

**Must keep**: controls are reachable by a real mouse. Unit tests and `element.click()` bypass
hit-testing and will not catch a regression here; the browser probe clicks for real and checks
`document.elementFromPoint`.

## 9. Per-account proxy routing and mailbox editing

**What**: an optional per-account proxy (scheme/host/port, with credentials) routed through
the existing dialer, and an edit (pencil) action on each mailbox row that opens the mailbox
editor.

**Where**: `frontend/src/lib/proxyroute.ts`, `internal/desktop/bind_account_proxy.go`,
`internal/storage/migrations/0036_account_proxy.sql`,
`frontend/src/components/settings/MailboxesSection.svelte`.

**Must keep**: an account without a proxy behaves exactly as before; proxy credentials live
in the OS keyring like every other credential.

---

## Known limitations in this line

- The reading-pane wallpaper at full strength on a near-white image leaves some secondary text
  below WCAG AA (a deliberate trade-off of the frozen glass defaults above, not a regression).
- Duplicate-append protection relies on `SEARCH HEADER Message-Id`. On servers where that search
  finds nothing (Stalwart is a known case) the failure direction is a second copy in Sent, never
  a lost message.
- Windows is the only platform built and exercised by the maintainer.
