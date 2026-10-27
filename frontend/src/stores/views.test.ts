import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import type { View } from '../lib/types'

const listViews = vi.fn()
vi.mock('../lib/api', () => ({
  listViews: () => listViews(),
  // selection.ts persists the last selection through these.
  setSetting: vi.fn(async () => {}),
  getSetting: vi.fn(async () => ''),
  SettingKeys: { lastSelection: 'last_selection' },
}))

const { loadViews, views } = await import('./views')
const { selection, selectSavedView } = await import('./selection')

function view(id: number): View {
  return { id, name: `view ${id}`, position: id } as View
}

beforeEach(() => {
  listViews.mockReset()
  views.set([])
})

describe('loadViews', () => {
  it('stores what the backend returned', async () => {
    listViews.mockResolvedValue([view(1), view(2)])
    await loadViews()
    expect(get(views).map((v) => v.id)).toEqual([1, 2])
  })

  it('leaves the list on a View that is still there', async () => {
    listViews.mockResolvedValue([view(1), view(2)])
    selectSavedView(2, 'view 2')
    await loadViews()
    expect(get(selection)).toMatchObject({ kind: 'savedView', viewId: 2 })
  })

  // the delete button is not the only way a View stops existing under the list
  // showing it: another window, a profile switch, or the server.
  it('returns to the inbox when the open View is gone', async () => {
    listViews.mockResolvedValue([view(1)])
    selectSavedView(2, 'view 2')
    await loadViews()
    expect(get(selection)).toMatchObject({ kind: 'view', view: 'inbox' })
  })

  it('leaves a folder or unified selection alone', async () => {
    listViews.mockResolvedValue([])
    const before = get(selection)
    await loadViews()
    expect(get(selection)).toEqual(before)
  })

  // a failed request says nothing about whether the View still exists, so
  // moving the user off it would be worse than an empty sidebar.
  it('keeps the selection when the request fails', async () => {
    listViews.mockRejectedValue(new Error('offline'))
    selectSavedView(2, 'view 2')
    await loadViews()
    expect(get(views)).toEqual([])
    expect(get(selection)).toMatchObject({ kind: 'savedView', viewId: 2 })
  })
})
