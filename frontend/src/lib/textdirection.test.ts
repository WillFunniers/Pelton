import { describe, it, expect } from 'vitest'
import { writingDirection, markDirection } from './textdirection'

describe('writingDirection', () => {
  it('reads latin text left to right', () => {
    expect(writingDirection('Hello there')).toBe('ltr')
  })

  it('reads Arabic and Hebrew right to left', () => {
    expect(writingDirection('مرحبا')).toBe('rtl')
    expect(writingDirection('שלום')).toBe('rtl')
  })

  // the first strong character decides, so leading punctuation, digits and
  // whitespace do not get a vote.
  it('skips characters with no direction of their own', () => {
    expect(writingDirection('  "123. مرحبا')).toBe('rtl')
    expect(writingDirection('(2026) Hello')).toBe('ltr')
  })

  it('takes the first strong character even with both scripts present', () => {
    expect(writingDirection('مرحبا hello')).toBe('rtl')
    expect(writingDirection('hello مرحبا')).toBe('ltr')
  })

  // a draft with nothing directional in it has no direction to report, and
  // left to right is both the default and what the app did before.
  it('falls back to left to right', () => {
    expect(writingDirection('')).toBe('ltr')
    expect(writingDirection('12345 !?')).toBe('ltr')
    expect(writingDirection('https://example.com')).toBe('ltr')
  })
})

describe('markDirection', () => {
  it('wraps right-to-left html so the recipient sees it that way', () => {
    expect(markDirection('<p>مرحبا</p>', 'rtl')).toBe('<div dir="rtl"><p>مرحبا</p></div>')
  })

  // every client already assumes left to right, so marking it would change the
  // markup of every message Pelton sends for nothing.
  it('leaves left-to-right html exactly as it was', () => {
    expect(markDirection('<p>hello</p>', 'ltr')).toBe('<p>hello</p>')
  })

  it('leaves an empty body alone', () => {
    expect(markDirection('', 'rtl')).toBe('')
    expect(markDirection('   ', 'rtl')).toBe('   ')
  })
})
