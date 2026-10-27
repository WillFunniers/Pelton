// prefs.ts is the single store for user preferences (theme, accent, density and
// the per-row technical-info toggles). it loads them from the backend on startup,
// applies them to the dom, and persists every change back through the settings
// bindings. nothing here uses localStorage: the backend settings table is the
// source of truth.

import { writable } from 'svelte/store'
import type { UIPrefs, ThemePref, DensityPref, EditorMode, ViewsPlacement, CloseAction, LogLevel, SelectAllScope, SearchKind, SearchSortPref } from '../lib/types'
import { getUIPrefs, setSetting, SettingKeys, systemColorScheme, setWindowTheme, getThemeApply } from '../lib/api'
import { applyTheme, applyDensity, applyAccent, applyScale, applyReduceMotion, applyHandCursor, setThemeSchedule, applyUIFont, applyMonoFont, applyCorners, applyWallpaper, watchSystemTheme, setSystemSchemeOverride, resolveTheme } from '../theme/theme'
import { applyGlassAlphas, applyGlassBlur, glassAlphas } from '../theme/glass'
import { applyUserTheme } from '../theme/usertheme'
import { uiFontStack, monoFontStack } from '../lib/fonts'
import { setLocale } from '../lib/i18n'

// defaults match the backend defaults so the ui renders sanely even before the
// first load resolves.
const defaults: UIPrefs = {
  theme: 'system',
  accent: '#465AF2',
  density: 'medium',
  showMailboxBadge: true,
  showDateTime: true,
  showPgp: true,
  showAuth: true,
  toastPosition: 'bottom-right',
  paneLocked: false,
  sidebarWidth: 264,
  listWidth: 380,
  sendDelaySeconds: 0,
  flagHighlight: 'flag',
  showShortcutHints: true,
  harvestAddresses: true,
  showAccountEmail: false,
  alwaysLoadImages: false,
  blockTrackingPixels: false,
  avatarSource: 'bimi_gravatar',
  avatarStyle: 'initials',
  multiSelectEnabled: true,
  showSelectedCount: true,
  selectAllScope: 'offer',
  selectAllUnified: false,
  searchSortText: 'auto',
  searchSortDated: 'auto',
  searchSortFiltered: 'auto',
  sidebarIndentGuides: false,
  rowTemplate: 'relaxed',
  rowShowAvatar: true,
  rowShowSnippet: true,
  previewLines: 1,
  uiScale: '1',
  messageFontSize: 14,
  showFlaggedCount: true,
  viewsPlacement: 'hidden',
  flagColorSync: false,
  showOfflineIndicator: true,
  showUnsyncedFolder: true,
  restoreTabs: false,
  paletteProfiles: false,
  swipeEnabled: true,
  swipeLeftAction: 'delete',
  swipeRightAction: 'unread',
  composeVimMode: false,
  downloadIncludeAttachments: true,
  appVimMode: false,
  language: 'en',
  lowPowerMode: false,
  autoSyncIntervalSeconds: 900,
  defaultEditorMode: 'plaintext',
  composeAutocomplete: true,
  composeChips: true,
  updateCheckFrequency: 'off',
  emptyStateImage: '',
  emptyStateFullscreen: false,
  readingPaneImage: '',
  readingPaneImageOpacity: 20,
  readingPaneMaskBlur: 0,
  listGlassDensity: 50,
  listGlassBlur: 16,
  mailBackgroundTransmission: 30,
  cornerStyle: 'default',
  themeId: '',
  menuBarInApp: false,
  menuBarNativeMinimal: false,
  menuBarIcons: false,
  timeFormat: 'auto',
  reduceMotion: false,
  handCursor: false,
  unreadBadge: true,
  themeDarkStart: '19:00',
  themeDarkEnd: '07:00',
  bodyFont: 'default',
  senderFonts: true,
  uiFont: 'default',
  monoFont: 'default',
  notifyNewMail: false,
  verboseSync: false,
  syncProgressBar: true,
  statusClock: true,
  statusUnread: true,
  markReadOnOpen: true,
  signatureAboveQuote: false,
  closeAction: 'background',
  startHidden: false,
  syncMessageLimit: 50,
  syncAutoBackfill: true,
  startupSelection: 'view:inbox',
  logToFile: false,
  logLevel: 'info',
  logMessageMetadata: false,
  crashLogs: false,
}

export const prefs = writable<UIPrefs>(defaults)

// syncWindowChrome matches the native window chrome (the Windows caption bar) to
// the resolved theme so it does not stay light under a dark ui.
function syncWindowChrome(pref: ThemePref): void {
  setWindowTheme(resolveTheme(pref) === 'dark')
}

