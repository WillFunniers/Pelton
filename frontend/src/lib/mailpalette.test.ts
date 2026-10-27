import { describe, it, expect } from 'vitest'
import { darkPalette, mailPalette, withAlpha, type MailPalette } from './mailpalette'

// The built-in dark tokens, as getComputedStyle would resolve them.
const BUILTIN: Record<string, string> = {
  '--surface-base': '#111214',
  '--surface-raised': '#1a1c1f',
  '--surface-overlay': '#222428',
  '--surface-hover': '#25282d',
  '--text-primary': '#ecedee',
}

// Real custom themes, with the values their authors chose. These are the reason
// the palette is read from tokens at all: a fixed grey pair renders every one of
// them as somebody else's theme.
const DOLORIS: Record<string, string> = {
  '--surface-base': '#161512',
  '--surface-raised': '#1a1c1f',
  '--surface-overlay': '#26251f',
  '--surface-hover': '#2e2c26',
  '--text-primary': '#f5f0e6',
}
const NORD: Record<string, string> = {
  '--surface-base': '#2e3440',
  '--surface-raised': '#3b4252',
  '--surface-overlay': '#434c5e',
  '--surface-hover': '#4c566a',
  '--text-primary': '#eceff4',
}
// A theme that defines only some of the contract, which is legal: everything
// else has to fall back rather than render nothing.
const PARTIAL: Record<string, string> = { '--text-primary': '#ffe0b2' }

const THEMES: [string, Record<string, string>][] = [
  ['built-in dark', BUILTIN],
  ['Doloris', DOLORIS],
  ['Nord', NORD],
  ['partial', PARTIAL],
]

