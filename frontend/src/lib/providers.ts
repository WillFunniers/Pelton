// providers.ts holds the wizard's provider presets. each preset seeds the server
// settings and auth method so the user usually only types an address and signs
// in or enters a password. custom uses autodiscovery instead of fixed hosts.
//
// The user-visible strings are locale keys rather than literal text, resolved
// through $t() at the point of use, so a translated build does not show English
// here while the rest of the wizard is translated.

import type { TLSMode } from './types'

export type AuthKind = 'oauth' | 'password'

export interface ProviderPreset {
  id: string
  // labelKey is a key in the locale catalogs, not display text.
  labelKey: string
  kind: AuthKind
  // oauthProvider is the backend provider key for oauth presets.
  oauthProvider?: 'google' | 'microsoft'
  imapHost?: string
  imapPort?: number
  smtpHost?: string
  smtpPort?: number
  // the connection security each leg needs, stated rather than read back out of
  // the port. outlook and icloud submit over STARTTLS on 587 while the rest use
  // implicit TLS, and that is a fact about the provider, not about the number.
  imapTls?: TLSMode
  smtpTls?: TLSMode
  // noteKey is shown under the form (e.g. app-specific password guidance).
  noteKey?: string
  // appPasswordKey, when set, replaces the plain note with a warning box that
  // spells out that the provider's regular password will not work.
  appPasswordKey?: string
  // appPasswordLinkKey is the label of the link inside that warning, for a
  // provider whose instructions are not the generic "create an app password".
  appPasswordLinkKey?: string
  // appPasswordUrl links to where an app-specific password is generated.
  appPasswordUrl?: string
  // custom means "use autodiscovery and let the user edit servers".
  custom?: boolean
  // oauthOptional marks a password-first preset that can still switch to the
  // oauth sign-in form (for users who bring their own client id).
  oauthOptional?: boolean
  // allowClientSecret reveals an optional oauth client-secret field, for
  // providers whose app registration may be a confidential client.
  allowClientSecret?: boolean
  // requireClientSecret shows the client-secret field up front and requires
  // it: Google's token endpoint rejects a Desktop app client that omits it.
  requireClientSecret?: boolean
}

