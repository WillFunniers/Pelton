import { describe, it, expect } from 'vitest'
import { blankAccountProxy, routeSummary } from './proxyroute'
import type { ProxyConfig } from './types'

const strings: Record<string, string> = {
  'mailboxes.route.summary.direct': 'Direct connection',
  'mailboxes.route.summary.system': 'System proxy',
  'mailboxes.route.summary.global': 'App-wide setting: {route}',
}
const tr = (key: string) => strings[key] ?? key

const globalProxy: ProxyConfig = {
  mode: 'manual',
  scheme: 'socks5',
  host: '10.0.0.1',
  port: 1080,
  username: '',
  password: '',
  hasPassword: false,
}

describe('routeSummary', () => {
  it('names the app-wide proxy a mailbox follows, so it is never hidden', () => {
    expect(routeSummary(blankAccountProxy(), globalProxy, tr)).toBe('App-wide setting: SOCKS5 10.0.0.1:1080')
  })

  it('reads an app-wide setting that is off, or not loaded yet, as direct', () => {
    expect(routeSummary(blankAccountProxy(), { ...globalProxy, mode: 'off' }, tr)).toBe('App-wide setting: Direct connection')
    expect(routeSummary(blankAccountProxy(), null, tr)).toBe('App-wide setting: Direct connection')
  })

  it("describes a mailbox's own route without the app-wide one", () => {
    expect(routeSummary({ ...blankAccountProxy(), mode: 'off' }, globalProxy, tr)).toBe('Direct connection')
    expect(routeSummary({ ...blankAccountProxy(), mode: 'system' }, globalProxy, tr)).toBe('System proxy')
    expect(
      routeSummary({ ...blankAccountProxy(), mode: 'manual', scheme: 'http', host: 'proxy.example', port: 8080 }, globalProxy, tr),
    ).toBe('HTTP proxy.example:8080')
  })
})
