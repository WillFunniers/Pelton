// An html message that paints its own light page stays a bright white slab
// inside an otherwise dark window, because mail is written on the assumption
// that it is being rendered on white (see the note in MailBody's buildSrcdoc).
//
// This rewrites the message's own light surfaces, and the dark text sitting on
// them, so the message belongs to the theme it is being read in.
//
// It is deliberately NOT softenSenderBackgrounds. That one makes a light
// background translucent so the reading-pane wallpaper shows through it; this
// one repaints it in the theme's own colours. The two answer different questions
// and MailBody runs exactly one of them, so neither has to reason about the
// other's output.
//
// The colours come from MailPalette (see mailpalette.ts), which reads them from
// the app's theme tokens - so a custom theme themes mail too.
//
// What is deliberately left alone, and why:
//   - backgrounds that are already dark: mail that paints a dark page does it to
//     carry light text, so lightening it would invert the sender's design
//   - saturated colours: a brand blue or a link colour is a design decision, not
//     a neutral surface. This is also what keeps a link readable as a link and a
//     brand button recognisable.
//   - a light background with unsupported syntax (url(), a gradient): there is
//     no single colour to judge, so any rewrite would destroy the design rather
//     than adapt it. The element is still *tracked* as light, so text inside it
//     stays dark and readable - only the box is left as the sender drew it.
//   - images: nothing here touches an <img> or a background image

import { parseColor, relativeLuminance, toHex, type Rgb } from './mailcolor'
import { withAlpha, type MailPalette, type Surface, type TranslucentSurface } from './mailpalette'

// Mid-grey, the point where a colour stops reading as a light surface. Used for
// both directions: above it a background is "light" and gets repainted, below it
// text is "dark" and gets moved onto the palette's light text ramp.
const LIGHT_LUMINANCE = 0.5

// Where on the palette's surface ramp a light background lands. The ramp's top is
// the sender's own lightness: a pure white page lands on the palette's page, and
// each step down in the original's luminance moves a step up the ramp. That is
// the elevation convention every dark ui already uses, and it is what a card
// slightly darker than its page was already expressing, so the relationship
// survives the inversion instead of collapsing. Mapping every light shade onto
// one value flattens a message's section hierarchy into a single sheet, which is
// the difference between a dark theme and a dark screenshot.
//
// The crown is flat, covering the top slice of the light range: a sender writing
// #ffffff next to #fafafa or #f6f7fb is not drawing three surfaces, that range is
// where "white" and "near-white" are used interchangeably for one page, and
// stepping it would invent seams the message never had. Below the crown the ramp
// is linear in luminance, so a step the sender did mean survives.
const SURFACE_CROWN = 0.09

// The sender's text is placed on the palette's text ramp by how dark it was:
// near-black body copy takes the primary text colour, the mid greys mail uses for
// secondary copy take the secondary, and the light greys it uses for meta lines
// take the muted one. The thresholds are the luminances of the greys mail
// actually uses - #333333 is 0.033, #666666 is 0.133, #888888 is 0.246, #999896
// (a real QQ signature line) is 0.318 - so the three roles a sender expresses
// arrive as the three roles the theme defines. Ordering is preserved and inverted
// in the same move: the darkest original stays the most prominent, which is what
// keeps a message's own hierarchy legible.
//
// The boundary between secondary and muted sits above #888888 on purpose. That
// grey is the one senders use for a full line of readable copy, and dropping it
// to the faint role would dim text that was meant to be read - the reference pair
// the reflected ramp was tuned against was exactly #888888.
//
// The ramp is quantised rather than continuous: a palette has three text roles,
// and inventing a shade between them would produce a colour no theme chose and no
// test can name.
const TEXT_LEVELS: { role: 'text' | 'secondary' | 'muted'; maxLuminance: number }[] = [
  { role: 'text', maxLuminance: 0.06 },
  { role: 'secondary', maxLuminance: 0.3 },
  { role: 'muted', maxLuminance: 1 },
]

// Above this saturation a colour carries a brand or a function (a link, a button)
// rather than reading as neutral text, so it is left exactly as sent. #0d7fef
// sits at 0.95 and #1e96eb at 0.87, both well clear of the limit.
const BRAND_SATURATION = 0.35

