<script lang="ts">
  // the Developer menu (#188): what the F-keys do, and somewhere to click when
  // you have not memorised them.
  //
  // The overlays were reachable only by keys nobody had been told about, which
  // made them invisible to anyone who had not read the issue. This hangs off the
  // DEV badge that is already in the status bar during a developer run, so the
  // list is where someone in dev mode is already looking rather than behind a
  // further key they would also have to know.
  //
  // The labels are English and not translated, matching the panels themselves:
  // nothing here is reachable in a build anyone runs as a mail client, so a
  // developer surface is not worth carrying through eight catalogs. The names
  // are the panel titles verbatim, so the menu entry and the window it opens
  // read the same.
  import { createEventDispatcher } from 'svelte'
  import { IconActivity, IconCpu, IconGauge, IconCheck } from '@tabler/icons-svelte'
  import type { ComponentType } from 'svelte'
  import { overlayKeys, openOverlays, toggleOverlay, type DevOverlay } from '../../stores/devoverlays'

  const dispatch = createEventDispatcher<{ close: void }>()

  const icons: Record<DevOverlay, ComponentType> = {
    activity: IconActivity,
    process: IconCpu,
    performance: IconGauge,
  }

  const labels: Record<DevOverlay, string> = {
    activity: 'Activity',
    process: 'Process',
    performance: 'Frames',
  }

  // read off the key table so the two cannot drift: a key rebound there is
  // relabelled here.
  const entries = Object.entries(overlayKeys).map(([key, overlay]) => ({ key, overlay }))

  function choose(overlay: DevOverlay): void {
    toggleOverlay(overlay)
    dispatch('close')
  }
</script>

<div class="menu" role="menu">
  <span class="menu-label">Developer overlays</span>
  {#each entries as entry (entry.overlay)}
    <button
      type="button"
      class="opt"
      role="menuitemcheckbox"
      aria-checked={$openOverlays.has(entry.overlay)}
      on:click={() => choose(entry.overlay)}
    >
      <span class="tick">
        {#if $openOverlays.has(entry.overlay)}<IconCheck size={13} stroke={2} />{/if}
      </span>
      <svelte:component this={icons[entry.overlay]} size={14} stroke={1.7} />
      <span class="name">{labels[entry.overlay]}</span>
      <kbd>{entry.key}</kbd>
    </button>
  {/each}
  <p class="note">Read on this machine and shown here only. Nothing is sent anywhere.</p>
</div>

<style>
  .menu {
    width: 260px;
    padding: var(--space-1);
    border: var(--hairline) solid var(--border-default);
    border-radius: var(--radius-card);
    background: var(--surface-overlay);
    box-shadow: var(--shadow-overlay);
  }

  .menu-label {
    display: block;
    padding: var(--space-2) var(--space-2) var(--space-1);
    font-size: var(--fz-meta);
    color: var(--text-tertiary);
  }

  .opt {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    border: none;
    background: transparent;
    color: var(--text-primary);
    cursor: var(--cursor-action);
    text-align: start;
    padding: var(--space-2);
    border-radius: var(--radius-control);
    font-size: var(--fz-label);
  }
  .opt:hover {
    background: var(--surface-hover);
  }

  /* the tick keeps its column whether or not it is showing, so the labels do
     not shift sideways as panels are opened and closed. */
  .tick {
    display: inline-flex;
    justify-content: center;
    width: 13px;
    flex-shrink: 0;
    color: var(--accent);
  }

  .name {
    flex: 1;
  }

  kbd {
    padding: 1px var(--space-2);
    border: var(--hairline) solid var(--border-default);
    border-radius: var(--radius-control);
    background: var(--surface-raised);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--fz-meta);
    line-height: 1.4;
  }

  .note {
    margin: var(--space-1) 0 0;
    padding: var(--space-2);
    border-top: var(--hairline) solid var(--border-default);
    font-size: var(--fz-meta);
    color: var(--text-tertiary);
  }
</style>
