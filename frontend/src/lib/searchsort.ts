// searchsort.ts decides what order a page of search results comes back in
// (#404).
//
// There are two steps, kept apart. First a query is classified into one of
// three kinds by what it is made of; then that kind's remembered preference is
// read, and 'auto' is resolved into a real order. The backend is only ever
// handed a real order, so the rule for what suits a query lives here rather
// than being half in the ui and half in Go.

import type { SearchSort, SearchSortPref, SearchKind } from './types'

/** Every order offered, in the order the menu lists them. */
export const searchSorts: SearchSort[] = ['relevance', 'newest', 'oldest', 'subjectAsc', 'subjectDesc']

/**
 * What kind of search this is.
 *
 * Free text wins: once words are typed there are scores worth ranking by, no
 * matter what else is set. Without words, a date window means the user is
 * reading chronologically, and anything else is a plain chip filter.
 */
export function searchKind(query: string, hasDates: boolean): SearchKind {
  if (query.trim() !== '') {
    return 'text'
  }
  return hasDates ? 'dated' : 'filtered'
}

/**
 * The order 'auto' means for a kind of search.
 *
 * Relevance is right for a text query and wrong for everything else: a query
 * built only from chips matches every hit on the same terms, so the scores are
 * flat and ranking by them shuffles mail for no reason the user can see. Date
 * is the order a mail client is read in, so that is what the other two get.
 */
export function automaticSort(kind: SearchKind): SearchSort {
  return kind === 'text' ? 'relevance' : 'newest'
}

/** Resolves a stored preference into the order to actually ask for. */
export function resolveSort(pref: SearchSortPref, kind: SearchKind): SearchSort {
  return pref === 'auto' ? automaticSort(kind) : pref
}
