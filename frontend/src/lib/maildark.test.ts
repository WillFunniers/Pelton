import { describe, it, expect } from 'vitest'
import { darkenSenderBackgrounds } from './maildark'
import { darkPalette, mailPalette, withAlpha, type MailPalette } from './mailpalette'

// The built-in dark tokens, resolved as getComputedStyle would report them. The
// darkening pass is driven through the real palette builder because the colours
// it writes are the theme's, not a fixed pair: mailpalette.test.ts proves the
// palette follows any theme, and these tests are about what the pass does with
// one.
const TOKENS: Record<string, string> = {
  '--surface-base': '#111214',
  '--surface-raised': '#1a1c1f',
  '--surface-overlay': '#222428',
  '--surface-hover': '#25282d',
  '--text-primary': '#ecedee',
}
const PALETTE: MailPalette = darkPalette((t) => TOKENS[t] ?? '')
const MAIL_DARK_PAGE = PALETTE.page.hex
const MAIL_TEXT = PALETTE.text.hex
const MAIL_SECONDARY = PALETTE.secondary.hex
const MAIL_MUTED = PALETTE.muted.hex

// darken with the standard palette, which is what every call in this file wants
function darken(html: string, backgroundAlpha?: number): string {
  return darkenSenderBackgrounds(html, { palette: PALETTE, backgroundAlpha })
}