// Background candidates: the elements that actually paint a box in mail layout.
// Tables and their cells carry most of it, and the block elements cover modern
// markup.
const BG_TAGS = new Set([
  'body', 'div', 'p', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'li', 'ul', 'ol', 'blockquote', 'pre', 'section', 'article', 'header',
  'footer', 'main', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'font',
])

// Text candidates are the narrower set: only elements that carry text, which
// keeps the pass away from images, decoration and structural wrappers.
//
// `a` is in the list, though it is also a link. A link that declares its own
// colour is protected by the saturation rule below, so a blue link keeps its
// blue; an anchor that instead inherits the body colour (the common "w***@qq.com"
// and "support@..." pattern) declares a neutral grey or black and has to move
// with the text around it, or it stays at ~1.3:1 on the darkened page.
//
// `pre` is in the list for the same reason as `a`, and it is not optional: a
// verification code is exactly the thing mail puts in a <pre> with a light
// background and near-black text. It is also in BG_TAGS, so leaving it out here
// repainted its box while leaving its text black - 1.1:1 on a real AFFiNE sign-in
// mail, which is the one string in the message the reader needs.
//
// `table` is in the list although a table is a layout element, because declaring
// the text colour once on the table and letting the cells inherit it is a common
// newsletter pattern. Nothing downstream catches that: the cells declare no
// colour of their own, so they keep a near-black inherited from a table whose own
// background this pass just repainted. That measured 1.32:1 on a three-line
// table. Widening the set is safe because a colour is only rewritten when it is
// already dark and unsaturated, so a brand colour on a table is left exactly as
// sent - verified against #067df7, which does not move.
const TEXT_TAGS = new Set([
  'body', 'p', 'div', 'span', 'a', 'td', 'th', 'li', 'font', 'pre', 'table',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'b', 'strong', 'em',
])

// Void elements never wrap content, so they neither take text nor open a nesting
// level for inherited background.
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

/** How to repaint a message for a dark theme. */
export interface DarkenOptions {
  /** The palette the message is repainted in, taken from the theme tokens. */
  palette: MailPalette
  /**
   * How opaque a repainted surface stays, 0-1. Below 1 the reading-pane
   * wallpaper shows through the message's own backgrounds, which is what makes a
   * message part of the pane rather than a panel laid over it. The message's page
   * is the caller's business (see planBody); this covers the surfaces the message
   * itself paints.
   */
  backgroundAlpha?: number
}

// channelSpread reports how far a colour sits from its own darkest channel.
// Adding this is what preserves a tint through repainting.
function channelSpread(rgb: Rgb): Rgb {
  const min = Math.min(rgb[0], rgb[1], rgb[2])
  return [rgb[0] - min, rgb[1] - min, rgb[2] - min]
}

// saturation is the HSV-style measure used to spot a brand or functional colour:
// a fully saturated colour carries meaning, a grey carries none.
function saturation(rgb: Rgb): number {
  const max = Math.max(rgb[0], rgb[1], rgb[2])
  if (max === 0) {
    return 0
  }
  return (max - Math.min(rgb[0], rgb[1], rgb[2])) / max
}

