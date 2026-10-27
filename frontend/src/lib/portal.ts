// Moves an element to the end of <body> for as long as it is alive.
//
// `position: fixed` only means "against the viewport" while nothing above the
// element establishes a containing block. A `transform` on any ancestor does
// establish one, and every dialog in the app is centred with
// `translate(-50%, -50%)`, so a fixed popup opened inside one is offset by the
// dialog's own position and clipped by its `overflow: hidden`. Leaving the
// dialog's subtree is what makes the coordinates mean what they say.
export function portal(node: HTMLElement) {
  document.body.appendChild(node)
  return {
    destroy(): void {
      node.remove()
    },
  }
}
