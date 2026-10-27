import { describe, expect, it } from 'vitest'
import { placeBelow } from './popupplace'

const viewport = { width: 1200, height: 800 }

function anchor(over: Partial<Parameters<typeof placeBelow>[0]> = {}) {
  return { top: 100, bottom: 130, left: 400, right: 560, width: 160, ...over }
}

describe('placeBelow', () => {
  it('sits just under the anchor', () => {
    const at = placeBelow(anchor(), viewport, 1, false)
    expect(at).toEqual({ top: 134, start: 400, width: 160, below: true })
  })

  it('flips above when the space below is too small to use', () => {
    const at = placeBelow(anchor({ top: 700, bottom: 730 }), viewport, 1, false)
    expect(at.below).toBe(false)
    // the anchor's own top: the caller pulls the popup up by its own height,
    // which is the only place that height is known.
    expect(at.top).toBe(700)
  })

  it('stays below when there is no more space above than below', () => {
    const at = placeBelow(anchor({ top: 20, bottom: 50 }), { width: 1200, height: 200 }, 1, false)
    expect(at.below).toBe(true)
  })

  // the bug this exists for: css `zoom` leaves the rect in screen pixels while
  // a fixed popup is placed in the zoomed layout space, so the popup drifted
  // further from its button the further down and across the window it sat.
  it('converts out of the interface zoom', () => {
    const at = placeBelow(anchor(), viewport, 2, false)
    expect(at).toEqual({ top: 69, start: 200, width: 80, below: true })
  })

  it('measures the flip against the zoomed viewport too', () => {
    // 730 screen pixels is 365 layout pixels, and a 800px window is 400 of
    // them: 35 left below, well under the minimum, so it flips.
    const at = placeBelow(anchor({ top: 700, bottom: 730 }), viewport, 2, false)
    expect(at.below).toBe(false)
    expect(at.top).toBe(350)
  })

  it('measures from the right edge when the interface reads right to left', () => {
    const at = placeBelow(anchor(), viewport, 1, true)
    expect(at.start).toBe(viewport.width - 560)
  })

  it('treats a missing or nonsense scale as 100%', () => {
    expect(placeBelow(anchor(), viewport, 0, false)).toEqual(placeBelow(anchor(), viewport, 1, false))
  })
})
