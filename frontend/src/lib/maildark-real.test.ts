import { describe, it, expect } from 'vitest'
import { darkenSenderBackgrounds } from './maildark'
import { hasVisibleContent } from './mailbody'
import { documentColors } from './maildoc'
import { darkPalette, type MailPalette } from './mailpalette'
// Real messages, kept as fixtures so this runs unattended. They are the
// sanitized bodies exactly as the backend hands them to the reader: the
// sanitizer has already stripped the sender's <style> blocks, so what remains
// is the inline markup these tests exercise. Imported with ?raw so the test
// needs no filesystem access.
import qweather from '../test/fixtures/mail-qweather.html?raw'
import steam from '../test/fixtures/mail-steam.html?raw'
import affine from '../test/fixtures/mail-affine.html?raw'
import activation from '../test/fixtures/mail-qweather-activation.html?raw'
import qqBirthday from '../test/fixtures/mail-qq-birthday.html?raw'
import qqReply from '../test/fixtures/mail-qq-reply.html?raw'
// The 163 attachment mail with no body at all, reported as "completely grey,
// I can't see it". Kept because the pane's empty-body state keys off exactly
// this shape, and because it is the fixture that proves the darkening pass
// cannot make an empty message unreadable - there is nothing to make unreadable.
import qqStl from '../test/fixtures/mail-qq-stl.html?raw'

// relative luminance, to assert on readability rather than on exact hex
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

