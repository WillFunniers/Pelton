import { describe, it, expect } from 'vitest'
import { PREVIEW_CSP, buildPreviewSrcdoc, isScheduledRow, previewHasFrame } from './scheduled'
import { mailPalette } from './mailpalette'
import type { OutboxRow, ScheduledPreview } from './types'

// The frame is the security boundary for a scheduled message: the body is
// rendered before anyone has decided to trust it, so these tests are about what
// the frame is allowed to do at all, not about how it looks. A colour change
// must never be able to make one of them pass or fail.

const LIGHT = mailPalette(false, () => '')

function frame(html: string): string {
  return buildPreviewSrcdoc({
    html,
    palette: LIGHT,
    fontSize: 14,
    font: 'system-ui',
    pageBackground: LIGHT.page.hex,
  })
}

function row(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: 1,
    accountId: 1,
    recipients: ['you@example.com'],
    state: 'queued',
    attempts: 0,
    lastError: '',
    nextAttemptAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    subject: 'hi',
    attachmentCount: 0,
    ...overrides,
  }
}

function preview(overrides: Partial<ScheduledPreview> = {}): ScheduledPreview {
  return {
    id: 1,
    accountId: 1,
    from: 'me@example.com',
    to: 'you@example.com',
    cc: '',
    subject: 'hi',
    date: '',
    scheduledAt: '',
    text: '',
    html: '<p>hi</p>',
    attachments: [],
    hiddenBccCount: 0,
    protected: false,
    ...overrides,
  }
}

// The one thing that must never be true of the frame: a remote origin or a
// script. Either would let a scheduled message reach out or run before the user
// has sent it.
describe('preview frame policy', () => {
  it('allows no script and no remote origin', () => {
    expect(PREVIEW_CSP).not.toContain('script-src')
    expect(PREVIEW_CSP).not.toContain('http:')
    expect(PREVIEW_CSP).not.toContain('https:')
    expect(PREVIEW_CSP).toContain("default-src 'none'")
    // an inline image arrives as a data url, so that is the one image origin.
    expect(PREVIEW_CSP).toContain('img-src data:')
  })

  it('carries the policy into the document it builds', () => {
    const doc = frame('<p>hi</p>')
    expect(doc).toContain('Content-Security-Policy')
    expect(doc).toContain(PREVIEW_CSP)
    expect(doc).toContain('<p>hi</p>')
  })

  it('does not name a style tag literally in the built document', () => {
    // the tags are concatenated in the source so svelte's parser does not read
    // the frame's css as the component's own; the output still has to be real.
    const doc = frame('<p>hi</p>')
    expect(doc).toContain('<style>')
    expect(doc).toContain('</style>')
  })
})

describe('previewHasFrame', () => {
  it('uses the frame for an html body', () => {
    expect(previewHasFrame(preview())).toBe(true)
  })

  it('does not frame a plain-text message', () => {
    expect(previewHasFrame(preview({ html: '' }))).toBe(false)
  })

  it('does not frame an encrypted message', () => {
    // there is no readable body, and framing ciphertext would show nothing
    // meaningful as though it were the message.
    expect(previewHasFrame(preview({ html: '<p>armor</p>', protected: true }))).toBe(false)
  })
})

// "Scheduled" is derived, not stored, so both surfaces have to agree on the
// threshold or a row could be listed in one and not the other.
describe('isScheduledRow', () => {
  it('accepts a queued row whose time has not come', () => {
    expect(isScheduledRow(row())).toBe(true)
  })

  it('rejects a row inside the undo-send window', () => {
    expect(isScheduledRow(row({ nextAttemptAt: new Date(Date.now() + 5000).toISOString() }))).toBe(
      false,
    )
  })

  it('rejects a row that is no longer queued', () => {
    expect(isScheduledRow(row({ state: 'sending' }))).toBe(false)
    expect(isScheduledRow(row({ state: 'failed' }))).toBe(false)
    expect(isScheduledRow(row({ state: 'sent' }))).toBe(false)
  })

  it('rejects a queued row with no time', () => {
    expect(isScheduledRow(row({ nextAttemptAt: '' }))).toBe(false)
  })
})
