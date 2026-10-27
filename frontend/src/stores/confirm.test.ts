import { beforeEach, describe, expect, it } from 'vitest'
import { get } from 'svelte/store'
import { askConfirm, confirmRequest } from './confirm'

beforeEach(() => {
  confirmRequest.set(null)
})

describe('askConfirm', () => {
  it('opens a request carrying what was asked', () => {
    void askConfirm({ title: 'Delete 3 messages?', body: 'They go to the bin.', confirmLabel: 'Delete', danger: true })

    const open = get(confirmRequest)!
    expect(open.title).toBe('Delete 3 messages?')
    expect(open.body).toBe('They go to the bin.')
    expect(open.confirmLabel).toBe('Delete')
    expect(open.danger).toBe(true)
  })

  it('defaults the body to empty and the action to harmless', () => {
    void askConfirm({ title: 'Go ahead?', confirmLabel: 'OK' })

    const open = get(confirmRequest)!
    expect(open.body).toBe('')
    expect(open.danger).toBe(false)
  })

  it('resolves true when the action is confirmed', async () => {
    const answer = askConfirm({ title: 'Go ahead?', confirmLabel: 'OK' })
    get(confirmRequest)!.resolve(true)
    await expect(answer).resolves.toBe(true)
  })

  it('resolves false when it is cancelled', async () => {
    const answer = askConfirm({ title: 'Go ahead?', confirmLabel: 'OK' })
    get(confirmRequest)!.resolve(false)
    await expect(answer).resolves.toBe(false)
  })

  it('closes the dialog once answered', async () => {
    const answer = askConfirm({ title: 'Go ahead?', confirmLabel: 'OK' })
    get(confirmRequest)!.resolve(true)
    await answer
    expect(get(confirmRequest)).toBeNull()
  })

  // an action that fires twice must not stack prompts, and the question nobody
  // can see any more has to answer no rather than hang forever.
  it('answers an outstanding question no when a second one is asked', async () => {
    const first = askConfirm({ title: 'First?', confirmLabel: 'OK' })
    const second = askConfirm({ title: 'Second?', confirmLabel: 'OK' })

    await expect(first).resolves.toBe(false)
    expect(get(confirmRequest)!.title).toBe('Second?')

    get(confirmRequest)!.resolve(true)
    await expect(second).resolves.toBe(true)
  })

  it('leaves nothing open before anything is asked', () => {
    expect(get(confirmRequest)).toBeNull()
  })
})
