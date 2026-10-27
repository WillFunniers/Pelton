import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import type { Account, ProxyConfig } from '../../lib/types'
import { blankAccountProxy } from '../../lib/proxyroute'

const api = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  accountsNeedingPassword: vi.fn(),
  accountOAuthProvider: vi.fn(),
  previewArchiveExportName: vi.fn(),
  getProxyConfig: vi.fn(),
  accountProxyPasswordStored: vi.fn(),
  testAccountRoute: vi.fn(),
  updateAccount: vi.fn(),
}))

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  ...api,
}))

vi.mock('../../stores/accounts', () => ({
  refreshSidebar: vi.fn(),
}))

import MailboxesSection from './MailboxesSection.svelte'

// the editor opens in a modal with a transition, and jsdom has no web
// animations. A finished stub lets svelte run the transition to its end.
Element.prototype.animate ??= function () {
  const animation = { onfinish: null as (() => void) | null, cancel() {}, finished: Promise.resolve() }
  queueMicrotask(() => animation.onfinish?.())
  return animation as unknown as Animation
}

const globalProxy: ProxyConfig = {
  mode: 'manual',
  scheme: 'socks5',
  host: '10.0.0.1',
  port: 1080,
  username: '',
  password: '',
  hasPassword: false,
}

function account(over: Partial<Account> = {}): Account {
  return {
    id: 9,
    email: 'routed@example.com',
    displayName: '',
    localLabel: '',
    useLocalLabel: false,
    username: '',
    imapHost: 'imap.example.com',
    imapPort: 993,
    smtpHost: 'smtp.example.com',
    smtpPort: 465,
    local: false,
    imapTls: 'ssl',
    smtpTls: 'ssl',
    exportOnArchive: false,
    exportDir: '',
    exportSubfolders: 'none',
    exportNameTemplate: '',
    pgpDefault: '',
    passwordPromptDismissed: false,
    trustedCerts: [],
    caSubjects: [],
    proxy: blankAccountProxy(),
    ...over,
  }
}

async function openEditor(a: Account): Promise<void> {
  api.listAccounts.mockResolvedValue([a])
  render(MailboxesSection)
  await userEvent.click(await screen.findByRole('button', { name: `Edit ${a.email}` }))
}

// the modal opened last, which is the advanced one once it is up.
function topDialog(): HTMLElement {
  const dialogs = screen.getAllByRole('dialog')
  return dialogs[dialogs.length - 1]
}

beforeEach(() => {
  for (const fn of Object.values(api)) {
    fn.mockReset()
  }
  api.accountsNeedingPassword.mockResolvedValue([])
  api.accountOAuthProvider.mockResolvedValue('')
  api.previewArchiveExportName.mockResolvedValue('')
  api.getProxyConfig.mockResolvedValue(globalProxy)
  api.accountProxyPasswordStored.mockResolvedValue(false)
  api.testAccountRoute.mockResolvedValue(undefined)
  api.updateAccount.mockImplementation(async (req) => account({ proxy: req.proxy }))
})

describe('mailbox route', () => {
  it('says where a mailbox on the app-wide setting actually goes', async () => {
    await openEditor(account())
    expect(await screen.findByText('App-wide setting: SOCKS5 10.0.0.1:1080')).toBeInTheDocument()
  })

  it("names the mailbox's own proxy instead of the app-wide one", async () => {
    await openEditor(account({ proxy: { ...blankAccountProxy(), mode: 'off' } }))
    expect(await screen.findByText('Direct connection')).toBeInTheDocument()
  })

  it('saves a custom proxy with its password', async () => {
    await openEditor(account())
    await userEvent.click(screen.getByRole('button', { name: /Archiving, encryption and network/ }))
    const advanced = within(topDialog())

    await userEvent.click(advanced.getByRole('button', { name: 'Custom proxy' }))
    await userEvent.type(advanced.getByLabelText('Proxy host'), 'own.example')
    await userEvent.type(advanced.getByLabelText('Password'), 'secret')
    const closers = advanced.getAllByRole('button', { name: 'Close' })
    await userEvent.click(closers[closers.length - 1])
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(api.updateAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        proxy: expect.objectContaining({ mode: 'manual', host: 'own.example', port: 1080, password: 'secret' }),
      }),
    )
  })

  it('shows a stored proxy password as a placeholder and never asks for it back', async () => {
    api.accountProxyPasswordStored.mockResolvedValue(true)
    await openEditor(account({ proxy: { ...blankAccountProxy(), mode: 'manual', host: 'own.example' } }))
    await userEvent.click(screen.getByRole('button', { name: /Archiving, encryption and network/ }))

    const password = within(topDialog()).getByLabelText('Password') as HTMLInputElement
    await vi.waitFor(() => expect(password.placeholder).toBe('Saved, leave blank to keep'))
    expect(password.value).toBe('')
  })

  it('tests the route against the servers in the editor', async () => {
    await openEditor(account({ proxy: { ...blankAccountProxy(), mode: 'off' } }))
    await userEvent.click(screen.getByRole('button', { name: /Archiving, encryption and network/ }))
    await userEvent.click(within(topDialog()).getByRole('button', { name: 'Test route' }))

    expect(api.testAccountRoute).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 9, imapHost: 'imap.example.com', smtpHost: 'smtp.example.com' }),
    )
  })
})