function isLight(rgb: Rgb): boolean {
  return relativeLuminance(rgb) > LIGHT_LUMINANCE
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

// surfaceStops is the palette's surface ramp as triples, from the page upward.
function surfaceStops(palette: MailPalette): Rgb[] {
  return [palette.page, palette.raised, palette.overlay].map((s: Surface) => s.rgb)
}

// darken places a light background on the palette's surface ramp, keeping its
// tint. The position comes from the original's luminance: white at the page,
// darker shades further up the ramp. The tint is weighted by how far up the ramp
// the colour went, so a near-white keeps its cast as a faint one rather than
// displacing the theme colour itself.
function darken(rgb: Rgb, palette: MailPalette): Rgb {
  const stops = surfaceStops(palette)
  // 1 at pure white, 0 at the mid-grey where a colour stops reading as a light
  // surface. LIGHT_LUMINANCE is the same boundary isLight uses, so a colour is
  // placed on the ramp using exactly the measure that decided it needed placing.
  const t = Math.min(1, Math.max(0, (1 - relativeLuminance(rgb)) / (1 - LIGHT_LUMINANCE)))
  const ramp = Math.max(0, (t - SURFACE_CROWN) / (1 - SURFACE_CROWN))
  const position = ramp * (stops.length - 1)
  const low = Math.min(stops.length - 1, Math.floor(position))
  const high = Math.min(stops.length - 1, low + 1)
  const f = position - low
  const spread = channelSpread(rgb)
  return stops[low].map((channel, i) =>
    clamp255(channel + (stops[high][i] - channel) * f + spread[i] * (1 - ramp)),
  ) as Rgb
}

// brandProtected reports whether a colour is a sender's design decision rather
// than a neutral the theme may repaint.
function brandProtected(rgb: Rgb): boolean {
  return saturation(rgb) >= BRAND_SATURATION
}

// textReplacement places a sender's dark text on the right ramp for the surface
// it actually sits on, or returns null to leave it as sent.
//
// The surface decides which ramp applies, and the distinction is not cosmetic. A
// text colour this pass can move is only movable because the surface under it
// moved too; a surface it could not repaint - a sender's own image-backed white
// card - is still light, and text on it has to stay dark. Writing the theme's
// light body colour there is what produced the reported "白底灰色字": light grey
// text on a white slab, at 1.2:1.
//
// A saturated colour is a brand or a link, so it is left as sent either way.
function textReplacement(fg: Rgb, bg: Rgb, palette: MailPalette): string | null {
  if (brandProtected(fg)) {
    return null
  }
  if (isLight(bg)) {
    // an already-dark colour is correct on a light surface, whatever the theme
    return isLight(fg) ? palette.onLight.hex : null
  }
  if (isLight(fg)) {
    return null
  }
  const luminance = relativeLuminance(fg)
  const level = TEXT_LEVELS.find((l) => luminance < l.maxLuminance) ?? TEXT_LEVELS[TEXT_LEVELS.length - 1]
  return palette[level.role].hex
}

/**
 * Repaints a message's own light surfaces, and the dark text on them, so it
 * reads correctly inside a dark theme.
 *
 * @param html the sanitized message body
 * @param options palette supplies the colours; backgroundAlpha makes the
 *                repainted surfaces translucent so a wallpaper shows through
 */
export function darkenSenderBackgrounds(html: string, options: DarkenOptions): string {
  const { palette } = options
  if (html === '' || !palette.dark) {
    // a light palette is the fixed light rendering this client has always used,
    // and has nothing to repaint: mail already assumes a light page
    return html
  }
  const alpha = Math.min(1, Math.max(0, options.backgroundAlpha ?? 1))
  const page = palette.page.rgb

  // The background each open element resolves to, so text knows what it is
  // sitting on. It starts at the page colour, which is what an element with no
  // background of its own inherits.
  const stack: Rgb[] = []
  const openTags: string[] = []
  let current = page

  return html.replace(/<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g, (match, slash: string, tagName: string, attrs: string) => {
    const tag = tagName.toLowerCase()
    if (slash === '/') {
      // pop to the matching open, tolerating mail that never closed a tag
      const at = openTags.lastIndexOf(tag)
      if (at >= 0) {
        openTags.length = at
        stack.length = at
        current = at === 0 ? page : (stack[at - 1] ?? page)
      }
      return match
    }

    const selfClosing = /\/\s*$/.test(attrs) || VOID_TAGS.has(tag)
    let next = current
    let rewritten = attrs

    // A bare element inside a light surface needs a colour of its own. The
    // reading document's fallback cannot serve it: that is a light colour for the
    // dark page, and it is wrong on a white card the message paints itself. A
    // real QQ birthday mail is built exactly this way - the text colour lives in a
    // style block the sanitizer removes, so the paragraphs arrive bare inside a
    // white, image-backed card, and they rendered as light grey on white at
    // 1.1:1. Declaring the colour here is the only place that knows which surface
    // the element ended up on.
    if (TEXT_TAGS.has(tag) && isLight(next) && !declaresTextColor(attrs)) {
      rewritten = setStyle(rewritten, mergeTextColor(styleOf(attrs), palette.onLight.hex))
    }

    const declared = declaredBackground(attrs)
    if (declared !== null) {
      const rgb = parseColor(declared.color)
      if (rgb !== null) {
        if (!isLight(rgb)) {
          next = rgb
        } else if (declared.rewritable) {
          // the box is repainted, so text inside it sits on the new surface
          next = darken(rgb, palette)
          if (BG_TAGS.has(tag)) {
            rewritten = replaceBackground(rewritten, withAlpha({ hex: toHex(next), rgb: next }, alpha))
          }
        } else {
          // the box keeps the sender's own light background - it carries an
          // image or a gradient this pass will not touch - so text inside it is
          // still sitting on a light surface and has to stay dark. Tracking the
          // repainted colour here instead is what wrote light-grey text onto a
          // real QQ mail's white background.
          next = rgb
        }
      }
    }

    if (TEXT_TAGS.has(tag)) {
      rewritten = replaceText(rewritten, tag, (rgb) => textReplacement(rgb, next, palette))
    }

    if (!selfClosing) {
      openTags.push(tag)
      stack.push(next)
    }
    current = next
    return rewritten === attrs ? match : `<${tagName}${rewritten}>`
  })
}

// styleOf returns an element's style attribute body, or '' when it has none.
function styleOf(attrs: string): string {
  const m = attrs.match(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i)
  return m ? (m[2] ?? m[3] ?? '') : ''
}

// setStyle replaces an element's style attribute, or adds one when it has none.
// Appending a second style attribute would be silently dropped by the html
// parser, leaving the element with whatever came first.
function setStyle(attrs: string, body: string): string {
  if (/\sstyle\s*=/i.test(attrs)) {
    return attrs.replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i, ` style="${body}"`)
  }
  return `${attrs} style="${body}"`
}

