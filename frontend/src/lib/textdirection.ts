// textdirection.ts works out which way a piece of text reads (#356).
//
// The browser does this for us wherever dir="auto" can be used, but a message
// being sent has to carry its direction in the markup, and that means deciding
// it in code: the recipient's client has no dir="auto" of ours to inherit from,
// so an unmarked right-to-left message arrives laid out left to right with its
// numbers and punctuation out of order. That is the complaint in the issue,
// seen from the other end.
//
// The rule is the one the html dir="auto" algorithm uses: find the first
// character with a strong direction and take its side. Digits, spaces and
// punctuation have no direction of their own, so a message opening with a date
// or a quote mark is decided by the first real word after it.

/**
 * Characters with a strong right-to-left direction: Hebrew, Arabic, Syriac,
 * Thaana, N'Ko and the Arabic presentation forms. This is the same set the
 * unicode bidirectional algorithm calls R or AL.
 */
const rtlChar =
  /[֐-׿؀-ۿ܀-ݏݐ-ݿހ-޿߀-߿ࢠ-ࣿיִ-﷿ﹰ-﻿]/

/**
 * Characters with a strong left-to-right direction. Deliberately broad rather
 * than exhaustive: it covers the scripts a latin, greek or cyrillic writer
 * actually uses, and anything outside both sets is treated as having no
 * direction, which is what it has.
 */
const ltrChar = /[A-Za-zÀ-˿Ͱ-֏ऀ-῿Ⰰ-퟿豈-ﬗ]/

/** Which way a run of text reads. */
export type TextDirection = 'ltr' | 'rtl'

/**
 * The direction of the first strongly directional character in text, or 'ltr'
 * when there is none. Text with no strong character at all (a number, a url, an
 * empty draft) has no direction to speak of, and left to right is both the
 * existing behaviour and the safer default.
 */
export function writingDirection(text: string): TextDirection {
  for (const ch of text) {
    if (rtlChar.test(ch)) {
      return 'rtl'
    }
    if (ltrChar.test(ch)) {
      return 'ltr'
    }
  }
  return 'ltr'
}

/**
 * Wraps html so it carries its own direction to the recipient. Left-to-right
 * html is returned untouched: it is what every client already assumes, and
 * wrapping it would change the markup of every message Pelton sends for no
 * gain.
 */
export function markDirection(html: string, direction: TextDirection): string {
  if (direction !== 'rtl' || html.trim() === '') {
    return html
  }
  return `<div dir="rtl">${html}</div>`
}
