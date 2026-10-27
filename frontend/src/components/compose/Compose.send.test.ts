import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { get } from 'svelte/store'
import { isMac } from '../../lib/i18n'

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

// the send shortcut as the platform spells it: Cmd+Enter on macOS, Ctrl+Enter
// elsewhere.
const sendKey = { key: 'Enter', metaKey: isMac, ctrlKey: !isMac }

let unsubscribe: (() => void) | null = null

// openPane renders a compose pane the way App does, re-rendered from the store
// so an edit made inside the pane reaches its session.
function openPane(patch: Partial<ComposeSession> = {}): number {
  const id = openCompose(1, 'plaintext')
  updateCompose(id, { signaturesApplied: true, ...patch })
  const session = get(composeSessions).find((s) => s.id === id) as ComposeSession
  const { rerender } = render(Compose, { props: { session } })
  unsubscribe = composeSessions.subscribe((list) => {
    const next = list.find((s) => s.id === id)
    if (next) {
      void rerender({ session: next })
    }
  })
  return id
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

describe('send shortcut (#480)', () => {
  it('sends from a field in the pane', async () => {
    openPane({ to: 'ann@example.com', subject: 'Hi' })

    await fireEvent.keyDown(screen.getByLabelText('Subject'), sendKey)

    await vi.waitFor(() => expect(api.sendMessage).toHaveBeenCalledOnce())
  })

  it('turns an address still being typed into a recipient before sending', async () => {
    openPane()
    const to = screen.getByRole('textbox', { name: 'To' })
    await userEvent.type(to, 'bob@example.com')

    await fireEvent.keyDown(to, sendKey)

    await vi.waitFor(() => expect(api.sendMessage).toHaveBeenCalledOnce())
    expect(api.sendMessage.mock.calls[0][0].to).toEqual([expect.objectContaining({ email: 'bob@example.com' })])
  })

  it('keeps the key from the editor, which would otherwise add a line', async () => {
    openPane({ to: 'ann@example.com' })
    // stands in for the CodeMirror or tiptap surface, both of which bind this
    // key themselves.
    const surface = document.createElement('div')
    surface.contentEditable = 'true'
    document.querySelector('.editor')?.appendChild(surface)
    const editorSaw = vi.fn()
    surface.addEventListener('keydown', editorSaw)

    await fireEvent.keyDown(surface, sendKey)

    await vi.waitFor(() => expect(api.sendMessage).toHaveBeenCalledOnce())
    expect(editorSaw).not.toHaveBeenCalled()
  })

  it('does not send on a plain Enter', async () => {
    openPane({ to: 'ann@example.com' })

    await fireEvent.keyDown(screen.getByLabelText('Subject'), { key: 'Enter' })

    expect(api.sendMessage).not.toHaveBeenCalled()
  })
})
