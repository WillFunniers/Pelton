import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'

vi.mock('../lib/api', () => ({ devToolsEnabled: vi.fn(async () => true) }))

import {
  devToolsAvailable,
  openOverlays,
  overlayKeys,
  toggleOverlay,
  closeOverlay,
  handleOverlayKey,
  initDevTools,
} from './devoverlays'
import { devToolsEnabled } from '../lib/api'

const enabled = vi.mocked(devToolsEnabled)

function press(key: string, over: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over } as KeyboardEvent
}

beforeEach(() => {
  openOverlays.set(new Set())
  devToolsAvailable.set(true)
  enabled.mockReset()
  enabled.mockResolvedValue(true)
})

describe('toggleOverlay', () => {
  it('opens a closed overlay and closes an open one', () => {
    toggleOverlay('activity')
    expect(get(openOverlays).has('activity')).toBe(true)
    toggleOverlay('activity')
    expect(get(openOverlays).has('activity')).toBe(false)
  })

  // the panels are draggable so they can be arranged side by side, which only
  // means anything if more than one can be open.
  it('keeps several open at once', () => {
    toggleOverlay('activity')
    toggleOverlay('process')
    expect(get(openOverlays).size).toBe(2)
    closeOverlay('activity')
    expect([...get(openOverlays)]).toEqual(['process'])
  })
})

describe('handleOverlayKey', () => {
  it('toggles the overlay its key names', () => {
    for (const [key, overlay] of Object.entries(overlayKeys)) {
      expect(handleOverlayKey(press(key))).toBe(true)
      expect(get(openOverlays).has(overlay)).toBe(true)
    }
  })

  it('ignores a key that is not an overlay key', () => {
    expect(handleOverlayKey(press('F9'))).toBe(false)
    expect(get(openOverlays).size).toBe(0)
  })

  // a modifier means the user meant something else with the key, so the
  // combination has to reach whatever else is listening.
  it('ignores the key when a modifier is held', () => {
    for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'] as const) {
      expect(handleOverlayKey(press('F6', { [mod]: true }))).toBe(false)
    }
    expect(get(openOverlays).size).toBe(0)
  })

  // the whole point of the availability check: a release build must not swallow
  // F6 to F8 from the rest of the app.
  it('does nothing at all when the overlays are unavailable', () => {
    devToolsAvailable.set(false)
    expect(handleOverlayKey(press('F6'))).toBe(false)
    expect(get(openOverlays).size).toBe(0)
  })
})

describe('initDevTools', () => {
  it('takes the backend at its word', async () => {
    enabled.mockResolvedValue(false)
    await initDevTools()
    expect(get(devToolsAvailable)).toBe(false)
  })

  // a failed check has to mean off. Leaving it on would bind the keys in a
  // build that has no overlays behind them.
  it('treats a failed check as unavailable', async () => {
    enabled.mockRejectedValue(new Error('no binding'))
    await initDevTools()
    expect(get(devToolsAvailable)).toBe(false)
  })
})
