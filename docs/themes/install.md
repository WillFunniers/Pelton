---
title: Installing a theme
description: How to install a Pelton theme, where theme files live on disk, and what to watch out for.
---

# Installing a theme

A theme file has the extension `.peltontheme`, a zip container holding a `manifest.json` and whatever it references.

## Checklist
<div class="checklist" markdown>
- [ ] Get a `.peltontheme` file, from [themes.pelton.app](https://themes.pelton.app) or someone who sent it to you
- [ ] Import it in Settings > Themes
- [ ] Review the preview before confirming
- [ ] Apply it
</div>

## Steps

1. Open **Settings > Themes**.
2. Click **Import theme...** and pick the `.peltontheme` file.
3. Pelton shows you exactly what the theme changes before installing anything: its metadata, every CSS file it ships (read-only, expandable), and a warning if it references anything outside the file itself. Nothing is installed until you confirm.
4. Once installed, click its card in the list to apply it.

![Settings > Themes, showing the installed theme gallery with New theme, Import theme, Browse themes, Open folder, and Reload](../assets/screenshots/screenshot-settings-themes.png)

**Browse themes** opens the community gallery at [themes.pelton.app](https://themes.pelton.app) in your browser, download a theme there and import it the same way.

!!! warning "Themes are community-submitted"
    Pelton checks every submission to the gallery, but treat a downloaded `.peltontheme` file like anything else you download from the internet, install it at your own risk. The sandboxing described in [Themes](index.md#what-a-theme-can-and-cant-do) limits what a theme *can* do, it isn't a guarantee nothing was missed.

## Where themes live

Installed themes (including the six bundled defaults: gruvbox-dark, midnight, nord, paper, solarized-dark, solarized-light) are stored as `.peltontheme` files in a folder next to Pelton's database:

=== "Windows"
    ```text
    %AppData%\Pelton\themes\
    ```
=== "macOS"
    ```text
    ~/Library/Application Support/Pelton/themes/
    ```
=== "Linux"
    ```text
    ~/.config/Pelton/themes/
    ```

**Settings > Themes > Open folder** takes you straight there. This is also where you'd manually drop a theme file if you don't want to use the import dialog, use **Reload** afterward to pick it up.

## Need help?

See [Support](../support.md).