// syncGlass recomputes the window's glass: whether it is on at all, how solid
// each tier is, and how far the two reader-chosen sheets blur. It is derived
// state: there is no "glass" preference, because a wallpaper already says what
// the reader wants - asking them to also enable the look that goes with it would
// be one setting too many.
//
// It has to run on every path that can change any half of that (the image, its
// strength, the theme, either zoning slider), which is why it takes the
// preferences rather than reading them: a caller that just changed one of them
// updates the store immediately but has not yet written to it.
//
// Nothing here measures the picture any more. Which alphas the glass wore used to
// be decided by sampling the wallpaper's brightness and classifying it; the
// zoning sliders replaced that, so the same picture now renders the same way on
// every run and a slider move is the only thing that changes the answer.
function syncGlass(p: UIPrefs): void {
  const on = p.readingPaneImage !== '' && p.readingPaneImageOpacity > 0
  applyWallpaper(on)
  // the alphas and the radii are published whether or not a wallpaper is up: the
  // stylesheet gates them on data-wallpaper itself, so writing them always keeps
  // one state to reason about - and the values are already correct on the frame
  // the wallpaper appears rather than one frame later.
  applyGlassAlphas(glassAlphas(p.listGlassDensity))
  applyGlassBlur({ pane: p.readingPaneMaskBlur, list: p.listGlassBlur })
}

// applyAll pushes the current preferences onto the document.
function applyAll(p: UIPrefs): void {
  setThemeSchedule(p.themeDarkStart, p.themeDarkEnd)
  applyTheme(p.theme as ThemePref)
  syncWindowChrome(p.theme as ThemePref)
  applyDensity(p.density as DensityPref)
  applyAccent(p.accent)
  applyScale(p.uiScale)
  applyReduceMotion(p.reduceMotion)
  applyHandCursor(p.handCursor)
  applyUIFont(uiFontStack(p.uiFont))
  applyMonoFont(monoFontStack(p.monoFont))
  applyCorners(p.cornerStyle)
  // after applyTheme, which is what decides whether a wallpaper may hoist at all
  syncGlass(p)
  setLocale(p.language)
}

// initPrefs loads preferences, applies them, and keeps the theme in sync with
// the os while in system mode. call once at startup.
export async function initPrefs(): Promise<void> {
  const loaded = await getUIPrefs()
  prefs.set(loaded)

  // on Linux the css prefers-color-scheme query never reports the desktop dark
  // preference, so resolve it natively first; elsewhere this returns "" and the
  // media query is used. done before applyAll so the first paint is correct.
  try {
    const scheme = await systemColorScheme()
    if (scheme === 'dark' || scheme === 'light') {
      setSystemSchemeOverride(scheme)
    }
  } catch {
    // fall back to the media query
  }

  applyAll(loaded)

  // a persisted custom theme applies after the base prefs so its base wins.
  // a missing or broken theme folder falls back to the default silently; the
  // stored selection stays, so reinstalling the theme brings it back.
  if (loaded.themeId) {
    try {
      applyUserTheme(await getThemeApply(loaded.themeId))
    } catch {
      applyUserTheme(null)
    }
  }

  watchSystemTheme(() => {
    let current: UIPrefs = defaults
    prefs.subscribe((p) => (current = p))()
    // a custom theme pins its own base; the os scheme only matters without one.
    if (current.theme === 'system' && !current.themeId) {
      applyTheme('system')
      syncWindowChrome('system')
      // the os flipping the scheme can turn glass on or off under a wallpaper
      syncGlass(current)
    }
  })

  // the schedule mode flips at its window bounds without any external event:
  // re-evaluate once a minute and when the window regains focus (a timer that
  // slept through os suspend fires late, so the focus check covers wake).
  const reapplySchedule = (): void => {
    let current: UIPrefs = defaults
    prefs.subscribe((p) => (current = p))()
    if (current.theme === 'schedule' && !current.themeId) {
      applyTheme('schedule')
      syncWindowChrome('schedule')
      // crossing the schedule bound can turn glass on or off under a wallpaper
      syncGlass(current)
    }
  }
  setInterval(reapplySchedule, 60_000)
  window.addEventListener('focus', reapplySchedule)
}

// the setters below update the store, apply the change immediately, and persist
// it. they are fire-and-forget for persistence; a failed write only means the
// choice will not survive a restart, not that the ui should block.

export function setTheme(theme: ThemePref): void {
  prefs.update((p) => {
    // the theme is half of the glass decision, so re-evaluate it against the
    // preferences as they are about to be, not as they were
    const next = { ...p, theme }
    applyTheme(theme)
    syncGlass(next)
    return next
  })
  syncWindowChrome(theme)
  void setSetting(SettingKeys.theme, theme)
}

