import { describe, it, expect } from 'vitest'
import { flatten, indexOfValue, step, firstEnabled, typeahead, isGroup } from './selectnav'
import type { SelectItem, SelectOption } from './selectnav'

const opts = (...labels: string[]): SelectOption[] =>
  labels.map((label) => ({ value: label.toLowerCase(), label }))

describe('flatten', () => {
  it('reads groups and loose options in the order they were given', () => {
    const items: SelectItem[] = [
      { value: 'last', label: 'Last used' },
      { label: 'Views', options: opts('Inbox', 'Flagged') },
      { label: 'Work', options: opts('Archive') },
    ]
    expect(flatten(items).map((o) => o.label)).toEqual(['Last used', 'Inbox', 'Flagged', 'Archive'])
  })

  it('tells a group from an option', () => {
    expect(isGroup({ label: 'Views', options: [] })).toBe(true)
    expect(isGroup({ value: 'a', label: 'A' })).toBe(false)
  })
})

describe('indexOfValue', () => {
  it('finds the current value and reports -1 for one that is gone', () => {
    const options = opts('Alpha', 'Beta')
    expect(indexOfValue(options, 'beta')).toBe(1)
    expect(indexOfValue(options, 'removed')).toBe(-1)
  })
})

describe('step', () => {
  it('moves one at a time', () => {
    const options = opts('A', 'B', 'C')
    expect(step(options, 0, 1)).toBe(1)
    expect(step(options, 2, -1)).toBe(1)
  })

  // wrapping in a long list moves the highlight somewhere the user cannot see.
  it('stops at the ends rather than wrapping', () => {
    const options = opts('A', 'B', 'C')
    expect(step(options, 2, 1)).toBe(2)
    expect(step(options, 0, -1)).toBe(0)
  })

  it('lands on the first or last option when nothing is highlighted', () => {
    const options = opts('A', 'B', 'C')
    expect(step(options, -1, 1)).toBe(0)
    expect(step(options, -1, -1)).toBe(2)
  })

  it('skips disabled options', () => {
    const options: SelectOption[] = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B', disabled: true },
      { value: 'c', label: 'C' },
    ]
    expect(step(options, 0, 1)).toBe(2)
    expect(step(options, 2, -1)).toBe(0)
  })

  it('copes with an empty list', () => {
    expect(step([], -1, 1)).toBe(-1)
  })
})

describe('firstEnabled', () => {
  it('reports -1 when every option is disabled', () => {
    expect(firstEnabled([{ value: 'a', label: 'A', disabled: true }])).toBe(-1)
  })
})

describe('typeahead', () => {
  const options = opts('Archive', 'Alpha', 'Beta')

  it('jumps to the first option starting with the letter', () => {
    expect(typeahead(options, 'b', -1)).toBe(2)
  })

  // the same letter again means the next match, which is how a native select
  // cycles through everything beginning with it.
  it('cycles through matches when a letter is repeated', () => {
    expect(typeahead(options, 'a', -1)).toBe(0)
    expect(typeahead(options, 'aa', 0)).toBe(1)
    expect(typeahead(options, 'aaa', 1)).toBe(0)
  })

  // a longer buffer is a word being spelled, so it matches the whole prefix
  // rather than cycling on its first letter.
  it('matches the whole buffer once it is a word', () => {
    expect(typeahead(options, 'al', -1)).toBe(1)
    expect(typeahead(options, 'arc', -1)).toBe(0)
  })

  it('ignores case', () => {
    expect(typeahead(options, 'BET', -1)).toBe(2)
  })

  it('reports -1 for no match and for an empty buffer', () => {
    expect(typeahead(options, 'z', -1)).toBe(-1)
    expect(typeahead(options, '', 0)).toBe(-1)
  })

  it('never lands on a disabled option', () => {
    const withDisabled: SelectOption[] = [
      { value: 'a', label: 'Archive', disabled: true },
      { value: 'b', label: 'Alpha' },
    ]
    expect(typeahead(withDisabled, 'a', -1)).toBe(1)
  })
})