function backgrounds(html: string): string[] {
  return [...html.matchAll(/background-color:\s*([^;"]+)/gi)].map((m) => m[1].trim().toLowerCase())
}

// textColors pulls every declared text colour, in either hex form
function textColors(html: string): string[] {
  return [...html.matchAll(/[^-]color:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1].trim().toLowerCase())
}

// The built-in dark tokens, resolved as getComputedStyle would report them.
const TOKENS: Record<string, string> = {
  '--surface-base': '#111214',
  '--surface-raised': '#1a1c1f',
  '--surface-overlay': '#222428',
  '--surface-hover': '#25282d',
  '--text-primary': '#ecedee',
}
const PALETTE: MailPalette = darkPalette((t) => TOKENS[t] ?? '')
const MAIL_DARK_PAGE = PALETTE.page.hex

// darken runs the real pass with the real palette, which is what every case
// below wants. The page colour is the one the reading pane paints.
function darken(html: string): string {
  return darkenSenderBackgrounds(html, { palette: PALETTE })
}

describe('real messages under a dark theme', () => {
  describe('the QWeather receipt', () => {
    const dark = darken(qweather)

    it('leaves no light background behind', () => {
      // every background it declares must now be dark; this is the whole point
      for (const bg of backgrounds(dark)) {
        expect(bg, `background ${bg} is still light`).toMatch(/^#[0-9a-f]{6}$/)
        expect(luminance(bg)).toBeLessThan(0.1)
      }
    })

    it('darkens the page, the card and the footer', () => {
      const dark2 = backgrounds(dark)
      // the light page and every white panel land on the base surface
      expect(dark2).toContain(PALETTE.page.hex)
      // nothing remains of the originals
      expect(dark).not.toMatch(/#fafafa/i)
      expect(dark).not.toMatch(/#ffffff/i)
      expect(dark).not.toMatch(/#f2f0f9/i)
      expect(dark).not.toMatch(/#eeeeee/i)
    })

    it('keeps the original surface hierarchy instead of flattening it', () => {
      // The page is #fafafa/#ffffff, a section is #EEEEEE, and the footer is the
      // tinted #F2F0F9. Mapping them all onto one dark value is what made the
      // message read as a single flat sheet; each one has to keep its own place
      // on the ramp, in the same order it had before.
      const dark2 = backgrounds(dark)
      const distinct = new Set(dark2)
      expect(distinct.size).toBeGreaterThan(1)
      // the lighter the original, the lower the result: the page sorts below the
      // #EEEEEE sections rather than collapsing onto them
      // the #EEEEEE sections land above the page on the ramp
      expect(luminance(PALETTE.page.hex)).toBeLessThan(luminance(dark2[dark2.length - 1]))
      expect(new Set(dark2).size).toBeGreaterThan(1)
    })

    it('keeps the tinted footer tinted', () => {
      // #F2F0F9 is a violet-tinted near-white. Darkening it has to leave a
      // violet cast rather than a neutral grey, or the footer loses the one
      // thing that distinguished it.
      const tinted = backgrounds(dark).find((bg) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16))
        return b > r && r >= g
      })
      expect(tinted, 'no violet-tinted dark background survived').toBeDefined()
    })

    it('moves the sender text onto the theme roles, all of them readable', () => {
      // #333333 body text and #888888 footer text both have to end up light on
      // the dark page, and both have to clear 4.5:1 there
      for (const role of [PALETTE.text.hex, PALETTE.secondary.hex]) {
        expect(dark, `${role} is missing from the darkened receipt`).toContain(`color: ${role}`)
        expect(contrast(role, PALETTE.page.hex), `${role} on the page`).toBeGreaterThanOrEqual(4.5)
      }
      // the dark text really is gone: no near-black colour survives as text
      for (const c of textColors(dark)) {
        expect(luminance(c), `${c} is still dark on a dark page`).toBeGreaterThan(0.2)
      }
    })

    it('keeps the link blue', () => {
      // every anchor colour survives
      const before = [...qweather.matchAll(/color:\s*#0D7FEF/gi)].length
      const after = [...dark.matchAll(/color:\s*#0D7FEF/gi)].length
      expect(before).toBeGreaterThan(0)
      expect(after).toBe(before)
    })

    it('does not disturb the structure', () => {
      const strip = (h: string): string => h.replace(/\sstyle="[^"]*"/g, '').replace(/\s(color|bgcolor)="[^"]*"/g, '')
      expect(strip(dark)).toBe(strip(qweather))
    })

    it('carries no bgcolor, matching the source', () => {
      expect(qweather).not.toMatch(/bgcolor/i)
      expect(dark).not.toMatch(/bgcolor/i)
    })
  })

  describe('the AFFiNE sign-in mail', () => {
    const dark = darken(affine)

    it('darkens the page and the card', () => {
      // #f6f7fb page, #fff card, #fafafa footer, #F5F5F5 code block
      expect(dark).not.toMatch(/#f6f7fb/i)
      expect(dark).not.toMatch(/background-color:\s*#fff\b/i)
      expect(dark).not.toMatch(/#fafafa/i)
      expect(dark).not.toMatch(/#F5F5F5/i)
    })

    it('lightens the body copy and the secondary line', () => {
      // #141414 body copy and #7A7A7A secondary copy both have to end up light
      // on the darkened page, in the theme's own two roles
      expect(dark).toContain(`color: ${PALETTE.text.hex}`)
      expect(dark).toContain(`color: ${PALETTE.secondary.hex}`)
      for (const role of [PALETTE.text.hex, PALETTE.secondary.hex]) {
        expect(contrast(role, PALETTE.page.hex), `${role} on the page`).toBeGreaterThan(4.5)
      }
    })

    it('keeps the brand button and its white label', () => {
      // the button is the message's one call to action; both halves must survive
      expect(dark).toContain('#1E96EB')
      expect(dark).toMatch(/color:\s*#FFFFFF/i)
    })

    // The verification code is the one string in this message the reader has to
    // read, and it was the one place the transform made things worse: <pre> was
    // in BG_TAGS but not in TEXT_TAGS, so its box was darkened while its text
    // stayed #141414 - 1.1:1, effectively invisible.
    it('keeps the verification code readable', () => {
      const pre = /<pre[^>]*>/.exec(dark)?.[0] ?? ''
      expect(pre).not.toBe('')
      const bg = /background-color:\s*(#[0-9a-f]{6})/i.exec(pre)?.[1]
      const fg = /color:\s*(#[0-9a-f]{6})/i.exec(pre)?.[1]
      expect(bg, 'the code block lost its background').toBeDefined()
      expect(fg, 'the code block lost its text colour').toBeDefined()
      expect(bg).not.toBe('#F5F5F5')
      expect(fg).not.toBe('#141414')
      expect(contrast(fg!, bg!)).toBeGreaterThanOrEqual(4.5)
    })

    it('keeps the code itself', () => {
      expect(affine).toContain('000000')
      expect(dark).toContain('000000')
    })

    it('does not disturb the structure', () => {
      const strip = (h: string): string => h.replace(/\sstyle="[^"]*"/g, '').replace(/\s(color|bgcolor)="[^"]*"/g, '')
      expect(strip(dark)).toBe(strip(affine))
    })
  })

  // The hardest real message to render dark, and the one that broke: almost all
  // of its text colour lives in a <style> block that the sanitizer removes, so
  // the elements arrive with no colour of their own and every one of them renders
  // in the reading document's own fallback colour.
  describe('the QWeather activation mail, whose colours are mostly in a stripped stylesheet', () => {
    const dark = darken(activation)

    it('has paragraphs that declare no colour at all', () => {
      // this is the shape of the message, and the reason the fallback matters:
      // if these ever gain inline colours the fixture stopped testing the case
      const bare = (activation.match(/<p>/g) ?? []).length
      expect(bare).toBeGreaterThan(0)
      expect(dark.match(/<p>/g) ?? []).toHaveLength(bare)
    })

    it('still darkens the surfaces it does declare', () => {
      expect(dark).not.toMatch(/#fafafa/i)
      expect(dark).not.toMatch(/background-color:\s*#ffffff/i)
      expect(dark).toMatch(new RegExp(`background-color:\\s*${PALETTE.page.hex}`, 'i'))
      // the tinted footer keeps its tint
      const tinted = backgrounds(dark).find((bg) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16))
        return b > r && r >= g
      })
      expect(tinted, 'the violet footer lost its tint').toBeDefined()
    })

    it('moves the colours it does declare', () => {
      expect(dark).toContain(`color: ${PALETTE.text.hex}`) // #333333 headings
      expect(dark).toContain(`color: ${PALETTE.secondary.hex}`) // #888888 footer
    })

    it('keeps the activation code', () => {
      expect(activation).toContain('000000')
      expect(dark).toContain('000000')
    })

    it('leaves the uncoloured text to the document fallback, which is readable on dark', () => {
      // The pass cannot rewrite a paragraph that declares nothing, so the reader's
      // protection here is the reading document's own body colour. This asserts the
      // pair actually works: the fallback is light, and reads on the darkened page.
      const { text } = documentColors(PALETTE)
      expect(contrast(text, MAIL_DARK_PAGE)).toBeGreaterThanOrEqual(4.5)
    })
  })

  describe('the Steam code message, which is already dark', () => {
    const dark = darken(steam)

    it('leaves its dark panels and light text alone', () => {
      // this message is designed dark; none of its own colours should move
      expect(dark).toContain('#212429')
      expect(dark).toContain('#17191c')
      expect(dark).toContain('#3a9aed')
    })

    it('darkens the light page it declares', () => {
      // it does declare a white body, which must stop being white
      expect(steam).toMatch(/#ffffff/i)
      expect(dark).not.toMatch(/background-color:\s*#ffffff/i)
    })
  })

  // Reported by the user as "白底灰色字" (grey text on a white background). The
  // message lives entirely in its own white card, and the card's background is a
  // `background` shorthand carrying an image, so the box itself cannot be
  // repainted - but it is still a white box, and the text inside it has to stay
  // dark. An earlier version of the palette work repainted the *tracked* colour
  // instead of the actual one, which put #ecedee text on that white card at
  // 1.23:1. These tests pin both halves of the correct behaviour.
  describe('the QQ birthday mail, which paints a white card behind the text', () => {
    const dark = darken(qqBirthday)

    it('leaves the sender text dark, because their background is still light', () => {
      // the card keeps its own image-backed white, so its text must keep its own
      // dark colour rather than being lightened onto a dark page it is not on
      for (const c of textColors(dark)) {
        expect(luminance(c), `${c} is too light for the white card it sits on`).toBeLessThan(0.5)
      }
      // and specifically it is not the theme's light body colour
      expect(dark).not.toContain(`color: ${PALETTE.text.hex}`)
    })

    it('does not repaint a background it cannot rewrite', () => {
      // the shorthand's url() and its position list belong to the sender
      expect(dark).toContain('url(http://i.mail.qq.com')
      expect(dark).toMatch(/background:\s*#fff url\(/)
      // no repainted surface was written for that element
      expect(dark).not.toContain(`background-color: ${PALETTE.page.hex}`)
    })

    it('still repaints the plain light surfaces it does declare', () => {
      // the hidden webmail block has a solid #ffe7e7 background, which is exactly
      // the kind of surface this pass owns
      expect(qqBirthday).toMatch(/#ffe7e7/i)
      expect(dark).not.toMatch(/#ffe7e7/i)
    })

    it('keeps the brand button and its white label', () => {
      expect(dark).toContain('#4f99ee')
      expect(dark).toMatch(/color:\s*#fff\b/i)
    })

    it('keeps the body copy', () => {
      expect(qqBirthday).toContain('Happy Birthday')
      expect(dark).toContain('Happy Birthday')
    })

    it('does not disturb the structure', () => {
      const strip = (h: string): string => h.replace(/\sstyle="[^"]*"/g, '').replace(/\s(color|bgcolor)="[^"]*"/g, '')
      expect(strip(dark)).toBe(strip(qqBirthday))
    })
  })

  // Reported as "灰底白字" (light text on a grey background). This message really
  // does declare near-black text and a light grey rule, so it is the straight
  // case: the text has to move onto the theme's light roles and the grey box has
  // to become a theme surface.
  describe('the QQ reply mail, whose text is near-black on a light page', () => {
    const dark = darken(qqReply)

    it('moves its near-black text onto the theme body colour', () => {
      // the mail's own copy is rgb(0, 0, 0)
      expect(qqReply).toMatch(/color:\s*rgb\(0, 0, 0\)/i)
      expect(dark).not.toMatch(/color:\s*rgb\(0, 0, 0\)/i)
      expect(dark).toContain(`color: ${PALETTE.text.hex}`)
    })

    it('makes every declared text colour readable on the darkened page', () => {
      // the business card carries #33312E and #999896, which are exactly the
      // secondary and muted cases
      for (const c of textColors(dark)) {
        expect(contrast(c, PALETTE.page.hex), `${c} on the page`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('repaints the one neutral background it declares', () => {
      // the signature separator is rgb(230, 232, 235)
      expect(qqReply).toMatch(/background:\s*rgb\(230, 232, 235\)/i)
      expect(dark).not.toMatch(/background:\s*rgb\(230, 232, 235\)/i)
    })

    it('keeps the QQ business-card link, which is a link and not a surface', () => {
      // the anchor declares no colour of its own, so its text is inherited; the
      // href must survive untouched regardless
      expect(dark).toContain('https://wx.mail.qq.com/home/index')
    })

    it('does not disturb the structure', () => {
      const strip = (h: string): string => h.replace(/\sstyle="[^"]*"/g, '').replace(/\s(color|bgcolor)="[^"]*"/g, '')
      expect(strip(dark)).toBe(strip(qqReply))
    })
  })

})

// A message can arrive with markup that shows nothing. The darkening pass has
// nothing to rewrite in it, and the pane must say so rather than paint a blank
// block the reader will read as a broken client. This was reported from a real
// 163 mail whose only payload was an attachment.
describe('the 163 attachment mail, whose body is empty', () => {
  const dark = darken(qqStl)

  it('really has nothing visible in it, which is why it is the case', () => {
    expect(hasVisibleContent(qqStl)).toBe(false)
    // one <br> and no text: the whole body is a wrapper and a line break
    expect(qqStl).toMatch(/<br\s*\/?>/i)
    expect(qqStl.replace(/<[^>]*>/g, '').trim()).toBe('')
  })

  it('still gets its declared black moved onto the theme colour', () => {
    // the sender's color:#000000 is present, so the pass has one thing to do
    // even here, and it must not leave near-black text on a dark page
    expect(qqStl).toMatch(/color:\s*#000000/i)
    expect(dark).not.toMatch(/color:\s*#000000/i)
    expect(dark).toContain(`color: ${PALETTE.text.hex}`)
  })

  it('does not disturb the structure it was given', () => {
    const strip = (h: string): string => h.replace(/\sstyle="[^"]*"/g, '').replace(/\s(color|bgcolor)="[^"]*"/g, '')
    expect(strip(dark)).toBe(strip(qqStl))
  })
})
