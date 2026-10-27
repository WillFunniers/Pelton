// liability.ts records that the user has seen the warranty and liability
// notice. the acknowledgement is stored as a single setting holding the terms
// wording that was shown, the app version and the moment it was given, so the
// notice is shown again after a change to the terms without asking twice for
// the same wording.

import { getSetting, setSetting, SettingKeys, appVersion } from './api'
import { get } from 'svelte/store'
import { locale } from './i18n'

/**
 * the published date of the terms this build shows. bump it whenever the
 * wording at pelton.app/terms changes, which asks everyone to read the new
 * version once.
 */
export const termsVersion = '2026-09-22'

/** a recorded acknowledgement of the warranty and liability notice. */
export interface LiabilityAck {
  /** the terms wording that was acknowledged, as termsVersion. */
  terms?: string
  /** app version the notice was accepted in. */
  version: string
  /** ISO timestamp of the acceptance. */
  at: string
}

/**
 * liabilityAccepted reports whether the current terms have already been
 * accepted. an acknowledgement of older wording does not count, so a change to
 * the terms brings the notice back. a failed lookup counts as accepted so a
 * broken settings read never locks the user out of their mail.
 */
export async function liabilityAccepted(): Promise<boolean> {
  try {
    const r = await getSetting(SettingKeys.liabilityAccepted)
    if (!r.found || r.value === '') return false
    return acceptedTerms(r.value) === termsVersion
  } catch {
    return true
  }
}

/**
 * acceptedTerms reads the terms wording out of a stored acknowledgement.
 * anything this cannot parse, including the acknowledgements written before the
 * terms were versioned, reads as unknown and therefore asks again.
 */
function acceptedTerms(raw: string): string | undefined {
  try {
    const ack = JSON.parse(raw) as LiabilityAck
    return typeof ack?.terms === 'string' ? ack.terms : undefined
  } catch {
    return undefined
  }
}

/** acceptLiability records the acknowledgement with the current version. */
export async function acceptLiability(): Promise<void> {
  let version = ''
  try {
    version = await appVersion()
  } catch {
    version = ''
  }
  const ack: LiabilityAck = { terms: termsVersion, version, at: new Date().toISOString() }
  await setSetting(SettingKeys.liabilityAccepted, JSON.stringify(ack))
}

/** termsUrl returns the terms page in the user's language. */
export function termsUrl(): string {
  return get(locale) === 'de' ? 'https://pelton.app/terms/de' : 'https://pelton.app/terms'
}
