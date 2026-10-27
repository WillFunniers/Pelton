import { describe, it, expect } from 'vitest'
import { softenSenderBackgrounds, DEFAULT_MAIL_BG_OPACITY } from './mailbg'

// counts how many translucent white layers a body ends up with
function countScrims(html: string): number {
  return (html.match(/rgba\(255,\s*255,\s*255,\s*0?\.[0-9]+\)/g) ?? []).length
}

describe('softenSenderBackgrounds', () => {
  it('leaves an empty body alone', () => {
    expect(softenSenderBackgrounds('')).toBe('')
  })

  it('defaults to the shipped opacity', () => {
    const out = softenSenderBackgrounds('<td style="background-color:#fff">x</td>')
    expect(out).toContain(`rgba(255,255,255,${DEFAULT_MAIL_BG_OPACITY})`)
  })

  // The bug this exists to prevent: real mail nests a light body, a light td
  // and a white card, and three translucent layers multiply to (1-a)^3, which
  // left the reader seeing almost no wallpaper at any usable alpha.
  it('applies the scrim to the outermost light background only', () => {
    const html =
      '<body style="background-color:#f6f7fb"><table><tr><td style="background-color:#f6f7fb">' +
      '<table style="background-color:#fff"><tr><td><pre style="background-color:#F5F5F5">000000</pre></td></tr></table>' +
      '</td></tr></table></body>'
    const out = softenSenderBackgrounds(html, { opacity: 0.3 })
    // exactly one translucent layer, and it is the outermost
    expect(countScrims(out)).toBe(1)
    expect(out.indexOf('rgba(255,255,255,0.3)')).toBeLessThan(out.indexOf('rgba(255,255,255,0)'))
    // the nested ones are cleared rather than given their own alpha
    expect(out.match(/rgba\(255,255,255,0\)/g)?.length).toBe(3)
  })

  it('keeps the strength independent of nesting depth', () => {
    const shallow = softenSenderBackgrounds('<body style="background-color:#fff">x</body>', { opacity: 0.3 })
    const deep = softenSenderBackgrounds(
      '<body style="background-color:#fff"><div style="background-color:#fff"><div style="background-color:#fff"><div style="background-color:#fff">x</div></div></div></body>',
      { opacity: 0.3 },
    )
    expect(countScrims(shallow)).toBe(1)
    expect(countScrims(deep)).toBe(1)
  })

  it('honours an explicit opacity', () => {
    expect(softenSenderBackgrounds('<td style="background-color:#fff">x</td>', { opacity: 0.5 })).toContain(
      'rgba(255,255,255,0.5)',
    )
  })

  it('leaves the wallpaper fully visible at opacity 0', () => {
    // 0 is a fully transparent scrim: nothing of the sender's light background
    // is kept, so the wallpaper comes through unmixed.
    expect(softenSenderBackgrounds('<td style="background-color:#fff">x</td>', { opacity: 0 })).toContain(
      'rgba(255,255,255,0)',
    )
  })

  it('keeps the sender background opaque at opacity 1', () => {
    expect(softenSenderBackgrounds('<td style="background-color:#fff">x</td>', { opacity: 1 })).toContain(
      'rgba(255,255,255,1)',
    )
  })

  it('clamps a nonsensical opacity', () => {
    expect(softenSenderBackgrounds('<td style="background-color:#fff">x</td>', { opacity: 5 })).toContain(
      'rgba(255,255,255,1)',
    )
    expect(softenSenderBackgrounds('<td style="background-color:#fff">x</td>', { opacity: -2 })).toContain(
      'rgba(255,255,255,0)',
    )
  })

  // bgcolor only accepts legacy colour syntax. Writing rgba() into it does not
  // leave the element uncoloured: browsers re-parse the string as a legacy
  // colour and render rgb(0,80,85), an opaque dark teal that covered the
  // wallpaper. The attribute is therefore dropped in favour of a style
  // declaration, which can express the softened colour.
  it('never writes a translucent value into bgcolor', () => {
    const out = softenSenderBackgrounds('<table bgcolor="#FFFFFF">x</table>')
    expect(out).not.toContain('bgcolor=')
    expect(out).toContain('style="background-color: rgba(255,255,255,')
  })

  it('moves a softened bgcolor into the existing style attribute', () => {
    const out = softenSenderBackgrounds('<td bgcolor="#ffffff" style="padding:80px">x</td>')
    expect(out).not.toContain('bgcolor=')
    expect(out).toContain('padding:80px')
    expect(out).toContain('rgba(255,255,255,')
  })

  // this is the case the fixed light reading page exists for: a dark-designed
  // message that carries light text, which a light scrim would erase.
  it('preserves a dark background so light text stays readable', () => {
    const html = '<td style="background-color:#1a1a1a;color:#eeeeee">x</td>'
    expect(softenSenderBackgrounds(html)).toBe(html)
  })

  it('leaves other declarations in the same style attribute untouched', () => {
    const out = softenSenderBackgrounds('<p style="color:#141414;background-color:#fff;font-size:15px">x</p>')
    expect(out).toContain('color:#141414')
    expect(out).toContain('font-size:15px')
  })

  it('does not touch a background carrying a gradient or image', () => {
    const grad = '<td style="background:linear-gradient(#fff,#eee)">x</td>'
    expect(softenSenderBackgrounds(grad)).toBe(grad)
    const img = '<td style="background:url(a.png) #fff">x</td>'
    expect(softenSenderBackgrounds(img)).toBe(img)
  })

  it('softens a background shorthand that is only a colour', () => {
    const out = softenSenderBackgrounds('<td style="background:#ffffff">x</td>')
    expect(out).toContain('rgba(255,255,255,')
  })

  it('leaves a dark bgcolor attribute alone', () => {
    const html = '<table bgcolor="#121212">x</table>'
    expect(softenSenderBackgrounds(html)).toBe(html)
  })

  it('is not confused by a colour in prose or a link', () => {
    const html = '<p>paint it #ffffff</p><a href="https://x.test/#fff">l</a>'
    expect(softenSenderBackgrounds(html)).toBe(html)
  })

  it('handles single-quoted and bare attributes', () => {
    expect(softenSenderBackgrounds("<td style='background-color:#fff'>x</td>")).toContain('rgba(255,255,255,')
    expect(softenSenderBackgrounds('<table bgcolor=#ffffff>x</table>')).toContain('rgba(255,255,255,')
  })

  it('handles rgb() and named colours', () => {
    expect(softenSenderBackgrounds('<td style="background-color:rgb(250,250,250)">x</td>')).toContain('rgba(255,255,255')
    expect(softenSenderBackgrounds('<td style="background-color:white">x</td>')).toContain('rgba(255,255,255')
  })

  it('leaves an unparseable colour alone rather than dropping it', () => {
    const html = '<td style="background-color:inherit">x</td>'
    expect(softenSenderBackgrounds(html)).toBe(html)
  })

  // a scrim only counts as "outermost" while no other scrim is open, so a
  // sibling card after a closed one must get its own scrim back
  it('gives each sibling card its own scrim', () => {
    const html =
      '<div style="background-color:#fff">a</div><div style="background-color:#fff">b</div>'
    const out = softenSenderBackgrounds(html, { opacity: 0.3 })
    expect(countScrims(out)).toBe(2)
  })

  it('recovers from a missing close tag instead of clearing everything after', () => {
    const html = '<body style="background-color:#fff"><table><td><div style="background-color:#fff">x</div></body>'
    const out = softenSenderBackgrounds(html, { opacity: 0.3 })
    expect(countScrims(out)).toBe(1)
  })

  it('does not let a non-lighting element end a scrim', () => {
    const html = '<body style="background-color:#fff"><span>x</span><div style="background-color:#fff">y</div></body>'
    const out = softenSenderBackgrounds(html, { opacity: 0.3 })
    // span carries no background, so the div is still nested inside the body
    expect(countScrims(out)).toBe(1)
  })
})
