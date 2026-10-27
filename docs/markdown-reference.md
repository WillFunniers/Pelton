---
title: Markdown feature reference
description: Reference for the markdown extensions enabled in this docs site.
---

# Markdown feature reference

## Admonitions (`admonition`, `pymdownx.details`)

Plain admonition, always expanded:

!!! note "Optional custom title"
    Body text. Supported types: `note`, `abstract`, `info`, `tip`,
    `success`, `question`, `warning`, `failure`, `danger`, `bug`,
    `example`, `quote`.

!!! warning
    Title is optional; omitting it uses the type name ("Warning").

Collapsible version (`???`), starts closed; `???+` starts open:

??? tip "Click to expand"
    Same body rules as a regular admonition.

???+ info "Starts open"
    Useful for "here's the full log" type asides.

## Tabs (`pymdownx.tabbed`, `content.tabs.link`)

`alternate_style = true` gives the pill-style tab bar; `content.tabs.link`
syncs tabs with the same label across the whole page (e.g. every "Linux"
tab switches together, handy for OS-specific steps).

=== "Windows"
    ```powershell
    winget install Pelton
    ```

=== "macOS"
    ```bash
    brew install --cask pelton
    ```

=== "Linux"
    ```bash
    flatpak install flathub app.pelton.Pelton
    ```

## Code blocks (`pymdownx.superfences`, `pymdownx.highlight`, `pymdownx.inlinehilite`)

Fenced, with a language for syntax highlighting:

```go
func main() {
    fmt.Println("hello")
}
```

With a title and line numbers/highlighting:

```go title="main.go" linenums="1" hl_lines="2"
func main() {
    fmt.Println("hello") // this line is highlighted
}
```

With annotations (`content.code.annotate`), numbers become clickable markers:

```bash
pelton --debug # (1)!
```

1. Forces debug logging for this run; see [CLI flags](cli-flags.md).

Inline code with its own language (`pymdownx.inlinehilite`):
here's `#!bash rm -rf ~/.config/pelton` as an inline snippet.

## Keyboard keys (`pymdownx.keys`)

Press ++ctrl+shift+p++ to open the command palette, or ++cmd+k++ on macOS.

## Tables (`tables`)

| Platform | Package format   | Auto-update |
| -------- | ---------------- | :---------: |
| macOS    | `.dmg`            | ✅          |
| Windows  | `.msi`            | ✅          |
| Linux    | Flatpak / AppImage | depends   |

## Task lists (`pymdownx.tasklist`)

- [x] Download the installer
- [ ] Launch Pelton
- [ ] Add your first account

## Definition lists (`def_list`)

`IMAP`
:   Protocol used to fetch and sync mail from the server.

`SMTP`
:   Protocol used to send mail through the server.

## Footnotes (`footnotes`)

Here's a sentence with a footnote.[^1] And another one.[^long]

[^1]: The footnote text goes here.
[^long]: Footnotes can hold multiple paragraphs and even code:

    ```bash
    echo "still part of the footnote"
    ```

## Attribute lists (`attr_list`) and tooltips (`content.tooltips`)

Add classes, ids, or a title (rendered as a tooltip) to almost anything:

[Download the latest release](https://github.com/peltonapp/Pelton/releases){ .md-button title="Opens GitHub Releases" }

A span with a tooltip: [hover me](#){ title="I'm a tooltip" }.

## Icons (vendored tabler set, `overrides/.icons/tabler/`)

Only icons actually present under `overrides/.icons/tabler/` render; add
the SVG there before using a new one. Currently vendored: `world`,
`brand-github`, `brand-discord`, `sun`, `moon`.

:tabler-world: Cross-platform :tabler-brand-github: Open source

## HTML mixed with markdown (`md_in_html`)

<div class="grid" markdown>

**Card one**
:   Ordinary markdown works inside this `<div>` because of `markdown="1"`
    (here spelled `markdown` as an attribute on the tag).

**Card two**
:   Useful for custom layout blocks styled in `stylesheets/pelton.css`.

</div>

## Headings and permalinks (`toc`, permalink = true)

Every heading below H1 gets a `#` permalink on hover, and shows up in the
right-hand table of contents (`toc.follow` keeps it scrolled to the active
section).

### A third-level heading

Text under it.

## Links

- Internal: [FAQ](faq.md)
- Internal with heading anchor: [a third-level heading](#a-third-level-heading)
- External: [pelton.app](https://pelton.app)

## What's deliberately NOT available

No emoji shortcodes (`:smile:`) and no math (`$...$`), both would pull
from a CDN at build time, which breaks the no-CDN check in
`.github/workflows/docs.yml`. Don't add the `pymdownx.emoji` or `mdx_math`
/ `pymdownx.arithmatex` extensions without sourcing them locally first.
