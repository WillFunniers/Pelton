// glass.ts turns the reader's zoning sliders into the two things a pane's glass
// is made of: how solid its sheet is, and how far that sheet blurs what shows
// through it.
//
// Why this lives in one module rather than in each component: the panes are not
// independent. The reader chooses a density for the message list, and the
// sidebar, the chrome bars and the overlay tiers all have to stay in proportion
// to it or the window stops reading as one hierarchy - a menu bar less solid
// than the pane under it, a chip lighter than the sheet it sits on. So there is
// one list density to choose and one ladder derived from it, computed here and
// published as custom properties (see the wallpaper block in tokens.css).
//
// Two mechanisms, for two different reasons:
//
//   * The ALPHAS are custom properties. A colour can be assembled out of a
//     percentage the stylesheet does not know until the reader moves a slider,
//     and `color-mix(in srgb, var(--surface-raised) var(--glass-raised-alpha)%)`
//     is exactly that.
//
//   * The BLUR RADII are a small injected stylesheet, not custom properties.
//     A backdrop-filter whose value references a var() is dropped outright by
//     Safari on macOS Sonoma (WebKit bug 297620) - the whole effect, not just
//     the radius - so the radius has to reach the declaration as a literal
//     number. The pane sheets are ::before pseudo-elements, which javascript
//     cannot style either, so the literals are written into one <style> element
//     that is rewritten whenever a slider moves. Same mechanism, and same
//     reasoning, as theme/usertheme.ts.
//
// Everything here is gated in CSS on :root[data-wallpaper='on'], so with no
// wallpaper the injected sheet matches nothing and the custom properties are
// not read: a light theme, a wallpaper that is off and an engine that cannot
// compute color-mix() all keep painting the plain, opaque window they always
// painted.

/** The alphas of the glass tiers, in percent, for a given list density. */
export interface GlassAlphas {
  /** the message list's own sheet, and its rows */
  list: number
  /** the sidebar's sheet */
  base: number
  /** chips, cards and buttons: anything raised out of a pane */
  raised: number
  /** a hovered chip or row */
  hover: number
  /** the menu bar, the status bar, the tab strip, and recessed fields */
  sunken: number
  /** dialogs, menus, the compose window, the settings screen */
  overlay: number
}

/** The blur radii the reader chooses, in px. */
export interface GlassBlur {
  /** the reading pane's mask, over the wallpaper and under the message */
  pane: number
  /** the message list's sheet; the sidebar follows it */
  list: number
}

// How much more solid the sidebar's sheet is than the list's. The sidebar is the
// window's outer edge and the list is the pane the eye reads down, so giving the
// sidebar a little more body than the list is what makes the two read as
// different depths rather than as one flat sheet. Measured against the matrix:
// below about 10 the two panes are indistinguishable at a glance, above about 15
// the sidebar stops looking like glass over the picture and the wallpaper's edge
// disappears into it. 12 is the middle of that band, and the value the sidebar
// offset is asserted at in the acceptance run.
export const SIDEBAR_DENSITY_OFFSET = 12

// Floors for the tiers ABOVE the two the reader controls. A reader who slides
// the list to 0 is asking for the picture itself in the list, not for the menu
// bar to become unreadable: the chrome keeps enough body to carry its own text
// over any picture, which is 62 and up - the level the previous build's
// translucent set used for chips, where it was measured at better than 4.5:1
// over a white wallpaper.
const RAISED_FLOOR = 62
const HOVER_FLOOR = 66
const SUNKEN_FLOOR = 68
const OVERLAY_FLOOR = 82

// The deltas that keep the ladder monotone as the list density rises: each tier
// stays at least as solid as everything it can be painted on top of, so a chip
// never turns into a hole in the pane behind it. The overlay tier is the flattest
// of them because a dialog already floats over the whole window and only has to
// stay ahead of the sheets beneath it.
const RAISED_DELTA = 12
const HOVER_DELTA = 14
const SUNKEN_DELTA = 16
const OVERLAY_DELTA = 20

const clamp = (n: number, lo = 0, hi = 100): number => Math.min(hi, Math.max(lo, n))

// density reads a preference as a percentage, falling back to the default for a
// value that is missing or corrupt rather than clamping it to zero: a preference
// this cannot read is a reason to paint the window the way it shipped, not a
// reason to strip its glass off.
function density(value: number, fallback: number): number {
  return clamp(Number.isFinite(value) ? value : fallback)
}

