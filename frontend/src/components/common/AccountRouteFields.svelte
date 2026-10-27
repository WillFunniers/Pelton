<script lang="ts">
  // the route a mailbox's connections take (#457), shared by the mailbox editor
  // and the add-mailbox wizard. The parent binds `route` and owns saving it.
  // The password is write-only, as in the Network settings: a stored one shows
  // as a placeholder and is kept while the field stays empty.
  import SegmentedSetting from '../settings/SegmentedSetting.svelte'
  import ToggleSwitch from './ToggleSwitch.svelte'
  import { t } from '../../lib/i18n'
  import type { AccountProxy } from '../../lib/types'

  export let route: AccountProxy
  // whether the mailbox signs in with a provider, the only case where the
  // sign-in refresh switch means anything.
  export let oauth = false

  function setMode(mode: string): void {
    route.mode = mode
  }

  // nudge the port to the scheme's usual default when it still holds the other
  // scheme's, the same as the Network settings do.
  function setScheme(scheme: string): void {
    route.scheme = scheme
    if (scheme === 'http' && (route.port === 1080 || !route.port)) route.port = 8080
    if (scheme === 'socks5' && route.port === 8080) route.port = 1080
  }

  const modeOptions = [
    { key: 'global', label: $t('mailboxes.route.mode.global') },
    { key: 'off', label: $t('mailboxes.route.mode.off') },
    { key: 'system', label: $t('mailboxes.route.mode.system') },
    { key: 'manual', label: $t('mailboxes.route.mode.manual') },
  ]
  const schemeOptions = [
    { key: 'socks5', label: 'SOCKS5' },
    { key: 'http', label: 'HTTP' },
  ]
</script>

<div class="route">
  <SegmentedSetting label={$t('mailboxes.route.label')} value={route.mode} options={modeOptions} on:change={(e) => setMode(e.detail)} />
  <p class="hint">{$t('mailboxes.route.hint')}</p>

  {#if route.mode === 'system'}
    <p class="hint">{$t('network.proxy.systemHint')}</p>
  {/if}

  {#if route.mode === 'manual'}
    <SegmentedSetting label={$t('network.proxy.type')} value={route.scheme} options={schemeOptions} on:change={(e) => setScheme(e.detail)} />
    <div class="servers">
      <label class="field"><span>{$t('network.proxy.host')}</span><input type="text" bind:value={route.host} placeholder="127.0.0.1" /></label>
      <label class="field narrow"><span>{$t('wizard.field.port')}</span><input type="number" bind:value={route.port} /></label>
    </div>
    <label class="field">
      <span>{$t('network.proxy.username')}</span>
      <input type="text" bind:value={route.username} placeholder={$t('network.proxy.optional')} />
    </label>
    <label class="field">
      <span>{$t('network.proxy.password')}</span>
      <input
        type="password"
        bind:value={route.password}
        autocomplete="off"
        placeholder={route.hasPassword && route.password === '' ? $t('network.proxy.passwordStored') : $t('network.proxy.optional')}
      />
    </label>
  {/if}

  <!-- on the app-wide setting everything already takes one route, so there is
       nothing to split off. -->
  {#if route.mode !== 'global'}
    <div class="toggle">
      <span>{$t('mailboxes.route.contacts')}</span>
      <ToggleSwitch
        checked={!route.contactsUseGlobal}
        label={$t('mailboxes.route.contacts')}
        on:change={(e) => (route.contactsUseGlobal = !e.detail)}
      />
    </div>
    {#if oauth}
      <div class="toggle">
        <span>{$t('mailboxes.route.oauth')}</span>
        <ToggleSwitch
          checked={!route.oauthUseGlobal}
          label={$t('mailboxes.route.oauth')}
          on:change={(e) => (route.oauthUseGlobal = !e.detail)}
        />
      </div>
    {/if}
    <p class="hint">{$t('mailboxes.route.scopeHint')}</p>
  {/if}
</div>

<style>
  .route {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .hint {
    margin: 0;
    font-size: var(--fz-label);
    color: var(--text-tertiary);
    line-height: 1.5;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .field span {
    font-size: var(--fz-label);
    color: var(--text-tertiary);
  }

  .field input {
    height: var(--control-height);
    padding: 0 var(--space-3);
    border: var(--hairline) solid var(--border-default);
    border-radius: var(--radius-control);
    background: var(--surface-sunken);
    color: var(--text-primary);
    outline: none;
  }

  .field input:focus {
    border-color: var(--accent);
  }

  .servers {
    display: flex;
    gap: var(--space-3);
  }

  .servers .field {
    flex: 1;
  }

  .servers .field.narrow {
    flex: 0 0 88px;
  }

  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    font-size: var(--fz-body);
    color: var(--text-primary);
  }
</style>