// pulls the first background colour a transform left behind
function bg(html: string): string | null {
  const m = html.match(/background-color:\s*([^;"]+)/i)
  return m ? m[1].trim().toLowerCase() : null
}

// pulls the first text colour a transform left behind (not background-color)
function fg(html: string): string | null {
  const m = html.match(/[^-]color:\s*([^;"]+)/i)
  return m ? m[1].trim().toLowerCase() : null
}

function bgOn(hex: string): string | null {
  return bg(darken(`<td style="background-color:${hex}">x</td>`))
}

function fgOn(fgHex: string, bgHex: string): string | null {
  return fg(darken(`<td style="background-color:${bgHex};color:${fgHex}">x</td>`))
}

// relative luminance of a hex colour, so the surface tests can assert on ordering
// and readability rather than on the exact numbers a constant happens to produce
// today - the ramp is tuned, and these assertions should survive tuning.
function lumOf(hex: string): number {
  const h = hex.replace('#', '')
  const ch = [0, 2, 4].map((i) => {
    const s = parseInt(h.slice(i, i + 2), 16) / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

// contrastOf is the WCAG ratio, for asserting readability rather than a colour
function contrastOf(a: string, b: string): number {
  const la = lumOf(a)
  const lb = lumOf(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// the background a bare colour is mapped to, for the ramp tests below
function bgOf(color: string): string {
  return bg(darken(`<div style="background-color:${color}">x</div>`))!
}

describe('darkenSenderBackgrounds', () => {
  it('leaves an empty body alone', () => {
    expect(darken('')).toBe('')
  })

  // the ten colours named in the brief
  describe('the named palette', () => {
    it('maps white to the dark page colour', () => {
      expect(bgOn('#FFFFFF')).toBe(MAIL_DARK_PAGE)
    })

    it('maps near-white greys to the dark page colour', () => {
      expect(bgOn('#FAFAFA')).toBe(MAIL_DARK_PAGE)
    })

    it('maps a tinted near-white to a dark equivalent that keeps the tint', () => {
      // blue-ish white: the result is dark, and still carries blue over red
      const out = bgOn('#F2F0F9')!
      expect(out).toMatch(/^#[0-9a-f]{6}$/)
      const r = parseInt(out.slice(1, 3), 16)
      const b = parseInt(out.slice(5, 7), 16)
      expect(b).toBeGreaterThan(r)
      expect(b).toBeLessThan(70)
    })

    it('maps a light grey separator onto a dark surface of its own', () => {
      // #EEEEEE is a section inset, not the page, so it lands above the base
      // rather than collapsing onto it - the point of the ramp. (Before the ramp
      // this asserted #1e1e1e, which is what flattened every message.)
      const out = bgOn('#EEEEEE')!
      expect(out).toMatch(/^#[0-9a-f]{6}$/)
      expect(lumOf(out)).toBeLessThan(0.5)
      expect(lumOf(out)).toBeGreaterThan(lumOf(MAIL_DARK_PAGE))
    })

    it('lightens dark body text', () => {
      expect(fgOn('#333333', '#ffffff')).toBe(MAIL_TEXT)
    })

    it('lightens secondary grey text onto the theme secondary role', () => {
      // #888888 is the grey senders use for a full line of readable copy - the
      // reference the reflected ramp was tuned against, and the reason the
      // secondary/muted boundary sits above it. It has to land on the secondary
      // role, and stay clearly readable there.
      const out = fgOn('#888888', '#ffffff')!
      expect(out).toBe(MAIL_SECONDARY)
      expect(contrastOf(out, MAIL_DARK_PAGE)).toBeGreaterThanOrEqual(4.5)
    })

    it('leaves a brand blue untouched', () => {
      const html = `<td style="background-color:#ffffff"><a style="color:#0D7FEF">l</a></td>`
      expect(darken(html)).toContain('#0D7FEF')
    })

    it('leaves pure black background untouched', () => {
      expect(bgOn('#000000')).toBe('#000000')
    })

    it('leaves a near-black background untouched', () => {
      // the value is passed through as written, so only its case can differ
      expect(bgOn('#17191C')?.toLowerCase()).toBe('#17191c')
    })

    it('leaves a dark slate background untouched', () => {
      expect(bgOn('#212429')).toBe('#212429')
    })
  })

  describe('the required scenarios', () => {
    // A
    it('turns a white card with dark text into a dark card with light text', () => {
      const out = darken('<div style="background:#ffffff;color:#333333">hi</div>')
      expect(out).toContain(MAIL_DARK_PAGE)
      expect(out).toContain(MAIL_TEXT)
    })

    // B
    it('leaves a dark card with light text completely alone', () => {
      const html = '<div style="background:#212429;color:#ffffff">hi</div>'
      expect(darken(html)).toBe(html)
    })

    // C
    it('keeps a link blue on a darkened card', () => {
      const out = darken(
        '<div style="background-color:#ffffff;color:#333333"><a style="color:#0D7FEF">x</a></div>',
      )
      expect(out).toContain(MAIL_DARK_PAGE)
      expect(out).toContain(MAIL_TEXT)
      expect(out).toContain('#0D7FEF')
    })

    // D
    it('keeps a brand button background and its white label', () => {
      const out = darken(
        '<div style="background-color:#ffffff"><a style="background-color:#1E96EB;color:#ffffff">Go</a></div>',
      )
      expect(out).toContain('#1E96EB')
      expect(out).toContain('#ffffff')
    })

    // E — the case the brief calls out: one message, both regions
    it('darkens the white half and preserves the black half of one message', () => {
      const html =
        '<table>' +
        '<tr><td style="background-color:#ffffff;color:#333333">light region</td></tr>' +
        '<tr><td style="background-color:#212429;color:#ffffff">dark region</td></tr>' +
        '</table>'
      const out = darken(html)
      // the light half moved
      expect(out).toContain(MAIL_DARK_PAGE)
      expect(fg(out)).toBe(MAIL_TEXT)
      // the dark half did not
      expect(out).toContain('#212429')
      expect(out).toContain('#ffffff')
    })

    // F
    it('darkens a light bgcolor attribute, in hex not rgba', () => {
      const out = darken('<table bgcolor="#FFFFFF">x</table>')
      expect(out).toContain(`bgcolor="${MAIL_DARK_PAGE}"`)
      // the #005055 bug: rgba in bgcolor is re-parsed as a legacy colour
      expect(out).not.toMatch(/bgcolor="rgba/)
    })

    // G
    it('never emits rgba into bgcolor, whatever the input', () => {
      for (const v of ['#ffffff', '#fafafa', '#f2f0f9', '#eeeeee', 'white', 'rgb(255,255,255)']) {
        const out = darken(`<td bgcolor="${v}">x</td>`)
        expect(out).not.toMatch(/bgcolor="rgba/)
        expect(out).not.toContain('005055')
      }
    })

    // H
    it('leaves a background image url untouched', () => {
      const html = '<td style="background:url(hero.png) #ffffff">x</td>'
      expect(darken(html)).toBe(html)
    })

    // I
    it('leaves a gradient untouched', () => {
      const html = '<td style="background:linear-gradient(#fff,#eee)">x</td>'
      expect(darken(html)).toBe(html)
      const two = '<td style="background-image:linear-gradient(180deg,#f6f6f6 0%,#ffffff 59%)">x</td>'
      expect(darken(two)).toBe(two)
    })

    // J — no wallpaper anywhere in this suite; the transform is unconditional
    it('runs without any wallpaper involvement', () => {
      // nothing in this API takes a wallpaper argument, so reaching this line
      // already proves the transform is not gated on one
      expect(bgOn('#ffffff')).toBe(MAIL_DARK_PAGE)
    })
  })

  describe('text is judged against the background it sits on', () => {
    it('lightens dark text even on a dark background, because it is unreadable there', () => {
      // #333333 on #212429 is 1.23:1 as the sender wrote it - lightening is the
      // only reading of "make this work on dark" that leaves it legible
      const out = darken('<td style="background-color:#212429;color:#333333">x</td>')
      expect(fg(out)).toBe(MAIL_TEXT)
      expect(out).toContain('#212429')
    })

    it('inherits the parent background for a child with none of its own', () => {
      // the span has no background; its dark text sits on the darkened td
      const out = darken(
        '<td style="background-color:#ffffff"><span style="color:#333333">x</span></td>',
      )
      expect(fg(out)).toBe(MAIL_TEXT)
    })

    it('resolves text against the background it actually sits on', () => {
      // the td is darkened and the div stays dark, so either way the span is on
      // a dark surface and its dark text has to be lightened
      const out = darken(
        '<td style="background-color:#ffffff">' +
          '<div style="background-color:#212429"><span style="color:#333333">x</span></div>' +
          '</td>',
      )
      expect(fg(out)).toBe(MAIL_TEXT)
      // and the already-dark div is untouched
      expect(out).toContain('#212429')
    })

    it('keeps the dark background scoped to its own element', () => {
      const out = darken(
        '<div style="background-color:#212429"><span style="color:#eee">a</span></div>' +
          '<p style="color:#333333">b</p>',
      )
      // the div's background does not leak: exactly one element carries it
      expect((out.match(/#212429/g) ?? []).length).toBe(1)
      // the span's already-light text is left as sent
      expect(out).toContain('#eee')
      // the trailing p is on the dark page, so its dark text is lightened
      expect(out).toContain(` color: ${MAIL_TEXT}`)
    })
  })

  describe('what it refuses to touch', () => {
    it('keeps a saturated dark colour, which is a brand not a neutral', () => {
      const out = darken('<td style="background-color:#ffffff;color:#c0392b">x</td>')
      expect(out).toContain('#c0392b')
    })

    it('leaves an unparseable value rather than dropping it', () => {
      const html = '<td style="background-color:inherit">x</td>'
      expect(darken(html)).toBe(html)
    })

    it('is not confused by a colour in prose or a link href', () => {
      const html = '<p>paint it #ffffff</p><a href="https://x.test/#fff">l</a>'
      expect(darken(html)).toBe(html)
    })

    it('leaves other declarations in the same attribute untouched', () => {
      const out = darken(
        '<p style="font-size:15px;background-color:#ffffff;line-height:24px">x</p>',
      )
      expect(out).toContain('font-size:15px')
      expect(out).toContain('line-height:24px')
      expect(out).toContain(MAIL_DARK_PAGE)
    })

    it('does not touch an img element', () => {
      const html = '<img src="https://x.test/a.png" width="10">'
      expect(darken(html)).toBe(html)
    })

    // an anchor that inherits the body colour is the "w***@qq.com" and
    // "support@..." pattern in the real receipt; it declares a neutral grey and
    // would otherwise stay at ~1.3:1 on the darkened page
    it('lightens a neutral-coloured anchor, because it is body text with a tag', () => {
      const out = darken(
        '<p style="background-color:#ffffff;color:#333333">hi <a style="color:#333333">w@q.com</a></p>',
      )
      // both the paragraph text and the anchor move
      expect((out.match(new RegExp(MAIL_TEXT, 'g')) ?? []).length).toBe(2)
    })

    it('still keeps a link that declares its own blue', () => {
      const out = darken(
        '<p style="background-color:#ffffff;color:#333333"><a style="color:#0D7FEF">docs</a></p>',
      )
      expect(out).toContain('#0D7FEF')
    })

    it('honours the palette it is told to render in', () => {
      // a light palette is the fixed light rendering, which has nothing to
      // repaint: mail already assumes a light page
      const out = darkenSenderBackgrounds('<div style="background:#ffffff;color:#333333">x</div>', {
        palette: mailPalette(false, () => ''),
      })
      expect(out).toBe('<div style="background:#ffffff;color:#333333">x</div>')
    })
  })

  describe('the dark surface ramp', () => {
    it('puts a pure white page on the base surface', () => {
      expect(bgOf('#ffffff')).toBe(MAIL_DARK_PAGE)
    })

    it('keeps a near-white page on the base, so white and near-white stay one surface', () => {
      // #fafafa is "the page" in practice, exactly as #ffffff is. Giving it a
      // step of its own would invent a seam the message never drew.
      expect(bgOf('#fafafa')).toBe(MAIL_DARK_PAGE)
    })

    it('keeps a tinted near-white on the base too, minus its tint', () => {
      // AFFiNE's page is #f6f7fb. Like #fafafa it is a page, so it must not step
      // away from the base; but it is tinted, and the tint is preserved on
      // purpose, so it lands a shade off rather than exactly on it.
      const out = bgOf('#f6f7fb')
      const ch = [1, 3, 5].map((i) => parseInt(out.slice(i, i + 2), 16))
      const base = [1, 3, 5].map((i) => parseInt(MAIL_DARK_PAGE.slice(i, i + 2), 16))
      ch.forEach((v, i) => expect(Math.abs(v - base[i]), `channel ${i} stepped too far`).toBeLessThanOrEqual(8))
      expect(ch[2]).toBeGreaterThan(ch[0]) // still blue over red
    })

    it('steps a surface that was genuinely distinct', () => {
      // #f5f5f5 and #eeeeee are insets against a white card, so they land above
      // the base rather than on it
      expect(bgOf('#f5f5f5')).not.toBe(MAIL_DARK_PAGE)
      expect(bgOf('#eeeeee')).not.toBe(MAIL_DARK_PAGE)
      expect(lumOf(bgOf('#eeeeee'))).toBeGreaterThan(lumOf(bgOf('#f5f5f5')))
    })

    it('keeps the ordering of a set of shades', () => {
      const shades = ['#ffffff', '#fafafa', '#f5f5f5', '#eeeeee', '#e5e5e5', '#cccccc']
      const lums = shades.map((c) => lumOf(bgOf(c)))
      for (let i = 1; i < lums.length; i++) {
        expect(lums[i], `${shades[i]} landed below ${shades[i - 1]}`).toBeGreaterThanOrEqual(lums[i - 1])
      }
      // ...and it genuinely spreads rather than sitting on one value
      expect(lums[lums.length - 1]).toBeGreaterThan(lums[0])
    })

    it('keeps every surface on the dark side', () => {
      for (const c of ['#ffffff', '#f5f5f5', '#eeeeee', '#e5e5e5', '#cccccc']) {
        expect(lumOf(bgOf(c)), `${c} came out light`).toBeLessThan(0.5)
      }
    })
  })

  describe('text colour inherited from a layout element', () => {
    it('moves a dark colour declared on a table, which its cells inherit', () => {
      // a common newsletter pattern: the table carries the colour, the cells
      // carry the text and declare nothing themselves. Missing this left
      // near-black text on a darkened page (1.32:1).
      const out = darken('<table style="color:#333333"><tr><td>body copy</td></tr></table>')
      expect(bg(out)).toBeNull()
      expect(out).toContain(`color: ${MAIL_TEXT}`)
    })

    it('still leaves a brand colour on a table alone', () => {
      const out = darken('<table style="color:#067df7"><tr><td>a link</td></tr></table>')
      expect(out).toContain('#067df7')
    })
  })

  describe('structure', () => {
    it('keeps the tags and nesting intact', () => {
      const html = '<table><tr><td style="background-color:#ffffff">a</td></tr></table>'
      const out = darken(html)
      expect(out.replace(/ style="[^"]*"/g, '')).toBe(html.replace(/ style="[^"]*"/g, ''))
      expect((out.match(/</g) ?? []).length).toBe((html.match(/</g) ?? []).length)
    })

    it('tolerates a missing close tag without clearing everything after', () => {
      const out = darken('<div style="background-color:#ffffff"><td>x</td>')
      expect(out).toContain(MAIL_DARK_PAGE)
    })

    it('starts the surface ramp at the theme page colour', () => {
      // the page mail is repainted onto is the theme's own page, so a white
      // background lands exactly where the reading pane's surface already is
      expect(bgOf('#ffffff')).toBe(PALETTE.page.hex)
      expect(MAIL_DARK_PAGE).toBe(TOKENS['--surface-base'])
    })
  })

  describe('it renders in the theme it is given, not a fixed grey pair', () => {
    // the point of the palette: a warm theme has to produce a warm message
    const WARM: Record<string, string> = {
      '--surface-base': '#161512',
      '--surface-raised': '#1a1c1f',
      '--surface-overlay': '#26251f',
      '--text-primary': '#f5f0e6',
    }
    const warm = darkPalette((t) => WARM[t] ?? '')

    it('paints a white card in the theme page colour', () => {
      const out = darkenSenderBackgrounds('<td style="background-color:#ffffff">x</td>', { palette: warm })
      expect(out).toContain(warm.page.hex)
      expect(out).not.toContain(MAIL_DARK_PAGE)
    })

    it('writes the theme body text colour for near-black sender text', () => {
      const out = darkenSenderBackgrounds('<td style="background-color:#ffffff;color:#000000">x</td>', {
        palette: warm,
      })
      expect(out).toContain(warm.text.hex)
      expect(out).not.toContain(MAIL_TEXT)
    })

    it('keeps the result warm rather than neutral grey', () => {
      const out = darkenSenderBackgrounds('<td style="background-color:#ffffff">x</td>', { palette: warm })
      const hex = bg(out)!
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      expect(r, 'the warm theme came out cool').toBeGreaterThanOrEqual(b)
      expect(g).toBeGreaterThanOrEqual(b)
    })

    it('preserves tint on every theme, so a violet footer stays violet', () => {
      for (const p of [PALETTE, warm]) {
        const out = darkenSenderBackgrounds('<div style="background-color:#f2f0f9">x</div>', { palette: p })
        const [r, , b] = [1, 3, 5].map((i) => parseInt(bg(out)!.slice(i, i + 2), 16))
        expect(b, 'the violet cast was lost').toBeGreaterThan(r)
      }
    })
  })

  describe('the text ramp uses the theme roles', () => {
    it('sends near-black body copy to the primary text role', () => {
      expect(fgOn('#000000', '#ffffff')).toBe(MAIL_TEXT)
      expect(fgOn('#141414', '#ffffff')).toBe(MAIL_TEXT)
      expect(fgOn('#333333', '#ffffff')).toBe(MAIL_TEXT)
    })

    it('sends a mid grey to the secondary role', () => {
      expect(fgOn('#666666', '#ffffff')).toBe(MAIL_SECONDARY)
      expect(fgOn('#888888', '#ffffff')).toBe(MAIL_SECONDARY)
    })

    it('sends a light meta grey to the muted role', () => {
      // #999896 is the real colour of a QQ signature's address line
      expect(fgOn('#999896', '#ffffff')).toBe(MAIL_MUTED)
    })

    it('keeps every role readable on the page', () => {
      for (const role of [MAIL_TEXT, MAIL_SECONDARY, MAIL_MUTED]) {
        expect(contrastOf(role, MAIL_DARK_PAGE), `${role} on the page`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('never writes a translucent text colour', () => {
      // translucent text over a wallpaper fails exactly when the wallpaper is
      // bright, which is when readability matters most
      const out = darken('<td style="background-color:#ffffff;color:#333333">x</td>')
      const text = fg(out)!
      expect(text).not.toContain('rgba')
      expect(text).toMatch(/^#[0-9a-f]{6}$/)
    })

    it('orders a message the way the sender ordered it', () => {
      // the sender drew three levels; the reader must still see three, in order
      const html =
        '<div style="background-color:#ffffff">' +
        '<p style="color:#333333">body</p>' +
        '<p style="color:#888888">secondary</p>' +
        '<p style="color:#999896">meta</p>' +
        '</div>'
      const out = darken(html)
      const lums = [MAIL_TEXT, MAIL_SECONDARY, MAIL_MUTED].map(lumOf)
      expect(lums[0]).toBeGreaterThan(lums[1])
      expect(lums[1]).toBeGreaterThan(lums[2])
      for (const c of [MAIL_TEXT, MAIL_SECONDARY, MAIL_MUTED]) {
        expect(out).toContain(c)
      }
    })
  })

  describe('translucent surfaces', () => {
    it('writes the surface as rgba when asked for an alpha', () => {
      const out = darken('<td style="background-color:#ffffff">x</td>', 0.7)
      expect(bg(out)).toBe(withAlpha(PALETTE.page, 0.7).rgba)
    })

    it('keeps the surface opaque at full alpha', () => {
      const out = darken('<td style="background-color:#ffffff">x</td>', 1)
      expect(bg(out)).toBe(PALETTE.page.hex)
      expect(out).not.toContain('rgba')
    })

    it('never writes rgba into a bgcolor attribute, at any alpha', () => {
      // the #005055 bug: a value bgcolor cannot parse is re-read as a legacy
      // colour, so a translucent background has to leave the attribute alone
      for (const alpha of [0, 0.3, 0.7, 1]) {
        const out = darken('<table bgcolor="#FFFFFF">x</table>', alpha)
        expect(out, `alpha ${alpha}`).not.toMatch(/bgcolor="rgba/)
        expect(out, `alpha ${alpha}`).not.toContain('005055')
      }
    })

    it('drops bgcolor and declares the translucent colour in style instead', () => {
      const out = darken('<table bgcolor="#FFFFFF">x</table>', 0.7)
      expect(out).not.toContain('bgcolor')
      expect(out).toContain(`background-color: ${withAlpha(PALETTE.page, 0.7).rgba}`)
    })

    it('keeps an opaque bgcolor as hex, which is what the attribute accepts', () => {
      const out = darken('<table bgcolor="#FFFFFF">x</table>', 1)
      expect(out).toContain(`bgcolor="${PALETTE.page.hex}"`)
    })

    it('leaves a dark background translucent-free, as the sender drew it', () => {
      const html = '<td style="background-color:#212429;color:#ffffff">x</td>'
      expect(darken(html, 0.3)).toBe(html)
    })

    it('keeps the tint while making a surface translucent', () => {
      const out = darken('<div style="background-color:#f2f0f9">x</div>', 0.7)
      // the translucent form is rgba(), so the channels are read from that
      // rather than sliced out of a hex string
      const [r, , b] = (bg(out)!.match(/\d+/g) ?? []).map(Number)
      expect(b).toBeGreaterThan(r)
    })

    it('treats a missing alpha as fully opaque', () => {
      expect(darken('<td style="background-color:#ffffff">x</td>')).toBe(
        darken('<td style="background-color:#ffffff">x</td>', 1),
      )
    })
  })

  describe('a background it cannot rewrite still informs the text decision', () => {
    // a real QQ mail paints `background: #fff url(...)`. The url means the box
    // cannot be repainted, but the box is still white, so text inside it has to
    // be judged against white - not against the dark page. Getting this wrong is
    // what produced the "白底灰字" report: #e5e5e5 text on a white slab at 1.2:1.
    const withImage = (color: string): string =>
      `<div style="background: ${color} url(http://x.test/bg.jpg) 0 0 no-repeat">text</div>`

    it('leaves the sender text dark when their background is light', () => {
      const out = darken(`<div style="background:#fff url(http://x.test/bg.jpg) 0 0 no-repeat;color:#333333">text</div>`)
      expect(fg(out), 'light-grey text was written onto a light background').toBe('#333333')
    })

    it('still converts light text when their background is dark', () => {
      const out = darken(`<div style="background:#212429 url(http://x.test/bg.jpg) 0 0 no-repeat;color:#ffffff">text</div>`)
      // already light: left as sent
      expect(fg(out)).toBe('#ffffff')
    })

    it('leaves the url itself untouched', () => {
      const html = withImage('#fff')
      const out = darken(`<div style="background: #fff url(http://x.test/bg.jpg) 0 0 no-repeat;color:#333333">text</div>`)
      expect(out).toContain('url(http://x.test/bg.jpg)')
      expect(html).toContain('url(http://x.test/bg.jpg)')
    })

    it('is not fooled by a shorthand that names no colour', () => {
      const html = '<div style="background: url(http://x.test/bg.jpg)">text</div>'
      expect(darken(html)).toBe(html)
    })

    it('adds the colour to an existing style attribute rather than a second one', () => {
      // two style attributes on one element is not a merge: the html parser keeps
      // the first and drops the second, so the colour would silently not apply
      const out = darken(
        '<div style="background: #fff url(http://x.test/bg.jpg)"><p style="margin:0">copy</p></div>',
      )
      // no element carries two style attributes
      for (const tag of out.match(/<[a-z][^>]*>/gi) ?? []) {
        expect((tag.match(/\sstyle=/gi) ?? []).length, `two style attributes in ${tag}`).toBeLessThanOrEqual(1)
      }
      // the paragraph kept its own declaration and gained the colour
      expect(out).toMatch(/<p style="margin:0; color: #[0-9a-f]{6}">/)
      expect(out).toContain(`color: ${PALETTE.onLight.hex}`)
    })
  })
})
