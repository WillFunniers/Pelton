import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'

// the selection store persists the startup choice through the settings
// bindings; none of that is what these tests are about.
vi.mock('../lib/api', () => ({
  setSetting: vi.fn(async () => undefined),
  getSetting: vi.fn(async () => ({ found: false, value: '' })),
  SettingKeys: { startupSelection: 'startup_selection' },
}))

import { selection, selectView, selectSavedView } from './selection'
import { setLocale, t } from '../lib/i18n'

// a catalog other than English is fetched by dynamic import, so switching is
// not done when setLocale returns. Wait for the strings to actually arrive
// rather than guessing at a number of ticks.
async function switchTo(locale: string, expected: string): Promise<void> {
  setLocale(locale)
  for (let i = 0; i < 200; i++) {
    if (get(t)('sidebar.unifiedInbox') === expected) {
      return
    }
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error(`catalog for ${locale} never loaded`)
}

beforeEach(async () => {
  await switchTo('en', 'Unified Inbox')
})

// #356: a selection carries its label rather than looking it up, so the label
// used to be a snapshot of whatever language was active when it was made. The
// window title and the list header read it, which left both in the old language
// after a switch until the user happened to click something else.
describe('selection label follows the language', () => {
  it('re-resolves a built-in view when the locale changes', async () => {
    selectView('inbox', 'Unified Inbox')
    expect(get(selection).label).toBe('Unified Inbox')

    await switchTo('de', 'Vereinter Posteingang')

    expect(get(selection).label).toBe('Vereinter Posteingang')
  })

  it('comes back when the language is switched back', async () => {
    selectView('inbox', 'Unified Inbox')
    await switchTo('de', 'Vereinter Posteingang')
    await switchTo('en', 'Unified Inbox')

    expect(get(selection).label).toBe('Unified Inbox')
  })

  // a saved View's label is what the user called it and a folder's is its name
  // on the server. Neither is translated, and rewriting them from a catalog
  // would replace a name the user chose with one they did not.
  it('leaves a saved view name alone', async () => {
    selectSavedView(7, 'Rechnungen')
    await switchTo('de', 'Vereinter Posteingang')

    expect(get(selection).label).toBe('Rechnungen')
  })
})