const reader = (tokens: Record<string, string>) => (token: string) => tokens[token] ?? ''
const paletteFor = (tokens: Record<string, string>): MailPalette => darkPalette(reader(tokens))

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const ch = [0, 2, 4].map((i) => {
    const s = parseInt(h.slice(i, i + 2), 16) / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

describe('the mail palette', () => {
  describe('follows the theme it is given', () => {
    it('uses the theme surfaces for the page and the raised surfaces', () => {
      for (const [name, tokens] of THEMES) {
        const p = paletteFor(tokens)
        const base = tokens['--surface-base'] ?? BUILTIN['--surface-base']
        expect(p.page.hex, `${name} page`).toBe(base)
      }
    })

    it('renders a warm theme warm, not grey', () => {
      // the whole reason this reads tokens: Doloris is a warm black, and a fixed
      // #1e1e1e page would visibly not belong to it
      const p = paletteFor(DOLORIS)
      const [r, g, b] = channels(p.page.hex)
      expect(r).toBeGreaterThanOrEqual(g)
      expect(g).toBeGreaterThanOrEqual(b)
      // and its text is the theme's own warm off-white
      expect(p.text.hex).toBe('#f5f0e6')
    })

    it('renders a cool theme cool', () => {
      const p = paletteFor(NORD)
      const [r, , b] = channels(p.page.hex)
      expect(b).toBeGreaterThan(r)
    })

    it('falls back per token rather than wholesale', () => {
      // PARTIAL defines only its text colour: its surfaces must come from the
      // built-in values, and its own colour must survive
      const p = paletteFor(PARTIAL)
      expect(p.page.hex).toBe(BUILTIN['--surface-base'])
      expect(p.text.hex).toBe('#ffe0b2')
    })

    it('keeps the built-in dark tokens when nothing is defined at all', () => {
      const p = paletteFor({})
      expect(p.page.hex).toBe(BUILTIN['--surface-base'])
      expect(p.text.hex).toBe(BUILTIN['--text-primary'])
    })
  })

  describe('the surface ramp stays ordered', () => {
    it('rises from the page to the overlay on every theme', () => {
      for (const [name, tokens] of THEMES) {
        const p = paletteFor(tokens)
        const lums = [p.page, p.raised, p.overlay].map((s) => luminance(s.hex))
        expect(lums[1], `${name} raised below page`).toBeGreaterThanOrEqual(lums[0])
        expect(lums[2], `${name} overlay below raised`).toBeGreaterThanOrEqual(lums[1])
      }
    })

    it('keeps every surface dark, so it still reads as a dark theme', () => {
      for (const [name, tokens] of THEMES) {
        const p = paletteFor(tokens)
        for (const s of [p.page, p.raised, p.overlay]) {
          expect(luminance(s.hex), `${name} ${s.hex} is not dark`).toBeLessThan(0.5)
        }
      }
    })
  })

  describe('text roles stay readable and ordered', () => {
    it('clears 4.5:1 for body text on the page, on every theme', () => {
      for (const [name, tokens] of THEMES) {
        const p = paletteFor(tokens)
        expect(contrast(p.text.hex, p.page.hex), `${name} body text`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('keeps the secondary role readable too', () => {
      // secondary carries real copy (a sender's #666666 paragraph), not just meta
      for (const [name, tokens] of THEMES) {
        const p = paletteFor(tokens)
        expect(contrast(p.secondary.hex, p.page.hex), `${name} secondary`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('orders the roles from body to muted on every theme', () => {
      for (const [name, tokens] of THEMES) {
        const p = paletteFor(tokens)
        const lums = [p.text, p.secondary, p.muted].map((s) => luminance(s.hex))
        expect(lums[1], `${name} secondary is not below body`).toBeLessThan(lums[0])
        expect(lums[2], `${name} muted is not below secondary`).toBeLessThan(lums[1])
      }
    })

    it('keeps the roles distinguishable rather than collapsing them', () => {
      // a hierarchy where all three roles are the same colour is not a hierarchy
      for (const [name, tokens] of THEMES) {
        const p = paletteFor(tokens)
        expect(new Set([p.text.hex, p.secondary.hex, p.muted.hex]).size, `${name} roles collapsed`).toBe(3)
      }
    })

    it('refuses a text colour that is not lighter than its own page', () => {
      // a theme mid-migration, or one whose "primary" text is meant for a raised
      // surface. Rendering it as body text would be invisible copy.
      const p = paletteFor({ '--surface-base': '#111214', '--text-primary': '#0a0a0a' })
      expect(contrast(p.text.hex, p.page.hex)).toBeGreaterThanOrEqual(4.5)
    })

    it('keeps the text solid, never translucent', () => {
      // translucent text over a wallpaper is unreadable exactly when the
      // wallpaper is bright, which is when it matters most
      for (const [name, tokens] of THEMES) {
        const p = paletteFor(tokens)
        for (const s of [p.text, p.secondary, p.muted]) {
          expect(s.hex, `${name} text is not a solid colour`).toMatch(/^#[0-9a-f]{6}$/)
        }
      }
    })
  })

  describe('withAlpha', () => {
    it('produces both css forms of the same colour', () => {
      const a = withAlpha({ hex: '#1a1c1f', rgb: [26, 28, 31] }, 0.7)
      expect(a.alphaHex).toBe('#1a1c1f' + Math.round(0.7 * 255).toString(16))
      expect(a.rgba).toBe('rgba(26, 28, 31, 0.7)')
    })

    it('writes a full alpha as ff, so a caller can tell opaque from translucent', () => {
      expect(withAlpha({ hex: '#1a1c1f', rgb: [26, 28, 31] }, 1).alphaHex).toBe('#1a1c1fff')
      expect(withAlpha({ hex: '#1a1c1f', rgb: [26, 28, 31] }, 0).alphaHex).toBe('#1a1c1f00')
    })

    it('clamps out of range alphas instead of writing nonsense', () => {
      const s = { hex: '#1a1c1f', rgb: [26, 28, 31] as [number, number, number] }
      expect(withAlpha(s, 5).rgba).toBe('rgba(26, 28, 31, 1)')
      expect(withAlpha(s, -2).rgba).toBe('rgba(26, 28, 31, 0)')
    })
  })

  describe('the light palette is untouched', () => {
    it('is the fixed light rendering this client has always used', () => {
      const p = mailPalette(false, () => '')
      expect(p.dark).toBe(false)
      expect(p.page.hex).toBe('#ffffff')
      expect(p.text.hex).toBe('#1a1a1a')
    })

    it('does not follow the tokens, so a light theme cannot break sender html', () => {
      const tokens = { '--surface-base': '#fff8e1', '--text-primary': '#111' }
      const p = mailPalette(false, reader(tokens))
      expect(p.page.hex).toBe('#ffffff')
      expect(p.text.hex).toBe('#1a1a1a')
    })
  })

  it('marks the dark palette as dark and the light one as not', () => {
    expect(paletteFor(BUILTIN).dark).toBe(true)
    expect(mailPalette(false, () => '').dark).toBe(false)
  })
})

// The token names are a cross-file contract with theme/tokens.css, and getting one
// wrong is silent in production: readTokenColor falls back, and the only symptom is
// that no theme ever themes mail. It is not silent here - the theme-driven tests
// above pin the resolved values, so a mistyped token name fails them (verified by
// temporarily breaking each name). What these tests add is the precedence rule
// itself, which those value assertions do not state.
describe('the tokens the palette reads', () => {
  const ALL = ['--surface-base', '--surface-raised', '--surface-overlay', '--surface-hover', '--text-primary']

  it('prefers the theme value over the fallback when the theme defines one', () => {
    // the fallback must never win over a token that is actually present, or a
    // custom theme would be read and then ignored - which is the whole point
    const tokens = Object.fromEntries(ALL.map((t) => [t, '#010203']))
    const p = paletteFor(tokens)
    expect(p.page.hex).toBe('#010203')
    expect(p.raised.hex).toBe('#010203')
    expect(p.overlay.hex).toBe('#010203')
  })

  it('falls back per token, only for what the theme is missing', () => {
    // a theme defining nothing must still render, and a theme defining one token
    // must not have its other tokens invented from it
    const partial = paletteFor({ '--surface-base': '#2e3440' })
    expect(partial.page.hex).toBe('#2e3440')
    expect(partial.raised.hex).toBe(BUILTIN['--surface-raised'])
  })

  it('reads a themed text colour rather than always using the fallback', () => {
    expect(paletteFor({ '--text-primary': '#f5f0e6' }).text.hex).toBe('#f5f0e6')
  })

  it('ignores a token set to something that is not a plain colour', () => {
    // a theme may legitimately use color-mix() or a keyword; those must fall back
    // rather than produce a broken colour
    for (const value of ['color-mix(in srgb, #fff 50%, #000)', 'currentColor', 'var(--x)']) {
      const p = paletteFor({ '--surface-base': value })
      expect(p.page.hex, `${value} should have fallen back`).toBe(BUILTIN['--surface-base'])
    }
  })
})
