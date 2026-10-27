<script lang="ts">
  // the scheduled-send list: every queued message whose time has not come yet.
  //
  // It is a list of decisions still open, which is why it does not show mail
  // already on its way. Each row is enough to recognise the message - when it
  // goes, what it is called, who it goes to, how many files ride along - and the
  // two things worth doing with one: look at it, or call it off.
  //
  // The preview reads the frozen message, so nothing shown here can be edited.
  // Cancel is the only change this surface can make, and it is the same atomic
  // cancel the outbox popover uses.
  import { createEventDispatcher } from 'svelte'
  import { IconClock, IconPaperclip, IconEye, IconX } from '@tabler/icons-svelte'
  import ScheduledPreview from './ScheduledPreview.svelte'
  import { outbox, loadOutbox } from '../../stores/outbox'
  import { cancelSend } from '../../lib/api'
  import { isScheduledRow } from '../../lib/scheduled'
  import { formatWeekdayTime, type TimeFormat } from '../../lib/format'
  import { prefs } from '../../stores/prefs'
  import { errorMessage, toastError, toastSuccess } from '../../stores/toast'
  import { t } from '../../lib/i18n'
  import type { OutboxRow } from '../../lib/types'

  const dispatch = createEventDispatcher<{ close: void }>()

  /** The row whose preview is open, or null. */
  let previewId: number | null = null
  let cancelling: number | null = null

  $: scheduled = $outbox.filter(isScheduledRow)

  function recipientLabel(row: OutboxRow): string {
    if (row.recipients.length === 0) {
      return $t('common.outboxPanel.noRecipients')
    }
    if (row.recipients.length === 1) {
      return row.recipients[0]
    }
    return `${row.recipients[0]} +${row.recipients.length - 1}`
  }

  function formatScheduled(iso: string): string {
    return formatWeekdayTime(new Date(iso), $prefs.timeFormat as TimeFormat)
  }

  async function cancel(id: number): Promise<void> {
    cancelling = id
    try {
      const cancelled = await cancelSend(id)
      if (cancelled) {
        toastSuccess($t('scheduled.cancelled'))
      } else {
        toastError($t('scheduled.tooLate'))
      }
    } catch (err) {
      toastError(errorMessage(err))
    } finally {
      cancelling = null
      await loadOutbox()
    }
  }

  async function onCancelled(): Promise<void> {
    previewId = null
    await loadOutbox()
  }
</script>

<div class="panel" role="dialog" aria-label={$t('scheduled.title')}>
  <header>
    <span class="title">{$t('scheduled.title')}</span>
    <button
      type="button"
      class="close"
      aria-label={$t('scheduled.closePanel')}
      on:click={() => dispatch('close')}
    >
      <IconX size={14} stroke={1.8} />
    </button>
  </header>

  {#if scheduled.length === 0}
    <p class="empty">{$t('scheduled.empty')}</p>
  {:else}
    <ul>
      {#each scheduled as row (row.id)}
        <li class="item">
          <span class="when">
            <IconClock size={13} stroke={1.8} />
            <span>{formatScheduled(row.nextAttemptAt)}</span>
          </span>
          <span class="subject">{row.subject || $t('scheduled.noSubject')}</span>
          <span class="to">{recipientLabel(row)}</span>
          {#if row.attachmentCount > 0}
            <span class="files">
              <IconPaperclip size={12} stroke={1.8} />
              <span>{row.attachmentCount}</span>
            </span>
          {/if}
          <span class="actions">
            <button
              type="button"
              class="action"
              aria-label={$t('scheduled.view')}
              title={$t('scheduled.view')}
              on:click={() => (previewId = row.id)}
            >
              <IconEye size={13} stroke={1.8} />
            </button>
            <button
              type="button"
              class="action danger"
              disabled={cancelling === row.id}
              aria-label={$t('scheduled.cancel')}
              title={$t('scheduled.cancel')}
              on:click={() => cancel(row.id)}
            >
              <IconX size={13} stroke={1.8} />
            </button>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if previewId !== null}
  <ScheduledPreview id={previewId} on:close={() => (previewId = null)} on:cancelled={onCancelled} />
{/if}

<style>
  .panel {
    width: 340px;
    max-height: 360px;
    display: flex;
    flex-direction: column;
    border: var(--hairline) solid var(--border-default);
    border-radius: var(--radius-card);
    background: var(--surface-overlay);
    box-shadow: var(--shadow-overlay);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .title {
    color: var(--text-secondary);
    font-size: var(--fz-label);
    font-weight: var(--fw-medium);
  }

  .close {
    display: flex;
    padding: 2px;
    border: 0;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
  }

  .close:hover {
    color: var(--text-primary);
  }

  .empty {
    margin: 0;
    padding: 16px 12px;
    color: var(--text-tertiary);
    font-size: var(--fz-label);
    text-align: center;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
  }

  .item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 8px;
    padding: 8px 10px;
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .item:last-child {
    border-bottom: 0;
  }

  .when {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--text-tertiary);
    font-size: var(--fz-meta);
  }

  .subject {
    grid-column: 1 / -1;
    color: var(--text-primary);
    font-size: var(--fz-label);
    overflow-wrap: anywhere;
  }

  .to {
    grid-column: 1;
    color: var(--text-secondary);
    font-size: var(--fz-meta);
    overflow-wrap: anywhere;
  }

  .files {
    display: flex;
    align-items: center;
    gap: 3px;
    color: var(--text-tertiary);
    font-size: var(--fz-meta);
  }

  .actions {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    gap: 2px;
    justify-content: flex-end;
  }

  .action {
    display: flex;
    padding: 3px;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
  }

  .action:hover {
    color: var(--text-primary);
    background: var(--surface-hover);
  }

  .action.danger:hover {
    color: var(--danger);
    background: var(--danger-bg);
  }

  .action:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
