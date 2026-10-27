---
title: Theme format
description: The manifest.json schema, the full themeable token list, and the size limits for a Pelton theme.
---

# Theme format

A `.peltontheme` file is a zip archive. At its root sits a `manifest.json`, everything else it references (token files, CSS, icon SVGs, a preview image) lives alongside it inside the same archive.

## `manifest.json`

Only `manifestVersion`, `name`, and `base` are required, everything else has a sensible default or is simply omitted.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `manifestVersion` | number | yes | Must be `1`. A container declaring a newer version than Pelton understands is refused outright, this is a hard format check, not a warning. |
| `name` | string | yes | Display name shown in the theme list. |
| `base` | string | yes | `"light"` or `"dark"`. Sets which built-in tokens a theme doesn't override fall back to. |
| `id` | string | no | Lowercase slug (`a-z0-9-`), used as the theme's folder-safe identifier. Auto-derived from `name` if omitted. |
| `author` | string | no | Shown in the theme list and the import preview. |
| `version` | string | no | Your own version string for the theme, free-form. |
| `description` | string | no | Shown in the import preview and the gallery. |
| `homepage` | string | no | Link shown in the theme list, if set. |
| `license` | string | no | Shown in the theme list, if set. |
| `pelton` | object | no | `{"min": "...", "max": "..."}`, an app-version range the theme was made for. Being outside this range only shows a warning banner on import, it never blocks installation. |
| `tokens` | array or object | no | Either a list of token-file paths (merged in order, later files win) or a single inline `{token: value}` object for a one-file theme. See [Tokens](#tokens). |
| `css` | array of strings | no | CSS file paths, concatenated in this exact order into one injected stylesheet. |
| `preview` | string | no | Path to a screenshot image, shown in the theme list and the gallery. |
| `icons` | object | no | Maps an icon name to an SVG file path. See [Icons](#icons). |

## Tokens

Only the tokens below can be overridden. Spacing and density tokens are deliberately not themeable, they're a separate setting, and a theme overriding them would mess with it and break layouts.

| Group | Tokens |
| --- | --- |
| Surfaces | `surface-base`, `surface-raised`, `surface-overlay`, `surface-sunken`, `surface-hover`, `selection-bg`, `selection-bg-strong` |
| Text | `text-primary`, `text-secondary`, `text-tertiary`, `text-inverse`, `link` |
| Borders | `border-subtle`, `border-default`, `border-strong`, `hairline` |
| Accent | `accent`, `accent-fg` |
| Semantic | `success`, `success-bg`, `warning`, `warning-bg`, `danger`, `danger-bg` |
| Radii | `radius-control`, `radius-card`, `radius-none` |
| Fonts | `font-ui`, `font-mono` |
| Type sizes | `fz-meta`, `fz-label`, `fz-list`, `fz-body`, `fz-heading`, `fz-title` |
| Font weights | `fw-regular`, `fw-medium`, `fw-semibold`, `fw-bold` |
| Elevation | `shadow-overlay` |

A token value can be anything a CSS custom property normally holds, colors, `color-mix()`, font stacks, sizes, shadows, up to 300 characters. It can't contain `; { } < > @ \`, control characters, or `url(...)`, this keeps a token value from escaping into a CSS rule or fetching something.

## CSS

Anything the token list doesn't cover can go in a theme's CSS files, there's no allowlist for CSS the way there is for tokens. They're concatenated in the order listed under `css` and injected after Pelton's own stylesheet, so they win on specificity without `!important`.

CSS can technically reach spacing too, but overriding it messes with the user's own density setting, so it's best left alone, see [Create a theme](create.md#6-share-it) for the full reasoning.

A `url()` inside your CSS that points outside the theme file itself (a remote font, a remote image) is flagged: on import, Pelton shows an explicit warning and defaults to blocking it, the user can choose to allow it, but nothing loads silently.

## Icons

`icons` maps a Tabler icon name (the name Pelton uses internally, lowercase and kebab-case, with the `Icon` prefix dropped) to an SVG file path in your container. Draw icons with `currentColor` so they follow the surrounding text color rather than a fixed one.

Every icon SVG is sanitized before use: no `<script>`, no event-handler attributes (`onclick=` and friends), no `javascript:` links, no `<iframe>`, `<foreignObject>`, `<embed>`, `<object>`, `<use>`, or `<animate>` elements, no `href`/`xlink:href`, no `url()` or `@import`, and no `DOCTYPE`/`ENTITY` declarations. Anything else valid in plain SVG markup is fine.

## Size limits

| Limit | Value |
| --- | --- |
| Container file (compressed) | 20 MB |
| Any single file | 10 MB |
| All CSS files combined | 1 MB |
| One icon SVG | 256 KB |
| One bundled asset (font, image), inlined | 5 MB |
| Number of files in the archive | 512 |
| One token value | 300 characters |

## A complete example

`manifest.json`, based on Pelton's bundled Nord theme, keeps only metadata and points at a separate token file:

```json
{
  "manifestVersion": 1,
  "id": "nord",
  "name": "Nord",
  "author": "Pelton",
  "version": "1.0",
  "description": "Cool arctic dark palette based on Nord by Sven Greb.",
  "license": "MIT",
  "base": "dark",
  "tokens": ["tokens/colors.json"]
}
```

`tokens/colors.json`, a plain `{token: value}` object:

```json
{
  "surface-base": "#2e3440",
  "surface-raised": "#3b4252",
  "surface-overlay": "#434c5e",
  "surface-sunken": "#272c36",
  "surface-hover": "#404a5c",
  "text-primary": "#eceff4",
  "text-secondary": "#d8dee9",
  "text-tertiary": "#8b95a7",
  "border-subtle": "rgba(216, 222, 233, 0.1)",
  "border-default": "rgba(216, 222, 233, 0.16)",
  "border-strong": "rgba(216, 222, 233, 0.28)",
  "success": "#a3be8c",
  "success-bg": "color-mix(in srgb, #a3be8c 16%, transparent)",
  "warning": "#ebcb8b",
  "warning-bg": "color-mix(in srgb, #ebcb8b 16%, transparent)",
  "danger": "#bf616a",
  "danger-bg": "color-mix(in srgb, #bf616a 16%, transparent)"
}
```

`tokens` also accepts a single inline object instead of a file list, the engine supports it, but keeping colors in their own file is easier to maintain and is what every example on this site uses. See [Create a theme](create.md) for the full folder layout, including where CSS files fit in.

## Need help?

See [Support](../support.md).
