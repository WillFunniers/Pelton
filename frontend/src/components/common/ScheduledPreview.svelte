<script lang="ts">
  // the read-only preview of one message still waiting in the outbox.
  //
  // It shows what the queue already holds, which is the point: the message was
  // frozen when it was scheduled, so what is on screen is what will be sent.
  // Nothing here can change it - there is no editor and no way to alter the
  // time - so looking costs nothing and the only action is cancelling it.
  //
  // The body renders in a frame of its own (see lib/scheduled.ts), not in this
  // document. The html arrives already sanitized by the backend with remote
  // content refused, and the frame adds a policy that allows no script and no
  // remote origin, so a scheduled message cannot fetch anything or run anything
  // while it is being looked at.
  import { createEventDispatcher, onMount } from 'svelte'
  import { IconPaperclip, IconLock } from '@tabler/icons-svelte'
  import Modal from './Modal.svelte'
  import Spinner from './Spinner.svelte'
  import ErrorState from './ErrorState.svelte'
  import { cancelSend, getScheduledPreview } from '../../lib/api'
  import { buildPreviewSrcdoc, previewHasFrame } from '../../lib/scheduled'
  import { formatBytes } from '../../lib/format'
  import { mailPalette, type MailPalette } from '../../lib/mailpalette'
  import { bodyFontStack } from '../../lib/fonts'
  import { prefs } from '../../stores/prefs'
  import { errorMessage, toastError, toastSuccess } from '../../stores/toast'
  import { t } from '../../lib/i18n'
  import type { ScheduledPreview } from '../../lib/types'

  /** The outbox row to preview. */
  export let id: number

  const dispatch = createEventDispatcher<{ close: void; cancelled: void }>()

  let preview: ScheduledPreview | null = null
  let failed = ''
  let cancelling = false
  let confirmingCancel = false

  // The frame cannot see the app stylesheet, so every theme value it renders
  // with is read off the root element and written into the srcdoc instead.
  let palette: MailPalette = mailPalette(false, () => '')
  let pageBackground = ''

  onMount(() => {
    const root = document.documentElement
    const readToken = (token: string): string => getComputedStyle(root).getPropertyValue(token).trim()
    palette = mailPalette(root.getAttribute('data-theme') === 'dark', readToken)
    // the page colour a message with no background of its own sits on.
    pageBackground = palette.page.hex
    void load()
  })

  async function load(): Promise<void> {
    try {
      preview = await getScheduledPreview(id)
    } catch (err) {
      failed = errorMessage(err)
    }
  }

  $: srcdoc =
    preview && previewHasFrame(preview)
      ? buildPreviewSrcdoc({
          html: preview.html,
          palette,
          fontSize: $prefs.messageFontSize,
          font: bodyFontStack($prefs.bodyFont) ?? readToken('--font-ui'),
          pageBackground,
        })
      : ''

  function readToken(token: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  }

  // confirmCancel deletes the queued message. It deliberately depends on nothing
  // the preview loaded: cancelling needs only the id this pane was opened with,
  // so a preview that failed to parse, is still loading, or cannot be shown at
  // all must not stop the user from calling the send off. The button is disabled
  // only while the cancel itself is in flight.
  async function confirmCancel(): Promise<void> {
    cancelling = true
    try {
      const cancelled = await cancelSend(id)
      if (cancelled) {
        toastSuccess($t('scheduled.cancelled'))
        dispatch('cancelled')
        dispatch('close')
      } else {
        // the worker claimed it between opening the preview and clicking, so
        // there is nothing left to recall.
        toastError($t('scheduled.tooLate'))
        await load()
      }
    } catch (err) {
      toastError(errorMessage(err))
    } finally {
      cancelling = false
      confirmingCancel = false
    }
  }
</script>

<Modal
  title={$t('scheduled.previewTitle')}
  size="large"
  on:close={() => dispatch('close')}
