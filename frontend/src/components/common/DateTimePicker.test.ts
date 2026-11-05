import { describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import DateTimePicker from './DateTimePicker.svelte'

// The picker is opened from inside the compose window's send-later popover,
// which is a scroll container. A fixed-position panel should escape that, but
// in the packaged WebView2 build it did not: the calendar was clipped by the
// popover and only appeared after the popover had scrolled, which read as "the
// first click did nothing" and had people click again. The panel and its scrim
// are portalled to the body instead, so these tests are about the first click
// actually showing the calendar.

function trigger(container: HTMLElement): HTMLElement {
  const button = container.querySelector('.trigger')
  if (!button) {
    throw new Error('the picker has no trigger button')
  }
  return button as HTMLElement
}

describe('DateTimePicker', () => {
  it('shows its panel on the first click', async () => {
    const { container } = render(DateTimePicker, { props: { mode: 'date' } })

    expect(document.querySelector('.panel')).toBeNull()
    await userEvent.click(trigger(container))

    expect(document.querySelector('.panel')).not.toBeNull()
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true')
  })

  it('places the panel outside the component so a scroll container cannot clip it', async () => {
    const { container } = render(DateTimePicker, { props: { mode: 'date' } })

    await userEvent.click(trigger(container))

    const panel = document.querySelector('.panel')
    expect(panel?.parentElement).toBe(document.body)
    expect(container.contains(panel as Node)).toBe(false)
  })

  it('keeps the panel invisible only until it has been positioned', async () => {
    const { container } = render(DateTimePicker, { props: { mode: 'date' } })

    await userEvent.click(trigger(container))

    // jsdom reports every rect as zero, so positioning resolves to the margin
    // rather than to a real offset; what matters is that it resolves at all and
    // that the panel is visible once it has.
    await waitFor(() => {
      expect(document.querySelector('.panel')).toHaveStyle({ visibility: 'visible' })
    })
  })

  it('does not depend on re-measuring itself after it moves', async () => {
    // In the packaged build the second measurement returned the position from
    // before the new coordinates had been applied, so a placement pass that
    // re-measured and "corrected" the result doubled them and put the calendar
    // off screen - it then only turned up on a later click. A stale rect here
    // reproduces exactly that.
    const real = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
      if (this.classList.contains('panel')) {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: 240,
          height: 338,
          toJSON: () => ({}),
        } as DOMRect
      }
      return real.call(this)
    }

    try {
      const { container } = render(DateTimePicker, { props: { mode: 'date' } })
      await userEvent.click(trigger(container))
      await waitFor(() => {
        expect(document.querySelector('.panel')).toHaveStyle({ visibility: 'visible' })
      })

      const panel = document.querySelector('.panel') as HTMLElement
      // jsdom has no layout, so the trigger sits at 0,0 and the panel is placed
      // at the margin, 4px under the trigger; what matters is that the numbers
      // are not doubled to 16 and 8.
      expect(panel.style.left).toBe('8px')
      expect(panel.style.top).toBe('4px')
    } finally {
      HTMLElement.prototype.getBoundingClientRect = real
    }
  })

  it('sits on top of the trigger instead of at the window edge when there is no room below', async () => {
    // jsdom lays nothing out, so the trigger is pinned near the bottom of the
    // 768px viewport and the panel is given its real height. There is no room
    // below the trigger, so the panel has to go above it: its bottom edge lands
    // on the trigger's top edge (700) rather than on the window's.
    const realRect = HTMLElement.prototype.getBoundingClientRect
    const realHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
      if (this.classList.contains('trigger')) {
        return {
          x: 0,
          y: 700,
          top: 700,
          left: 0,
          right: 235,
          bottom: 727,
          width: 235,
          height: 27,
          toJSON: () => ({}),
        } as DOMRect
      }
      return realRect.call(this)
    }
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains('panel') ? 338 : (realHeight?.get?.call(this) ?? 0)
      },
    })

    try {
      const { container } = render(DateTimePicker, { props: { mode: 'date' } })
      await userEvent.click(trigger(container))
      await waitFor(() => {
        expect(document.querySelector('.panel')).toHaveStyle({ visibility: 'visible' })
      })

      const panel = document.querySelector('.panel') as HTMLElement
      expect(panel.style.top).toBe('358px')
    } finally {
      HTMLElement.prototype.getBoundingClientRect = realRect
      if (realHeight) {
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', realHeight)
      }
    }
  })

  it('renders into the host it is given when it is inline, keeping its footer with the trigger', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const { container } = render(DateTimePicker, { props: { mode: 'date', inline: true, inlineHost: host } })

    await userEvent.click(trigger(container))

    const panel = document.querySelector('.panel') as HTMLElement
    expect(host.contains(panel)).toBe(true)
    // the footer stays next to the field: that is what leaves the rest of the
    // host's content where it was when the calendar opens
    expect(container.querySelector('.panel-foot')).not.toBeNull()
    expect(document.querySelector('.scrim')).toBeNull()

    host.remove()
  })

  it('closes on the scrim and removes both portalled nodes', async () => {
    const { container, unmount } = render(DateTimePicker, { props: { mode: 'date' } })

    await userEvent.click(trigger(container))
    const scrim = document.querySelector('.scrim')
    expect(scrim?.parentElement).toBe(document.body)

    await userEvent.click(scrim as HTMLElement)

    expect(document.querySelector('.panel')).toBeNull()
    expect(document.querySelector('.scrim')).toBeNull()
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false')

    unmount()
    expect(document.querySelector('.panel')).toBeNull()
  })
})