// glassAlphas derives the whole ladder from the list density. The fallback is
// the density this build ships, because that is the window a root element painted
// without the reader's preferences should wear.
export function glassAlphas(listDensity: number, defaultDensity = 50): GlassAlphas {
  const list = density(listDensity, defaultDensity)
  return {
    list,
    base: clamp(list + SIDEBAR_DENSITY_OFFSET),
    raised: clamp(Math.max(list + RAISED_DELTA, RAISED_FLOOR)),
    hover: clamp(Math.max(list + HOVER_DELTA, HOVER_FLOOR)),
    sunken: clamp(Math.max(list + SUNKEN_DELTA, SUNKEN_FLOOR)),
    overlay: clamp(Math.max(list + OVERLAY_DELTA, OVERLAY_FLOOR)),
  }
}

// blurRadius reads a blur preference as a whole number of pixels. The range
// check is a bound, not a clamp: a value outside it is not a radius this build
// offers, so it is replaced rather than honoured, which keeps a corrupt
// preference from asking for a blur that costs a frame per repaint. The fallback
// is the radius this build ships for that pane, so an unreadable preference
// leaves the window wearing its shipped glass.
function blurRadius(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value) || value < 0 || value > max) return fallback
  return Math.round(value)
}

// The custom properties the stylesheet reads, one per tier.
const ALPHA_VARS: Record<keyof GlassAlphas, string> = {
  list: '--glass-list-alpha',
  base: '--glass-base-alpha',
  raised: '--glass-raised-alpha',
  hover: '--glass-hover-alpha',
  sunken: '--glass-sunken-alpha',
  overlay: '--glass-overlay-alpha',
}

// applyGlassAlphas publishes the ladder on the root element, where tokens.css's
// wallpaper block reads it. Inline on the document element rather than injected
// css: these are values the stylesheet already knows how to use, and the element
// is the same one data-wallpaper is written to, so the two can never describe
// different states.
export function applyGlassAlphas(alphas: GlassAlphas): void {
  const root = document.documentElement
  for (const [tier, name] of Object.entries(ALPHA_VARS) as [keyof GlassAlphas, string][]) {
    root.style.setProperty(name, `${clamp(alphas[tier])}%`)
  }
}

// The id of the injected blur sheet; one per document, rewritten in place.
const blurStyleId = 'pelton-glass-blur'

// glassBlurCss renders the blur sheet. Split out from the dom write so the
// declarations can be asserted directly, and so every rule's shape is visible in
// one place: a literal radius, both the prefixed and the unprefixed property
// (WebKitGTK and older WebKit only honor the prefix), and the same
// :root[data-wallpaper='on'] gate the rest of the glass uses.
//
// A radius of 0 emits no rule at all rather than `backdrop-filter: none`: the
// effect is what costs a composited pass, and a pane whose reader asked for no
// blur should not pay for one.
export function glassBlurCss(blur: GlassBlur): string {
  const rules: string[] = []
  const pane = blurRadius(blur.pane, 0, 24)
  const list = blurRadius(blur.list, 16, 40)
  if (pane > 0) rules.push(rule('.detail::before', pane))
  if (list > 0) {
    rules.push(rule('.list-col::before', list))
    // the sidebar follows the list: one slider, one blur, so the two panes never
    // disagree about how deep the window looks.
    rules.push(rule('.sidebar::before', list))
  }
  return rules.length === 0 ? '' : `${rules.join('\n')}\n`
}

function rule(selector: string, px: number): string {
  const value = `blur(${px}px)`
  return `:root[data-wallpaper='on'] ${selector}{-webkit-backdrop-filter:${value};backdrop-filter:${value}}`
}

// applyGlassBlur writes the sheet, replacing any previous one.
export function applyGlassBlur(blur: GlassBlur): void {
  const css = glassBlurCss(blur)
  let style = document.getElementById(blurStyleId) as HTMLStyleElement | null
  if (css === '') {
    style?.remove()
    return
  }
  if (!style) {
    style = document.createElement('style')
    style.id = blurStyleId
    document.head.appendChild(style)
  }
  if (style.textContent !== css) {
    style.textContent = css
  }
}
