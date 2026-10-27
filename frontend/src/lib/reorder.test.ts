import { afterEach, describe, expect, it, vi } from 'vitest'
import { reorder, reorderHandleAttr, reorderIdAttr } from './reorder'

// rowHeight and rowWidth are the pretend geometry every item gets. jsdom lays
// nothing out and reports every rect as zero, so each item's rect is stubbed
// from its position in the list and the drag is driven against those numbers.
const rowHeight = 20
const rowWidth = 20

interface List {
  node: HTMLElement
  destroy: () => void
  reordered: string[][]
  events: string[]
}

function buildList(ids: string[], axis: 'x' | 'y' = 'y'): List {
  const node = document.createElement('div')
  document.body.appendChild(node)

  ids.forEach((id, index) => {
    const item = document.createElement('div')
    item.setAttribute(reorderIdAttr, id)
    const handle = document.createElement('span')
    handle.setAttribute(reorderHandleAttr, '')
    item.appendChild(handle)
    node.appendChild(item)
    stubRect(item, index, axis)
  })

  const reordered: string[][] = []
  const events: string[] = []
  node.addEventListener('reorder', (e) => reordered.push((e as CustomEvent<{ ids: string[] }>).detail.ids))
  node.addEventListener('reorderstart', () => events.push('start'))
  node.addEventListener('reorderend', () => events.push('end'))

  const action = reorder(node, { axis })
  return { node, destroy: () => action.destroy?.(), reordered, events }
}

