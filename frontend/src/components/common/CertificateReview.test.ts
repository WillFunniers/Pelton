import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import type { UntrustedCert } from '../../lib/types'
import CertificateReview from './CertificateReview.svelte'

function cert(over: Partial<UntrustedCert>): UntrustedCert {
  return {
    server: 'imap',
    host: '127.0.0.1',
    port: 1143,
    fingerprint: 'ab'.repeat(32),
    display: Array(32).fill('AB').join(':'),
    subject: 'CN=127.0.0.1,O=Proton AG',
    issuer: 'CN=127.0.0.1,O=Proton AG',
    notBefore: '2026-01-01T00:00:00Z',
    notAfter: '2046-01-01T00:00:00Z',
    names: ['127.0.0.1'],
    selfSigned: true,
    reason: 'x509: certificate signed by unknown authority',
    ...over,
  }
}

describe('CertificateReview', () => {
  it('shows what the user has to compare before trusting', () => {
    render(CertificateReview, { props: { certs: [cert({})] } })

    expect(screen.getByText(Array(32).fill('AB').join(':'))).toBeInTheDocument()
    expect(screen.getByText('CN=127.0.0.1,O=Proton AG')).toBeInTheDocument()
    expect(screen.getByText('Itself (self-signed)')).toBeInTheDocument()
    expect(screen.getByText('IMAP 127.0.0.1:1143')).toBeInTheDocument()
  })

  // Proton Bridge serves one certificate on both ports; it is one decision,
  // not two identical blocks.
  it('shows a certificate both servers present once', () => {
    render(CertificateReview, { props: { certs: [cert({}), cert({ server: 'smtp', port: 1025 })] } })

    expect(screen.getAllByText(Array(32).fill('AB').join(':'))).toHaveLength(1)
    expect(screen.getByText('IMAP 127.0.0.1:1143, SMTP 127.0.0.1:1025')).toBeInTheDocument()
  })

  it('flags an expired certificate', () => {
    render(CertificateReview, { props: { certs: [cert({ notAfter: '2020-01-01T00:00:00Z' })] } })
    expect(screen.getByText(/^expired/)).toBeInTheDocument()
  })

  it('hands every reviewed certificate to the trust action', async () => {
    const certs = [cert({}), cert({ server: 'smtp', port: 1025 })]
    const onTrust = vi.fn()
    render(CertificateReview, {
      props: { certs },
      events: { trust: (e: CustomEvent<UntrustedCert[]>) => onTrust(e.detail) },
    })

    await userEvent.click(screen.getByRole('button', { name: 'Trust this certificate' }))
    expect(onTrust).toHaveBeenCalledWith(certs)
  })
})
