# Repository context for the issue labeller

This file is read verbatim into the system prompt of the model that labels new
issues (`.github/workflows/label-issue.yml`). Edit it to change how issues are
classified: it is the tuning surface, the workflow is just plumbing.

Keep it short. Every line here is sent on every issue.

## What Pelton is

A free, cross-platform desktop email client built around privacy. Go with a
Wails backend, Svelte 5 and TypeScript in the system webview. It talks IMAP and
SMTP directly to the user's own mail provider. No telemetry, no analytics, and
no server we run sits in the data path.

Users install it on macOS, Windows or Linux and connect their real mailboxes.
Mail is stored locally in SQLite. Deletions can be permanent, and Pelton is not
a backup tool.

## What the areas mean

- **area: backend** — the Go side, `internal/` and `cmd/`. Covers IMAP and SMTP
  connections, syncing, the local SQLite store, credentials and the OS
  keychain, OAuth, TLS and certificate trust, search indexing, PGP and S/MIME,
  phishing detection, CardDAV, the MCP server, import and export. Symptoms
  here read like: mail not arriving, sync stuck or failing, cannot send, login
  or password problems, duplicated or missing messages, database errors.

- **area: frontend** — the Svelte interface under `frontend/`. Covers the
  message list and reading pane, the composer, settings, onboarding, themes,
  keyboard shortcuts and the command palette. Symptoms read like: something
  renders wrong, a button does nothing, layout breaks, wrong colours, an
  element is in the wrong place, text is cut off.

- **area: localization** — translations under `frontend/src/lib/locales/`.
  Wrong, missing or untranslated strings, a language that will not switch,
  right-to-left layout problems, a request for a new language.

- **area: packaging** — installers and distribution: the .deb, the .rpm and
  Copr, the macOS .dmg, the Windows installer and portable exe, Flatpak, Nix,
  and the release workflow. Symptoms read like: will not install, will not
  start after installing, missing dependency, signing or gatekeeper warnings.

- **area: ci** — GitHub Actions workflows themselves. Rare for user-reported
  issues; mostly maintainer-facing.

Choose every area the issue touches. Most issues have exactly one. A feature
that needs work on both the Go side and the interface gets both, and that is
common for anything user-visible with state behind it.

An issue that fits none of these, or that is a question rather than a report,
gets an empty list. Do not force a guess.

## What the priorities mean

These are the options of the organisation's Priority field, not labels.

Judge by what happens to the user, not by how upset the report sounds.

- **Urgent** — mail or data is lost or destroyed, the app cannot start at all,
  credentials or message contents are exposed, or a security flaw is
  described. Anything where waiting makes the damage worse.

- **High** — a core job is broken with no workaround: cannot send, cannot
  receive, sync fails, an account cannot be added, the app crashes in normal
  use.

- **Medium** — something is broken but there is a way around it, or it affects
  part of the app rather than its core. Most feature requests land here.

- **Low** — cosmetic, wording, a nice-to-have, or a rare edge case.

If the report is vague and you cannot tell, choose `Medium`.

## What the efforts mean

Estimate the work to do it, not how much it matters. Priority and effort are
independent: a one-line fix can be urgent, and a nice-to-have can be huge.

- **Low** — a contained change in one place: wording, a colour or spacing fix,
  a missing translation, a guard on one condition, a new setting that toggles
  something that already exists.

- **Medium** — real work inside one area: a new component or settings panel, a
  bug whose fix spans a few files in one Go package, a new keyboard shortcut
  with its own state.

- **High** — the change crosses the Go and Svelte sides, alters the database
  schema or a stored format so existing installs need migrating, adds a
  protocol or provider integration, or touches sync, crypto or credentials.
  Anything that needs a design decision before it can be written.

If you cannot tell from the report, choose `Medium`.

## What the types mean

- **Bug** — something behaves other than it should.
- **Feature** — a request for something Pelton does not do yet.
- **Task** — maintenance, docs, chores, refactors, questions.
