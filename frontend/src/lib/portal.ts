// Moves an element to the end of <body> for as long as it is alive.
//
// `position: fixed` only means "against the viewport" while nothing above the
// element establishes a containing block. A `transform` on any ancestor does
// establish one, and every dialog in the app is centred with
// `translate(-50%, -50%)`, so a fixed popup opened inside one is offset by the
// dialog's own position and clipped by its `overflow: hidden`. Leaving the
// dialog's subtree is what makes the coordinates mean what they say.
//
// `target` moves it somewhere else instead: a picker that renders inline inside
// its host portals into a box the host reserves for it, so it can be laid out
// above content it is nested deep inside.
export function portal(node: HTMLElement, target?: HTMLElement | null) {
  const move = (dest: HTMLElement | null | undefined): void => {
    const into = dest ?? document.body
    if (into !== node.parentElement) {
      into.appendChild(node)
    }
  }
  move(target)
  return {
    update(next: HTMLElement | null | undefined): void {
      move(next)
    },
    destroy(): void {
      node.remove()
    },
  }
}
