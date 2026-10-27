# Frontend (Svelte 5 + TypeScript)

Read this before touching `frontend/`. See also [design-tokens.md](design-tokens.md)
for UI/CSS rules, which apply to everything in `src/components`.

## Layout

- `src/components/` — feature subfolders: `sidebar`, `settings`, `compose`,
  `wizard`, `common`, `detail`, `list`, `onboarding`.
- `src/stores/` — app state.
- `src/theme/` — design tokens and theme/accent logic.
- `src/lib/` — Wails API bindings, locales.

## Wails bindings

`frontend/wailsjs/` is maintained by hand, but `wails generate module` rewrites
it whenever it runs, so matching what the generator emits is not a style
preference. Anything written differently is rewritten by the next person who
runs it, and lands in their diff as churn that has nothing to do with their
change.

The detail that keeps getting missed is blank lines. In `go/models.ts` a blank
line inside a namespace or a class is a single tab, not an empty line; only the
lines separating one namespace from the next are truly empty. After adding a
DTO by hand, `grep -nP '^$' frontend/wailsjs/go/models.ts` should still match
nothing but those namespace boundaries.

`go/desktop/App.js` and `App.d.ts` have no nesting and use empty lines
throughout, so they need no such care.

## Docstrings

Every exported function, exported type/interface, and public component prop
gets a short doc comment: JSDoc-style `/** ... */` for functions/types, a
comment above `export let` / `$props()` fields for component props. Internal,
unexported helpers only need one if genuinely non-obvious. Keep it short and
factual, don't restate the signature in prose.

## Localization

UI strings live in `src/lib/locales/`. Adding user-facing text means adding the
key to every catalog in that directory, so `ls` it rather than working from a
list: languages get added, and the count grows. English is the source of truth;
other languages can be a reasonable best-effort translation, flag it if you're
unsure of the translation.

`pnpm run check:locales` compares every catalog against `en.ts` and fails on a
missing key, a key English does not have, or a `{placeholder}` that was dropped
or renamed. CI runs it, so a string added to English alone goes red rather than
rendering as its own key for everyone on another language.

## Testing

`pnpm run check` (svelte-check) and `pnpm run test` (vitest) must both pass. CI
runs both.

Tests live next to what they cover, as `*.test.ts`. The runner is vitest on
jsdom, sharing the Vite config, so there is no second build setup. Component
tests use `@testing-library/svelte`: query by role and label rather than by
class, and drive the component with `@testing-library/user-event` instead of
calling its internals. A component that reports through `createEventDispatcher`
is listened to with mount's `events` option, since Svelte 5 removed `$on`.

`pnpm run test:watch` reruns on save, `pnpm run test:coverage` reports coverage.

jsdom is not the renderer Pelton ships on: the app runs in WKWebView and
WebView2, so layout, real geometry and native behaviour are not covered here.
When touching UI that depends on any of those, still verify via `make run`
before calling a change done (a separate `PELTON_DEV` data dir is used
automatically so this never touches a real install's accounts/mail/settings).
