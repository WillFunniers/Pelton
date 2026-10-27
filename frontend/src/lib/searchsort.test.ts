import { describe, it, expect } from 'vitest'
import { searchKind, automaticSort, resolveSort } from './searchsort'

describe('searchKind', () => {
  it('calls anything with typed words a text search', () => {
    expect(searchKind('invoice', false)).toBe('text')
    // even alongside a date window: once there are words there are scores.
    expect(searchKind('invoice', true)).toBe('text')
  })

  it('separates a date window from a plain chip filter', () => {
    expect(searchKind('', true)).toBe('dated')
    expect(searchKind('', false)).toBe('filtered')
  })

  it('treats whitespace as no query at all', () => {
    expect(searchKind('   ', false)).toBe('filtered')
  })
})

describe('automaticSort', () => {
  // the point of the whole feature: relevance for words, date for everything
  // else, since a query built only from chips scores every hit the same.
  it('ranks a text search and dates the rest', () => {
    expect(automaticSort('text')).toBe('relevance')
    expect(automaticSort('dated')).toBe('newest')
    expect(automaticSort('filtered')).toBe('newest')
  })
})

describe('resolveSort', () => {
  it('passes a real order through untouched', () => {
    expect(resolveSort('oldest', 'text')).toBe('oldest')
    expect(resolveSort('subjectAsc', 'dated')).toBe('subjectAsc')
  })

  it('reads auto off the kind of search', () => {
    expect(resolveSort('auto', 'text')).toBe('relevance')
    expect(resolveSort('auto', 'filtered')).toBe('newest')
  })
})