>
  {#if failed}
    <ErrorState message={failed} />
  {:else if !preview}
    <div class="loading"><Spinner /></div>
  {:else}
    <dl class="meta">
      <dt>{$t('scheduled.from')}</dt>
      <dd>{preview.from}</dd>
      <dt>{$t('scheduled.to')}</dt>
      <dd>{preview.to || $t('common.outboxPanel.noRecipients')}</dd>
      {#if preview.cc}
        <dt>{$t('scheduled.cc')}</dt>
        <dd>{preview.cc}</dd>
      {/if}
      <dt>{$t('scheduled.subject')}</dt>
      <dd>{preview.subject}</dd>
      <dt>{$t('scheduled.when')}</dt>
      <dd>{preview.scheduledAt}</dd>
    </dl>

    {#if preview.hiddenBccCount > 0}
      <!-- bcc never reaches the transmitted headers, so the addresses cannot be
           recovered from the stored message. only the count is known. -->
      <p class="hidden-bcc">
        {$t('scheduled.hiddenBcc').replace('{count}', String(preview.hiddenBccCount))}
      </p>
    {/if}

    {#if preview.protected}
      <p class="protected">
        <IconLock size={15} stroke={1.8} />
        <span>{$t('scheduled.protected')}</span>
      </p>
    {:else if srcdoc}
      <iframe
        class="body"
        title={$t('scheduled.bodyTitle')}
        sandbox=""
        referrerpolicy="no-referrer"
        {srcdoc}
      ></iframe>
    {:else}
      <pre class="plain">{preview.text}</pre>
    {/if}

    {#if preview.attachments.length > 0}
      <div class="attachments">
        <span class="attachments-title">
          {$t('scheduled.attachments').replace('{count}', String(preview.attachments.length))}
        </span>
        <ul>
          {#each preview.attachments as att (att.filename + att.size)}
            <li>
              <IconPaperclip size={14} stroke={1.7} />
              <span class="name">{att.filename}</span>
              <span class="size">{formatBytes(att.size)}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}

  <svelte:fragment slot="footer">
    {#if confirmingCancel}
      <span class="confirm">{$t('scheduled.cancelConfirm')}</span>
      <button type="button" class="ghost" on:click={() => (confirmingCancel = false)}>
        {$t('common.outboxPanel.discardCancel')}
      </button>
      <button type="button" class="danger" disabled={cancelling} on:click={confirmCancel}>
        {$t('scheduled.cancelConfirmYes')}
      </button>
    {:else}
      <button type="button" class="ghost" on:click={() => dispatch('close')}>
        {$t('scheduled.close')}
      </button>
      <button
        type="button"
        class="danger"
        disabled={cancelling}
        on:click={() => (confirmingCancel = true)}
      >
        {$t('scheduled.cancel')}
      </button>
    {/if}
  </svelte:fragment>
</Modal>

<style>
  .loading {
    display: flex;
    justify-content: center;
    padding: 24px 0;
  }

  .meta {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    margin: 0 0 10px;
    font-size: var(--fz-label);
  }

  .meta dt {
    color: var(--text-tertiary);
  }

  .meta dd {
    margin: 0;
    color: var(--text-primary);
    overflow-wrap: anywhere;
  }

  .hidden-bcc {
    margin: 0 0 8px;
    font-size: var(--fz-meta);
    color: var(--text-tertiary);
  }

  .protected {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 10px;
    padding: 10px 12px;
    border: var(--hairline) solid var(--border-default);
    border-radius: var(--radius-control);
    background: var(--surface-sunken);
    color: var(--text-secondary);
    font-size: var(--fz-label);
  }

  .body {
    width: 100%;
    height: 320px;
    border: var(--hairline) solid var(--border-default);
    border-radius: var(--radius-control);
    background: var(--surface-base);
  }

  .plain {
    margin: 0;
    max-height: 320px;
    overflow: auto;
    padding: 10px 12px;
    border: var(--hairline) solid var(--border-default);
    border-radius: var(--radius-control);
    background: var(--surface-sunken);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--fz-body);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .attachments {
    margin-top: 12px;
  }

  .attachments-title {
    display: block;
    margin-bottom: 4px;
    color: var(--text-tertiary);
    font-size: var(--fz-meta);
  }

  .attachments ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .attachments li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-control);
    font-size: var(--fz-label);
  }

  .attachments li + li {
    margin-top: 4px;
  }

  .attachments .name {
    flex: 1;
    color: var(--text-primary);
    overflow-wrap: anywhere;
  }

  .attachments .size {
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  .confirm {
    margin-inline-end: auto;
    color: var(--text-secondary);
    font-size: var(--fz-label);
  }

  .ghost,
  .danger {
    padding: 6px 12px;
    border-radius: var(--radius-control);
    border: var(--hairline) solid var(--border-default);
    background: transparent;
    color: var(--text-primary);
    font-size: var(--fz-label);
    cursor: pointer;
  }

  .danger {
    border-color: var(--danger);
    color: var(--danger);
  }

  .danger:disabled,
  .ghost:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
