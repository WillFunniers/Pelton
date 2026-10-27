import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import type { Account, UntrustedCert } from '../../lib/types'
import { blankAccountProxy } from '../../lib/proxyroute'

const api = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  accountsNeedingPassword: vi.fn(),
  previewArchiveExportName: vi.fn(),
  probeAccountCertificates: vi.fn(),
  trustAccountCertificate: vi.fn(),
  removeAccountTrustedCertificate: vi.fn(),
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

const pinned = Array(32).fill('EF').join(':')

function account(over: Partial<Account>): Account {
  return {
    id: 3,
    email: 'me@proton.example',
    displayName: '',
    localLabel: '',
    useLocalLabel: false,
    username: '',
    imapHost: '127.0.0.1',
    imapPort: 1143,
    smtpHost: '127.0.0.1',
    smtpPort: 1025,
    local: false,
    imapTls: 'starttls',
    smtpTls: 'starttls',
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

const changed: UntrustedCert = {
  server: 'imap',
  host: '127.0.0.1',
  port: 1143,
  fingerprint: '12'.repeat(32),
  display: Array(32).fill('12').join(':'),
  subject: 'CN=127.0.0.1',
  issuer: 'CN=127.0.0.1',
  notBefore: '2026-01-01T00:00:00Z',
  notAfter: '2046-01-01T00:00:00Z',
  names: ['127.0.0.1'],
  selfSigned: true,
  reason: 'x509: certificate signed by unknown authority',
}

async function openEditor(): Promise<void> {
  render(MailboxesSection)
  await userEvent.click(await screen.findByRole('button', { name: 'Edit me@proton.example' }))
}

beforeEach(() => {
  for (const fn of Object.values(api)) {
    fn.mockReset()
  }
  api.accountsNeedingPassword.mockResolvedValue([])
  api.previewArchiveExportName.mockResolvedValue('')
  api.trustAccountCertificate.mockResolvedValue(undefined)
  api.removeAccountTrustedCertificate.mockResolvedValue(undefined)
})

describe('mailbox editor certificates (#446)', () => {
  it('checks the servers and trusts a changed certificate', async () => {
    api.listAccounts
      .mockResolvedValueOnce([account({})])
      .mockResolvedValue([account({ trustedCerts: [changed.display] })])
    api.probeAccountCertificates.mockResolvedValue([changed])
    await openEditor()

    expect(screen.getByText('None. Only certificates the system trusts are accepted.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Check certificates' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Trust this certificate' }))

    expect(api.trustAccountCertificate).toHaveBeenCalledWith(3, changed.fingerprint)
    expect(await screen.findByText(changed.display)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trust this certificate' })).not.toBeInTheDocument()
  })

  it('says so when both servers are already trusted', async () => {
    api.listAccounts.mockResolvedValue([account({})])
    api.probeAccountCertificates.mockResolvedValue([])
    await openEditor()

    await userEvent.click(screen.getByRole('button', { name: 'Check certificates' }))
    expect(await screen.findByText('Both servers present a trusted certificate.')).toBeInTheDocument()
  })

  it('removes a pinned certificate', async () => {
    api.listAccounts
      .mockResolvedValueOnce([account({ trustedCerts: [pinned] })])
      .mockResolvedValue([account({})])
    await openEditor()

    expect(screen.getByText(pinned)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(api.removeAccountTrustedCertificate).toHaveBeenCalledWith(3, pinned)
    await vi.waitFor(() => expect(screen.queryByText(pinned)).not.toBeInTheDocument())
  })
})
