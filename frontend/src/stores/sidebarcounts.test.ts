import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./accounts', () => ({ refreshSidebar: vi.fn(async () => undefined) }))
vi.mock('./views', () => ({ loadViews: vi.fn(async () => undefined) }))

import { refreshCountsSoon } from './sidebarcounts'
import { refreshSidebar } from './accounts'
import { loadViews } from './views'

const sidebarRead = vi.mocked(refreshSidebar)
const viewsRead = vi.mocked(loadViews)

beforeEach(() => {
  vi.useFakeTimers()
  sidebarRead.mockClear()
  viewsRead.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

// #403: every local change asks for a refresh, so without collapsing them a
// bulk delete of fifty messages would be fifty passes over the whole tree.
describe('refreshCountsSoon', () => {
  it('collapses a run of changes into one pass', () => {
    for (let i = 0; i < 50; i++) {
      refreshCountsSoon()
    }
    vi.advanceTimersByTime(200)
    expect(sidebarRead).toHaveBeenCalledTimes(1)
  })

  // both stores hold badges. Reading one and not the other leaves saved Views
  // stale, which looks like the fix only half works.
  it('re-reads the saved views as well as the folder tree', () => {
    refreshCountsSoon()
    vi.advanceTimersByTime(200)
    expect(sidebarRead).toHaveBeenCalledTimes(1)
    expect(viewsRead).toHaveBeenCalledTimes(1)
  })

  it('does nothing until the run has settled', () => {
    refreshCountsSoon()
    vi.advanceTimersByTime(199)
    expect(sidebarRead).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(sidebarRead).toHaveBeenCalledTimes(1)
  })

  it('refreshes again for a change after the last one landed', () => {
    refreshCountsSoon()
    vi.advanceTimersByTime(200)
    refreshCountsSoon()
    vi.advanceTimersByTime(200)
    expect(sidebarRead).toHaveBeenCalledTimes(2)
  })
})