// setThemeId activates an installed custom theme ('' returns to the built-in
// default). It loads and applies the theme before persisting, so a broken
// theme folder surfaces as a rejection here instead of a half-applied ui.
export async function setThemeId(themeId: string): Promise<void> {
  let current: UIPrefs = defaults
  prefs.subscribe((p) => (current = p))()
  if (themeId) {
    applyUserTheme(await getThemeApply(themeId))
    syncWindowChrome(themeIdBase())
  } else {
    applyUserTheme(null)
    applyTheme(current.theme as ThemePref)
    syncWindowChrome(current.theme as ThemePref)
  }
  // a custom theme pins its own light/dark base, so switching to or from one can
  // change whether the glass surfaces apply at all
  syncGlass(current)
  prefs.update((p) => ({ ...p, themeId }))
  void setSetting(SettingKeys.themeId, themeId)
}

// themeIdBase reads the base the injected theme pinned on the root element,
// so the native window chrome can follow it.
function themeIdBase(): 'light' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

// setCornerStyle picks the corner radius look and applies it immediately.
export function setCornerStyle(value: string): void {
  prefs.update((p) => ({ ...p, cornerStyle: value }))
  applyCorners(value)
  void setSetting(SettingKeys.cornerStyle, value)
}

export function setDensity(density: DensityPref): void {
  prefs.update((p) => ({ ...p, density }))
  applyDensity(density)
  void setSetting(SettingKeys.density, density)
}

// setUIScale zooms the whole interface and persists the multiplier.
export function setUIScale(scale: string): void {
  prefs.update((p) => ({ ...p, uiScale: scale }))
  applyScale(scale)
  void setSetting(SettingKeys.uiScale, scale)
}

// setMessageFontSize sets the base font size (px) for rendered email content.
export function setMessageFontSize(size: number): void {
  prefs.update((p) => ({ ...p, messageFontSize: size }))
  void setSetting(SettingKeys.messageFontSize, String(size))
}

// setShowFlaggedCount toggles the count and bold styling on the sidebar Flagged
// view (the entry itself always stays).
export function setShowFlaggedCount(value: boolean): void {
  prefs.update((p) => ({ ...p, showFlaggedCount: value }))
  void setSetting(SettingKeys.showFlaggedCount, String(value))
}

// setViewsPlacement controls how saved Views are surfaced: hidden, sidebar or tab.
export function setViewsPlacement(value: ViewsPlacement): void {
  prefs.update((p) => ({ ...p, viewsPlacement: value }))
  void setSetting(SettingKeys.viewsPlacement, value)
}

// setFlagColorSync toggles pushing color labels to the server as imap keywords.
export function setFlagColorSync(value: boolean): void {
  prefs.update((p) => ({ ...p, flagColorSync: value }))
  void setSetting(SettingKeys.flagColorSync, String(value))
}

// setNotifyNewMail toggles native OS notifications for new inbox mail. VIP
// senders still notify when this is off.
export function setNotifyNewMail(value: boolean): void {
  prefs.update((p) => ({ ...p, notifyNewMail: value }))
  void setSetting(SettingKeys.notifyNewMail, String(value))
}

// setShowOfflineIndicator toggles the little downloaded badge on pinned messages.
export function setShowOfflineIndicator(value: boolean): void {
  prefs.update((p) => ({ ...p, showOfflineIndicator: value }))
  void setSetting(SettingKeys.showOfflineIndicator, String(value))
}

// setShowUnsyncedFolder toggles the marker on folders excluded from sync.
export function setShowUnsyncedFolder(value: boolean): void {
  prefs.update((p) => ({ ...p, showUnsyncedFolder: value }))
  void setSetting(SettingKeys.showUnsyncedFolder, String(value))
}

// setRestoreTabs toggles bringing the reading-pane tabs back at launch.
export function setRestoreTabs(value: boolean): void {
  prefs.update((p) => ({ ...p, restoreTabs: value }))
  void setSetting(SettingKeys.restoreTabs, String(value))
}

// setPaletteProfiles toggles listing profiles directly in the command palette.
export function setPaletteProfiles(value: boolean): void {
  prefs.update((p) => ({ ...p, paletteProfiles: value }))
  void setSetting(SettingKeys.paletteProfiles, String(value))
}

// setSwipeEnabled toggles trackpad swipe gestures on message rows.
export function setSwipeEnabled(value: boolean): void {
  prefs.update((p) => ({ ...p, swipeEnabled: value }))
  void setSetting(SettingKeys.swipeEnabled, String(value))
}

// the settings key each kind of search remembers its sort order under (#404).
const searchSortKeys: Record<SearchKind, string> = {
  text: SettingKeys.searchSortText,
  dated: SettingKeys.searchSortDated,
  filtered: SettingKeys.searchSortFiltered,
}

