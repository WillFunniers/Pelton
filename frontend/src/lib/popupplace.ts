// Where a popup anchored to a control goes.
//
// The arithmetic lives here rather than in the component because of the
// interface scale. The app zooms itself with css `zoom` on <html>, and under
// zoom getBoundingClientRect and window.innerWidth report unscaled screen
// pixels while a `position: fixed` element is placed in the zoomed layout
// space (see ContextMenu.svelte). The two agree only at 100%, so a popup
// placed from raw rect values drifts further from its button the further down
// and across the window it sits. Converting is a division, which is easy to
// leave out and impossible to see in a test that never renders.

/** The control the popup hangs off, in unscaled screen pixels. */
export interface Anchor {
  top: number
  bottom: number
  left: number
  right: number
  width: number
}

/** The window, in unscaled screen pixels. */
export interface Viewport {
  width: number
  height: number
}

/** Where to draw the popup, in the zoomed layout space a fixed element uses. */
export interface Placement {
  /** Distance from the top of the viewport. */
  top: number
  /** Distance from the reading direction's starting edge. */
  start: number
  /** The anchor's width, as a floor for the popup's own. */
  width: number
  /** False when the popup was flipped above the anchor. */
  below: boolean
}

/**
 * placeBelow puts a popup under its anchor, flipping it above when the space
 * below is smaller than minRoom and there is more of it above.
 *
 * A flipped popup is returned with the anchor's own top as its `top`: the
 * caller pulls it up by its own height in css, which is the only place the
 * rendered height is known.
 */
export function placeBelow(
  anchor: Anchor,
  viewport: Viewport,
  scale: number,
  rtl: boolean,
  minRoom = 240,
): Placement {
  const factor = scale > 0 ? scale : 1
  const top = anchor.top / factor
  const bottom = anchor.bottom / factor
  const room = viewport.height / factor - bottom
  const above = room < minRoom && top > room
  return {
    top: above ? top : bottom + 4,
    // measured from the start edge rather than the left one, so a popup wider
    // than its anchor grows away from the reading direction instead of always
    // rightward (#356).
    start: rtl ? viewport.width / factor - anchor.right / factor : anchor.left / factor,
    width: anchor.width / factor,
    below: !above,
  }
}
