// scheduled.ts holds the pieces of the scheduled-send preview that are worth
// testing on their own: which queued rows count as scheduled, and the frame the
// stored body is rendered in.
//
// The frame is deliberately stricter than the reading pane's. Reading mail needs
// a nonce-scoped script, because links clicked inside the frame have to reach
// the host and the scan badges need wiring. A preview offers neither: it has no
// links to relay and no actions to take, so its frame allows no script at all
// and no remote origin of any kind. Nothing a scheduled message carried can run
// or be fetched while the user is deciding whether to send it.

import { documentColors } from './maildoc'
import type { MailPalette } from './mailpalette'
import type { OutboxRow, ScheduledPreview } from './types'

// A row queued further out than this is a message the user deliberately
// scheduled, rather than one sitting in the short undo-send window. Both the
// outbox popover and the scheduled list judge rows by this, so they cannot
// disagree about what "scheduled" means.
export const SCHEDULED_THRESHOLD_MS = 60 * 1000

/** isScheduledRow reports whether a queued row is a future scheduled send. */
export function isScheduledRow(row: OutboxRow): boolean {
  if (row.state !== 'queued' || !row.nextAttemptAt) {
    return false
  }
  return new Date(row.nextAttemptAt).getTime() - Date.now() > SCHEDULED_THRESHOLD_MS
}

// The preview frame's policy. img-src is data: alone, which is what an inline
// image becomes once the backend resolves it, and nothing else: a remote image
// cannot be fetched even if the sanitizer let its url through. There is no
// script-src, so no script runs. Both are second locks rather than the only one
// - the body is already sanitized before it gets here.
export const PREVIEW_CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"

/** The inputs the preview frame renders with, all resolved by the caller. */
export interface PreviewFrameOptions {
  /** the body, already sanitized by the backend with remote content refused */
  html: string
  /** the palette the app currently renders mail in */
  palette: MailPalette
  /** the reader font size, in px */
  fontSize: number
  /** the resolved reader font stack, for text that declares none */
  font: string
  /** the colour painted behind the message */
  pageBackground: string
}

/**
 * buildPreviewSrcdoc wraps an already-sanitized body in the document the frame
 * loads. The value is assigned to the iframe's srcdoc, which keeps it a separate
 * document with its own policy; it is never inserted into this document, so the
 * message cannot reach the app's DOM.
 */
export function buildPreviewSrcdoc(options: PreviewFrameOptions): string {
  const { html, palette, fontSize, font, pageBackground } = options
  const { text, link, quote, rule } = documentColors(palette)
  const css = [
    `html{margin:0;background:${pageBackground};color:${text};font-family:${font};font-size:${fontSize}px;line-height:1.5;}`,
    'body{margin:0;padding:4px 2px;word-wrap:break-word;overflow-wrap:break-word;}',
    `a{color:${link};}`,
    'img{max-width:100%;height:auto;}',
    'table{max-width:100%;}',
    'pre{white-space:pre-wrap;}',
    `blockquote{margin:0;margin-inline-start:8px;padding-inline-start:10px;border-inline-start:2px solid ${rule};color:${quote};}`,
  ].join('\n')
  const openStyle = '<sty' + 'le>'
  const closeStyle = '</sty' + 'le>'
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`,
    `${openStyle}${css}${closeStyle}`,
    '</head><body>',
    html,
    '</body></html>',
  ].join('')
}

/**
 * previewHasFrame reports whether a preview renders in the frame at all. An
 * encrypted message has no readable body, and a plain-text message has no html
 * to frame, so both are shown as text instead.
 */
export function previewHasFrame(preview: ScheduledPreview): boolean {
  return !preview.protected && preview.html !== ''
}
