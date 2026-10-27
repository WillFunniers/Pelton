<script lang="ts">
  // column 3: the reading pane. it loads the open message, shows the header,
  // action toolbar, sanitized body and attachments, and performs the toolbar
  // actions. empty, loading and error states are explicit.
  import peltonLogo from '../../assets/images/icons/pelton-logo.png'
  import DetailHeader from './DetailHeader.svelte'
  import ActionToolbar from './ActionToolbar.svelte'
  import MailBody from './MailBody.svelte'
  import ProtectedNotice from './ProtectedNotice.svelte'
  import PhishingNotice from './PhishingNotice.svelte'
  import AttachmentList from './AttachmentList.svelte'
  import InfoModal from './InfoModal.svelte'
  import SourceModal from './SourceModal.svelte'
  import Spinner from '../common/Spinner.svelte'
  import ErrorState from '../common/ErrorState.svelte'
  import TabBar from './TabBar.svelte'
  import { visibleMessageId, hasTabs, activeTabId, tabs, markTabStale, labelTab, closeTab } from '../../stores/tabs'
  import { openMessageId } from '../../stores/selection'
  import { messageDetail, loadMessage, clearMessage } from '../../stores/message'
  import { setFlagged, deleteMessage, archiveMessage, scanMessage } from '../../lib/api'
  import { reportArchiveExport, dropDeleted } from '../../lib/messageactions'
  import {
    virusTotal,
    scanning,
    scanEnabled,
    resetVerdicts,
    putLinkVerdict,
    putAttachmentVerdict,
    currentVerdictMessage,
  } from '../../stores/virustotal'
  import { removeFromList, patchInList } from '../../stores/messages'
  import { recordDeleted } from '../../stores/undodelete'
  import { recordArchived } from '../../stores/undoarchive'
  import { openReply, openForward } from '../../stores/compose'
  import { errorMessage, toastError } from '../../stores/toast'
  import { prefs } from '../../stores/prefs'
  import { t } from '../../lib/i18n'
  import { get } from 'svelte/store'
  import { tick } from 'svelte'
  import type { MessageDetail, EditorMode } from '../../lib/types'

  // default editor mode for replies and forwards, from settings.
  $: replyMode = $prefs.defaultEditorMode as EditorMode

  // The reading-pane wallpaper paints in its own layer behind the pane's
  // content, so it can carry its own opacity. Fading .detail itself would take
  // the message text down with it, which is the opposite of what a faint
  // backdrop is for.
  //
  // The strength is a plain `opacity` on the image layer rather than an alpha
  // color composited over it: `color-mix()` needs a webview new enough to
  // parse it, and an engine that does not know it drops the whole
  // background-image declaration, which loses the wallpaper rather than just
  // its tint.
  $: wallpaperStyle =
    $prefs.readingPaneImage && $prefs.readingPaneImageOpacity > 0
      ? [
          `background-image: url("${$prefs.readingPaneImage}")`,
          'background-size: cover',
          'background-position: center',
          'background-repeat: no-repeat',
          `opacity: ${$prefs.readingPaneImageOpacity / 100}`,
        ].join('; ')
      : ''

  let infoOpen = false
  let sourceOpen = false

  // the pane follows whichever message is visible: the active tab's, or the one
  // picked in the list when no tab is active.
  let loadedId = -1
  $: if ($visibleMessageId !== null && $visibleMessageId !== loadedId) {
    loadedId = $visibleMessageId
    void loadMessage($visibleMessageId)
  }
  $: if ($visibleMessageId === null && loadedId !== -1) {
    loadedId = -1
    clearMessage()
  }

  // a tab holds an id, so the subject only arrives once the message loads. A
  // load that fails for a tab means the message is gone: the tab is marked
  // rather than closed, so nothing you parked disappears on its own.
  $: if ($activeTabId !== null && $messageDetail.status === 'ready' && $messageDetail.data) {
    labelTab($activeTabId, $messageDetail.data.subject)
  }
  $: if ($activeTabId !== null && $messageDetail.status === 'error') {
    markTabStale($activeTabId)
  }

  // a tab whose message is gone says so plainly rather than showing the raw
  // load error, and stays open until it is closed.
  $: activeTabStale = $tabs.some((tab) => tab.id === $activeTabId && tab.stale)

  // the scroll container is reused across messages, so it keeps the offset of
  // whatever was open before. after a long message a shorter one renders above
  // the viewport and the pane looks blank until you scroll back up.
  let scrollEl: HTMLDivElement | undefined
  let scrolledId = -1
  $: if ($messageDetail.data && $messageDetail.data.id !== scrolledId) {
    scrolledId = $messageDetail.data.id
    void resetScroll()
  }

  // the container only exists once a message has rendered, and the body iframe
  // sizes itself after that, so this waits a tick rather than reading scrollEl
  // straight out of the reactive block.
  async function resetScroll(): Promise<void> {
    await tick()
    if (scrollEl) {
      scrollEl.scrollTop = 0
    }
  }

  $: canScan = scanEnabled($virusTotal)

  // a message opening clears the previous one's verdicts, then auto-scans
  // whichever targets the user turned on. autoScannedId keeps that to one pass
  // per message, since the reactive block also re-runs on unrelated changes.
  let autoScannedId = -1
  $: if ($messageDetail.data && currentVerdictMessage() !== $messageDetail.data.id) {
    resetVerdicts($messageDetail.data.id)
  }
  $: if (canScan && $messageDetail.data && $messageDetail.data.id !== autoScannedId) {
    autoScannedId = $messageDetail.data.id
    if ($virusTotal.autoScanLinks || $virusTotal.autoScanAttachments) {
      void runScan($messageDetail.data.id, $virusTotal.autoScanLinks, $virusTotal.autoScanAttachments)
    }
  }

  // runScan scans a message's links, attachments or both, and files each result
  // against the message it belongs to so a slow scan cannot land on whatever
  // message the user moved on to.
  async function runScan(messageId: number, links: boolean, attachments: boolean): Promise<void> {
    if (get(scanning)) {
      return
    }
    scanning.set(true)
    try {
      const result = await scanMessage(messageId, links, attachments)
      for (const link of result.links) {
        putLinkVerdict(messageId, link.url, link.verdict)
      }
      for (const att of result.attachments) {
        putAttachmentVerdict(messageId, att.attachmentId, att.verdict)
      }
    } catch (err) {
      toastError(errorMessage(err))
    } finally {
      scanning.set(false)
    }
  }

  async function toggleFlag(detail: MessageDetail): Promise<void> {
    const next = !detail.flagged
    messageDetail.update((s) => (s.data ? { ...s, data: { ...s.data, flagged: next } } : s))
    patchInList(detail.id, { flagged: next })
    try {
      await setFlagged(detail.id, next)
    } catch (err) {
      toastError(errorMessage(err))
    }
  }

  async function remove(detail: MessageDetail): Promise<void> {
    try {
      await deleteMessage(detail.id)
      recordDeleted(detail)
      // a deleted message hands the pane to the row that took its place rather
      // than leaving it empty, so deleting down a mailbox never goes back to
      // the list between messages.
      closeTab(detail.id)
      dropDeleted(detail.id)
    } catch (err) {
      toastError(errorMessage(err))
    }
  }

  // dismiss clears a message out of the pane after acting on it. A tab holding
  // it closes, since acting on a message is done with it; the untabbed pane
  // only empties if it was showing that message and not something else.
  function dismiss(id: number): void {
    closeTab(id)
    if (get(openMessageId) === id) {
      openMessageId.set(null)
    }
  }

  // archive moves the message to the account's Archive folder via the imap move
  // binding, then closes the pane and drops it from the list.
  async function archive(detail: MessageDetail): Promise<void> {
    try {
      const undo = await archiveMessage(detail.id)
      reportArchiveExport(undo)
      recordArchived(detail, undo)
      removeFromList(detail.id)
      dismiss(detail.id)
    } catch (err) {
      toastError(errorMessage(err))
    }
  }

  // print builds a clean, self-contained document from the already-sanitized
  // body and opens the system print dialog via a hidden iframe (WKWebView and
  // WebView2 both route window.print() to the native dialog). using the
  // sanitized body keeps remote/script content out of the printed page.
  function escapeHtml(s: string): string {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
  }

  function printMessage(detail: MessageDetail): void {
    const noSubject = get(t)('detail.noSubject')
    const toLabel = get(t)('detail.print.to')
    const bodyHtml = detail.isHtml
      ? detail.bodyHtmlSafe
      : `<pre style="white-space:pre-wrap;font:14px/1.5 ui-monospace,monospace">${escapeHtml(detail.bodyPlain)}</pre>`
    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(detail.subject || noSubject)}</title>