// setSearchSort remembers a sort order for one kind of search. Picking an order
// while looking at a date range is a statement about date ranges, so it is
// stored against that kind rather than becoming the order for every search.
export function setSearchSort(kind: SearchKind, pref: SearchSortPref): void {
  prefs.update((p) => {
    if (kind === 'text') {
      return { ...p, searchSortText: pref }
    }
    if (kind === 'dated') {
      return { ...p, searchSortDated: pref }
    }
    return { ...p, searchSortFiltered: pref }
  })
  void setSetting(searchSortKeys[kind], pref)
}

// searchSortPref reads back what a kind of search is set to.
export function searchSortPref(p: UIPrefs, kind: SearchKind): SearchSortPref {
  if (kind === 'text') {
    return p.searchSortText
  }
  return kind === 'dated' ? p.searchSortDated : p.searchSortFiltered
}

// setSwipeLeftAction / setSwipeRightAction pick what each swipe direction does.
export function setSwipeLeftAction(action: string): void {
  prefs.update((p) => ({ ...p, swipeLeftAction: action }))
  void setSetting(SettingKeys.swipeLeftAction, action)
}

export function setSwipeRightAction(action: string): void {
  prefs.update((p) => ({ ...p, swipeRightAction: action }))
  void setSetting(SettingKeys.swipeRightAction, action)
}

// setComposeVimMode toggles vim keybindings in the compose editor.
export function setComposeVimMode(value: boolean): void {
  prefs.update((p) => ({ ...p, composeVimMode: value }))
  void setSetting(SettingKeys.composeVimMode, String(value))
}

// setDownloadIncludeAttachments remembers the range-download attachment choice.
export function setDownloadIncludeAttachments(value: boolean): void {
  prefs.update((p) => ({ ...p, downloadIncludeAttachments: value }))
  void setSetting(SettingKeys.downloadIncludeAttachments, String(value))
}

// setAppVimMode toggles global vim-style navigation of the app window.
export function setAppVimMode(value: boolean): void {
  prefs.update((p) => ({ ...p, appVimMode: value }))
  void setSetting(SettingKeys.appVimMode, String(value))
}

// setLanguage persists the chosen ui language and applies it immediately.
// The value is a built-in code or "user:<id>" for a custom language file.
export function setLanguage(language: string): void {
  prefs.update((p) => ({ ...p, language }))
  setLocale(language)
  void setSetting(SettingKeys.language, language)
}

// setLowPowerMode toggles pausing periodic auto-sync, bulk downloads and
// address-book rescans.
export function setLowPowerMode(value: boolean): void {
  prefs.update((p) => ({ ...p, lowPowerMode: value }))
  void setSetting(SettingKeys.lowPowerMode, String(value))
}

// setDefaultEditorMode sets the editor a new compose session starts in.
export function setDefaultEditorMode(mode: EditorMode): void {
  prefs.update((p) => ({ ...p, defaultEditorMode: mode }))
  void setSetting(SettingKeys.defaultEditorMode, mode)
}

// setComposeAutocomplete toggles address-book suggestions while typing a
// recipient.
export function setComposeAutocomplete(value: boolean): void {
  prefs.update((p) => ({ ...p, composeAutocomplete: value }))
  void setSetting(SettingKeys.composeAutocomplete, String(value))
}

// setComposeChips toggles rendering recipients as removable chips versus a
// plain comma-separated text field.
export function setComposeChips(value: boolean): void {
  prefs.update((p) => ({ ...p, composeChips: value }))
  void setSetting(SettingKeys.composeChips, String(value))
}

// setUpdateCheckFrequency persists how often the app checks GitHub releases
// for a newer version: 'off', 'startup', 'weekly', or 'monthly'.
export function setUpdateCheckFrequency(value: string): void {
  prefs.update((p) => ({ ...p, updateCheckFrequency: value }))
  void setSetting(SettingKeys.updateCheckFrequency, value)
}

// setEmptyStateImage persists the reading-pane empty-state image as a data uri;
// an empty string restores the bundled Pelton logo.
export function setEmptyStateImage(value: string): void {
  prefs.update((p) => ({ ...p, emptyStateImage: value }))
  void setSetting(SettingKeys.emptyStateImage, value)
}

// setEmptyStateFullscreen toggles showing the empty-state image as a full-bleed
// cover background instead of a small centered mark.
export function setEmptyStateFullscreen(value: boolean): void {
  prefs.update((p) => ({ ...p, emptyStateFullscreen: value }))
  void setSetting(SettingKeys.emptyStateFullscreen, String(value))
}

