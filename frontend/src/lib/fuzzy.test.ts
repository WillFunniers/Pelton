import { describe, expect, it } from 'vitest'
import { fuzzyMatch, highlightRuns } from './fuzzy'

describe('fuzzyMatch', () => {
  it('matches characters in order', () => {
    const match = fuzzyMatch('et', 'Empty trash')
    expect(match).not.toBeNull()
    expect(match!.positions).toEqual([0, 6])
  })

  it('refuses a query whose characters are out of order', () => {
    expect(fuzzyMatch('te', 'Empty trash')?.positions).not.toEqual([6, 0])
    expect(fuzzyMatch('zz', 'Empty trash')).toBeNull()
  })

  it('matches regardless of case', () => {
    expect(fuzzyMatch('EMPTY', 'Empty trash')).not.toBeNull()
    expect(fuzzyMatch('empty', 'EMPTY TRASH')).not.toBeNull()
  })

  it('treats an empty query as a match with no positions', () => {
    const match = fuzzyMatch('', 'Empty trash')
    expect(match).not.toBeNull()
    expect(match!.positions).toEqual([])
  })

  it('finds nothing in an empty candidate', () => {
    expect(fuzzyMatch('a', '')).toBeNull()
  })

  // the case the module's own comment names as the reason it is not a plain
  // substring search: "ea" should reach for Empty trash, where both letters
  // start words, over Search mail, where they sit inside one.
  it('prefers word starts over letters buried inside a word', () => {
    const wordStarts = fuzzyMatch('et', 'Empty trash')
    const buried = fuzzyMatch('et', 'Server settings')
    expect(wordStarts!.score).toBeGreaterThan(buried!.score)
  })

  it('prefers a consecutive run over the same letters spread out', () => {
    const consecutive = fuzzyMatch('mail', 'mailbox')
    const scattered = fuzzyMatch('mail', 'Move all items later')
    expect(consecutive!.score).toBeGreaterThan(scattered!.score)
  })

  it('prefers a match at the start of the string', () => {
    const atStart = fuzzyMatch('set', 'Settings')
    const later = fuzzyMatch('set', 'Reset everything')
    expect(atStart!.score).toBeGreaterThan(later!.score)
  })

  it('reports positions that are ascending and inside the candidate', () => {
    const text = 'Mark all as read'
    const match = fuzzyMatch('mar', text)!
    expect(match.positions).toHaveLength(3)
    for (let i = 1; i < match.positions.length; i++) {
      expect(match.positions[i]).toBeGreaterThan(match.positions[i - 1])
    }
    for (const at of match.positions) {
      expect(at).toBeGreaterThanOrEqual(0)
      expect(at).toBeLessThan(text.length)
    }
  })

  it('matches a query as long as the candidate', () => {
    expect(fuzzyMatch('abc', 'abc')?.positions).toEqual([0, 1, 2])
  })

  it('finds nothing when the query is longer than the candidate', () => {
    expect(fuzzyMatch('abcd', 'abc')).toBeNull()
  })
})

describe('highlightRuns', () => {
  it('splits into alternating plain and matched runs', () => {
    expect(highlightRuns('Empty trash', [0, 6])).toEqual([
      { text: 'E', hit: true },
      { text: 'mpty ', hit: false },
      { text: 't', hit: true },
      { text: 'rash', hit: false },
    ])
  })

  it('joins adjacent positions into one run', () => {
    expect(highlightRuns('mailbox', [0, 1, 2, 3])).toEqual([
      { text: 'mail', hit: true },
      { text: 'box', hit: false },
    ])
  })

  it('returns the whole text unhit when nothing matched', () => {
    expect(highlightRuns('Settings', [])).toEqual([{ text: 'Settings', hit: false }])
  })

  it('returns nothing for empty text', () => {
    expect(highlightRuns('', [])).toEqual([])
  })

  it('never emits an empty run', () => {
    for (const runs of [
      highlightRuns('Empty trash', [0, 6]),
      highlightRuns('abc', [0, 1, 2]),
      highlightRuns('abc', [2]),
    ]) {
      for (const run of runs) {
        expect(run.text.length).toBeGreaterThan(0)
      }
    }
  })

  // the runs are what the palette renders, so together they have to be the
  // original string: a dropped or duplicated character would show up on screen.
  it('reassembles into the original text', () => {
    const text = 'Mark all as read'
    const match = fuzzyMatch('mar', text)!
    expect(
      highlightRuns(text, match.positions)
        .map((r) => r.text)
        .join(''),
    ).toBe(text)
  })
})
