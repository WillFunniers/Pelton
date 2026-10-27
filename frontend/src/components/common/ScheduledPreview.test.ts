import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import type { ScheduledPreview as PreviewDTO } from '../../lib/types'

// The preview is the only place a scheduled message can be read before it goes
// out, so these tests are about whether the stored message is actually shown:
// the recipients, what it is called, what rides along, and the two things that
// must never be shown - a body the user encrypted, and hidden recipients as
// anything other than a count.

const api = vi.hoisted(() => ({
  getScheduledPreview: vi.fn(),
  cancelSend: vi.fn(),
}))

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  ...api,
}))

const toasts = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../../stores/toast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../stores/toast')>()),
  ...toasts,
}))

import ScheduledPreview from './ScheduledPreview.svelte'

// the preview opens in a modal with a transition, and jsdom has no web
// animations. A finished stub lets svelte run the transition to its end.
Element.prototype.animate ??= function () {
  const animation = {
    onfinish: null as (() => void) | null,
    cancel() {},
    finished: Promise.resolve(),
  }
  queueMicrotask(() => animation.onfinish?.())
  return animation as unknown as Animation
}

function dto(overrides: Partial<PreviewDTO> = {}): PreviewDTO {
  return {
    id: 42,
    accountId: 1,
    from: 'Spud McPelton <spud@example.com>',
    to: 'you@example.com',
    cc: '',
    subject: 'project report',
    date: '',
    scheduledAt: '2026-10-03T09:00:00Z',
    text: '',
    html: '<p>the body</p>',
    attachments: [],
    hiddenBccCount: 0,
    protected: false,
    ...overrides,
  }
}