// setReadingPaneImage persists the reading-pane wallpaper as a data uri, so the
// image is read from the user's own disk and never fetched over the network.
// An empty string clears it.
export function setReadingPaneImage(value: string): void {
  prefs.update((p) => {
    const next = { ...p, readingPaneImage: value }
    syncGlass(next)
    return next
  })
  void setSetting(SettingKeys.readingPaneImage, value)
}

// setReadingPaneImageOpacity sets the reading pane's background density: the
// strength of the wallpaper the pane sits on, in percent, clamped to 0-100 so a
// bad value can never make the pane unreadable or the style invalid.
//
// This is the zoning slider the settings screen labels "reading pane background
// density", and the setting behind it is the one the window has always had: the
// value a reader chose before the zoning existed is exactly the value this
// controls now, so nothing had to be migrated for it.
export function setReadingPaneImageOpacity(value: number): void {
  const clamped = Math.min(100, Math.max(0, Math.round(value)))
  prefs.update((p) => {
    // opacity 0 means the wallpaper is not showing, so it also turns glass off
    const next = { ...p, readingPaneImageOpacity: clamped }
    syncGlass(next)
    return next
  })
  void setSetting(SettingKeys.readingPaneImageOpacity, String(clamped))
}

// setReadingPaneMaskBlur sets the radius, in px, of the mask the reading pane
// draws between the wallpaper and the message. The range is the one the slider
// offers, and the value is rounded to whole pixels because the radius reaches the
// stylesheet as a literal `blur(Npx)`.
export function setReadingPaneMaskBlur(value: number): void {
  const clamped = Math.min(24, Math.max(0, Math.round(value)))
  prefs.update((p) => {
    const next = { ...p, readingPaneMaskBlur: clamped }
    syncGlass(next)
    return next
  })
  void setSetting(SettingKeys.readingPaneMaskBlur, String(clamped))
}

// setListGlassDensity sets how solid the message list's glass is, in percent.
// The sidebar's own sheet and the chrome tiers are derived from it (theme/glass),
// so this one value moves the whole window's hierarchy together.
export function setListGlassDensity(value: number): void {
  const clamped = Math.min(100, Math.max(0, Math.round(value)))
  prefs.update((p) => {
    const next = { ...p, listGlassDensity: clamped }
    syncGlass(next)
    return next
  })
  void setSetting(SettingKeys.listGlassDensity, String(clamped))
}

// setListGlassBlur sets the blur radius, in px, of the list's glass. The sidebar
// follows it; the menu and status bars keep their own, shallower radius.
export function setListGlassBlur(value: number): void {
  const clamped = Math.min(40, Math.max(0, Math.round(value)))
  prefs.update((p) => {
    const next = { ...p, listGlassBlur: clamped }
    syncGlass(next)
    return next
  })
  void setSetting(SettingKeys.listGlassBlur, String(clamped))
}

// setMailBackgroundTransmission sets how much wallpaper shows through an html
// message's own light background, in percent, clamped to 0-100 so a bad value
// cannot make the sender's background invalid.
//
// It stays a setting of the reading pane's zone rather than becoming an alias of
// the pane's density: the two answer different questions there. The density is
// how strong the picture is where nothing covers it, and this is how much of it
// survives under the light panels most mail is built from. The settings screen
// says so in as many words.
export function setMailBackgroundTransmission(value: number): void {
  const clamped = Math.min(100, Math.max(0, Math.round(value)))
  prefs.update((p) => ({ ...p, mailBackgroundTransmission: clamped }))
  void setSetting(SettingKeys.mailBackgroundTransmission, String(clamped))
}

// setAutoSyncInterval persists how often a full sync pass runs, in seconds (0
// disables it).
export function setAutoSyncInterval(seconds: number): void {
  prefs.update((p) => ({ ...p, autoSyncIntervalSeconds: seconds }))
  void setSetting(SettingKeys.autoSyncIntervalSeconds, String(seconds))
}

export function setAccent(accent: string): void {
  prefs.update((p) => ({ ...p, accent }))
  applyAccent(accent)
  void setSetting(SettingKeys.accent, accent)
}

// setBodyFont picks the reader fallback font for mail bodies.
export function setBodyFont(value: string): void {
  prefs.update((p) => ({ ...p, bodyFont: value }))
  void setSetting(SettingKeys.bodyFont, value)
}

// setSenderFonts decides whether a message may use the fonts it asks for. Off,
// everything renders in the reader font above. Takes effect on the next message
// opened, since the sanitizing happens backend-side.
export function setSenderFonts(value: boolean): void {
  prefs.update((p) => ({ ...p, senderFonts: value }))
  void setSetting(SettingKeys.senderFonts, String(value))
}

