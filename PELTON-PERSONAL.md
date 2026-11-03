# About This Customization

A WyMok-maintained customization of [Pelton](https://github.com/peltonapp/Pelton) — the
open-source, privacy-first desktop email client (Go + Wails backend, Svelte 5 frontend).
The Simplified Chinese catalog was developed here and has since been merged upstream; what
remains specific to this repository is the smaller set of customisations listed below.

- **Upstream base**: `v2026.4.6` (commit `79c9858`)
- **This line's version string**: `v2026.4.6_zh.1`
- **Licence**: GPL-3.0-or-later, unchanged from upstream. See [LICENSE](LICENSE).
- **Platform builds**: Windows x86-64 (built and tested by the maintainer);
  macOS and Linux are unmodified upstream code paths and have not been verified here.

This is not an official Pelton release and is not endorsed by the upstream project.
Bug reports about upstream behaviour belong upstream; issues introduced by this fork
are listed under [docs/personal/features.md](docs/personal/features.md) and are my own.

## Maintainer

WyMok (`WillFunniers`) maintains this customization; upstream Pelton is authored and maintained
by Arne K. and the Pelton contributors — see [AUTHORS.md](AUTHORS.md). This fork is not an
official Pelton release, and nothing here is endorsed by the upstream project. Issues caused by
the customisations belong to this repository; upstream behaviour belongs upstream.

## What differs from upstream

Everything else — sync engine, IMAP/SMTP handling, database schema, theming system,
licensing and privacy behaviour — is upstream code. In short:

| Area | Change |
|---|---|
| Localisation | Extra `zh-CN` strings for the customisations below (scheduled-send viewer, outbox); the catalog as a whole now also ships upstream |
| Mail providers | Chinese presets: QQ Mail, 163, 126, 139 (China Mobile), plus NetEase/QQ app-password guidance |
| Compatibility | IMAP `ID` (RFC 2971) so NetEase servers allow `SELECT`; legacy TLS ciphers for older servers |
| Sent folder | QQ/163 aware Sent folder resolution, with duplicate-append protection |
| Scheduled send | A read-only viewer: list scheduled mail, preview the full message, cancel before it goes out |
| Sync robustness | A future-scheduled message no longer stalls syncing for every account |
| Appearance | Reading-pane wallpaper, glass panes and dark-mail rendering with fixed, deliberate defaults |

The full list, with the behaviour each one is expected to keep, is in
[docs/personal/features.md](docs/personal/features.md).

## Building

Prerequisites match upstream, with one version requirement that matters:

| Tool | Version used |
|---|---|
| Go | 1.26.x (`go 1.26.0` in `go.mod`) |
| Wails CLI | **v2.17.0** — required: `options.App.StartHidden` does not exist in 2.16.0 |
| Node | 24.x |
| pnpm | 10.24.0 (also pinned by `packageManager` in `frontend/package.json`) |

```bash
# dev
cd frontend && pnpm install && cd ..
wails dev

# production build (Windows)
wails build -platform windows/amd64 -trimpath \
  -ldflags "-X main.version=v2026.4.6_zh.1"

# production build with the NSIS installer
wails build -platform windows/amd64 -trimpath -nsis \
  -ldflags "-X main.version=v2026.4.6_zh.1"
```

`-trimpath` is deliberate: it keeps the build machine's paths out of the binary. A build
without it embeds absolute source paths, which is why published artefacts are built with it.

The repository `Makefile` remains the source of truth for the other platforms, exactly as
upstream ships it. The Linux build needs `-tags webkit2_41` and the GTK/WebKit development
packages, again as upstream documents.

## Tests

```bash
# backend
go test ./internal/... ./cmd/...
go vet ./internal/... ./cmd/...

# frontend
cd frontend
pnpm check          # svelte-check
pnpm check:locales  # every catalog must mirror en.ts
pnpm test           # vitest
pnpm build
```

## Attribution

Upstream Pelton is by Arne K. and the Pelton contributors; `AUTHORS.md` and the git history
retain their authorship. Third-party components and their licences are recorded in
[licenses/manifest.json](licenses/manifest.json).

The Simplified Chinese catalog began on this line and was contributed upstream, where it has
been merged and is now maintained as part of Pelton; this repository keeps a copy that carries
the extra strings for its own features. The provider presets, the scheduled-send viewer and the
remaining customisations are maintained only here.

Because this is a GPL-3.0-or-later derivative, redistribution is welcome under the same
licence. If you run a modified version, keep the upstream copyright notices and licence text.

## Privacy

No telemetry, no analytics, no third-party servers in the mail path — the same guarantees
upstream makes, and nothing in this fork adds one. Test fixtures in this repository are
sanitised copies of real messages; see
[frontend/src/test/fixtures/README.md](frontend/src/test/fixtures/README.md).
