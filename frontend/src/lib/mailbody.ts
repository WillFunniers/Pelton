// mailbody.ts decides which background treatment a message body gets, given the
// theme and the reading-pane wallpaper.
//
// The decision lives here, apart from MailBody.svelte, because getting it wrong
// is invisible: every transform can be individually correct and fully tested
// while the reader still sees a white message, if the wrong one was chosen for
// their combination of settings. That is exactly what happened - Dark + Wallpaper
// ran the wallpaper transform and never reached the darkening one - and it went
// unnoticed because the tests covered the transforms and nothing covered the
// choice between them. Branch selection is the thing that has to be tested, so it
// is a function rather than an expression inside a component.
//
// The theme decides which transform runs. The wallpaper decides only how much of
// the message's background is left transparent for it. Neither is allowed to veto
// the other.
//
//   theme | wallpaper | treatment
//   ------+-----------+--------------------------------------------------
//   light | no        | raw: mail already assumes a light page
//   light | yes       | soften: the sender's light boxes turned translucent
//   dark  | no        | darken, opaque: repainted in the theme's colours
//   dark  | yes       | darken, translucent: repainted, wallpaper through

import { darkenSenderBackgrounds } from './maildark'
import { softenSenderBackgrounds } from './mailbg'
import { withAlpha, type MailPalette } from './mailpalette'

/** Which treatment a body received. Exported so tests can assert on the choice. */
export type BodyBranch = 'raw' | 'soften' | 'darken'

export interface BodyPlanOptions {
  /**
   * The message's palette, read from the theme tokens. Its `dark` flag decides
   * whether darkening applies, so the theme is resolved once, in one place, and a
   * caller cannot pass a palette that disagrees with its own flag.
   */
  palette: MailPalette
  /** Whether a reading-pane wallpaper is actually showing. */
  wallpaper: boolean
  /** Wallpaper transmission, 0-1: how much of it reaches the message. */
  transmission: number
}

export interface BodyPlan {
  branch: BodyBranch
  /** The message html after its treatment, ready for buildSrcdoc. */
  html: string
  /**
   * The colour the message renders on: what text with no background of its own
   * is judged against, and what the reading iframe paints before it loads.
   */
  pageBackground: string
}

/**
 * Chooses the treatment for one message body.
 *
 * Dark always darkens. A dark theme with a wallpaper darkens the message *and*
 * leaves the wallpaper behind it - the two are independent layers, not
 * alternatives. Softening stays what it always was: the light-theme treatment
 * that lets a wallpaper through a message's own light backgrounds. The two
 * transforms are never combined, because one turns a surface translucent white
 * and the other repaints it in the theme's colours, and the result of both would
 * be a sheet neither was designed to produce.
 */
export function planBody(html: string, options: BodyPlanOptions): BodyPlan {
  const { palette, wallpaper, transmission } = options
  // The slider's meaning is "how much of the sender's background is left", so it
  // is the alpha a repainted surface keeps: 0 leaves the sender's background
  // fully transparent and the wallpaper unmixed, 100 makes it solid and hides the
  // wallpaper. Only the colour behind it changes with the theme - a white scrim in
  // a dark theme is precisely the "white translucent page" this work exists to
  // stop producing.
  //
  // With no wallpaper the message stays fully opaque whatever the slider says:
  // the setting is about what shows through from *behind* the message, and with
  // nothing behind it there is nothing to let through. A translucent message over
  // an opaque frame would only risk the frame showing at the edges.
  const transmissionAlpha = clamp01(transmission)
  const alpha = wallpaper ? 1 - transmissionAlpha : 1

  if (palette.dark) {
    return {
      branch: 'darken',
      // The message is repainted on its own terms. At the default slider position
      // the same message with and without a wallpaper differs only in what is
      // behind it, which is what keeps "dark always darkens" true.
      html: darkenSenderBackgrounds(html, { palette, backgroundAlpha: alpha }),
      pageBackground: wallpaper ? withAlpha(palette.page, alpha).rgba : palette.page.hex,
    }
  }

  if (wallpaper) {
    return {
      branch: 'soften',
      html: softenSenderBackgrounds(html, { opacity: transmissionAlpha }),
      pageBackground: withAlpha({ hex: '#ffffff', rgb: [255, 255, 255] }, transmissionAlpha).rgba,
    }
  }

  return { branch: 'raw', html, pageBackground: palette.page.hex }
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
}

// Content that a reader can see even when the body holds no text at all. A
// message whose only content is an image is not empty, and calling it empty
// would hide it - so any of these makes a body count as having content.
const CONTENT_TAGS = 'img|video|audio|picture|svg|canvas|object|embed|iframe'

// Entities that render as blank space. They occupy layout but no reader can
// read them, so on their own they are not body content.
const BLANK_ENTITY = /&nbsp;|&zwnj;|&zwj;|&thinsp;|&#160;|&#8203;/gi

/**
 * Reports whether a sanitized html body shows the reader anything at all.
 *
 * This exists because an empty body is otherwise indistinguishable from a
 * rendering failure. A real message arrived whose html was a single `<br>` and
 * whose plain-text alternative was one newline; the reading pane painted a large
 * blank surface with nothing to explain it, which reads as "the client is
 * broken" rather than "the sender wrote nothing". Naming the situation is the
 * fix, so the pane needs to be able to tell the two apart.
 *
 * It is deliberately conservative: the answer is only `false` when the body is
 * definitely blank. Every other outcome - any text, any embedded media - is
 * reported as content, because being wrong in that direction merely withholds a
 * hint, while being wrong the other way would hide a message.
 *
 * This is a readability heuristic for a UI hint, not a security boundary. The
 * body it inspects has already been through the backend sanitizer, which is the
 * only thing standing between a message and this renderer.
 *
 * @param html the sanitized html body, i.e. MessageDetail.bodyHtmlSafe
 */
export function hasVisibleContent(html: string): boolean {
  // a comment's contents are not rendered, and a commented-out block would
  // otherwise be read as text or as a media tag that shows nothing
  const markup = html.replace(/<!--[\s\S]*?-->/g, '')
  if (new RegExp(`<(${CONTENT_TAGS})\\b`, 'i').test(markup)) {
    return true
  }
  const text = markup
    .replace(/<[^>]*>/g, '')
    // blank entities first, so the sweep below sees them as the blank they are
    .replace(BLANK_ENTITY, ' ')
    // anything still entity-shaped is real, readable content (`&amp;`, `&copy;`,
    // a named or numeric character reference for a visible glyph)
    .replace(/&[a-z]+;|&#\d+;/gi, 'x')
    .replace(/\s+/g, '')
  return text.length > 0
}
