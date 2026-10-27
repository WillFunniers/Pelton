// The glass the store publishes, tested on the store that owns it: the two
// attributes and the derived values that reach the stylesheet, and the paths that
// have to recompute them.
//
// What the values LOOK like is not testable here - no stylesheet is loaded in
// jsdom, so a color-mix() token never resolves. The alphas themselves are pinned
// down in theme/glass.test.ts, and .build/render/glassaccept.mjs asserts the
// rendered result against the real built app.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import {
  prefs,
  setListGlassBlur,
  setListGlassDensity,
  setReadingPaneImage,
  setReadingPaneImageOpacity,
  setReadingPaneMaskBlur,
} from './prefs'

// the backend is not there in jsdom; only the persistence calls need stubbing,
// and the rest of the module (the setting keys) is used as it is.
vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  setSetting: vi.fn(async () => {}),
  getUIPrefs: vi.fn(async () => ({})),
}))

const root = () => document.documentElement
const wallpaper = () => root().getAttribute('data-wallpaper')
const alpha = (tier: string) => root().style.getPropertyValue(`--glass-${tier}-alpha`)
const blurSheet = () => document.getElementById('pelton-glass-blur')?.textContent ?? ''

beforeEach(() => {
  document.getElementById('pelton-glass-blur')?.remove()
  root().removeAttribute('data-wallpaper')
  root().setAttribute('data-theme', 'dark')
  for (const tier of ['list', 'base', 'raised', 'hover', 'sunken', 'overlay']) {
    root().style.removeProperty(`--glass-${tier}-alpha`)
  }
  prefs.set({
    ...get(prefs),
    theme: 'dark',
    readingPaneImage: '',
    readingPaneImageOpacity: 30,
    // the shipped defaults, so a test that does not set one of them is testing
    // what the window actually opens with
    readingPaneMaskBlur: 0,
    listGlassDensity: 50,
    listGlassBlur: 16,
  })
})

describe('the wallpaper switch', () => {
  it('marks the root once a picture is set, and only in a dark theme', () => {
    setReadingPaneImage('data:image/svg+xml;base64,AAA')
    expect(wallpaper()).toBe('on')

    // a light theme keeps opaque chrome and its picture in the reading pane
    root().setAttribute('data-theme', 'light')
    setReadingPaneImage('data:image/svg+xml;base64,BBB')
    expect(wallpaper()).toBeNull()
  })

  it('clears the mark when the picture goes away or its strength reaches zero', () => {
    setReadingPaneImage('data:image/svg+xml;base64,AAA')
    setReadingPaneImageOpacity(0)
    expect(wallpaper()).toBeNull()

    setReadingPaneImageOpacity(30)
    setReadingPaneImage('')
    expect(wallpaper()).toBeNull()
  })
})

describe('the zoning sliders', () => {
  it('publishes the whole ladder from the list density', () => {
    setListGlassDensity(72)
    expect(alpha('list')).toBe('72%')
    expect(alpha('base')).toBe('84%')
    expect(alpha('raised')).toBe('84%')
    expect(alpha('sunken')).toBe('88%')
    expect(alpha('overlay')).toBe('92%')
  })

  it('keeps the sidebar a fixed step above the list', () => {
    for (const list of [0, 20, 50, 88]) {
      setListGlassDensity(list)
      const base = parseInt(alpha('base'))
      expect(base - parseInt(alpha('list'))).toBe(12)
    }
  })

  it('publishes the alphas whether or not a wallpaper is showing', () => {
    // the stylesheet gates them on data-wallpaper, so writing them always leaves
    // one state to reason about and no frame where the glass is half resolved
    expect(wallpaper()).toBeNull()
    setListGlassDensity(40)
    expect(alpha('list')).toBe('40%')
  })

  it('writes the reader\'s radii into the blur sheet as literals, and no var()', () => {
    setReadingPaneMaskBlur(6)
    setListGlassBlur(24)
    const css = blurSheet()
    expect(css).toContain('.detail::before{-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}')
    expect(css).toContain('.list-col::before{-webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px)}')
    // the sidebar follows the list rather than having a radius of its own
    expect(css).toContain('.sidebar::before{-webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px)}')
    expect(css).not.toContain('var(')
  })

  it('emits no rule for a radius of zero, so nothing pays for a pass it cannot see', () => {
    setReadingPaneMaskBlur(0)
    setListGlassBlur(0)
    expect(blurSheet()).toBe('')

    setListGlassBlur(10)
    expect(blurSheet()).toContain('.list-col::before')
    expect(blurSheet()).not.toContain('.detail::before')
  })

  it('clamps every slider to the range the control offers', () => {
    setReadingPaneMaskBlur(99)
    expect(get(prefs).readingPaneMaskBlur).toBe(24)
    setReadingPaneMaskBlur(-4)
    expect(get(prefs).readingPaneMaskBlur).toBe(0)
    setListGlassBlur(99)
    expect(get(prefs).listGlassBlur).toBe(40)
    setListGlassDensity(140)
    expect(get(prefs).listGlassDensity).toBe(100)
  })
})
