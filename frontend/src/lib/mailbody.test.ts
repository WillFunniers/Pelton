import { describe, it, expect } from 'vitest'
import { planBody, hasVisibleContent } from './mailbody'
import { darkPalette, mailPalette, withAlpha, type MailPalette } from './mailpalette'

// These tests cover which treatment a body receives, not what any treatment does
// to a colour. That distinction is the whole point: the dark theme shipped with
// every transform correct and individually tested while the reader still saw a
// white message, because Dark + Wallpaper picked the wallpaper transform and
// never reached the darkening one. Nothing here inspects Html strings for
// specific shades - the transform tests do that - so a colour change can never
// make a branch-selection test pass or fail for the wrong reason.

const BODY = '<body style="background-color:#ffffff"><p style="color:#333333">hi</p></body>'

const TOKENS: Record<string, string> = {
  '--surface-base': '#111214',
  '--surface-raised': '#1a1c1f',
  '--surface-overlay': '#222428',
  '--surface-hover': '#25282d',
  '--text-primary': '#ecedee',
}
const DARK: MailPalette = darkPalette((t) => TOKENS[t] ?? '')
const LIGHT: MailPalette = mailPalette(false, () => '')
const darkPage = DARK.page.hex

function plan(dark: boolean, wallpaper: boolean, transmission = 0.3) {
  return planBody(BODY, { palette: dark ? DARK : LIGHT, wallpaper, transmission })
}

// asTriples rewrites every colour form in a body to a bare "r,g,b" list, so a
// test can compare two renderings without caring whether a surface came out as
// hex (opaque) or rgba (translucent). Both forms are correct; only the channel
// values are the claim.
function asTriples(html: string): string {
  return html
    .replace(/#([0-9a-f]{6})\b/gi, (_, h: string) =>
      [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(','),
    )
    .replace(/rgba?\(([^)]+)\)/g, (_, inner: string) =>
      inner
        .split(',')
        .slice(0, 3)
        .map((n) => String(Number(n.trim())))
        .join(','),
    )
}

// hasColor reports whether a body paints a surface, in either colour form
function hasColor(html: string, surface: { hex: string; rgb: [number, number, number] }): boolean {
  return asTriples(html).includes(surface.rgb.join(','))
}

describe('body treatment selection', () => {
  // The four combinations of theme and wallpaper. This table IS the contract.
  it('light with no wallpaper leaves the message as sent', () => {
    const p = plan(false, false)
    expect(p.branch).toBe('raw')
    expect(p.html).toBe(BODY)
    expect(p.pageBackground).toBe('#ffffff')
  })

  it('light with a wallpaper softens the message', () => {
    const p = plan(false, true)
    expect(p.branch).toBe('soften')
    expect(p.html).not.toBe(BODY)
    expect(p.html).toContain('rgba(255,255,255,0.3)')
  })

  it('dark with no wallpaper darkens the message', () => {
    const p = plan(true, false)
    expect(p.branch).toBe('darken')
    expect(hasColor(p.html, DARK.page), 'the page colour is not in the body').toBe(true)
  })

  // The regression this work exists for. Before the fix this returned 'soften',
  // which left every light surface in the message white in a dark theme.
  it('dark with a wallpaper darkens the message, never softens it', () => {
    const p = plan(true, true)
    expect(p.branch).toBe('darken')
    expect(p.branch).not.toBe('soften')
    expect(hasColor(p.html, DARK.page), 'the page colour is not in the body').toBe(true)
    expect(p.html).not.toContain('rgba(255,255,255')
  })

  it('a wallpaper changes only the alpha a dark theme is rendered at', () => {
    // The property behind the table above: the wallpaper is a layer behind the
    // message, so it may not reach into the transform - it may only decide how
    // much of the message's own background is left transparent for it. Same
    // branch, same colours, same structure; the alpha is the only difference.
    const withWall = plan(true, true)
    const without = plan(true, false)
    expect(withWall.branch).toBe(without.branch)
    expect(withWall.html).not.toBe(without.html)
    // strip every alpha and the two bodies become identical
    expect(asTriples(withWall.html)).toBe(asTriples(without.html))
    // and it is the theme's own colours underneath, not a fixed grey
    expect(withWall.html).toContain(withAlpha(DARK.page, 0.7).rgba)
  })

  it('a wallpaper is what the page colour acknowledges, not the transform', () => {
    // With a wallpaper the page is translucent so the wallpaper shows through;
    // without one it is the solid reading colour.
    expect(plan(true, true).pageBackground).toBe(withAlpha(DARK.page, 0.7).rgba)
    expect(plan(true, false).pageBackground).toBe(darkPage)
  })

  it('the dark scrim is dark, never white', () => {
    // A white scrim in a dark theme is the "white translucent page" this work set
    // out to remove, so it is asserted directly.
    const p = plan(true, true)
    expect(p.pageBackground).toContain(DARK.page.rgb.join(', '))
    expect(p.pageBackground).not.toContain('255, 255, 255')
  })

  it('the light scrim stays white', () => {
    expect(plan(false, true).pageBackground).toContain('255, 255, 255')
  })

  it('never applies both transforms', () => {
    // A softened body would carry a translucent white; a darkened one must not,
    // and vice versa. One transform per body, in every combination.
    for (const dark of [true, false]) {
      for (const wallpaper of [true, false]) {
        const p = plan(dark, wallpaper)
        const softened = p.html.includes('rgba(255,255,255')
        const darkened = hasColor(p.html, DARK.page)
        expect(softened && darkened, `dark=${dark} wallpaper=${wallpaper}`).toBe(false)
      }
    }
  })

  it('clamps a transmission outside 0-1 rather than emitting an invalid colour', () => {
    expect(plan(true, true, 5).pageBackground).toBe(withAlpha(DARK.page, 0).rgba)
    expect(plan(true, true, -5).pageBackground).toBe(withAlpha(DARK.page, 1).rgba)
    expect(plan(false, true, Number.NaN).pageBackground).toBe('rgba(255, 255, 255, 0)')
  })

  it('passes an empty body through untouched', () => {
    expect(planBody('', { palette: DARK, wallpaper: true, transmission: 0.3 }).html).toBe('')
  })
})