// setThemeDarkTimes updates the schedule mode's dark window and reapplies the
// theme immediately when that mode is active.
export function setThemeDarkTimes(start: string, end: string): void {
  prefs.update((p) => ({ ...p, themeDarkStart: start, themeDarkEnd: end }))
  setThemeSchedule(start, end)
  let current: UIPrefs = defaults
  prefs.subscribe((p) => (current = p))()
  if (current.theme === 'schedule' && !current.themeId) {
    applyTheme('schedule')
    syncWindowChrome('schedule')
  }
  void setSetting(SettingKeys.themeDarkStart, start)
  void setSetting(SettingKeys.themeDarkEnd, end)
}

// setMenuBarInApp shows the in-app menu bar on macOS. setMenuBarNativeMinimal
// reduces the native macOS menu to the app menu while the in-app bar is on;
// the backend rebuilds the native menu when either setting is written.
export function setMenuBarInApp(value: boolean): void {
  prefs.update((p) => ({ ...p, menuBarInApp: value }))
  void setSetting(SettingKeys.menuBarInApp, String(value))
}

export function setMenuBarNativeMinimal(value: boolean): void {
  prefs.update((p) => ({ ...p, menuBarNativeMinimal: value }))
  void setSetting(SettingKeys.menuBarNativeMinimal, String(value))
}

// setMenuBarIcons toggles icons in the in-app menu bar's dropdowns.
export function setMenuBarIcons(value: boolean): void {
  prefs.update((p) => ({ ...p, menuBarIcons: value }))
  void setSetting(SettingKeys.menuBarIcons, String(value))
}

// setTimeFormat picks the clock for rendered times: 'auto' (locale), '12', '24'.
export function setTimeFormat(value: string): void {
  prefs.update((p) => ({ ...p, timeFormat: value }))
  void setSetting(SettingKeys.timeFormat, value)
}

// setReduceMotion toggles the ui transition/animation kill switch.
export function setReduceMotion(value: boolean): void {
  prefs.update((p) => ({ ...p, reduceMotion: value }))
  applyReduceMotion(value)
  void setSetting(SettingKeys.reduceMotion, String(value))
}

// setHandCursor switches clickable chrome between the native arrow and the
// browser hand.
export function setHandCursor(value: boolean): void {
  prefs.update((p) => ({ ...p, handCursor: value }))
  applyHandCursor(value)
  void setSetting(SettingKeys.handCursor, String(value))
}

// setUnreadBadgeEnabled toggles the unread badge on the dock or tray icon. The backend
// re-applies or clears the badge itself when this setting lands.
export function setUnreadBadgeEnabled(value: boolean): void {
  prefs.update((p) => ({ ...p, unreadBadge: value }))
  void setSetting(SettingKeys.unreadBadge, String(value))
}

// setUIFont / setMonoFont override the interface and monospace font tokens,
// applying live like the other appearance settings.
export function setUIFont(value: string): void {
  prefs.update((p) => ({ ...p, uiFont: value }))
  applyUIFont(uiFontStack(value))
  void setSetting(SettingKeys.uiFont, value)
}

export function setMonoFont(value: string): void {
  prefs.update((p) => ({ ...p, monoFont: value }))
  applyMonoFont(monoFontStack(value))
  void setSetting(SettingKeys.monoFont, value)
}

// setVerboseSync toggles surfacing the currently-syncing mailbox in the status
// line.
export function setVerboseSync(value: boolean): void {
  prefs.update((p) => ({ ...p, verboseSync: value }))
  void setSetting(SettingKeys.verboseSync, String(value))
}

// setSyncProgressBar toggles the progress bar in the status line. It covers
// backfills as well as syncs, since scrolling into older mail is the other
// place you sit and wait.
export function setSyncProgressBar(value: boolean): void {
  prefs.update((p) => ({ ...p, syncProgressBar: value }))
  void setSetting(SettingKeys.syncProgressBar, String(value))
}

// setStatusClock shows or hides the date and time in the status bar.
export function setStatusClock(value: boolean): void {
  prefs.update((p) => ({ ...p, statusClock: value }))
  void setSetting(SettingKeys.statusClock, String(value))
}

// setStatusUnread shows or hides the unread count in the status bar.
export function setStatusUnread(value: boolean): void {
  prefs.update((p) => ({ ...p, statusUnread: value }))
  void setSetting(SettingKeys.statusUnread, String(value))
}

// setMarkReadOnOpen picks whether opening a message marks it read.
export function setMarkReadOnOpen(value: boolean): void {
  prefs.update((p) => ({ ...p, markReadOnOpen: value }))
  void setSetting(SettingKeys.markReadOnOpen, String(value))
}

// setSignatureAboveQuote picks whether a reply's footer goes above the quote.
export function setSignatureAboveQuote(value: boolean): void {
  prefs.update((p) => ({ ...p, signatureAboveQuote: value }))
  void setSetting(SettingKeys.signatureAboveQuote, String(value))
}

