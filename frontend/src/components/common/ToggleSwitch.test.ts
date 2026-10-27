import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import ToggleSwitch from './ToggleSwitch.svelte'

// the component reports through createEventDispatcher, which svelte 5 surfaces
// as mount's `events` option rather than the $on that no longer exists.
function renderSwitch(props: Record<string, unknown>, onChange?: (value: boolean) => void) {
  return render(ToggleSwitch, {
    props,
    events: onChange ? { change: (e: CustomEvent<boolean>) => onChange(e.detail) } : {},
  })
}

describe('ToggleSwitch', () => {
  it('reports its state to assistive technology', async () => {
    const { rerender } = renderSwitch({ checked: false })
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    await rerender({ checked: true })
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('names itself when given a label', () => {
    renderSwitch({ label: 'Dark mode' })
    expect(screen.getByRole('switch', { name: 'Dark mode' })).toBeInTheDocument()
  })

  // the parent owns the state, so a click asks for the opposite of what is
  // currently shown rather than flipping anything itself.
  it('asks for the opposite of its current state', async () => {
    const changed = vi.fn()
    renderSwitch({ checked: false }, changed)

    await userEvent.click(screen.getByRole('switch'))
    expect(changed).toHaveBeenCalledWith(true)
  })

  it('asks to turn off when it is on', async () => {
    const changed = vi.fn()
    renderSwitch({ checked: true }, changed)

    await userEvent.click(screen.getByRole('switch'))
    expect(changed).toHaveBeenCalledWith(false)
  })

  it('does not change itself on click', async () => {
    renderSwitch({ checked: false })
    await userEvent.click(screen.getByRole('switch'))
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('stays silent while disabled', async () => {
    const changed = vi.fn()
    renderSwitch({ checked: false, disabled: true }, changed)

    await userEvent.click(screen.getByRole('switch'), { pointerEventsCheck: 0 })
    expect(changed).not.toHaveBeenCalled()
    expect(screen.getByRole('switch')).toBeDisabled()
  })

  // it sits in forms throughout settings, where a submit-by-default button
  // would send the form instead of toggling.
  it('is not a submit button', () => {
    renderSwitch({})
    expect(screen.getByRole('switch')).toHaveAttribute('type', 'button')
  })
})
