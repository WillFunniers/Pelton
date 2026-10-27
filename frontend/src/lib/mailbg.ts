// Mail that sets its own opaque background hides the reading-pane wallpaper
// behind a solid slab, which is most visible in the wide margins these
// newsletter/card layouts leave empty. Declarations like that arrive as inline
// `style` attributes, and an inline declaration outranks anything the reading
// iframe's own stylesheet can say about the same element, so the pane cannot
// paint over them from the outside: the sender's value simply wins.
//
// Softening them here is what lets the wallpaper reach the message. Only
// backgrounds that are actually light are touched, and only their alpha
// changes, so a designed light page keeps its tint under the wallpaper.
//
// The one rule that matters is that a softened layer must never sit inside
// another one. Real mail nests its backgrounds several deep - a typical card is
// a light <body>, a light <td>, then a white <table> - and translucent layers
// multiply: three of them at 0.30 leave (1-0.30)^3 = 34% of the wallpaper, and
// the reader sees almost none of it. So the softening is applied to the
// outermost light background of each nesting chain only, and every light
// background inside it is made fully transparent instead, which keeps the
// wallpaper coming through at the chosen strength no matter how deep the
// message nests.

import { parseColor, relativeLuminance } from './mailcolor'

/** Default opacity of a message's light background, 0-1. */
export const DEFAULT_MAIL_BG_OPACITY = 0.3

export interface SoftenOptions {
  /** How solid the message's own light background stays, 0-1. */
  opacity?: number
}

// parseColor and relativeLuminance live in mailcolor so both body transforms
// (this one and maildark) share one definition of each. The threshold stays
// local because "light enough to soften" is this transform's own decision.

// The luminance above which a background counts as light enough to soften.
// 0.5 is mid-grey, the point where a colour stops reading as a light surface.
const LIGHT_LUMINANCE = 0.5

function isLight(value: string): boolean {
  const rgb = parseColor(value)
  return rgb !== null && relativeLuminance(rgb) > LIGHT_LUMINANCE
}

// Tags that open a nesting level for background purposes. Anything not listed
// (br, img, ...) carries no children, so it can never wrap another background
// and does not affect the depth tracking.
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

// Tags whose background is transparent for practical purposes even when the
// element wraps other content, so they do not count as "a background above".
const BACKGROUNDLESS = new Set(['html', 'head'])

/**
 * Rewrites a message's own light, opaque backgrounds so the reading-pane
 * wallpaper shows through them, leaving dark backgrounds and every non-colour
 * declaration untouched.
 *
 * Dark backgrounds are deliberately preserved: mail that paints a dark page
 * does so to carry light text, and washing that out to a light scrim would
 * leave the message unreadable - the same failure the reading iframe's fixed
 * light page exists to prevent.
 *
 * @param html the sanitized message body
 * @param options opacity is how solid the sender's light backgrounds stay, 0-1
 */
export function softenSenderBackgrounds(html: string, options: SoftenOptions = {}): string {
  if (html === '') {
    return html
  }
  const opacity = clamp01(options.opacity ?? DEFAULT_MAIL_BG_OPACITY)
  // The outermost light background carries the chosen alpha; nested ones go
  // fully transparent so the strength does not multiply with depth. 0 leaves
  // the sender's background invisible (the wallpaper shows unmixed) and 1
  // leaves it exactly as written.
  const scrim = `rgba(255,255,255,${opacity})`

  // Tags currently open that have been given the scrim. A close tag carries no
  // attributes of its own, so the depth has to be tracked from the open tags
  // themselves rather than by re-reading the closing element.
  const openScrims: string[] = []

  return html.replace(/<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g, (match, slash: string, tagName: string, attrs: string) => {
    const tag = tagName.toLowerCase()
    const isClose = slash === '/'

    if (isClose) {
      // pop to the matching open, tolerating mail that never closed a tag
      const at = openScrims.lastIndexOf(tag)
      if (at >= 0) {
        openScrims.length = at
      }
      return match
    }

    // Self-closing tags and empty elements never contain anything, so they take
    // the scrim on their own box without opening a nesting level.
    const selfClosing = /\/\s*$/.test(attrs) || VOID_TAGS.has(tag)
    if (BACKGROUNDLESS.has(tag)) {
      return match
    }
    if (!hasLightBackground(attrs)) {
      return match
    }

    // The outermost light background carries the chosen strength; anything
    // nested inside it is cleared, so exactly one translucent layer exists in
    // the chain and the strength cannot multiply with nesting depth.
    const outermost = openScrims.length === 0
    const replacement = rewriteBackgrounds(attrs, outermost ? scrim : 'rgba(255,255,255,0)')

    if (!selfClosing) {
      openScrims.push(tag)
    }
    return `<${tagName}${replacement}>`
  })
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_MAIL_BG_OPACITY
}