// The alpha contract, stated on its own because the two directions are easy to
// confuse: the slider says how much of the *wallpaper* comes through, which is
// one minus the alpha the message's own background keeps.
describe('the transmission to alpha mapping', () => {
  it('leaves the background solid when nothing should come through', () => {
    const p = planBody(BODY, { palette: DARK, wallpaper: true, transmission: 0 })
    expect(p.pageBackground).toBe(withAlpha(DARK.page, 1).rgba)
    // and the message's own surfaces are solid too
    expect(hasColor(p.html, DARK.page)).toBe(true)
    expect(p.html).not.toContain('rgba(')
  })

  it('leaves the background fully transparent when everything should come through', () => {
    const p = planBody(BODY, { palette: DARK, wallpaper: true, transmission: 1 })
    expect(p.pageBackground).toBe(withAlpha(DARK.page, 0).rgba)
    expect(p.html).toContain(withAlpha(DARK.page, 0).rgba)
  })

  it('maps the slider value to its complement, on every step', () => {
    for (const transmission of [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1]) {
      const p = planBody(BODY, { palette: DARK, wallpaper: true, transmission })
      expect(p.pageBackground, `transmission ${transmission}`).toBe(
        withAlpha(DARK.page, 1 - transmission).rgba,
      )
    }
  })

  it('gives the message the same alpha as its page', () => {
    // otherwise the message and the page behind it disagree, and a seam shows at
    // the edge of the message
    const p = planBody(BODY, { palette: DARK, wallpaper: true, transmission: 0.3 })
    const messageAlpha = p.html.match(/rgba\([^)]*?,\s*([\d.]+)\)/)![1]
    const pageAlpha = p.pageBackground.match(/,\s*([\d.]+)\)/)![1]
    expect(messageAlpha).toBe(pageAlpha)
  })

  it('keeps the message opaque with no wallpaper, whatever the slider says', () => {
    // the slider is about what shows through from behind; with nothing behind it
    // there is nothing to let through
    for (const transmission of [0, 0.3, 1]) {
      const p = planBody(BODY, { palette: DARK, wallpaper: false, transmission })
      expect(p.pageBackground, `transmission ${transmission}`).toBe(darkPage)
    }
  })

  it('keeps the sender text solid in every combination', () => {
    for (const transmission of [0, 0.3, 0.7, 1]) {
      const p = planBody(BODY, { palette: DARK, wallpaper: true, transmission })
      const colors = [...p.html.matchAll(/[^-]color:\s*([^;"]+)/gi)].map((m) => m[1].trim())
      for (const c of colors) {
        expect(c, `text colour ${c} is translucent`).not.toContain('rgba')
      }
    }
  })
})

// hasVisibleContent decides whether the pane explains an empty body or renders
// the message. It sits in front of the reader, so the two failure modes are not
// symmetric: a false "empty" hides a real message, while a false "has content"
// merely withholds a hint. These tests therefore pin down both directions, and
// the media cases matter most - a picture-only mail is a real message.
describe('telling an empty body from one that says nothing in words', () => {
  it('calls the real empty mail empty', () => {
    // the exact sanitized body of the 163 mail that was reported as "completely
    // grey, I can't see it": 147 bytes of markup and one <br>
    expect(
      hasVisibleContent(
        '<div style="line-height:1.7;color:#000000;font-size:14px;font-family:Arial"><div style="margin:0;"><br></div></div>',
      ),
    ).toBe(false)
  })

  it('calls a body empty regardless of the wrapper it arrives in', () => {
    for (const html of [
      '',
      '<br>',
      '<br><br><br>',
      '<div></div>',
      '<p>   </p>',
      '<div>\n  \t\n</div>',
      '<table><tr><td></td></tr></table>',
      '<p>&nbsp;</p>',
      '<p>&#160;</p>',
      '<p>&nbsp;&nbsp;&nbsp;</p>',
      '<div><span> </span></div>',
      '<!-- just a comment -->',
      '<div><!-- <img src="x.png"> --></div>',
    ]) {
      expect(hasVisibleContent(html), `should be empty: ${JSON.stringify(html)}`).toBe(false)
    }
  })

  it('never calls a body with text empty', () => {
    for (const html of [
      'hi',
      '<p>附件是胶圈模具</p>',
      '<div><div>ok</div></div>',
      // a single visible character is still content
      '.',
      // entities that render as a real glyph are content, not blank
      '&amp;',
      '&copy;',
      '&#65;',
    ]) {
      expect(hasVisibleContent(html), `should have content: ${JSON.stringify(html)}`).toBe(true)
    }
  })

  it('never calls a body with embedded media empty', () => {
    // a picture-only message is a real message, and hiding it would be worse
    // than any blank pane
    for (const html of [
      '<img src="cid:a@b">',
      '<img src="data:image/png;base64,AAAA">',
      '<p><img src="cid:a@b"></p>',
      '<video src="cid:v@b"></video>',
      '<table><tr><td><img src="cid:a@b"></td></tr></table>',
    ]) {
      expect(hasVisibleContent(html), `should have content: ${JSON.stringify(html)}`).toBe(true)
    }
  })

  it('does not read a tag name as text', () => {
    // the tag-stripping step has to remove the markup, not merely the brackets
    expect(hasVisibleContent('<div style="margin:0"><br></div>')).toBe(false)
  })
})
