# Pelton Personal

A personal fork of [Pelton](https://github.com/peltonapp/Pelton) — the open-source,
privacy-first desktop email client (Go + Wails backend, Svelte 5 frontend) — with a
Simplified Chinese interface and a small set of local customisations.

- **Upstream base**: `v2026.4.6` (commit `79c9858`)
- **This line's version string**: `v2026.4.6_zh.1`
- **Licence**: GPL-3.0-or-later, unchanged from upstream. See [LICENSE](LICENSE).
- **Platform builds**: Windows x86-64 (built and tested by the maintainer);
  macOS and Linux are unmodified upstream code paths and have not been verified here.

This is not an official Pelton release and is not endorsed by the upstream project.
Bug reports about upstream behaviour belong upstream; issues introduced by this fork
are listed under [docs/personal/features.md](docs/personal/features.md) and are my own.

## What differs from upstream

Everything else — sync engine, IMAP/SMTP handling, database schema, theming system,
licensing and privacy behaviour — is upstream code. In short:

| Area | Change |
|---|---|
| Localisation | Simplified Chinese catalog (`zh-CN`), 12 catalogs kept key-identical |
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
[licenses/manifest.json](licenses/manifest.json). Localisation work, the provider presets and
the customisations described above were written for this fork.

Because this is a GPL-3.0-or-later derivative, redistribution is welcome under the same
licence. If you run a modified version, keep the upstream copyright notices and licence text.

## Privacy

No telemetry, no analytics, no third-party servers in the mail path — the same guarantees
upstream makes, and nothing in this fork adds one. Test fixtures in this repository are
sanitised copies of real messages; see
[frontend/src/test/fixtures/README.md](frontend/src/test/fixtures/README.md).
