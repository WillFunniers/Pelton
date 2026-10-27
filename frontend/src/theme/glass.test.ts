// The two things the zoning sliders produce, pinned down where they can be
// asserted directly: the alpha ladder derived from the list density, and the blur
// sheet's literal declarations.
//
// The ladder is the part worth testing rather than the sliders that feed it. It
// is a set of relationships - the sidebar above the list, every chip above the
// pane it sits on, the overlay above all of them - and a relationship is exactly
// what an edit to one of the constants can quietly break while every individual
// number still looks reasonable.
import { describe, expect, it } from 'vitest'
import {
  SIDEBAR_DENSITY_OFFSET,
  applyGlassAlphas,
  applyGlassBlur,
  glassAlphas,
  glassBlurCss,
} from './glass'

const TIERS = ['list', 'base', 'raised', 'hover', 'sunken', 'overlay'] as const

describe('glassAlphas', () => {
  it('derives the published ladder from the list density', () => {
    expect(glassAlphas(72)).toEqual({ list: 72, base: 84, raised: 84, hover: 86, sunken: 88, overlay: 92 })
  })

  it('puts the sidebar a fixed step above the list, as the zoning asks', () => {
    for (const list of [0, 10, 25, 50, 72, 88]) {
      const a = glassAlphas(list)
      expect(a.base - a.list).toBe(SIDEBAR_DENSITY_OFFSET)
    }
    // at the ceiling there is nowhere left to go, so the offset closes rather
    // than pushing the sidebar past opaque
    expect(glassAlphas(95).base).toBe(100)
  })

  it('never lets a tier be lighter than the one it is painted on', () => {
    // this is the invariant the whole ladder exists for: a chip lighter than its
    // pane reads as a hole, and the sidebar is denser than the list by design, so
    // the ordering has to hold at both ends of the range
    for (let list = 0; list <= 100; list += 1) {
      const a = glassAlphas(list)
      const order = [a.list, a.base, a.raised, a.hover, a.sunken, a.overlay]
      for (let i = 1; i < order.length; i += 1) {
        expect(order[i]).toBeGreaterThanOrEqual(order[i - 1])
      }
    }
  })

  it('keeps the chrome readable at the bottom of the range', () => {
    // a reader who slides the list to 0 is asking for the picture itself in the
    // list, not for the menu bar to lose its backing
    const a = glassAlphas(0)
    expect(a.list).toBe(0)
    expect(a.raised).toBeGreaterThanOrEqual(62)
    expect(a.sunken).toBeGreaterThanOrEqual(68)
    expect(a.overlay).toBeGreaterThanOrEqual(82)
  })

  it('hands the reader the whole range at the top of it', () => {
    const a = glassAlphas(100)
    for (const tier of TIERS) expect(a[tier]).toBe(100)
  })

  it('falls back to the shipped density for a value it cannot use', () => {
    // a preference that is missing or corrupt is a reason to paint the window the
    // way it shipped, not a reason to strip its glass off
    expect(glassAlphas(NaN).list).toBe(50)
    expect(glassAlphas(undefined as unknown as number).list).toBe(50)
    // a number out of range is clamped, not replaced: it is still an opinion
    expect(glassAlphas(-20).list).toBe(0)
    expect(glassAlphas(500).list).toBe(100)
    // and the shipped density is the shipped ladder, not just one tier of it
    expect(glassAlphas(NaN)).toEqual(glassAlphas(50))
  })
})

describe('glassBlurCss', () => {
  it('writes each radius as a literal, prefixed and unprefixed', () => {
    const css = glassBlurCss({ pane: 2, list: 16 })
    expect(css).toContain(':root[data-wallpaper=\'on\'] .detail::before{-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}')
    expect(css).toContain(':root[data-wallpaper=\'on\'] .list-col::before{-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}')
    // a var() here would be dropped whole by WebKit (bug 297620), which is the
    // reason this sheet exists instead of two more tokens
    expect(css).not.toContain('var(')
  })

  it('gives the sidebar the list\'s radius, so one slider sets both', () => {
    const css = glassBlurCss({ pane: 4, list: 30 })
    const sidebar = css.split('\n').find((line) => line.includes('.sidebar::before'))
    expect(sidebar).toContain('blur(30px)')
  })

  it('leaves a zero radius out entirely', () => {
    expect(glassBlurCss({ pane: 0, list: 0 })).toBe('')
    const css = glassBlurCss({ pane: 0, list: 8 })
    expect(css).not.toContain('.detail::before')
    expect(css).toContain('.list-col::before')
  })

  it('replaces an impossible radius with the shipped one rather than honouring it', () => {
    // out of range is not an opinion about the radius, it is a value this build
    // does not offer - and an unbounded blur is a frame per repaint. The
    // fallbacks are the shipped defaults: no mask at all for the reading pane,
    // 16px for the list.
    const impossiblePane = glassBlurCss({ pane: 99, list: 40 })
    expect(impossiblePane).not.toContain('.detail::before')
    expect(impossiblePane).toContain('.list-col::before{-webkit-backdrop-filter:blur(40px)')
    const impossibleList = glassBlurCss({ pane: 6, list: 99 })
    expect(impossibleList).toContain('.detail::before{-webkit-backdrop-filter:blur(6px)')
    expect(impossibleList).toContain('.list-col::before{-webkit-backdrop-filter:blur(16px)')
    const neither = glassBlurCss({ pane: NaN, list: -1 })
    expect(neither).not.toContain('.detail::before')
    expect(neither).toContain('blur(16px)')
    // in range is rounded, because the declaration is built from it
    expect(glassBlurCss({ pane: 7.6, list: 16 })).toContain('blur(8px)')
  })
})

describe('the injected sheet', () => {
  it('is created once, rewritten in place, and removed when nothing blurs', () => {
    document.getElementById('pelton-glass-blur')?.remove()

    applyGlassBlur({ pane: 2, list: 16 })
    const first = document.getElementById('pelton-glass-blur')
    expect(first).not.toBeNull()

    applyGlassBlur({ pane: 12, list: 16 })
    expect(document.getElementById('pelton-glass-blur')).toBe(first)
    expect(first?.textContent).toContain('blur(12px)')

    // and it goes away again when the reader asks for no blur: an element that
    // matched nothing would be a rule the engine still parses on every style pass
    applyGlassBlur({ pane: 0, list: 0 })
    expect(document.getElementById('pelton-glass-blur')).toBeNull()
  })

  it('publishes the alphas as percentages the stylesheet can mix with', () => {
    const root = document.documentElement
    for (const tier of TIERS) root.style.removeProperty(`--glass-${tier}-alpha`)

    applyGlassAlphas(glassAlphas(72))
    for (const tier of TIERS) {
      expect(root.style.getPropertyValue(`--glass-${tier}-alpha`)).toMatch(/^\d+%$/)
    }
    expect(root.style.getPropertyValue('--glass-list-alpha')).toBe('72%')
  })
})