// declaresTextColor reports whether an element says anything about its own text
// colour, including the colour it inherits from a <font> wrapper. An element that
// declares one has already been judged and must not be given a second colour here.
function declaresTextColor(attrs: string): boolean {
  const body = styleOf(attrs)
  for (const decl of body.split(';')) {
    const at = decl.indexOf(':')
    if (at < 0) {
      continue
    }
    if (decl.slice(0, at).trim().toLowerCase() === 'color') {
      return true
    }
  }
  return /\scolor\s*=/i.test(attrs)
}

// mergeTextColor appends a colour declaration to a style body, replacing any
// existing one and leaving every other declaration as it was.
function mergeTextColor(body: string, hex: string): string {
  const kept = body
    .split(';')
    .filter((decl) => {
      const at = decl.indexOf(':')
      if (at < 0) {
        return decl.trim() !== ''
      }
      return decl.slice(0, at).trim().toLowerCase() !== 'color'
    })
    .map((decl) => decl.trim())
    .filter((decl) => decl !== '')
  return [...kept, `color: ${hex}`].join('; ')
}

// declaredBackground returns the colour an element paints and whether this
// transform may rewrite it.
//
// A `background` shorthand is only rewritable when its whole value is a bare
// colour: anything carrying a url(), a gradient or a position keeps only its
// colour, for the text decision, and its box is left as the sender drew it.
function declaredBackground(attrs: string): { color: string; rewritable: boolean } | null {
  const styleMatch = attrs.match(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i)
  const styleBody = styleMatch ? (styleMatch[2] ?? styleMatch[3] ?? '') : ''
  for (const decl of styleBody.split(';')) {
    const at = decl.indexOf(':')
    if (at < 0) {
      continue
    }
    const prop = decl.slice(0, at).trim().toLowerCase()
    const value = decl.slice(at + 1).trim()
    if (prop === 'background-color') {
      if (parseColor(value) !== null) {
        return { color: value, rewritable: true }
      }
      continue
    }
    if (prop !== 'background') {
      continue
    }
    if (parseColor(value) !== null) {
      return { color: value, rewritable: true }
    }
    // a shorthand with an image or a gradient in it: the element really does
    // paint a box, so text inside it is judged against whatever colour the value
    // names - but the value itself is the sender's and stays as drawn
    const named = value.match(/(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b)/i)?.[0] ?? ''
    if (named !== '' && parseColor(named) !== null) {
      return { color: named, rewritable: false }
    }
  }
  const bg = attrs.match(/\sbgcolor\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
  if (bg) {
    const value = bg[2] ?? bg[3] ?? bg[4] ?? ''
    if (parseColor(value) !== null) {
      return { color: value, rewritable: true }
    }
  }
  return null
}

// replaceBackground rewrites only the background colour declarations, leaving
// every other declaration in the attribute untouched.
//
// An opaque replacement goes into bgcolor as hex, which is what a legacy
// attribute accepts. A translucent one cannot go there at all: bgcolor takes only
// the old colour syntax, and a value it cannot parse is not ignored - browsers
// re-parse the string as a legacy colour (bgcolor="rgba(255,255,255,0)" renders as
// rgb(0,80,85)). So a translucent background drops bgcolor and is written into a
// style declaration instead, which can carry it.
function replaceBackground(attrs: string, replacement: TranslucentSurface): string {
  const opaque = replacement.alphaHex === replacement.hex + 'ff'
  const value = opaque ? replacement.hex : replacement.rgba
  let out = attrs

  const styleMatch = out.match(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i)
  if (styleMatch) {
    const quote = styleMatch[2] !== undefined ? '"' : "'"
    const body = styleMatch[2] ?? styleMatch[3] ?? ''
    const rewritten = body
      .split(';')
      .map((decl) => {
        const at = decl.indexOf(':')
        if (at < 0) {
          return decl
        }
        const prop = decl.slice(0, at).trim().toLowerCase()
        const rgb = parseColor(decl.slice(at + 1).trim())
        if (rgb === null) {
          return decl
        }
        if ((prop === 'background-color' || prop === 'background') && isLight(rgb)) {
          return ` ${prop}: ${value}`
        }
        return decl
      })
      .join(';')
    out = out.replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i, ` style=${quote}${rewritten}${quote}`)
  }

  const hadBgcolor = /\sbgcolor\s*=/i.test(out)
  out = out.replace(/\sbgcolor\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i, (m, _q, dq: string | undefined, sq: string | undefined, bare: string | undefined) => {
    const declared = parseColor(dq ?? sq ?? bare ?? '')
    if (declared === null || !isLight(declared)) {
      return m
    }
    // a translucent replacement cannot live here; the style declaration carries
    // it instead, and this attribute is dropped rather than lying about the box
    return opaque ? ` bgcolor="${replacement.hex}"` : ''
  })

  // an element that only had bgcolor would otherwise lose its background
  // entirely when the replacement is translucent
  if (!opaque && hadBgcolor && !/\sstyle\s*=/i.test(out)) {
    out += ` style="background-color: ${value}"`
  }
  return out
}

