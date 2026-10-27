import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import Select from './Select.svelte'
import { popupIsOpen } from '../../lib/popups'

const items = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
]

// the list is positioned against the viewport, which only holds while no
// ancestor carries a transform. every dialog in the app is centred with one,
// so the list has to leave the component's own subtree to be placed correctly
// and to escape the dialog's overflow clip.
describe('Select popup placement', () => {
  it('opens its list as a child of the body, not next to the button', async () => {
    const { container } = render(Select, { props: { value: 'a', items, ariaLabel: 'Letter' } })

    await userEvent.click(screen.getByRole('combobox'))

    const list = screen.getByRole('listbox')
    expect(list.closest('body')).toBe(document.body)
    expect(container.contains(list)).toBe(false)
  })

  it('takes the list away again when it closes', async () => {
    render(Select, { props: { value: 'a', items, ariaLabel: 'Letter' } })

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'Beta' }))

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('leaves nothing behind when it is unmounted while open', async () => {
    const { unmount } = render(Select, { props: { value: 'a', items, ariaLabel: 'Letter' } })

    await userEvent.click(screen.getByRole('combobox'))
    unmount()

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(popupIsOpen()).toBe(false)
  })
})

// a dialog closes on escape and listens at the capture phase. it asks whether a
// popup is open first, so the count has to be right or escape stops dismissing
// dialogs at all.
describe('Select popup registration', () => {
  it('registers only while the list is open', async () => {
    render(Select, { props: { value: 'a', items, ariaLabel: 'Letter' } })
    expect(popupIsOpen()).toBe(false)

    await userEvent.click(screen.getByRole('combobox'))
    expect(popupIsOpen()).toBe(true)

    await userEvent.keyboard('{Escape}')
    expect(popupIsOpen()).toBe(false)
  })

  it('does not count a second time when it is already open', async () => {
    render(Select, { props: { value: 'a', items, ariaLabel: 'Letter' } })

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.keyboard('{ArrowDown}')
    expect(popupIsOpen()).toBe(true)

    await userEvent.keyboard('{Escape}')
    expect(popupIsOpen()).toBe(false)
  })
})
