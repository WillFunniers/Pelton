import { describe, it, expect, beforeEach } from 'vitest'
import { applyWallpaper, applyTheme } from './theme'

// applyWallpaper is the single switch that turns the whole window into glass: it
// puts data-wallpaper on the root, and every glass rule in tokens.css and the
// components keys off that attribute. If it is wrong the ui either goes
// translucent with no wallpaper behind it (text on a raw window colour) or keeps
// opaque slabs over a wallpaper (the bug this feature exists to fix), so the two
// things it must get right are pinned here.
describe('the wallpaper glass switch', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-wallpaper')
    document.documentElement.removeAttribute('data-theme')
  })

  it('marks the root only when a wallpaper is on in a dark theme', () => {
    applyTheme('dark')
    applyWallpaper(true)
    expect(document.documentElement.getAttribute('data-wallpaper')).toBe('on')
  })

  it('refuses to go glass in a light theme', () => {
    // the light theme's chrome is opaque by design and its wallpaper stays behind
    // the reading pane; hoisting it would change a mode nobody asked to change
    applyTheme('light')
    applyWallpaper(true)
    expect(document.documentElement.getAttribute('data-wallpaper')).toBeNull()
  })

  it('clears the mark when the wallpaper goes away', () => {
    applyTheme('dark')
    applyWallpaper(true)
    applyWallpaper(false)
    expect(document.documentElement.getAttribute('data-wallpaper')).toBeNull()
  })

  it('does not leave a stale mark after switching to a light theme', () => {
    // applyTheme then applyWallpaper is the order prefs.ts applies them in, and a
    // theme switch has to be able to take the glass back off
    applyTheme('dark')
    applyWallpaper(true)
    applyTheme('light')
    applyWallpaper(true)
    expect(document.documentElement.getAttribute('data-wallpaper')).toBeNull()
  })

  it('resolves the system preference rather than trusting the raw value', () => {
    // "system" is not a scheme, so the switch has to read what was resolved onto
    // the root. a stubbed matchMedia keeps this deterministic.
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({
      matches: true,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia

    applyTheme('system')
    applyWallpaper(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.getAttribute('data-wallpaper')).toBe('on')

    window.matchMedia = original
  })
})
