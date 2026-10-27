// rtlfont.ts loads the Arabic face, and only when something needs it (#356).
//
// Familjen Grotesk, the interface font, ships latin, latin-ext and vietnamese
// and has no Arabic glyphs at all. Without a face that does, Arabic chrome
// falls through to whatever the operating system provides: fine on macOS and
// Windows, but not guaranteed on Linux, where a machine with no Arabic font
// installed renders the whole interface as empty boxes.
//
// Noto Sans Arabic is bundled through @fontsource, so it is served from the app
// like the other two and never fetched from a cdn. It is imported here rather
// than in main.ts so a reader who never selects a right-to-left language does
// not download a font for a language they do not use.

/**
 * The family to append to a font stack so Arabic has something to render with.
 *
 * Appended at the end rather than inserted before the generic fallback, which
 * is safe because css font fallback runs per character: a generic that resolves
 * to a face without Arabic glyphs is skipped for those characters and the next
 * family in the list is tried.
 */
export const arabicFallback = '"Noto Sans Arabic"'

let loading: Promise<unknown> | null = null

/**
 * Loads the Arabic face once. Repeat calls share the first load, and a failed
 * load is not retried: a missing font is a degraded interface, not a broken
 * one, and retrying on every language change would not make it arrive.
 */
export function ensureArabicFont(): Promise<unknown> {
  // the arabic-*.css entries carry only the Arabic subset, rather than the
  // whole face with latin the interface font already covers.
  loading ??= Promise.all([
    import('@fontsource/noto-sans-arabic/arabic-400.css'),
    import('@fontsource/noto-sans-arabic/arabic-500.css'),
    import('@fontsource/noto-sans-arabic/arabic-600.css'),
    import('@fontsource/noto-sans-arabic/arabic-700.css'),
  ]).catch(() => undefined)
  return loading
}