// replaceText rewrites the text colour declarations. `map` returns the
// replacement for a colour that needs to move, or null to leave it as sent.
function replaceText(attrs: string, tag: string, map: (rgb: Rgb) => string | null): string {
  let out = attrs

  const styleMatch = out.match(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i)
  if (styleMatch) {
    const quote = styleMatch[2] !== undefined ? '"' : "'"
    const body = styleMatch[2] ?? styleMatch[3] ?? ''
    const rewritten = body
      .split(';')
      .map((decl) => {
        const at = decl.indexOf(':')
        if (at < 0) {
          return decl
        }
        const prop = decl.slice(0, at).trim().toLowerCase()
        if (prop !== 'color') {
          return decl
        }
        const rgb = parseColor(decl.slice(at + 1).trim())
        if (rgb === null) {
          return decl
        }
        const replacement = map(rgb)
        return replacement === null ? decl : ` ${prop}: ${replacement}`
      })
      .join(';')
    out = out.replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i, ` style=${quote}${rewritten}${quote}`)
  }

  // the legacy <font color> attribute carries text colour the same way
  if (tag === 'font') {
    out = out.replace(/\scolor\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i, (m, _q, dq: string | undefined, sq: string | undefined, bare: string | undefined) => {
      const rgb = parseColor(dq ?? sq ?? bare ?? '')
      if (rgb === null) {
        return m
      }
      const replacement = map(rgb)
      return replacement === null ? m : ` color="${replacement}"`
    })
  }
  return out
}
