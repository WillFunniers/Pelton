import { describe, it, expect } from 'vitest'
import { documentColors } from './maildoc'
import { darkPalette, mailPalette, type MailPalette } from './mailpalette'

// The built-in tokens, as a reader would see them resolved. The tests are driven
// through the real palette builder rather than through literal colours, because
// the point of the change is that these are the theme's colours and not a fixed
// grey pair.
const TOKENS: Record<string, string> = {
  '--surface-base': '#111214',
  '--surface-raised': '#1a1c1f',
  '--surface-overlay': '#222428',
  '--surface-hover': '#25282d',
  '--text-primary': '#ecedee',
}
const builtin = (): MailPalette => darkPalette((t) => TOKENS[t] ?? '')

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

// These are the colours the reading document sets for text the sender did not
// colour. They are the fallback for every element whose colour lived in the
// sender's stylesheet, which the sanitizer removes - so they carry more text than
// a "default" usually would.
describe('reading document colours', () => {
  it('is readable on the page it paints, in both themes', () => {
    const light = documentColors(mailPalette(false, () => ''))
    const dark = documentColors(builtin())
    for (const [name, c, bg] of [
      ['light text', light.text, '#ffffff'],
      ['light link', light.link, '#ffffff'],
      ['light quote', light.quote, '#ffffff'],
      ['dark text', dark.text, TOKENS['--surface-base']],
      ['dark link', dark.link, TOKENS['--surface-base']],
      ['dark quote', dark.quote, TOKENS['--surface-base']],
    ] as const) {
      expect(contrast(c, bg), `${name} ${c} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('does not set a dark colour on a dark page', () => {
    // the exact failure that made a real QWeather mail unreadable: its text had no
    // colour of its own, and the fallback was a near-black on a dark page
    const dark = documentColors(builtin())
    for (const c of [dark.text, dark.link, dark.quote]) {
      expect(luminance(c), `${c} is too dark for the dark page`).toBeGreaterThan(0.2)
    }
  })

  it('keeps the light theme exactly as it was', () => {
    // light mode is not what this changed, so the values are pinned
    expect(documentColors(mailPalette(false, () => ''))).toEqual({
      text: '#1a1a1a',
      link: '#1a56db',
      quote: '#55606c',
      rule: '#94a3b8',
    })
  })

  it('gives the fallback text the same colour as the darkening pass gives body text', () => {
    // so text that inherited its colour is indistinguishable from text that
    // declared near-black explicitly
    expect(documentColors(builtin()).text).toBe(builtin().text.hex)
  })

  it('takes the dark rule from the palette rather than a fixed slate', () => {
    // the rule is decoration the document owns, so it belongs to the theme
    expect(documentColors(builtin()).rule).not.toBe('#94a3b8')
  })
})