// stubRect pins an item at the slot its index names. The action only ever reads
// the midpoint along the drag axis, so the other numbers are filler.
function stubRect(item: HTMLElement, index: number, axis: 'x' | 'y'): void {
  const top = axis === 'y' ? index * rowHeight : 0
  const left = axis === 'x' ? index * rowWidth : 0
  item.getBoundingClientRect = (): DOMRect =>
    ({
      top,
      bottom: top + rowHeight,
      left,
      right: left + rowWidth,
      height: rowHeight,
      width: rowWidth,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
}

// handleOf returns the grab handle of the item at index, which is the only
// place a drag can start from.
function handleOf(list: List, index: number): HTMLElement {
  return list.node.children[index].querySelector<HTMLElement>(`[${reorderHandleAttr}]`)!
}

// drag presses the handle of `from`, moves to the coordinate `to`, and releases.
// `to` is in slot units, so 0 is above the first row and 2.5 is the middle of
// the third.
function drag(list: List, from: number, to: number, axis: 'x' | 'y' = 'y'): void {
  const size = axis === 'y' ? rowHeight : rowWidth
  const startAt = from * size + size / 2
  const endAt = to * size
  const coord = (value: number): MouseEventInit =>
    axis === 'y' ? { clientY: value, clientX: 0, button: 0 } : { clientX: value, clientY: 0, button: 0 }

  handleOf(list, from).dispatchEvent(new MouseEvent('mousedown', { ...coord(startAt), bubbles: true }))
  window.dispatchEvent(new MouseEvent('mousemove', coord(endAt)))
  window.dispatchEvent(new MouseEvent('mouseup', coord(endAt)))
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('reorder', () => {
  it('moves a row down', () => {
    const list = buildList(['a', 'b', 'c'])
    drag(list, 0, 2)
    expect(list.reordered).toEqual([['b', 'a', 'c']])
    list.destroy()
  })

  it('moves a row up', () => {
    const list = buildList(['a', 'b', 'c'])
    drag(list, 2, 0)
    expect(list.reordered).toEqual([['c', 'a', 'b']])
    list.destroy()
  })

  it('moves a row to the end', () => {
    const list = buildList(['a', 'b', 'c'])
    drag(list, 0, 3)
    expect(list.reordered).toEqual([['b', 'c', 'a']])
    list.destroy()
  })

  it('moves a row to the start', () => {
    const list = buildList(['a', 'b', 'c'])
    drag(list, 2, 0)
    expect(list.reordered).toEqual([['c', 'a', 'b']])
    list.destroy()
  })

  // the insertion point below a row's own slot shifts up by one once the row is
  // lifted out, so this is the same place the row already sits.
  it('reports nothing when a row is dropped back where it was', () => {
    const list = buildList(['a', 'b', 'c'])
    drag(list, 1, 1)
    expect(list.reordered).toEqual([])
    list.destroy()
  })

  it('reports nothing when a row is dropped just below its own slot', () => {
    const list = buildList(['a', 'b', 'c'])
    drag(list, 1, 2)
    expect(list.reordered).toEqual([])
    list.destroy()
  })

  it('keeps every id exactly once', () => {
    const list = buildList(['a', 'b', 'c', 'd', 'e'])
    drag(list, 3, 1)
    expect([...list.reordered[0]].sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    list.destroy()
  })

  it('works along the horizontal axis', () => {
    const list = buildList(['a', 'b', 'c'], 'x')
    drag(list, 0, 2, 'x')
    expect(list.reordered).toEqual([['b', 'a', 'c']])
    list.destroy()
  })

  // a press that never travels is a click on the row, which still has to
  // select rather than starting a drag.
  it('ignores a press that does not travel far enough', () => {
    const list = buildList(['a', 'b', 'c'])
    handleOf(list, 0).dispatchEvent(new MouseEvent('mousedown', { clientY: 10, button: 0, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 12 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 12 }))
    expect(list.events).toEqual([])
    expect(list.reordered).toEqual([])
    list.destroy()
  })

  it('only starts from a handle', () => {
    const list = buildList(['a', 'b', 'c'])
    const item = list.node.children[0] as HTMLElement
    item.dispatchEvent(new MouseEvent('mousedown', { clientY: 10, button: 0, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 60 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 60 }))
    expect(list.reordered).toEqual([])
    list.destroy()
  })

  it('ignores a right-click press', () => {
    const list = buildList(['a', 'b', 'c'])
    handleOf(list, 0).dispatchEvent(new MouseEvent('mousedown', { clientY: 10, button: 2, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 60 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 60 }))
    expect(list.reordered).toEqual([])
    list.destroy()
  })

  it('emits start and end around a drag', () => {
    const list = buildList(['a', 'b', 'c'])
    drag(list, 0, 2)
    expect(list.events).toEqual(['start', 'end'])
    list.destroy()
  })

  // Escape has to end the drag without committing, and still tidy up.
  it('abandons the drag on Escape', () => {
    const list = buildList(['a', 'b', 'c'])
    handleOf(list, 0).dispatchEvent(new MouseEvent('mousedown', { clientY: 10, button: 0, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 50 }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 50 }))
    expect(list.reordered).toEqual([])
    expect(list.events).toEqual(['start', 'end'])
    list.destroy()
  })

  it('leaves no placeholder behind', () => {
    const list = buildList(['a', 'b', 'c'])
    drag(list, 0, 2)
    expect(list.node.children).toHaveLength(3)
    for (const child of list.node.children) {
      expect(child.hasAttribute(reorderIdAttr)).toBe(true)
    }
    list.destroy()
  })

  it('clears the dragged row’s dimming', () => {
    const list = buildList(['a', 'b', 'c'])
    drag(list, 0, 2)
    expect((list.node.children[0] as HTMLElement).style.opacity).toBe('')
    list.destroy()
  })

  it('stops listening once destroyed', () => {
    const list = buildList(['a', 'b', 'c'])
    list.destroy()
    drag(list, 0, 2)
    expect(list.reordered).toEqual([])
  })

  // a nested list's items are inside this container too and the event bubbles
  // through both, so only the container an item is a direct child of reacts.
  it('ignores an item belonging to a nested container', () => {
    const outer = buildList(['a', 'b'])
    const inner = document.createElement('div')
    const nested = document.createElement('div')
    nested.setAttribute(reorderIdAttr, 'deep')
    const handle = document.createElement('span')
    handle.setAttribute(reorderHandleAttr, '')
    nested.appendChild(handle)
    inner.appendChild(nested)
    outer.node.appendChild(inner)

    handle.dispatchEvent(new MouseEvent('mousedown', { clientY: 10, button: 0, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 60 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 60 }))
    expect(outer.reordered).toEqual([])
    outer.destroy()
  })
})
