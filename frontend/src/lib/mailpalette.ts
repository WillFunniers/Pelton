// mailpalette.ts turns the app's own theme tokens into the palette a message
// body is rendered in.
//
// Why this exists: hardening mail's html against a dark theme is not the same
// job as *theming* it. Rewriting a message's whites to a fixed #1e1e1e and its
// blacks to a fixed #e5e5e5 makes the message dark, but it stays a cold grey
// slab that belongs to no theme in particular - so a reader who chose a warm
// theme, or any custom theme at all, gets a message that visibly is not part of
// the app around it. The palette is read from the same tokens the rest of the UI
// uses instead, which means a custom theme themes mail too, with no mail
// specific colours to maintain and no second place for a theme to disagree with
// itself.
//
// The tokens are read from the DOM rather than from the theme preference for the
// same reason MailBody watches data-theme: "system" and "schedule" resolve to a
// concrete scheme elsewhere, and a custom theme is an injected style block that
// overrides the tokens. The computed value is the only one that reflects what is
// actually on screen.

import { parseColor, relativeLuminance, toHex, type Rgb } from './mailcolor'

/** One colour a message is rendered in, in both the forms callers need. */
export interface Surface {
  /** the colour as css writes it, opaque */
  hex: string
  /** the same colour as a triple, for the luminance maths */
  rgb: Rgb
}

/** A surface at one transparency, in both css syntaxes. */
export interface TranslucentSurface extends Surface {
  /** hex with an 8-digit alpha suffix, e.g. #1a1c1f33 */
  alphaHex: string
  /** css rgba() form of the same colour */
  rgba: string
}

/**
 * The palette a message is rendered in: the surfaces it may sit on and the text
 * roles within it.
 */
export interface MailPalette {
  /** whether this is the dark palette, i.e. whether darkening applies at all */
  dark: boolean
  /** the page behind the message: what text with no background sits on */
  page: Surface
  /** a card or panel raised above the page */
  raised: Surface
  /** a further raised surface: an overlay, a hovered row, a quote block */
  overlay: Surface
  /** body copy */
  text: Surface
  /** secondary copy */
  secondary: Surface
  /** meta and footer copy */
  muted: Surface
  /**
   * Text for a surface that is still light - a sender's own box this pass could
   * not repaint because it carries an image or a gradient. Text there is on a
   * light background in a dark theme, so it has to be dark, and it is the same
   * colour in both palettes because the surface is the same white either way.
   */
  onLight: Surface
}

// One level of the surface ramp: the token that supplies it, and what to use
// when the theme does not define that token. The fallbacks are the built-in dark
// token values, so a theme that defines nothing still renders correctly.
interface TokenSpec {
  token: string
  fallback: string
}

// Ordered from the page upward. The order is load-bearing: it is what preserves
// a message's own elevation, so a card that was lighter than its page still
// reads as raised once the page darkens. Sender backgrounds are placed on this
// ramp rather than mapped onto one colour, because collapsing every light shade
// onto a single value is what turns a laid-out message into a flat sheet.
const DARK_SURFACES: TokenSpec[] = [
  { token: '--surface-base', fallback: '#111214' },
  { token: '--surface-raised', fallback: '#1a1c1f' },
  { token: '--surface-overlay', fallback: '#222428' },
  { token: '--surface-hover', fallback: '#25282d' },
]

const DARK_TEXT: TokenSpec = { token: '--text-primary', fallback: '#ecedee' }

// How strong the weaker text roles are, as a fraction of the body colour's
// contrast against the page. Placing them this way rather than at fixed greys is
// what keeps the three roles ordered and distinguishable on any theme: a fixed
// secondary grey can land on top of a custom theme's body colour, or below its
// page. mailpalette.test.ts asserts both the ordering and a 4.5:1 floor for the
// secondary role against every built-in theme.
const SECONDARY_CONTRAST = 0.7
const MUTED_CONTRAST = 0.45

// The light palette is what this client has always rendered light mail in, and
// deliberately does not follow the theme. Light mail is rendered on the fixed
// light page buildSrcdoc paints, and a custom light theme's surfaces are not a
// safe page for arbitrary sender html to sit on. A light theme with a wallpaper
// still shows its character through the softened sender backgrounds (see
// mailbg.ts), which is where a light theme's own look belongs.
const LIGHT_PALETTE: MailPalette = {
  dark: false,
  page: surface('#ffffff'),
  raised: surface('#ffffff'),
  overlay: surface('#f5f5f5'),
  text: surface('#1a1a1a'),
  secondary: surface('#4a4d54'),
  muted: surface('#55606c'),
  // a light box stays light in either theme, so its text is the same colour as
  // this palette's own body copy
  onLight: surface('#1a1a1a'),
}