// setCloseAction picks what the window's close button does. The backend reads
// the setting on each close, so the change takes effect without a restart.
export function setCloseAction(value: CloseAction): void {
  prefs.update((p) => ({ ...p, closeAction: value }))
  void setSetting(SettingKeys.closeAction, value)
}

// setStartHidden picks whether Pelton launches with its window hidden.
export function setStartHidden(value: boolean): void {
  prefs.update((p) => ({ ...p, startHidden: value }))
  void setSetting(SettingKeys.startHidden, String(value))
}

// setSyncMessageLimit caps how many of a folder's newest messages a first sync
// fetches. It only applies to folders that have not synced yet, so lowering it
// never discards mail that is already cached.
export function setSyncMessageLimit(value: number): void {
  prefs.update((p) => ({ ...p, syncMessageLimit: value }))
  void setSetting(SettingKeys.syncMessageLimit, String(value))
}

// setSyncAutoBackfill toggles fetching the next batch of older mail
// automatically on reaching the end of the list, as opposed to on a button.
export function setSyncAutoBackfill(value: boolean): void {
  prefs.update((p) => ({ ...p, syncAutoBackfill: value }))
  void setSetting(SettingKeys.syncAutoBackfill, String(value))
}

// toggle keys map a boolean preference to its setting key so setToggle stays
// generic over the four technical-info switches.
type ToggleKey = 'showMailboxBadge' | 'showDateTime' | 'showPgp' | 'showAuth'

const toggleSettingKey: Record<ToggleKey, string> = {
  showMailboxBadge: SettingKeys.showMailboxBadge,
  showDateTime: SettingKeys.showDateTime,
  showPgp: SettingKeys.showPgp,
  showAuth: SettingKeys.showAuth,
}

export function setToggle(key: ToggleKey, value: boolean): void {
  prefs.update((p) => ({ ...p, [key]: value }))
  void setSetting(toggleSettingKey[key], String(value))
}

export function setToastPosition(position: string): void {
  prefs.update((p) => ({ ...p, toastPosition: position }))
  void setSetting(SettingKeys.toastPosition, position)
}

// setSendDelay persists the undo-send window in seconds (0 disables it).
export function setSendDelay(seconds: number): void {
  prefs.update((p) => ({ ...p, sendDelaySeconds: seconds }))
  void setSetting(SettingKeys.sendDelay, String(seconds))
}

// setFlagHighlight persists how flagged rows are highlighted.
export function setFlagHighlight(style: string): void {
  prefs.update((p) => ({ ...p, flagHighlight: style }))
  void setSetting(SettingKeys.flagHighlight, style)
}

// setShortcutHints toggles the inline keyboard shortcut chips.
export function setShortcutHints(value: boolean): void {
  prefs.update((p) => ({ ...p, showShortcutHints: value }))
  void setSetting(SettingKeys.shortcutHints, String(value))
}

// setHarvestAddresses toggles learning addresses from mail for autocomplete.
// Off, only contacts from a synced address book are offered.
export function setHarvestAddresses(value: boolean): void {
  prefs.update((p) => ({ ...p, harvestAddresses: value }))
  void setSetting(SettingKeys.harvestAddresses, String(value))
}

// setShowAccountEmail toggles showing the account email instead of its name.
export function setShowAccountEmail(value: boolean): void {
  prefs.update((p) => ({ ...p, showAccountEmail: value }))
  void setSetting(SettingKeys.accountEmail, String(value))
}

// setAlwaysLoadImages toggles the global remote-image override. the settings ui
// guards enabling it with a tracking warning.
export function setAlwaysLoadImages(value: boolean): void {
  prefs.update((p) => ({ ...p, alwaysLoadImages: value }))
  void setSetting(SettingKeys.alwaysLoadImages, String(value))
}

// setBlockTrackingPixels keeps images that look like tracking pixels blocked
// even once the rest of a message's remote content is loaded. Off by default,
// because the detection is a heuristic that will sometimes be wrong; each load
// button offers to load them anyway when it is.
export function setBlockTrackingPixels(value: boolean): void {
  prefs.update((p) => ({ ...p, blockTrackingPixels: value }))
  void setSetting(SettingKeys.blockTrackingPixels, String(value))
}

// setAvatarSource selects the sender-photo fallback chain (bimi_gravatar,
// gravatar_bimi, pfp).
export function setAvatarSource(source: string): void {
  prefs.update((p) => ({ ...p, avatarSource: source }))
  void setSetting(SettingKeys.avatarSource, source)
}

// setAvatarStyle selects the generated placeholder look (initials, mono, pixel,
// geometric).
export function setAvatarStyle(style: string): void {
  prefs.update((p) => ({ ...p, avatarStyle: style }))
  void setSetting(SettingKeys.avatarStyle, style)
}

