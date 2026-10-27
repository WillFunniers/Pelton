// cjkfont.ts loads the Simplified Chinese face, and only when something needs
// it, the same way rtlfont.ts loads Arabic.
//
// Familjen Grotesk, the interface font, ships latin, latin-ext and vietnamese
// and has no Han glyphs. macOS and Windows both carry a CJK face of their own
// (PingFang SC, Microsoft YaHei) so the interface falls through to those and
// looks native; a Linux machine with no CJK font installed has nothing to fall
// through to and renders the interface as empty boxes.
//
// Only 400 and 700 are bundled, where Arabic bundles four weights. A Han face
// carries thousands of glyphs, so one weight is about 1.1 MB against Arabic's
// 50 KB, and four of them would put 4.4 MB into every download for every user
// whatever language they read. Regular and bold are what the interface leans
// on; css weight matching resolves the semibold tokens to the nearer of the
// two, which on a Han face is not a difference anyone reads.
//
// Noto Sans SC is bundled through @fontsource, so it is served from the app and
// never fetched from a cdn.

/**
 * The family to append to a font stack so Han characters have something to
 * render with.
 *
 * Appended at the end rather than inserted before the generic fallback, which
 * is safe because css font fallback runs per character: a family without Han
 * glyphs is skipped for those characters and the next one in the list is tried.
 * Sitting last also means a system face is preferred where there is one, so the
 * interface keeps the look of the platform it is running on.
 */
export const chineseFallback = '"Noto Sans SC"'

let loading: Promise<unknown> | null = null

/**
 * Loads the Simplified Chinese face once. Repeat calls share the first load,
 * and a failed load is not retried: a missing font is a degraded interface, not
 * a broken one, and retrying on every language change would not make it arrive.
 */
export function ensureChineseFont(): Promise<unknown> {
  // the chinese-simplified-*.css entries carry only the Han subset, rather than
  // the whole face with the latin the interface font already covers.
  loading ??= Promise.all([
    import('@fontsource/noto-sans-sc/chinese-simplified-400.css'),
    import('@fontsource/noto-sans-sc/chinese-simplified-700.css'),
  ]).catch(() => undefined)
  return loading
}
