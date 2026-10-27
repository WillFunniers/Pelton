<script lang="ts">
  // renders the message body. html mail goes into a sandboxed iframe, as
  // defense in depth on top of the backend sanitization: a strict CSP allows
  // exactly one nonce-scoped inline script (Pelton's own click handler, built
  // fresh per render - see buildSrcdoc), so nothing from the email itself can
  // ever execute even though the sandbox now permits scripts to run at all.
  // plaintext renders in the mono font, with bare urls linkified. remote
  // images are blocked by the backend by default; a per-message affordance
  // asks the backend to re-render with remote content allowed.
  import { onDestroy, onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { BrowserOpenURL } from '../../../wailsjs/runtime/runtime'
  import { IconPhoto, IconUserCheck, IconWorldCheck, IconMailCheck, IconShieldSearch, IconChevronDown, IconEyeOff, IconMailOff } from '@tabler/icons-svelte'
  import { prefs } from '../../stores/prefs'
  import { getMessageHtml, trustSenderImages, allowDomainImages, allowRemoteForMessage, scanUrl } from '../../lib/api'
  import { setBodyHtml } from '../../stores/message'
  import { openContextMenu } from '../../stores/contextmenu'
  import { virusTotal, linkVerdicts, putLinkVerdict, scanEnabled } from '../../stores/virustotal'
  import VerdictBadge from '../common/VerdictBadge.svelte'
  import EmptyState from '../common/EmptyState.svelte'
  import { errorMessage, toastError, toastSuccess } from '../../stores/toast'
  import { displayName, linkifySegments } from '../../lib/format'
  import { planBody, hasVisibleContent } from '../../lib/mailbody'
  import { mailPalette, type MailPalette } from '../../lib/mailpalette'
  import { documentColors } from '../../lib/maildoc'
  import { bodyFontStack } from '../../lib/fonts'
  import { frameKeyRelay, relayedKey, replayKey } from '../../lib/framekeys'
  import { t } from '../../lib/i18n'
  import type { MessageDetail, Verdict } from '../../lib/types'

  export let detail: MessageDetail

  $: canScan = scanEnabled($virusTotal)

  // remoteLoaded starts true when the backend already rendered remote content
  // because the sender/domain is trusted (or the global override is on).
  let remoteLoaded = detail.remoteAllowed

  // reset the remote-loaded affordance when a different message opens.
  let lastId = -1
  $: if (detail.id !== lastId) {
    lastId = detail.id
    remoteLoaded = detail.remoteAllowed
    frameHeight = 320
  }

  $: senderLabel = displayName(detail.fromName, detail.fromAddress)
  $: senderDomain = detail.fromAddress.includes('@') ? detail.fromAddress.split('@').pop() : ''

  // The reading iframe cannot see the parent stylesheet, so everything it needs
  // from the theme is read off the root element and written into the srcdoc. The
  // resolved theme is read from the attribute rather than derived from the
  // preference, because the preference alone does not say what is on screen:
  // "system" and "schedule" resolve to a concrete scheme elsewhere (theme.ts),
  // and that resolution can change with no preference change at all.
  //
  // The palette is the theme tokens themselves (see lib/mailpalette.ts), and it
  // has to be re-read whenever a token could have changed - not only when
  // data-theme does. A custom theme is an injected style element that overrides
  // the tokens, so pointing the app at a different custom theme can leave
  // data-theme exactly as it was while every colour in the window changes; a
  // message rendered from the previous palette would then be the one part of the
  // window that visibly did not follow. A stylesheet arriving or leaving is
  // likewise the only signal for the theme editor's live preview.
  let palette = mailPalette(false, () => '')
  let themeObserver: MutationObserver | undefined

  onMount(() => {
    const read = (): void => {
      const root = document.documentElement
      const dark = root.getAttribute('data-theme') === 'dark'
      // read a resolved token value: the iframe document cannot see the parent
      // stylesheet, so every theme value it needs is read here and written into
      // the srcdoc instead
      const readToken = (token: string): string => getComputedStyle(root).getPropertyValue(token).trim()
      palette = mailPalette(dark, readToken)
    }
    read()
    themeObserver = new MutationObserver(read)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    themeObserver.observe(document.head, { childList: true })
  })

  // buildSrcdoc wraps the already-sanitized body in a minimal document. the
  // style tag name is concatenated so the literal token never appears in the
  // component source, where svelte's parser would mistake it for a real style
  // block and parse the css that follows as the component's styles.
  //
  // the background/text colors here are fixed light values, not theme
  // tokens, and deliberately do not follow dark mode. html mail almost always
  // assumes it is being rendered on a white page and sets its own colors (or
  // none at all) on that assumption - senders that hardcode dark/black text
  // with no background of their own used to inherit our dark-theme background,
  // producing unreadable black-on-near-black text. every other mail client
  // (Thunderbird, Apple Mail, Gmail) renders html mail on a fixed light
  // background for the same reason; a message's own styles still override
  // this when it sets them explicitly. with a wallpaper set the page uses a
  // translucent scrim instead of opaque white, so the wallpaper reaches the
  // body without giving up that contrast (see wallpaperScrim).
  //
  // a content-security-policy is set as defense in depth on top of the backend
  // sanitizer: when remote content is not allowed, img-src is limited to data:
  // (our inlined cid images) so nothing can phone home even if a remote url ever
  // slipped past the sanitizer. when the user opts in, http(s) image sources are
  // permitted.
  //
  // script-src is scoped to a single nonce, generated fresh per render, and
  // that nonce is used on exactly one inline <script> block below (Pelton's
  // own, never sender content). Any <script> tag the sanitizer might have let
  // through from the email itself has no nonce and so still can't execute:
  // the sandbox no longer omits allow-scripts, but the CSP keeps the "sender
  // html can never run code" guarantee. allow-scripts had to come back
  // because clicks inside a script-less sandboxed iframe never reached a
  // cross-frame listener registered from the parent on some webview engines
  // (contentDocument access itself worked - measuring the body's height was
  // fine - but no click ever arrived at a listener attached that way). A
  // click handler that runs natively inside the iframe's own document, using
  // postMessage to hand the url back to the parent, has no such dependency on
  // cross-frame event delivery.
  // The resolved theme is read off the root element rather than derived from
  // the preference, because the preference alone does not say what is on screen:
  // "system" and "schedule" resolve to a concrete scheme elsewhere (theme.ts,
  // and the injected custom theme), and that resolution can change with no
  // preference change at all. Watching the attribute catches every writer,
  // including the schedule flipping at its window bound.
  //
  // The palette is those same tokens (see lib/mailpalette.ts), and it has to be
  // re-read whenever a token could have changed - not only when data-theme does.
  // A custom theme is an injected style element that overrides the tokens, so
  // switching from one custom theme to another can leave data-theme exactly as it
  // was while every colour in the window changes; a message rendered from the
  // previous palette would then be the one part of the window that visibly did
  // not follow. A stylesheet arriving or leaving is also the only signal the
  // theme editor's live preview gives, and it has no preference change of its own.

  onDestroy(() => themeObserver?.disconnect())

  // readTokenVar reads a resolved css token for the srcdoc, which cannot see the
  // parent stylesheet and so has to be handed every theme value it renders with.
  function readTokenVar(token: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  }

  function buildSrcdoc(
    html: string,
    allowRemote: boolean,
    fontSize: number,
    bodyFont: string,
    nonce: string,
    offerScan: boolean,
    pageBackground: string,
    palette: MailPalette,
  ): string {
    // the reader font preference sets the base font-family, so it applies to
    // mail that declares none. Mail that declares its own overrides it, unless
    // the sender-fonts setting is off, in which case the sanitizer has already
    // taken those declarations out and this is what everything renders in.
    const font = bodyFontStack(bodyFont) ?? readTokenVar('--font-ui')
    // The document's own colours, for text that declares none of its own. See
    // lib/maildoc.ts: this is the fallback that broke a real QWeather mail, whose
    // paragraph colour lived only in the stylesheet the sanitizer removes, and a
    // real QQ birthday mail, whose paragraphs likewise declare nothing before
    // sitting on a background the message paints itself.
    const { text: textColor, link: linkColor, quote: quoteColor, rule: ruleColor } = documentColors(palette)
    // the .pelton-vt colors are the light-theme semantic token values written
    // out literally, for the same reason: a badge sits on the message's own
    // background rather than the app's, so it does not follow the app theme.
    // the page colour goes on `html` alone, never `html,body`. An element's
    // background propagates to the canvas from the root, but the body's own box
    // still paints whatever it is given, so writing the same value on both
    // composites it twice inside the body's box. With an opaque colour that is
    // invisible; with the translucent one a dark theme + wallpaper produces
    // (see planBody), the body box comes out darker than the rest of the frame
    // and the message reads as a band across an otherwise uniform page.
    const css = `
  html{margin:0;background:${pageBackground};color:${textColor};font-family:${font};font-size:${fontSize}px;line-height:1.5;}
  body{margin:0;padding:4px 2px;word-wrap:break-word;overflow-wrap:break-word;}
  a{color:${linkColor};}
  img{max-width:100%;height:auto;}
  video{max-width:100%;height:auto;}
  blockquote{margin:0;margin-inline-start:8px;padding-inline-start:10px;border-inline-start:2px solid ${ruleColor};color:${quoteColor};}
  table{max-width:100%;}
  pre{white-space:pre-wrap;}
  .pelton-vt{display:inline-block;margin-inline-start:3px;font-family:${readTokenVar('--font-mono') || 'monospace'};font-weight:700;font-size:0.85em;cursor:default;}
  .pelton-vt-clean{color:#1a7f4b;}
  .pelton-vt-flagged{color:#c0392b;}
  .pelton-vt-unknown{color:#6b7280;}
  .pelton-vt-error{color:#9a6700;}
  .pelton-phish{display:inline-block;margin-inline-start:3px;font-weight:700;font-size:0.85em;color:#c0392b;cursor:default;}`
    const imgSrc = allowRemote ? 'data: https: http:' : 'data:'
    // media rides on the same choice as images: a message that embeds a video
    // can only reach out once the reader has allowed remote content for it.
    // The sanitizer has already removed remote media before that point, so this
    // is the second of the two locks rather than the only one.
    const mediaSrc = allowRemote ? 'data: https: http:' : 'data:'
    const csp = `default-src 'none'; img-src ${imgSrc}; media-src ${mediaSrc}; style-src 'unsafe-inline'; font-src data:; script-src 'nonce-${nonce}'`
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`
    const open = '<sty' + 'le>'
    const close = '</sty' + 'le>'
    // relays clicked links to the parent instead of trying to navigate this
    // sandboxed iframe (which has no allow-top-navigation and would silently
    // do nothing). runs inside the iframe's own document so it's a normal,
    // same-document click listener - no cross-frame event delivery involved.
    //
    // the contextmenu half is only wired up when a scan can actually be
    // offered: with the integration off there is nothing to put in a menu, and
    // suppressing the default one to show nothing would just look broken.
    const contextHandler = offerScan
      ? 'document.addEventListener("contextmenu",function(e){var a=e.target&&e.target.closest("a");if(!a)return;var href=(a.getAttribute("href")||"").trim();if(!/^https?:/i.test(href))return;e.preventDefault();window.parent.postMessage({peltonContextLink:href,x:e.clientX,y:e.clientY},"*")});'
      : ''
    const script =
      '<scr' +
      'ipt nonce="' +
      nonce +
      '">document.addEventListener("click",function(e){var a=e.target&&e.target.closest("a");if(!a)return;var href=(a.getAttribute("href")||"").trim();if(!href)return;e.preventDefault();if(/^(https?:|mailto:)/i.test(href)){window.parent.postMessage({peltonOpenUrl:href},"*")}});' +
      contextHandler +
      frameKeyRelay +
      '</scr' +
      'ipt>'
    // data-pelton-ready marks the body as belonging to our own srcdoc, not
    // the iframe's initial blank placeholder document: a fresh iframe already
    // has an empty <body> before any srcdoc has loaded, so a readiness check
    // that only looks for "a body" would resolve instantly against that
    // placeholder instead of waiting for the real content.
    // dir="auto" reads the direction off the message's own first strong
    // character (#356), so Hebrew and Arabic mail lays out right to left with
    // its numbers and punctuation in the right order. It is only a default: a
    // message that states its own direction, which the sanitizer now keeps,
    // overrides this on the element that says so.
    //
    // It goes on the document rather than on the reader's side of the pane
    // because the direction belongs to the mail, not to the interface: an
    // Arabic interface must not turn an English message round.
    return `<!doctype html><html dir="auto"><head><meta charset="utf-8">${cspMeta}${open}${css}${close}</head><body dir="auto" data-pelton-ready="1">${html}${script}</body></html>`
  }

  // nonce is regenerated per message so a stale nonce from a previous render
  // can never be replayed against a new one.
  function makeNonce(): string {
    return crypto.randomUUID().replace(/-/g, '')
  }

  // The theme decides the message's treatment; the wallpaper decides only what
  // sits behind it. They are independent: a dark theme darkens the message
  // whether or not a wallpaper is showing, and a wallpaper is visible behind a
  // darkened message just as it is behind a light one. Which transform runs for
  // a given combination is decided in lib/mailbody.ts, where it can be tested
  // directly - it is a choice nothing in the component's markup can reveal.
  //
  // darkMode is the palette's own flag rather than a second reading of the theme
  // attribute, so the branch and the colours it is rendered in cannot disagree.
  $: wallpaperOn = $prefs.readingPaneImage !== '' && $prefs.readingPaneImageOpacity > 0
  $: darkMode = palette.dark
  $: bodyPlan = planBody(detail.bodyHtmlSafe, {
    palette,
    wallpaper: wallpaperOn,
    transmission: $prefs.mailBackgroundTransmission / 100,
  })
  $: bodyHtml = bodyPlan.html
  // the page colour the message renders on, which is also what text with no
  // background of its own is judged against
  $: pageBackground = bodyPlan.pageBackground
  $: srcdoc = buildSrcdoc(bodyHtml, remoteLoaded, $prefs.messageFontSize, $prefs.bodyFont, makeNonce(), canScan, pageBackground, palette)

  // plain-text bodies render in a <pre>, not the sandboxed iframe, so bare
  // urls need their own linkification: nothing upstream turns them into real
  // links the way html mail's own <a> tags already are.
  $: plainSegments = detail.isHtml ? [] : linkifySegments(detail.bodyPlain)

  // An html body can be markup that shows nothing at all - a real message
  // arrived as a single <br>. The frame would then paint its min-height as a
  // large blank block of the message's page colour, which is indistinguishable
  // from a rendering failure and is what a reader reports as "the message is
  // blank". Naming the situation replaces that blank; it is not cosmetic.
  // Plain-text bodies are left alone: an empty <pre> collapses to nothing, so
  // there is no misleading block to explain.
  $: bodyEmpty = detail.isHtml && !hasVisibleContent(detail.bodyHtmlSafe)

  // the iframe is sized to its content height so the reading pane has a single
  // scrollbar instead of a nested one (which the interface zoom made worse).
  // allow-same-origin lets us measure the content height from the parent.
  let frame: HTMLIFrameElement
  let frameHeight = 320
  let resizeObserver: ResizeObserver | null = null

  // measuring documentElement/body.scrollHeight is unreliable here: per spec
  // scrollHeight can never be smaller than the viewport (the iframe's own
  // current height), so once the iframe grows it can never be measured back
  // down, and the height only ratchets upward, leaving a growing gap below
  // short emails. a ResizeObserver on the body's own border box reports its
  // true content size independent of the iframe's current height.
  function measure(): void {
    const body = readyBody()
    if (!body) {
      return
    }
    const h = Math.max(40, Math.ceil(body.getBoundingClientRect().height))
    // hysteresis: on fractional display scaling (125%/150%, common on Fedora's
    // WebKitGTK) the applied iframe height rounds to a device pixel differently
    // from how getBoundingClientRect measures it back, so writing every reading
    // to frameHeight makes the body flip between two adjacent pixel heights
    // forever, which reads as continuous shaking. only apply a change that moves
    // the height by more than a pixel, which settles the loop while still
    // tracking real content growth and shrink.
    if (Math.abs(h - frameHeight) <= 1) {
      return
    }
    frameHeight = h
  }

  // readyBody returns the iframe's body only once it's our own rendered
  // srcdoc, not the iframe's transient initial blank document.
  function readyBody(): HTMLElement | null {
    const body = frame?.contentDocument?.body
    return body?.dataset.peltonReady ? body : null
  }

  // readyPollHandle cancels the fallback readiness poll started by
  // scheduleAttach, so a later reload (a new message) doesn't leave a stale
  // poll running against a document that's already been replaced.
  let readyPollHandle = 0

  // attachInteractivity wires up sizing for the iframe's current document.
  // Link clicks are handled separately, by the nonce-scoped script inside the
  // srcdoc itself (see buildSrcdoc) relaying to onWindowMessage below - not by
  // a listener attached here from the parent, which proved unreliable. This
  // is idempotent per document: calling it twice for the same load is
  // harmless since a fresh resizeObserver just replaces the previous one.
  function attachInteractivity(): void {
    resizeObserver?.disconnect()
    resizeObserver = null
    const body = readyBody()
    if (!body) {
      return
    }
    measure()
    resizeObserver = new ResizeObserver(() => measure())
    resizeObserver.observe(body)
    // a fresh srcdoc replaces the document, so any badges from the previous
    // render are gone and have to be put back.
    decorateLinks(get(linkVerdicts), suspectLinks)
  }

  // onFrameLoad fires when the iframe's srcdoc finishes loading. It is the
  // fast path; scheduleAttach below also runs unconditionally as a fallback
  // in case 'load' fires before contentDocument.body is actually populated
  // (observed to be unreliable timing on some webview engines).
  function onFrameLoad(): void {
    attachInteractivity()
  }

  // scheduleAttach polls (briefly, via rAF) until the iframe's document has a
  // body, then attaches interactivity. This exists because relying solely on
  // the 'load' event has proven unreliable: a listener registered a beat too
  // late leaves clicks silently doing nothing, which is worse than the small
  // cost of polling for under a second.
  function scheduleAttach(): void {
    cancelAnimationFrame(readyPollHandle)
    let attempts = 0
    const tick = (): void => {
      if (readyBody()) {
        attachInteractivity()
        return
      }
      attempts += 1
      if (attempts < 120) {
        readyPollHandle = requestAnimationFrame(tick)
      }
    }
    readyPollHandle = requestAnimationFrame(tick)
  }

  $: if (frame && srcdoc) {
    scheduleAttach()
  }

  // onWindowMessage receives the url from the click handler running inside
  // the iframe's own document (see the injected script in buildSrcdoc) and
  // opens it in the external browser. The source check makes sure this only
  // ever acts on messages from our own mail iframe, not anything else that
  // might postMessage into this window.
  function onWindowMessage(event: MessageEvent): void {
    if (event.source !== frame?.contentWindow) {
      return
    }
    const key = relayedKey(event.data)
    if (key && frame) {
      replayKey(frame, key)
      return
    }
    const data = event.data as { peltonOpenUrl?: unknown; peltonContextLink?: unknown; x?: unknown; y?: unknown } | null
    const href = data?.peltonOpenUrl
    if (typeof href === 'string' && /^(https?:|mailto:)/i.test(href)) {
      BrowserOpenURL(href)
      return
    }
    const link = data?.peltonContextLink
    if (typeof link === 'string' && typeof data?.x === 'number' && typeof data?.y === 'number') {
      openLinkMenu(link, data.x, data.y)
    }
  }

  // openLinkMenu shows the scan action for a link the user right-clicked inside
  // the iframe. the coordinates arrive in the iframe's own space, which the
  // interface zoom scales relative to the parent, so they are converted using
  // the measured ratio between the element's rendered and internal widths
  // rather than by reasoning about the zoom factor.
  function openLinkMenu(url: string, frameX: number, frameY: number): void {
    if (!canScan || !frame) {
      return
    }
    const rect = frame.getBoundingClientRect()
    const inner = frame.contentDocument?.documentElement.clientWidth ?? 0
    const scale = inner > 0 ? rect.width / inner : 1
    openContextMenu(rect.left + frameX * scale, rect.top + frameY * scale, [
      { label: $t('virustotal.scanLink'), icon: IconShieldSearch, action: () => void scanLink(url) },
    ])
  }

  // the plain-text body is rendered by svelte rather than in the iframe, so its
  // links get the same menu directly.
  function onPlainContext(event: MouseEvent, url: string): void {
    if (!canScan || url === '') {
      return
    }
    event.preventDefault()
    openContextMenu(event.clientX, event.clientY, [
      { label: $t('virustotal.scanLink'), icon: IconShieldSearch, action: () => void scanLink(url) },
    ])
  }

  async function scanLink(url: string): Promise<void> {
    try {
      putLinkVerdict(detail.id, url, await scanUrl(url))
    } catch (err) {
      toastError(errorMessage(err))
    }
  }

  // glyph and class for a verdict badge rendered inside the iframe, where the
  // svelte badge component cannot reach.
  function verdictGlyph(v: Verdict): { text: string; cls: string; label: string } {
    if (v.error !== '') {
      const label = v.error === 'rate_limited' ? $t('virustotal.error.rateLimited') : v.error === 'unauthorized' ? $t('virustotal.error.unauthorized') : v.error
      return { text: '!', cls: 'pelton-vt-error', label }
    }
    if (v.status === 'clean') {
      return { text: '✓', cls: 'pelton-vt-clean', label: `0/${v.total} ${$t('virustotal.verdict.enginesFlagged')}` }
    }
    if (v.status === 'flagged') {
      return {
        text: '✗',
        cls: 'pelton-vt-flagged',
        label: `${v.malicious + v.suspicious}/${v.total} ${$t('virustotal.verdict.enginesFlagged')}`,
      }
    }
    return { text: '?', cls: 'pelton-vt-unknown', label: $t('virustotal.verdict.unknown') }
  }

  // suspectLinks are the urls the phishing checks flagged in this message: a
  // link whose text names another site, a punycode host, a shortener, or a
  // sign-in page somewhere unrelated to the sender (#206). Marking them where
  // they sit is the only place the warning is any use, since the banner cannot
  // point at a link halfway down a newsletter.
  $: suspectLinks = new Set(detail.phishing?.links ?? [])

  // decorateLinks pins a badge to every anchor whose target has a verdict.
  // Badges are added to the iframe's own document, which the parent can reach
  // because the sandbox allows same-origin; they are our own nodes, never
  // anything the sender supplied, and are rebuilt from scratch on every pass so
  // a re-scan cannot leave a stale marker behind.
  function decorateLinks(verdicts: Map<string, Verdict>, suspects: Set<string>): void {
    const doc = frame?.contentDocument
    if (!readyBody() || !doc) {
      return
    }
    for (const stale of Array.from(doc.querySelectorAll('.pelton-vt, .pelton-phish'))) {
      stale.remove()
    }
    for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
      const href = (anchor.getAttribute('href') ?? '').trim()
      if (suspects.has(href)) {
        const mark = doc.createElement('span')
        mark.className = 'pelton-phish'
        mark.textContent = '⚠'
        mark.title = $t('phishing.linkMarker')
        anchor.after(mark)
      }
      const verdict = verdicts.get(href)
      if (!verdict) {
        continue
      }
      const { text, cls, label } = verdictGlyph(verdict)
      const badge = doc.createElement('span')
      badge.className = `pelton-vt ${cls}`
      badge.textContent = text
      badge.title = label
      anchor.after(badge)
    }
  }

  $: if (frame && detail.isHtml) {
    decorateLinks($linkVerdicts, suspectLinks)
  }

  window.addEventListener('message', onWindowMessage)

  onDestroy(() => {
    resizeObserver?.disconnect()
    cancelAnimationFrame(readyPollHandle)
    window.removeEventListener('message', onWindowMessage)
  })

  // tracking pixels (#205). they are only reported when the setting is on, so
  // an empty list means either a clean message or detection turned off.
  $: trackers = detail.trackingPixels ?? []
  // pixelsBlocked flips once remote content has been loaded with the pixels
  // held back, so the reader is told what was withheld instead of it happening
  // quietly. Detection is a heuristic: the wording says "look like" and the
  // menu on each button loads them anyway.
  let pixelsBlocked = false
  // which load button has its "load them too" menu open, by index.
  let pixelMenu: number | null = null
  // whether the per-pixel breakdown under the banner is expanded.
  let pixelDetails = false

  // trackerHosts is the deduplicated list of who the pixels would report to.
  $: trackerHosts = [...new Set(trackers.map((p) => p.host))]

  // reasonText turns the backend's signal names into the sentence shown under
  // a pixel. An unknown signal falls back to its raw name rather than vanishing.
  function reasonText(reason: string, tFn: (key: string) => string): string {
    const key = `detail.mailBody.pixelReason.${reason}`
    const text = tFn(key)
    return text === key ? reason : text
  }

  async function loadRemote(includeTrackers = false): Promise<void> {
    try {
      const html = await getMessageHtml(detail.id, true, includeTrackers)
      setBodyHtml(html)
      remoteLoaded = true
      pixelsBlocked = !includeTrackers && trackers.length > 0
      pixelMenu = null
    } catch (err) {
      toastError(errorMessage(err))
    }
  }

  // trust the sender permanently, then show this message's remote content now.
  async function trustSender(includeTrackers = false): Promise<void> {
    try {
      await trustSenderImages(detail.id)
      toastSuccess($t('detail.mailBody.imagesTrusted').replace('{who}', senderLabel))
      await loadRemote(includeTrackers)
    } catch (err) {
      toastError(errorMessage(err))
    }
  }

  // trust the whole sender domain permanently, then show remote content now.
  async function trustDomain(includeTrackers = false): Promise<void> {
    try {
      await allowDomainImages(detail.id)
      toastSuccess($t('detail.mailBody.imagesTrusted').replace('{who}', senderDomain ?? ''))
      await loadRemote(includeTrackers)
    } catch (err) {
      toastError(errorMessage(err))
    }
  }

  // allow remote content for this one message only (persists), then show it now.
  // nothing else from the sender or domain is trusted.
  async function trustThisEmail(includeTrackers = false): Promise<void> {
    try {
      await allowRemoteForMessage(detail.id)
      await loadRemote(includeTrackers)
    } catch (err) {
      toastError(errorMessage(err))
    }
  }

  // the load buttons, built as data so the split control that carries the
  // "load the pixels too" menu is written once rather than four times.
  $: loadActions = [
    {
      key: 'once',
      icon: IconPhoto,
      label: $t('detail.mailBody.loadOnce'),
      title: '',
      run: (withPixels: boolean) => loadRemote(withPixels),
    },
    {
      key: 'email',
      icon: IconMailCheck,
      label: $t('detail.mailBody.thisEmail'),
      title: $t('detail.mailBody.thisEmailTitle'),
      run: (withPixels: boolean) => trustThisEmail(withPixels),
    },
    {
      key: 'sender',
      icon: IconUserCheck,
      label: $t('detail.mailBody.thisSender'),
      title: $t('detail.mailBody.alwaysLoadFrom').replace('{who}', senderLabel),
      run: (withPixels: boolean) => trustSender(withPixels),
    },
    ...(senderDomain
      ? [
          {
            key: 'domain',
            icon: IconWorldCheck,
            label: $t('detail.mailBody.thisDomain'),
            title: $t('detail.mailBody.alwaysLoadFrom').replace('{who}', senderDomain),
            run: (withPixels: boolean) => trustDomain(withPixels),
          },
        ]
      : []),
  ]
</script>

{#if detail.hasRemoteContent && !remoteLoaded}
  <div class="remote-bar">
    <div class="remote-info">
      <span class="remote-text">{$t('detail.mailBody.remoteBlocked')}</span>
      {#if detail.remoteHosts && detail.remoteHosts.length > 0}
        <span class="remote-hosts" title={detail.remoteHosts.join(', ')}>
          {$t('detail.mailBody.from')} {detail.remoteHosts.slice(0, 3).join(', ')}{detail.remoteHosts.length > 3 ? ` ${$t('detail.mailBody.more').replace('{count}', String(detail.remoteHosts.length - 3))}` : ''}
        </span>
      {/if}
    </div>
    <div class="remote-actions">
      {#each loadActions as action, i (action.key)}
        <span class="split">
          <button type="button" class="remote-btn" class:has-caret={trackers.length > 0} title={action.title} on:click={() => action.run(false)}>
            <svelte:component this={action.icon} size={14} stroke={1.6} />
            {action.label}
          </button>
          {#if trackers.length > 0}
            <button
              type="button"
              class="remote-caret"
              aria-label={$t('detail.mailBody.pixelMenuLabel')}
              aria-expanded={pixelMenu === i}
              on:click={() => (pixelMenu = pixelMenu === i ? null : i)}
            >
              <IconChevronDown size={12} stroke={2} />
            </button>
            {#if pixelMenu === i}
              <div class="pixel-menu">
                <button type="button" on:click={() => action.run(true)}>
                  {$t('detail.mailBody.loadWithPixels')}
                </button>
              </div>
            {/if}
          {/if}
        </span>
      {/each}
    </div>
  </div>
{/if}

{#if detail.hasRemoteContent && !remoteLoaded && trackers.length > 0}
  <div class="pixel-bar">
    <button type="button" class="pixel-summary" aria-expanded={pixelDetails} on:click={() => (pixelDetails = !pixelDetails)}>
      <IconEyeOff size={14} stroke={1.6} />
      {$t('detail.mailBody.pixelSummary').replace('{count}', String(trackers.length))}
      <IconChevronDown size={12} stroke={2} class={pixelDetails ? 'flip' : ''} />
    </button>
    {#if pixelDetails}
      <ul class="pixel-list">
        {#each trackers as pixel (pixel.url)}
          <li>
            <span class="pixel-host">{pixel.host}</span>
            <span class="pixel-why">{pixel.reasons.map((r) => reasonText(r, $t)).join(', ')}</span>
          </li>
        {/each}
      </ul>
      <p class="pixel-note">{$t('detail.mailBody.pixelNote')}</p>
    {/if}
  </div>
{/if}

{#if remoteLoaded && pixelsBlocked}
  <div class="pixel-bar done">
    <span class="pixel-done-text">
      <IconEyeOff size={14} stroke={1.6} />
      {$t('detail.mailBody.pixelsKeptBlocked').replace('{count}', String(trackers.length))}
      <span class="pixel-hosts" title={trackerHosts.join(', ')}>{trackerHosts.slice(0, 2).join(', ')}</span>
    </span>
    <button type="button" class="remote-btn" on:click={() => loadRemote(true)}>
      {$t('detail.mailBody.loadWithPixels')}
    </button>
  </div>
{/if}

{#if detail.isHtml}
  {#if bodyEmpty}
    <!-- No iframe at all: an empty body has nothing to render, and mounting one
         would paint its min-height as a blank slab of the message's own page
         colour - the "grey window" this state exists to replace. --mail-page is
         the same property the frame is given, so the two cannot disagree. -->
    <div class="body-empty" style={`--mail-page: ${palette.page.hex}`}>
      <EmptyState title={$t('detail.mailBody.emptyBody')} detail={$t('detail.mailBody.emptyBodyHint')}>
        <IconMailOff size={26} stroke={1.4} />
      </EmptyState>
    </div>
  {:else}
    <iframe
      class="body-frame"
      class:wallpaper={wallpaperOn}
      class:dark={darkMode}
      title={$t('detail.mailBody.iframeTitle')}
      sandbox="allow-same-origin allow-scripts allow-popups allow-top-navigation-by-user-activation"
      bind:this={frame}
      on:load={onFrameLoad}
      style={`height:${frameHeight}px; --mail-page: ${palette.page.hex}`}
      {srcdoc}
    ></iframe>
  {/if}
{:else}
  <!-- dir="auto" for the same reason as the html document above: a plain-text
       message written right to left reads that way, whatever the interface is
       set to. -->
  <pre dir="auto" class="body-plain mono selectable" style={`font-size:${$prefs.messageFontSize}px`}>{#each plainSegments as segment}{#if segment.href}<a
        class="plain-link"
        href={segment.href}
        on:click|preventDefault={() => BrowserOpenURL(segment.href ?? '')}
        on:contextmenu={(e) => onPlainContext(e, segment.href ?? '')}
      >{segment.text}</a>{#if $linkVerdicts.has(segment.href ?? '')}<VerdictBadge verdict={$linkVerdicts.get(segment.href ?? '')!} size={12} />{/if}{:else}{segment.text}{/if}{/each}</pre>
{/if}

<style>
  /* a warning-tinted banner, since blocked remote content is a privacy matter. */
  .remote-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-bottom: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: var(--hairline) solid var(--warning);
    border-radius: var(--radius-control);
    background: var(--warning-bg, var(--surface-sunken));
  }

  .remote-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .remote-text {
    font-size: var(--fz-label);
    color: var(--text-primary);
  }

  .remote-hosts {
    font-size: var(--fz-meta);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remote-actions {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .remote-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border: var(--hairline) solid var(--border-default);
    border-radius: var(--radius-control);
    background: var(--surface-raised);
    color: var(--text-primary);
    font-size: var(--fz-label);
    cursor: var(--cursor-action);
  }

  .remote-btn:hover {
    background: var(--surface-hover);
  }

  /* a split control: the button does the safe thing, the caret next to it
     offers to load the tracking pixels as well. */
  .split {
    position: relative;
    display: inline-flex;
  }

  .remote-btn.has-caret {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-inline-end: none;
  }

  .remote-caret {
    display: inline-flex;
    align-items: center;
    padding: 0 var(--space-1);
    border: var(--hairline) solid var(--border-default);
    border-top-right-radius: var(--radius-control);
    border-bottom-right-radius: var(--radius-control);
    background: var(--surface-raised);
    color: var(--text-secondary);
    cursor: pointer;
  }

  .remote-caret:hover {
    background: var(--surface-hover);
    color: var(--text-primary);
  }

  .pixel-menu {
    position: absolute;
    top: calc(100% + var(--space-1));
    /* anchored to the end of its button, so it opens on the other side in a
       right-to-left interface rather than off the edge of it. */
    inset-inline-end: 0;
    z-index: 30;
    border: var(--hairline) solid var(--border-default);
    border-radius: var(--radius-control);
    background: var(--surface-overlay);
    box-shadow: var(--shadow-overlay);
    white-space: nowrap;
  }

  .pixel-menu button {
    display: block;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: var(--fz-label);
    text-align: start;
    cursor: pointer;
  }

  .pixel-menu button:hover {
    background: var(--surface-hover);
  }

  /* the tracking-pixel line sits under the blocked-content banner, and after
     loading it replaces it with what stayed behind. */
  .pixel-bar {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-control);
    margin-bottom: var(--space-2);
  }

  .pixel-bar.done {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .pixel-summary,
  .pixel-done-text {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    border: none;
    background: transparent;
    padding: 0;
    color: var(--text-secondary);
    font-size: var(--fz-meta);
    text-align: start;
  }

  .pixel-summary {
    cursor: pointer;
  }

  .pixel-summary:hover {
    color: var(--text-primary);
  }

  .pixel-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .pixel-list li {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    font-size: var(--fz-meta);
  }

  .pixel-host {
    font-family: var(--font-mono);
    color: var(--text-primary);
    word-break: break-all;
  }

  .pixel-why,
  .pixel-hosts {
    color: var(--text-tertiary);
  }

  .pixel-note {
    margin: 0;
    font-size: var(--fz-meta);
    color: var(--text-tertiary);
  }

  /* The empty-body state stands in for the iframe, so it takes the frame's own
     floor of 120px and sits flush like it does, with no radius of its own.

     It must NOT grow to fill the pane: a message whose body is empty usually
     carries an attachment instead, and stretching this block would push the
     attachment cards below the fold - replacing one "I can't see anything" with
     another. `min-height` rather than a fixed height keeps it at the frame's
     footprint while still growing for a longer translation, which several of the
     bundled locales are.

     It paints the message page colour opaquely, which is what the iframe painted
     in the same place. Leaving it transparent would put the hint on the reading
     pane's own background instead - and with a wallpaper that background is the
     wallpaper wash, whose brightness is whatever image the reader picked. The
     hint's text roles are derived for a surface of this colour, so on a light
     wallpaper wash they fell to 3.09:1; against the page colour they hold 9.09:1
     and 4.74:1 at every wallpaper setting. */
  .body-empty {
    min-height: 120px;
    background: var(--mail-page);
  }

  /* height is set inline from the measured content height so the pane has a single
     scrollbar. a min-height avoids a flash of collapse before the first measure.
     the iframe is a nested browsing context, but its rendering still gets pulled
     along by the ancestor's CSS zoom (the app-wide interface scale, applied on
     <html> in theme.ts) since zoom is not a normal non-inherited property for
     replaced elements. that means email content ends up zoomed twice: once by
     its own messageFontSize, and again by whatever interface scale the user
     picked. dividing back out by --ui-scale here cancels the ancestor's zoom so
     the reading pane always renders at true size regardless of interface zoom. */
  .body-frame {
    display: block;
    width: 100%;
    min-height: 120px;
    border: none;
    /* fixed, not theme-derived: matches the light background the srcdoc itself
       renders on (see buildSrcdoc), so there is no dark flash around/before the
       html mail content in dark mode. */
    background: #ffffff;
    zoom: calc(1 / var(--ui-scale, 1));
  }

  /* In a dark theme the frame matches the page the srcdoc paints, for the same
     reason the light default exists: without it the blank frame shows white
     until the message loads. The colour is the page's own, taken from the same
     palette the srcdoc is built with and handed in as a custom property, so the
     frame cannot disagree with the page it is hiding behind. */
  .body-frame.dark {
    background: var(--mail-page);
  }

  /* With a wallpaper set the frame goes transparent so the pane's wallpaper
     layer is not covered by this element's own box. No flash risk here: the
     wallpaper itself is what shows before the srcdoc paints.

     This rule comes after .dark on purpose, and the order is load-bearing. Both
     classes are applied in a dark theme with a wallpaper, and they have equal
     specificity, so the later one wins. With .dark last it painted an opaque
     #1e1e1e box over the wallpaper and hid it completely; the wallpaper only
     reaches the message if transparency wins. What the reader sees before the
     srcdoc paints is the wallpaper either way, which is what the dark frame
     exists to approximate. */
  .body-frame.wallpaper {
    background: transparent;
  }

  .body-plain {
    margin: 0;
    font-size: var(--fz-body);
    line-height: 1.55;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .plain-link {
    color: var(--accent);
    text-decoration: underline;
    cursor: var(--cursor-action);
  }
</style>
