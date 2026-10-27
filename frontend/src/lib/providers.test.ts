import { describe, it, expect } from 'vitest'
import { providerPresets } from './providers'
import en from './locales/en'

// The QQ preset exists because QQ Mail cannot be reached with the account
// password: it needs the authorization code generated in the web settings, and
// its servers are on the conventional ports with implicit TLS on both legs.
describe('QQ Mail preset', () => {
  const qq = providerPresets.find((p) => p.id === 'qq')

  it('is offered in the wizard', () => {
    expect(qq).toBeDefined()
  })

  it('points at the QQ servers with implicit TLS on both legs', () => {
    expect(qq?.imapHost).toBe('imap.qq.com')
    expect(qq?.imapPort).toBe(993)
    expect(qq?.imapTls).toBe('ssl')
    expect(qq?.smtpHost).toBe('smtp.qq.com')
    expect(qq?.smtpPort).toBe(465)
    expect(qq?.smtpTls).toBe('ssl')
  })

  it('warns that the account password will not work and links to the code page', () => {
    expect(qq?.kind).toBe('password')
    expect(qq?.appPasswordKey).toBe('wizard.qq.appPasswordWarning')
    expect(qq?.appPasswordUrl).toContain('qq.com')
  })
})

// 163 and 126 are one service on two sets of hostnames, and they exist as
// presets for the same reason QQ does: NetEase refuses the account password, so
// the client has to use the authorization code from the web settings instead.
// The hosts differ per domain, so each is checked against its own rather than
// against a shared value.
describe('NetEase Mail presets (163 / 126)', () => {
  const mail163 = providerPresets.find((p) => p.id === '163')
  const mail126 = providerPresets.find((p) => p.id === '126')

  it('offers both in the wizard', () => {
    expect(mail163).toBeDefined()
    expect(mail126).toBeDefined()
  })

  it('points each at its own hostnames with implicit TLS on both legs', () => {
    expect(mail163?.imapHost).toBe('imap.163.com')
    expect(mail163?.imapPort).toBe(993)
    expect(mail163?.imapTls).toBe('ssl')
    expect(mail163?.smtpHost).toBe('smtp.163.com')
    expect(mail163?.smtpPort).toBe(465)
    expect(mail163?.smtpTls).toBe('ssl')

    expect(mail126?.imapHost).toBe('imap.126.com')
    expect(mail126?.imapPort).toBe(993)
    expect(mail126?.imapTls).toBe('ssl')
    expect(mail126?.smtpHost).toBe('smtp.126.com')
    expect(mail126?.smtpPort).toBe(465)
    expect(mail126?.smtpTls).toBe('ssl')
  })

  it('warns that the account password will not work and links to the code page', () => {
    for (const preset of [mail163, mail126]) {
      expect(preset?.kind).toBe('password')
      // one warning text for both: the reader does the same thing on either
      expect(preset?.appPasswordKey).toBe('wizard.netease.appPasswordWarning')
      expect(preset?.appPasswordLinkKey).toBe('wizard.netease.appPasswordLink')
      // the help centre that serves 163, 126 and yeah.net
      expect(preset?.appPasswordUrl).toContain('help.mail.163.com')
    }
  })
})

// China Mobile's 139 Mail is the third Chinese provider that refuses the
// account password. It is a service of its own rather than another hostname of
// NetEase's, so it carries its own warning text and its own help page, but the
// shape of the preset is the same: ordinary IMAP/SMTP, implicit TLS, the
// authorization code in the password field.
describe('139 Mail preset (China Mobile)', () => {
  const mail139 = providerPresets.find((p) => p.id === '139')

  it('is offered in the wizard', () => {
    expect(mail139).toBeDefined()
  })

  it('points at the 139 servers with implicit TLS on both legs', () => {
    expect(mail139?.imapHost).toBe('imap.139.com')
    expect(mail139?.imapPort).toBe(993)
    expect(mail139?.imapTls).toBe('ssl')
    expect(mail139?.smtpHost).toBe('smtp.139.com')
    expect(mail139?.smtpPort).toBe(465)
    expect(mail139?.smtpTls).toBe('ssl')
  })

  it('warns that the account password will not work and links to the code page', () => {
    expect(mail139?.kind).toBe('password')
    expect(mail139?.appPasswordKey).toBe('wizard.mobile139.appPasswordWarning')
    expect(mail139?.appPasswordLinkKey).toBe('wizard.mobile139.appPasswordLink')
    // China Mobile's own help centre, not NetEase's: a different provider with a
    // different page for turning the service on and generating the code.
    expect(mail139?.appPasswordUrl).toContain('help.mail.10086.cn')
  })
})

// Every preset's strings have to resolve through the catalog, or a translated
// build shows a raw key where a provider name belongs.
describe('provider preset labels', () => {
  it('every preset has a label key present in the catalog', () => {
    for (const preset of providerPresets) {
      expect(preset.labelKey, `${preset.id} labelKey`).toBeTruthy()
      expect(en[preset.labelKey], `${preset.id} labelKey not in catalog`).toBeTruthy()
    }
  })

  it('every note and app-password key is present in the catalog', () => {
    for (const preset of providerPresets) {
      if (preset.noteKey) {
        expect(en[preset.noteKey], `${preset.id} noteKey not in catalog`).toBeTruthy()
      }
      if (preset.appPasswordKey) {
        expect(en[preset.appPasswordKey], `${preset.id} appPasswordKey not in catalog`).toBeTruthy()
      }
      if (preset.appPasswordLinkKey) {
        expect(en[preset.appPasswordLinkKey], `${preset.id} appPasswordLinkKey not in catalog`).toBeTruthy()
      }
    }
  })

  it('has no leftover literal display text', () => {
    for (const preset of providerPresets) {
      expect(preset, `${preset.id} still carries a literal label`).not.toHaveProperty('label')
      expect(preset, `${preset.id} still carries a literal note`).not.toHaveProperty('note')
    }
  })
})