// setMultiSelectEnabled toggles whether several rows can be selected at once.
export function setMultiSelectEnabled(value: boolean): void {
  prefs.update((p) => ({ ...p, multiSelectEnabled: value }))
  void setSetting(SettingKeys.multiSelectEnabled, String(value))
}

// setShowSelectedCount toggles the "N selected" count text in the selection bar.
export function setShowSelectedCount(value: boolean): void {
  prefs.update((p) => ({ ...p, showSelectedCount: value }))
  void setSetting(SettingKeys.showSelectedCount, String(value))
}

// setSelectAllScope picks how far select-all reaches.
export function setSelectAllScope(value: SelectAllScope): void {
  prefs.update((p) => ({ ...p, selectAllScope: value }))
  void setSetting(SettingKeys.selectAllScope, value)
}

// setSelectAllUnified offers select-all in the unified views as well.
export function setSelectAllUnified(value: boolean): void {
  prefs.update((p) => ({ ...p, selectAllUnified: value }))
  void setSetting(SettingKeys.selectAllUnified, String(value))
}

// setStartupSelection picks what the sidebar opens on at launch: 'view:<key>',
// 'folder:<id>', or 'last' to restore the previous session. Read once at
// startup, so the change takes effect on the next launch.
export function setStartupSelection(value: string): void {
  prefs.update((p) => ({ ...p, startupSelection: value }))
  void setSetting(SettingKeys.startupSelection, value)
}

// setLogToFile turns the rotating log file on or off. Off stops writing but
// leaves what is already on disk; deleting it is a separate, explicit action.
export function setLogToFile(value: boolean): void {
  prefs.update((p) => ({ ...p, logToFile: value }))
  void setSetting(SettingKeys.logToFile, String(value))
}

// setLogLevel picks how much detail the log records.
export function setLogLevel(value: LogLevel): void {
  prefs.update((p) => ({ ...p, logLevel: value }))
  void setSetting(SettingKeys.logLevel, value)
}

// setLogMessageMetadata allows subjects and senders into the log for debugging
// sync. Its own opt-in, since it is the one logging switch that writes anything
// about the user's mail.
export function setLogMessageMetadata(value: boolean): void {
  prefs.update((p) => ({ ...p, logMessageMetadata: value }))
  void setSetting(SettingKeys.logMessageMetadata, String(value))
}

// setCrashLogs toggles leaving a file with the stack behind when Pelton
// crashes.
export function setCrashLogs(value: boolean): void {
  prefs.update((p) => ({ ...p, crashLogs: value }))
  void setSetting(SettingKeys.crashLogs, String(value))
}

// setSidebarIndentGuides toggles the nested-folder guide lines.
export function setSidebarIndentGuides(value: boolean): void {
  prefs.update((p) => ({ ...p, sidebarIndentGuides: value }))
  void setSetting(SettingKeys.sidebarIndentGuides, String(value))
}

// setRowTemplate selects the message-list row layout.
export function setRowTemplate(template: string): void {
  prefs.update((p) => ({ ...p, rowTemplate: template }))
  void setSetting(SettingKeys.rowTemplate, template)
}

// setRowShowAvatar / setRowShowSnippet are per-field overrides on the template.
export function setRowShowAvatar(value: boolean): void {
  prefs.update((p) => ({ ...p, rowShowAvatar: value }))
  void setSetting(SettingKeys.rowShowAvatar, String(value))
}

export function setRowShowSnippet(value: boolean): void {
  prefs.update((p) => ({ ...p, rowShowSnippet: value }))
  void setSetting(SettingKeys.rowShowSnippet, String(value))
}

// setPreviewLines clamps the snippet to 1..3 lines.
export function setPreviewLines(lines: number): void {
  const clamped = Math.max(1, Math.min(3, Math.round(lines)))
  prefs.update((p) => ({ ...p, previewLines: clamped }))
  void setSetting(SettingKeys.previewLines, String(clamped))
}

export function setPaneLocked(locked: boolean): void {
  prefs.update((p) => ({ ...p, paneLocked: locked }))
  void setSetting(SettingKeys.paneLocked, String(locked))
}

// setPaneWidths persists the two resizable column widths. it is called as the
// user finishes dragging a divider, not on every pixel, to avoid hammering the
// settings table.
export function setPaneWidths(sidebarWidth: number, listWidth: number): void {
  prefs.update((p) => ({ ...p, sidebarWidth, listWidth }))
  void setSetting(SettingKeys.sidebarWidth, String(Math.round(sidebarWidth)))
  void setSetting(SettingKeys.listWidth, String(Math.round(listWidth)))
}