export const providerPresets: ProviderPreset[] = [
  {
    // password-first: an app password works today on consumer accounts with
    // no Google Cloud Console involved. oauth stays reachable behind
    // oauthOptional for users who registered their own client (#56).
    id: 'gmail',
    labelKey: 'wizard.provider.gmail',
    kind: 'password',
    oauthProvider: 'google',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapTls: 'ssl',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpTls: 'ssl',
    appPasswordUrl: 'https://myaccount.google.com/apppasswords',
    appPasswordKey: 'wizard.gmail.appPasswordWarning',
    oauthOptional: true,
    requireClientSecret: true,
  },
  {
    id: 'outlook',
    labelKey: 'wizard.provider.outlook',
    kind: 'oauth',
    oauthProvider: 'microsoft',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapTls: 'ssl',
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpTls: 'starttls',
    allowClientSecret: true,
  },
  {
    // QQ Mail. Both legs use implicit TLS on the conventional ports, and the
    // same hosts serve foxmail.com and a QQ number's own address, so one preset
    // covers them all.
    //
    // QQ refuses the account password: mail clients must sign in with the
    // 16-character "authorization code" generated in the web settings, which is
    // why this is a password preset carrying an app-password warning rather than
    // a plain note. The transport is ordinary IMAP/SMTP; the sent folder is
    // called "Sent Messages" and is found by name (see internal/imap/append.go).
    id: 'qq',
    labelKey: 'wizard.provider.qq',
    kind: 'password',
    imapHost: 'imap.qq.com',
    imapPort: 993,
    imapTls: 'ssl',
    smtpHost: 'smtp.qq.com',
    smtpPort: 465,
    smtpTls: 'ssl',
    appPasswordUrl: 'https://service.mail.qq.com/detail/0/75',
    appPasswordKey: 'wizard.qq.appPasswordWarning',
    appPasswordLinkKey: 'wizard.qq.appPasswordLink',
  },
  {
    // NetEase Mail, the other Chinese provider whose account password is refused.
    // 163 and 126 are one service on two sets of hostnames, and both need the
    // authorization code generated in the web settings after the IMAP/SMTP
    // service is switched on there. The transport is ordinary IMAP/SMTP.
    //
    // NetEase additionally refuses to let a client select a mailbox until it has
    // announced itself with the IMAP ID command, so a client that skips that step
    // syncs nothing on these hosts. internal/imap sends ID on every login, which
    // is why nothing here has to know about it; see internal/imap/id.go.
    //
    // Both presets wear the wizard's generic mail glyph: the icon set carries the
    // NetEase *music* brand and no mail mark for it, and the wrong product's logo
    // would be worse than none.
    id: '163',
    labelKey: 'wizard.provider.163',
    kind: 'password',
    imapHost: 'imap.163.com',
    imapPort: 993,
    imapTls: 'ssl',
    smtpHost: 'smtp.163.com',
    smtpPort: 465,
    smtpTls: 'ssl',
    appPasswordUrl: 'https://help.mail.163.com/faq.do?m=list&categoryID=90',
    appPasswordKey: 'wizard.netease.appPasswordWarning',
    appPasswordLinkKey: 'wizard.netease.appPasswordLink',
  },
  {
    // 126.com is the same service as 163 on its own hostnames, with its own web
    // settings and its own authorization codes. The two share one warning text
    // because the reader has to do exactly the same thing on either.
    id: '126',
    labelKey: 'wizard.provider.126',
    kind: 'password',
    imapHost: 'imap.126.com',
    imapPort: 993,
    imapTls: 'ssl',
    smtpHost: 'smtp.126.com',
    smtpPort: 465,
    smtpTls: 'ssl',
    appPasswordUrl: 'https://help.mail.163.com/faq.do?m=list&categoryID=90',
    appPasswordKey: 'wizard.netease.appPasswordWarning',
    appPasswordLinkKey: 'wizard.netease.appPasswordLink',
  },
  {
    // China Mobile's 139 Mail. Like NetEase it refuses the account password and
    // hands out an authorization code in the web settings instead, and like
    // NetEase it is ordinary IMAP/SMTP with implicit TLS on the conventional
    // ports. The 10086.cn names resolve to the same servers; 139.com is what the
    // address ends in, so that is the name the preset carries.
    //
    // The server announces ID and accepts it before login (measured 2026-09-27:
    // "a2 OK ID complete"), so the reason 163 needs internal/imap/id.go applies
    // here too. It advertises neither SPECIAL-USE nor LIST-EXTENDED, so the Sent
    // folder is resolved by name rather than by attribute; the Chinese names are
    // already in that fallback list (see internal/imap/append.go).
    id: '139',
    labelKey: 'wizard.provider.139',
    kind: 'password',
    imapHost: 'imap.139.com',
    imapPort: 993,
    imapTls: 'ssl',
    smtpHost: 'smtp.139.com',
    smtpPort: 465,
    smtpTls: 'ssl',
    appPasswordUrl: 'https://help.mail.10086.cn/statichtml/4/Top/837.html',
    appPasswordKey: 'wizard.mobile139.appPasswordWarning',
    appPasswordLinkKey: 'wizard.mobile139.appPasswordLink',
  },
  {
    id: 'icloud',
    labelKey: 'wizard.provider.icloud',
    kind: 'password',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapTls: 'ssl',
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpTls: 'starttls',
    appPasswordUrl: 'https://appleid.apple.com',
    appPasswordKey: 'wizard.icloud.appPasswordWarning',
  },
  {
    id: 'yahoo',
    labelKey: 'wizard.provider.yahoo',
    kind: 'password',
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    imapTls: 'ssl',
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    smtpTls: 'ssl',
    noteKey: 'wizard.provider.yahoo.note',
  },
  {
    id: 'fastmail',
    labelKey: 'wizard.provider.fastmail',
    kind: 'password',
    imapHost: 'imap.fastmail.com',
    imapPort: 993,
    imapTls: 'ssl',
    smtpHost: 'smtp.fastmail.com',
    smtpPort: 465,
    smtpTls: 'ssl',
    noteKey: 'wizard.provider.fastmail.note',
  },
  {
    id: 'purelymail',
    labelKey: 'wizard.provider.purelymail',
    kind: 'password',
    imapHost: 'imap.purelymail.com',
    imapPort: 993,
    imapTls: 'ssl',
    smtpHost: 'smtp.purelymail.com',
    smtpPort: 465,
    smtpTls: 'ssl',
    noteKey: 'wizard.provider.purelymail.note',
  },
  {
    id: 'custom',
    labelKey: 'wizard.provider.custom',
    kind: 'password',
    custom: true,
    noteKey: 'wizard.provider.custom.note',
  },
]
