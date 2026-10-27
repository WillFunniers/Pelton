// devoverlays.ts owns which developer overlays are open (#188), and the
// developer keys that go with them.
//
// The overlays only exist when the app was started for development, which the
// backend decides from PELTON_DEV or PELTON_DEVTOOLS. Nothing here is persisted:
// every launch starts with all of them closed, so an overlay left open cannot
// confuse the next session.

import { writable, get } from 'svelte/store'
import { devToolsEnabled } from '../lib/api'

/** The overlays, in the order their keys run. */
export type DevOverlay = 'activity' | 'process' | 'performance'

/** Which F-key opens which overlay. */
export const overlayKeys: Record<string, DevOverlay> = {
  F6: 'activity',
  F7: 'process',
  F8: 'performance',
}

/** Whether the developer overlays are available at all. */
export const devToolsAvailable = writable(false)

/** The overlays currently on screen. Several can be open at once. */
export const openOverlays = writable<Set<DevOverlay>>(new Set())

/**
 * Asks the backend whether the overlays are available. Called once at startup;
 * the keys do nothing until it resolves true.
 */
export async function initDevTools(): Promise<void> {
  try {
    devToolsAvailable.set(await devToolsEnabled())
  } catch {
    devToolsAvailable.set(false)
  }
}

/** Opens the overlay if it is closed, closes it if it is open. */
export function toggleOverlay(name: DevOverlay): void {
  openOverlays.update((open) => {
    const next = new Set(open)
    if (!next.delete(name)) {
      next.add(name)
    }
    return next
  })
}

/** Closes one overlay. */
export function closeOverlay(name: DevOverlay): void {
  openOverlays.update((open) => {
    const next = new Set(open)
    next.delete(name)
    return next
  })
}

/**
 * Handles a keydown for the developer keys and reports whether it was one. Does
 * nothing when the developer tools are unavailable, so a release build never
 * swallows F6 to F8.
 *
 * F9 used to pin the glass alpha set, so the two sets could be compared against a
 * real wallpaper by eye. There is nothing to pin now that the reader's sliders
 * decide the alphas, so the key went with the sets it chose between.
 */
export function handleOverlayKey(event: KeyboardEvent): boolean {
  if (!get(devToolsAvailable)) {
    return false
  }
  // a modifier means the user meant something else with the key.
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return false
  }
  const overlay = overlayKeys[event.key]
  if (!overlay) {
    return false
  }
  toggleOverlay(overlay)
  return true
}