/** Whether an element's attributes declare a light background colour. */
function hasLightBackground(attrs: string): boolean {
  return backgroundValue(attrs) !== null
}

// backgroundValue returns the colour an element paints as its background, or
// null when it paints none (or paints something this transform refuses to
// judge, like a gradient or an image).
function backgroundValue(attrs: string): string | null {
  const style = attrs.match(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i)
  const styleBody = style ? (style[2] ?? style[3] ?? '') : ''
  for (const decl of styleBody.split(';')) {
    const at = decl.indexOf(':')
    if (at < 0) {
      continue
    }
    const prop = decl.slice(0, at).trim().toLowerCase()
    const value = decl.slice(at + 1).trim()
    if (prop === 'background-color') {
      if (isLight(value)) {
        return value
      }
    } else if (prop === 'background') {
      // only a bare colour: anything with url()/gradient/position is left alone,
      // since replacing it would drop part of the sender's design
      if (parseColor(value) !== null && isLight(value)) {
        return value
      }
    }
  }
  const bg = attrs.match(/\sbgcolor\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
  if (bg) {
    const value = bg[2] ?? bg[3] ?? bg[4] ?? ''
    if (isLight(value)) {
      return value
    }
  }
  return null
}

function rewriteBackgrounds(attrs: string, replacement: string): string {
  const styleMatch = attrs.match(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i)
  let styleBody: string | null = null
  if (styleMatch) {
    const dq = styleMatch[2]
    styleBody = dq !== undefined ? dq : (styleMatch[3] ?? '')
  }

  // bgcolor is a legacy HTML attribute, not a CSS declaration: it only accepts
  // the old colour syntax. A translucent value written into it is not ignored -
  // browsers re-parse the string as a legacy colour, so
  // bgcolor="rgba(255,255,255,0)" renders as rgb(0,80,85), an opaque dark teal.
  // The attribute therefore cannot carry a softened background at all: it is
  // dropped and the equivalent declaration goes into style, which can.
  const hasBgcolor = /\sbgcolor\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.test(attrs)

  let out = attrs
  if (hasBgcolor) {
    out = out.replace(/\sbgcolor\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i, '')
  }

  if (styleBody !== null) {
    const decls = styleBody.split(';')
    const alreadySetsBackground = decls.some((decl) => {
      const at = decl.indexOf(':')
      if (at < 0) {
        return false
      }
      const prop = decl.slice(0, at).trim().toLowerCase()
      return prop === 'background-color' || prop === 'background'
    })
    const rewritten = decls
      .map((decl) => {
        const at = decl.indexOf(':')
        if (at < 0) {
          return decl
        }
        const prop = decl.slice(0, at).trim().toLowerCase()
        const value = decl.slice(at + 1).trim()
        if (prop === 'background-color' && isLight(value)) {
          return ` ${prop}: ${replacement}`
        }
        if (prop === 'background' && parseColor(value) !== null && isLight(value)) {
          return ` ${prop}: ${replacement}`
        }
        return decl
      })
      .join(';')
    // a bgcolor whose element has no background declaration of its own still
    // needs its colour carried over, or dropping the attribute would leave the
    // element uncoloured
    const merged = hasBgcolor && !alreadySetsBackground
      ? `${rewritten.replace(/;\s*$/, '')}; background-color: ${replacement}`
      : rewritten
    return out.replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i, (_m, _q, dq: string | undefined) => {
      const quote = dq !== undefined ? '"' : "'"
      return ` style=${quote}${merged}${quote}`
    })
  }

  if (hasBgcolor) {
    return `${out} style="background-color: ${replacement}"`
  }
  return out
}
