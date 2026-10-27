import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSetting = vi.fn()
const setSetting = vi.fn(async (_key: string, _value: string) => {})
vi.mock('./api', () => ({
  getSetting: (k: string) => getSetting(k),
  setSetting: (k: string, v: string) => setSetting(k, v),
  appVersion: async () => '2026.4.4',
  SettingKeys: { liabilityAccepted: 'liability_accepted' },
}))

const { liabilityAccepted, acceptLiability, termsVersion } = await import('./liability')

/** what the settings store answers with for a stored acknowledgement. */
function stored(value: string) {
  getSetting.mockResolvedValue({ found: true, value })
}

beforeEach(() => {
  getSetting.mockReset()
  setSetting.mockReset()
})

describe('liabilityAccepted', () => {
  it('is false when nothing was ever accepted', async () => {
    getSetting.mockResolvedValue({ found: false, value: '' })
    expect(await liabilityAccepted()).toBe(false)
  })

  it('is true for an acknowledgement of the terms this build shows', async () => {
    stored(JSON.stringify({ terms: termsVersion, version: '2026.4.4', at: '2026-09-24T00:00:00Z' }))
    expect(await liabilityAccepted()).toBe(true)
  })

  // the terms require the notice to reappear after every change to them, so an
  // acknowledgement of older wording does not carry over.
  it('is false for an acknowledgement of superseded terms', async () => {
    stored(JSON.stringify({ terms: '2026-07-29', version: '2026.4.3', at: '2026-08-01T00:00:00Z' }))
    expect(await liabilityAccepted()).toBe(false)
  })

  // installs that predate versioned terms stored no terms field at all. those
  // people accepted wording we can no longer identify, so they are asked once.
  it('is false for an acknowledgement written before the terms were versioned', async () => {
    stored(JSON.stringify({ version: '2026.4.2', at: '2026-07-01T00:00:00Z' }))
    expect(await liabilityAccepted()).toBe(false)
  })

  it('is false for a stored value that does not parse', async () => {
    stored('not json')
    expect(await liabilityAccepted()).toBe(false)
  })

  // a broken settings read must never stand between someone and their mail, so
  // it counts as accepted rather than blocking the app behind the notice.
  it('is true when the settings read throws', async () => {
    getSetting.mockRejectedValue(new Error('no storage'))
    expect(await liabilityAccepted()).toBe(true)
  })
})

describe('acceptLiability', () => {
  it('records the terms it accepted, so the next launch does not ask again', async () => {
    await acceptLiability()
    const [key, value] = setSetting.mock.calls[0] ?? []
    expect(key).toBe('liability_accepted')
    expect(value).toBeTypeOf('string')
    const ack = JSON.parse(value)
    expect(ack.terms).toBe(termsVersion)
    expect(ack.version).toBe('2026.4.4')
    expect(Date.parse(ack.at)).not.toBeNaN()

    stored(value)
    expect(await liabilityAccepted()).toBe(true)
  })
})