<style>
  body{font:14px/1.6 system-ui,sans-serif;color:#111;margin:24px}
  .hdr{border-bottom:1px solid #ccc;padding-bottom:12px;margin-bottom:16px}
  .hdr h1{font-size:18px;margin:0 0 8px}
  .hdr div{font-size:12px;color:#555}
  img{max-width:100%}
</style></head><body>
<div class="hdr">
  <h1>${escapeHtml(detail.subject || noSubject)}</h1>
  <div><strong>${escapeHtml(detail.fromName || detail.fromAddress)}</strong> &lt;${escapeHtml(detail.fromAddress)}&gt;</div>
  <div>${escapeHtml(detail.date)}</div>
  <div>${escapeHtml(toLabel)} ${escapeHtml(detail.toAddresses)}</div>
</div>
${bodyHtml}
</body></html>`

    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.position = 'fixed'
    frame.style.right = '0'
    frame.style.bottom = '0'
    frame.style.width = '0'
    frame.style.height = '0'
    frame.style.border = '0'
    document.body.appendChild(frame)
    const win = frame.contentWindow
    const idoc = frame.contentDocument || win?.document
    if (!win || !idoc) {
      document.body.removeChild(frame)
      toastError(get(t)('detail.print.dialogFailed'))
      return
    }
    idoc.open()
    idoc.write(doc)
    idoc.close()
    // give the iframe a tick to lay out before printing, then clean up after.
    const run = (): void => {
      win.focus()
      win.print()
      setTimeout(() => frame.remove(), 1000)
    }
    if (idoc.readyState === 'complete') {
      setTimeout(run, 50)
    } else {
      frame.onload = run
    }
  }
</script>

<section class="detail">
  {#if wallpaperStyle}
    <div class="wallpaper" style={wallpaperStyle} aria-hidden="true"></div>
  {/if}
  <div class="detail-body">
    {#if $hasTabs}
      <TabBar />
    {/if}
    {#if $visibleMessageId === null}
      {#if $prefs.emptyStateFullscreen && $prefs.emptyStateImage}
        <div
          class="placeholder placeholder-full"
          style={`background-image: url("${$prefs.emptyStateImage}")`}
          role="img"
          aria-label="Pelton"
        ></div>
      {:else}
        <div class="placeholder">
          <img class="placeholder-logo" src={$prefs.emptyStateImage || peltonLogo} alt="Pelton" draggable="false" />
        </div>
      {/if}
    {:else if activeTabStale}
      <div class="placeholder gone">
        <p>{$t('tabs.goneBody')}</p>
        <button type="button" class="gone-close" on:click={() => $activeTabId !== null && closeTab($activeTabId)}>
          {$t('tabs.close')}
        </button>
      </div>
    {:else if $messageDetail.status === 'loading' && !$messageDetail.data}
      <Spinner label={$t('detail.loadingMessage')} />
    {:else if $messageDetail.status === 'error'}
      <ErrorState message={$messageDetail.error} onRetry={() => $visibleMessageId && loadMessage($visibleMessageId)} />
    {:else if $messageDetail.data}
      {@const detail = $messageDetail.data}
      <div class="toolbar-bar">
        <ActionToolbar
          flagged={detail.flagged}
          {canScan}
          scanning={$scanning}
          on:scan={() => runScan(detail.id, true, true)}
          on:reply={() => openReply(detail, replyMode, false)}
          on:replyAll={() => openReply(detail, replyMode, true)}
          on:forward={() => openForward(detail, replyMode)}
          on:archive={() => archive(detail)}
          on:delete={() => remove(detail)}
          on:toggleFlag={() => toggleFlag(detail)}
          on:print={() => printMessage(detail)}
          on:info={() => (infoOpen = true)}
          on:source={() => (sourceOpen = true)}
        />
      </div>

      {#if infoOpen}
        <InfoModal {detail} on:close={() => (infoOpen = false)} />
      {/if}

      {#if sourceOpen}
        <SourceModal messageId={detail.id} on:close={() => (sourceOpen = false)} />
      {/if}

      <div class="scroll selectable" tabindex="-1" bind:this={scrollEl}>
        <DetailHeader {detail} />
        <div class="body-wrap">
          {#if detail.phishing.level !== 'none'}
            <PhishingNotice report={detail.phishing} messageId={detail.id} />
          {/if}
          {#if detail.pgpState !== '' && detail.pgpState !== 'open'}
            <!-- the body here is still the armor, so showing it would put
                 ciphertext in front of the reader. -->
            <ProtectedNotice
              state={detail.pgpState}
              messageId={detail.id}
              on:opened={() => void loadMessage(detail.id)}
            />
          {:else}
            <MailBody {detail} />
          {/if}
        </div>
        <AttachmentList messageId={detail.id} attachments={detail.attachments} />
      </div>
    {/if}
  </div>
</section>

<style>
  /* a tab whose message is gone: a sentence and a way out, not an error dump. */
  .gone {
    flex-direction: column;
    gap: var(--space-3);
    color: var(--text-tertiary);
    font-size: var(--fz-meta);
    text-align: center;
    padding: var(--space-5);
  }

  .gone-close {
    padding: var(--space-2) var(--space-4);
    border: var(--hairline) solid var(--border-default);
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--fz-label);
    cursor: var(--cursor-action);
  }
  .gone-close:hover {
    background: var(--glass-hover);
    color: var(--text-primary);
  }

  /* the gone state is a sentence with no message behind it, so it takes the same
     tint the pane's other rows wear rather than landing on a raw picture. the
     empty state next to it stays untinted: a faded mark needs no backing. */
  :global(:root[data-wallpaper='on']) .gone {
    background: var(--glass-raised);
  }

  /* The reading pane's own surface lives on a ::before rather than on .detail
     itself for two separate reasons:
       1. backdrop-filter makes an element a containing block for its fixed
          descendants, and this pane renders InfoModal and SourceModal, which are
          position:fixed and must keep covering the window rather than the pane;
       2. a pseudo-element has no descendants, so the message iframe below is not
          painted over by anything - the email keeps its own colours exactly as
          maildark produced them. (Measured: an ancestor backdrop-filter does not
          blur an iframe's own content, but a filter layered on top of one does.)
     isolation:isolate keeps the pseudo's z-index:-1 inside this pane. */
  .detail {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    /* the positioning context for the pane's own layers, and the scope for the
       surface pseudo-element below */
    position: relative;
    isolation: isolate;
  }

  .detail::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--glass-raised);
  }

  /* While a wallpaper is up this pane's own layer stops being a sheet and becomes
     the reader's MASK: no tint at all, and a blur radius of their choosing. It
     shows the window's own wallpaper layer (App.svelte) directly, so the picture
     arrives here at the strength they set and as crisp as they asked for - the
     wallpaper is what the reading pane is for, and a tinted, blurred sheet over it
     is what "the wallpaper is barely there" looked like.

     The blur is deliberately on this layer and not on the wallpaper itself, and
     never on the message: this pseudo-element sits below the pane's content, so
     the radius softens the picture the pane stands on while the email above it
     keeps every edge maildark gave it. Putting the same blur on the wallpaper
     layer instead would be indistinguishable here and would follow the picture
     into the panes beside it; putting it anywhere above the iframe would blur the
     message, which is the one thing this pane must never do.

     The radius arrives from theme/glass.ts as a literal in an injected rule - a
     backdrop-filter whose value references a var() is dropped whole by WebKit
     (bug 297620) - and it is 0 by way of that rule not existing at all, so a
     reader who wants the picture untouched pays for no render pass either.

     The chrome keeps its glass; only this pane's own surface opts out. That
     asymmetry is the point of the rule, not a leftover. */
  :global(:root[data-wallpaper='on']) .detail::before {
    background: transparent;
  }

  /* The pane's own rows are chrome, not message: the toolbar holds buttons and
     the attachment strip holds labels. They keep a tint of their own - the same
     chip token the rest of the chrome wears, minus the filter - because text on
     a raw picture is only readable while that picture happens to be dark: with
     the sheet gone, a near-white wallpaper at full strength left the pane's own
     text at 1.17:1 (measured, near-white @100%). The message area between them
     still gets nothing, which is the point: that is where the wallpaper shows. */
  :global(:root[data-wallpaper='on']) .toolbar-bar {
    background: var(--glass-raised);
  }

  /* The reading pane's own wallpaper layer paints behind .detail-body. Both are
     positioned with `z-index: auto`, so DOM order decides the paint order and the
     content wins without either needing a z-index; `pointer-events: none` keeps
     the layer from swallowing clicks meant for the toolbar or the message body.

     In glass mode the window already carries the wallpaper (App.svelte) and this
     one is hidden: keeping both would stack the same image twice and make the
     pane darker than the panes beside it. It stays for every other combination,
     where the pane is the only place a wallpaper appears - including an engine
     without color-mix(), where the panes fall back to opaque surfaces and the
     window's own layer is never shown, so this copy is the only one to be had.
     The query is the other side of the one in tokens.css that forces those
     fallbacks, so the two flip together. */
  .wallpaper {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  @supports (background-color: color-mix(in srgb, red 50%, transparent)) {
    :global(:root[data-wallpaper='on']) .wallpaper {
      display: none;
    }
  }

  /* the pane's content, held in its own layer above the wallpaper. it takes
     over .detail's column layout because it is now the flex parent of the
     pane's children. */
  .detail-body {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  /* with no message selected the pane shows the Pelton mark, faded, as a calm
     empty state rather than text. */
  .placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }

  .placeholder-logo {
    width: 128px;
    height: 128px;
    object-fit: contain;
    opacity: 0.12;
    filter: grayscale(1);
    user-select: none;
    -webkit-user-select: none;
  }

  /* full-bleed variant: the chosen image covers the whole empty pane. */
  .placeholder-full {
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }

  .toolbar-bar {
    display: flex;
    align-items: center;
    padding: var(--space-2) var(--pane-pad);
    border-bottom: var(--hairline) solid var(--border-subtle);
    flex-shrink: 0;
  }

  .scroll:focus {
    outline: none;
  }
  .scroll:focus-visible {
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .scroll {
    flex: 1;
    /* min-height:0 is required for a flex child to scroll; without it the body
       grows the pane instead of scrolling inside it. */
    min-height: 0;
    overflow-y: auto;
    padding: var(--pane-pad);
    display: flex;
    flex-direction: column;
  }

  /* the html body iframe now sizes itself to its content (single scrollbar in the
     outer .scroll), so the wrap hugs it instead of stretching and leaving a gap. */
  .body-wrap {
    flex: 0 0 auto;
    margin-top: var(--space-4);
    display: flex;
    flex-direction: column;
  }
</style>
