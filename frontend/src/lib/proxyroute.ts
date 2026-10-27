// the route a mailbox's connections take (#457): the blank one a new mailbox
// starts with, and the short sentence the mailbox editor shows for it.
import type { AccountProxy, ProxyConfig } from './types'

// blankAccountProxy follows the app-wide setting, with contacts and sign-in on
// the same route as the mail. The proxy fields hold the usual SOCKS5 default
// so switching to a custom proxy starts somewhere sensible.
export function blankAccountProxy(): AccountProxy {
  return {
    mode: 'global',
    scheme: 'socks5',
    host: '',
    port: 1080,
    username: '',
    password: '',
    hasPassword: false,
    contactsUseGlobal: false,
    oauthUseGlobal: false,
  }
}

type Route = Pick<ProxyConfig, 'mode' | 'scheme' | 'host' | 'port'>

// routeSummary names where a mailbox's connections go. A mailbox on the
// app-wide setting says what that setting is right now, so the editor never
// hides that mail is going through a proxy set somewhere else.
export function routeSummary(route: AccountProxy, global: ProxyConfig | null, tr: (key: string) => string): string {
  if (route.mode !== 'global') {
    return describe(route, tr)
  }
  const current = global ? describe(global, tr) : tr('mailboxes.route.summary.direct')
  return tr('mailboxes.route.summary.global').replace('{route}', current)
}

function describe(route: Route, tr: (key: string) => string): string {
  switch (route.mode) {
    case 'manual':
      return `${route.scheme === 'http' ? 'HTTP' : 'SOCKS5'} ${route.host}:${route.port}`
    case 'system':
      return tr('mailboxes.route.summary.system')
    default:
      return tr('mailboxes.route.summary.direct')
  }
}