function surface(color: string): Surface {
  const rgb = parseColor(color) ?? [0, 0, 0]
  return { hex: toHex(rgb), rgb }
}

/** A reader of computed css custom property values, e.g. the document root. */
export type TokenReader = (token: string) => string

// readTokenColor reads a custom property and parses it, returning null when the
// theme does not define it or defines something that is not a plain colour. A
// theme may legitimately set a token to a color-mix() or a system keyword, and
// those have to fall back rather than produce a broken colour.
function readTokenColor(read: TokenReader, spec: TokenSpec): Rgb {
  const value = read(spec.token)
  return (value ? parseColor(value) : null) ?? parseColor(spec.fallback)!
}

/**
 * Builds the dark palette from the theme tokens currently on screen.
 *
 * @param read reads a css custom property's computed value from the document
 */
export function darkPalette(read: TokenReader): MailPalette {
  const surfaces = DARK_SURFACES.map((spec) => readTokenColor(read, spec))
  const declared = readTokenColor(read, DARK_TEXT)

  // A text colour that is not lighter than the page it sits on cannot be body
  // text on that page, whatever it is called: a theme mid-migration, or one
  // whose "primary" text is meant for a raised surface, would otherwise be
  // rendered as unreadable copy. The built-in light grey is used in that case,
  // so the worst outcome is a slightly cool message rather than an invisible one.
  const usable = relativeLuminance(declared) > relativeLuminance(surfaces[0]) + 0.05
  const text = usable ? declared : parseColor(DARK_TEXT.fallback)!

  return {
    dark: true,
    page: surface(toHex(surfaces[0])),
    raised: surface(toHex(surfaces[1])),
    overlay: surface(toHex(surfaces[2])),
    text: surface(toHex(text)),
    secondary: surface(toHex(between(text, surfaces[0], SECONDARY_CONTRAST))),
    muted: surface(toHex(between(text, surfaces[0], MUTED_CONTRAST))),
    // a surface this pass could not repaint is still white, so text on it has to
    // stay dark - the light palette's own body colour, not a theme one
    onLight: surface('#1a1a1a'),
  }
}

// between places a colour the given fraction of the way from `low` to `high` in
// luminance, carrying `high`'s tint across so a warm theme keeps a warm
// hierarchy rather than a grey one.
function between(high: Rgb, low: Rgb, fraction: number): Rgb {
  const target = relativeLuminance(low) + (relativeLuminance(high) - relativeLuminance(low)) * fraction
  const grey = greyForLuminance(target)
  const spread = channelSpread(high)
  return spread.map((offset, channel) => clamp255(grey[channel] + Math.round(offset / 2))) as Rgb
}

// channelSpread reports how far each channel sits above the colour's darkest
// channel, which is what carries a tint from one colour to another.
function channelSpread(rgb: Rgb): Rgb {
  const min = Math.min(rgb[0], rgb[1], rgb[2])
  return [rgb[0] - min, rgb[1] - min, rgb[2] - min]
}

// greyForLuminance returns the neutral triple of a relative luminance by
// inverting the sRGB transfer function.
function greyForLuminance(luminance: number): Rgb {
  const l = Math.min(1, Math.max(0, luminance))
  const channel = (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055) * 255
  const v = Math.round(channel)
  return [v, v, v]
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

/**
 * Adds an alpha to a surface, returning both css forms.
 *
 * Both are needed because the two places a background gets written accept
 * different syntaxes. A style declaration takes either, but the legacy bgcolor
 * attribute takes only the old hex syntax, and a translucent value in it is
 * re-parsed as a legacy colour (rgba(255,255,255,0) renders as rgb(0,80,85)).
 * Callers that keep bgcolor therefore use alphaHex, and callers that own a style
 * declaration use rgba.
 */
export function withAlpha(s: Surface, alpha: number): TranslucentSurface {
  const a = Math.min(1, Math.max(0, alpha))
  return {
    ...s,
    alphaHex: s.hex + Math.round(a * 255).toString(16).padStart(2, '0'),
    // rounded to three places: an alpha written to fifteen digits is noise in
    // the markup, and a thousandth of a step is far below a visible difference
    rgba: `rgba(${s.rgb.join(', ')}, ${Math.round(a * 1000) / 1000})`,
  }
}

/** The palette for a message: theme derived in a dark theme, fixed light otherwise. */
export function mailPalette(dark: boolean, read: TokenReader): MailPalette {
  return dark ? darkPalette(read) : LIGHT_PALETTE
}
