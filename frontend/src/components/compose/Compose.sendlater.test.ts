import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { get } from 'svelte/store'

const api = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  saveDraft: vi.fn(),
  deleteDraft: vi.fn(),
  composeProtectionStatus: vi.fn(),
}))

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  ...api,
}))

vi.mock('../../stores/outbox', () => ({
  loadOutbox: vi.fn(),
}))

vi.mock('../../stores/signatures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../stores/signatures')>()),
  getAccountSignatures: vi.fn().mockResolvedValue({ headerId: 0, footerId: 0 }),
}))

import Compose from './Compose.svelte'
import { composeSessions, openCompose, updateCompose, type ComposeSession } from '../../stores/compose'

// The picker's floating panel has to leave the page it was opened from to be
// placed correctly. Inside the send-later menu the opposite is wanted: the
// calendar is rendered into a box the menu reserves above its presets, so the
// menu grows upward into empty space and everything already on screen - the
// presets, the field, the buttons - keeps its position. A second layer with its
// own scrim never appears.

let unsubscribe: (() => void) | null = null

function openPane(): void {
  const id = openCompose(1, 'plaintext')
  updateCompose(id, { signaturesApplied: true })
  const session = get(composeSessions).find((s) => s.id === id) as ComposeSession
  const { rerender } = render(Compose, { props: { session } })
  unsubscribe = composeSessions.subscribe((list) => {
    const next = list.find((s) => s.id === id)
    if (next) {
      void rerender({ session: next })
    }
  })
}

async function openCalendar(): Promise<HTMLElement> {
  await fireEvent.click(screen.getByRole('button', { name: 'Schedule send' }))
  await fireEvent.click(document.querySelector('.send-menu .trigger') as HTMLElement)
  return document.querySelector('.send-menu') as HTMLElement
}

beforeEach(() => {
  for (const fn of Object.values(api)) {
    fn.mockReset()
  }
  api.sendMessage.mockResolvedValue(1)
  api.composeProtectionStatus.mockResolvedValue({ canSign: false, canEncrypt: false, suggested: 'none' })
})

afterEach(() => {
  unsubscribe?.()
  unsubscribe = null
  composeSessions.set([])
})

describe('send-later calendar', () => {
  it('opens the calendar in the menu box above the presets', async () => {
    openPane()
    const menu = await openCalendar()

    const slot = menu.firstElementChild as HTMLElement
    expect(slot.className).toContain('send-calendar')

    const panel = document.querySelector('.panel') as HTMLElement
    expect(slot.contains(panel)).toBe(true)
    expect(menu.contains(panel)).toBe(true)
  })

  it('leaves the footer and the presets below the calendar', async () => {
    openPane()
    const menu = await openCalendar()

    // the clear/today row and the schedule button belong to the field at the
    // bottom, not to the calendar block at the top
    const custom = menu.querySelector('.send-custom') as HTMLElement
    expect(custom.querySelector('.panel-foot')).not.toBeNull()
    expect(custom.querySelector('.panel')).toBeNull()

    const slot = menu.firstElementChild as HTMLElement
    const presets = menu.querySelector('.send-preset') as HTMLElement
    // the calendar box comes before the presets, which come before the field
    expect(slot.compareDocumentPosition(presets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(presets.compareDocumentPosition(custom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not put a second scrim over the composer', async () => {
    openPane()
    await openCalendar()

    expect(document.querySelector('.scrim')).toBeNull()
  })

  it('places the calendar in the flow, not at fixed coordinates', async () => {
    openPane()
    await openCalendar()

    const panel = document.querySelector('.panel') as HTMLElement
    // the floating panel carries left/top/visibility; an inline one carries none
    expect(panel.getAttribute('style')).toBeNull()
  })
})
