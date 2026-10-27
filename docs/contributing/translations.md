---
title: Translating Pelton
description: How Pelton's UI strings are localized and how to add or improve a translation.
---

# Translating Pelton

!!! tip "New here?"
    Worth reading the [Contributing guidelines](guidelines.md) first, they
    cover ground rules and the PR workflow this guide assumes.

## Where translations live

UI strings live in `frontend/src/lib/locales/`, one TypeScript file per
language: `en.ts`, `de.ts`, `fr.ts`, `nl.ts`, `es.ts`, `it.ts`, `pl.ts`, `tr.ts`, `pt.ts`, `ar.ts`, `zh-CN.ts`. Each file
exports a flat `Record<string, string>` keyed by a dotted, feature-prefixed
key, for example:

```ts
const en: Record<string, string> = {
  'menu.compose': 'Compose',
  'shortcut.search': 'Search',
  'settings.about': 'About',
  // ...
};
```

English (`en.ts`) is the source of truth. Every other file mirrors its
keys with a translation for that language.

## Adding or fixing a translation

1. Open the locale file for the language you're editing.
2. Find the key (search for its English value in `en.ts` if you're not
   sure which key it is).
3. Change the string on the right-hand side of the `key: 'value'` pair.
   Don't change the key itself, only the value.

```ts
// de.ts
'menu.compose': 'Verfassen',
```

There's no build step to run and no key-enforcement check, a locale file
can be missing a key without failing anything, it just falls back silently.
So if you're adding a **new** key (as part of a feature, not a
translation fix), add it to all seven locale files, not just `en.ts`. A
reasonable best-effort translation is fine for languages you don't speak
natively, flag it in your pull request if you're unsure.

## Adding a new language

There's no scaffolding command for this yet:

1. Copy `en.ts` to a new file named after the language's
   [ISO 639-1](https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes)
   code, e.g. `it.ts` for Italian.
2. Translate every value, keeping every key unchanged. Watch for strings
   with an interpolated `{variable}`: some languages need the sentence
   reordered so a case suffix or particle doesn't glue onto the
   placeholder (Turkish's `tr.ts` rephrases "Move to {folder}" as
   "{folder} klasörüne taşı" for this reason).
3. Register the language everywhere its code is checked, not just in
   `i18n.ts`:
      - `frontend/src/lib/i18n.ts`: add it to the `Locale` type, the
        `locales` array, `localeNames` (the language's own spelling of
        its name, not a translation), and the `loaders` map
        (`import('./locales/xx')`).
      - `frontend/src/lib/flags.ts`: add a `defaultCountry` entry so the
        phone/region picker has a sensible default for it.
      - `internal/desktop/menu_i18n.go`: add a native-menu string block
        (used for the OS menu bar, which isn't rendered by the frontend).
      - `internal/desktop/notify.go`: add new-mail notification strings.
      - `internal/desktop/bind_locales.go`: add it to `builtinLocales`, so
        it's accepted as a base for a user-defined custom locale.
4. Open a pull request, a native or fluent speaker reviewing it is
   welcome but not required to get it merged. If the first pass was
   drafted with AI assistance, say so in the PR and have it reviewed
   in-app by a native or fluent speaker before merging.

## Need help?

See [Support](../support.md).