describe('ScheduledPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows who the message goes to and what it is called', async () => {
    api.getScheduledPreview.mockResolvedValue(dto())
    render(ScheduledPreview, { props: { id: 42 } })

    expect(await screen.findByText('project report')).toBeInTheDocument()
    expect(screen.getByText('you@example.com')).toBeInTheDocument()
    expect(screen.getByText('Spud McPelton <spud@example.com>')).toBeInTheDocument()
    expect(api.getScheduledPreview).toHaveBeenCalledWith(42)
  })

  it('shows a cc line only when there is a cc', async () => {
    api.getScheduledPreview.mockResolvedValue(dto())
    const { unmount } = render(ScheduledPreview, { props: { id: 42 } })
    await screen.findByText('project report')
    expect(screen.queryByText('Cc')).not.toBeInTheDocument()
    unmount()

    api.getScheduledPreview.mockResolvedValue(dto({ cc: 'boss@example.com' }))
    render(ScheduledPreview, { props: { id: 42 } })
    expect(await screen.findByText('boss@example.com')).toBeInTheDocument()
  })

  it('lists attachments by name and size', async () => {
    api.getScheduledPreview.mockResolvedValue(
      dto({
        attachments: [
          { filename: 'report.pdf', contentType: 'application/pdf', size: 2048 },
          { filename: 'data.csv', contentType: 'text/csv', size: 1024 },
        ],
      }),
    )
    render(ScheduledPreview, { props: { id: 42 } })

    expect(await screen.findByText('report.pdf')).toBeInTheDocument()
    expect(screen.getByText('data.csv')).toBeInTheDocument()
    // a file the user cannot judge by name has to say how big it is, or the
    // point of looking before sending is lost.
    expect(screen.getByText('2 KB')).toBeInTheDocument()
    expect(screen.getByText('1 KB')).toBeInTheDocument()
  })

  it('renders the body in a frame with no scripts allowed', async () => {
    api.getScheduledPreview.mockResolvedValue(dto())
    const { container } = render(ScheduledPreview, { props: { id: 42 } })
    await screen.findByText('project report')

    const frame = container.querySelector('iframe')
    expect(frame).not.toBeNull()
    // the sandbox attribute is present and empty: nothing is granted, so no
    // script and no navigation, on top of the policy written into the document.
    expect(frame?.getAttribute('sandbox')).toBe('')
    expect(frame?.getAttribute('srcdoc')).toContain("default-src 'none'")
    expect(frame?.getAttribute('srcdoc')).toContain('the body')
  })

  it('falls back to text when there is no html body', async () => {
    api.getScheduledPreview.mockResolvedValue(dto({ html: '', text: 'plain words' }))
    const { container } = render(ScheduledPreview, { props: { id: 42 } })

    expect(await screen.findByText('plain words')).toBeInTheDocument()
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('never renders a body for an encrypted message', async () => {
    api.getScheduledPreview.mockResolvedValue(
      dto({ protected: true, html: '', text: '', subject: 'secrets' }),
    )
    const { container } = render(ScheduledPreview, { props: { id: 42 } })

    expect(await screen.findByText('secrets')).toBeInTheDocument()
    expect(container.querySelector('iframe')).toBeNull()
    // it says why rather than showing an empty pane.
    expect(
      screen.getByText('This message is encrypted, so its contents cannot be shown here.'),
    ).toBeInTheDocument()
  })

  it('reports hidden recipients as a count and never names them', async () => {
    api.getScheduledPreview.mockResolvedValue(dto({ hiddenBccCount: 3 }))
    render(ScheduledPreview, { props: { id: 42 } })

    expect(await screen.findByText('Hidden recipients: 3')).toBeInTheDocument()
  })

  it('says nothing about hidden recipients when there are none', async () => {
    api.getScheduledPreview.mockResolvedValue(dto({ hiddenBccCount: 0 }))
    render(ScheduledPreview, { props: { id: 42 } })
    await screen.findByText('project report')

    expect(screen.queryByText(/Hidden recipients/)).not.toBeInTheDocument()
  })

  it('asks before cancelling, and says the message will not be kept', async () => {
    api.getScheduledPreview.mockResolvedValue(dto())
    api.cancelSend.mockResolvedValue(true)
    const closed = vi.fn()
    render(ScheduledPreview, { props: { id: 42 }, events: { close: closed } })

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel send' }))

    expect(api.cancelSend).not.toHaveBeenCalled()
    expect(
      screen.getByText('Cancel this send? The message will not be kept.'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel send' }))
    await waitFor(() => expect(api.cancelSend).toHaveBeenCalledWith(42))
    await waitFor(() => expect(closed).toHaveBeenCalled())
  })

  it('explains when the message left before the cancel landed', async () => {
    api.getScheduledPreview.mockResolvedValue(dto())
    api.cancelSend.mockResolvedValue(false)
    const closed = vi.fn()
    render(ScheduledPreview, { props: { id: 42 }, events: { close: closed } })

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel send' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel send' }))

    await waitFor(() => expect(api.cancelSend).toHaveBeenCalledWith(42))
    // the pane stays open: the message is still on its way and the user should
    // see that rather than watch the window shut as if it had worked.
    expect(closed).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(toasts.toastError).toHaveBeenCalledWith(
        'Too late to cancel, the message is already on its way.',
      ),
    )
  })
  // Cancelling needs only the id this pane was opened with. A preview that is
  // still loading, or that never loads at all, must not stop the user from
  // calling the send off - that was the bug this pair of tests exists to keep
  // out: the button used to be gated on the preview having produced data.
  it('can still cancel while the preview is still loading', async () => {
    api.getScheduledPreview.mockReturnValue(new Promise(() => {}))
    api.cancelSend.mockResolvedValue(true)
    const closed = vi.fn()
    render(ScheduledPreview, { props: { id: 42 }, events: { close: closed } })

    const button = screen.getByRole('button', { name: 'Cancel send' })
    expect(button).toBeEnabled()

    await userEvent.click(button)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel send' }))

    await waitFor(() => expect(api.cancelSend).toHaveBeenCalledWith(42))
    await waitFor(() => expect(closed).toHaveBeenCalled())
  })

  it('can still cancel when the preview failed to load', async () => {
    api.getScheduledPreview.mockRejectedValue(new Error('the message could not be read'))
    api.cancelSend.mockResolvedValue(true)
    const closed = vi.fn()
    render(ScheduledPreview, { props: { id: 42 }, events: { close: closed } })

    // the failure is shown, and cancelling is still offered.
    expect(await screen.findByText('the message could not be read')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Cancel send' })
    expect(button).toBeEnabled()

    await userEvent.click(button)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel send' }))

    await waitFor(() => expect(api.cancelSend).toHaveBeenCalledWith(42))
    await waitFor(() => expect(closed).toHaveBeenCalled())
  })
})
