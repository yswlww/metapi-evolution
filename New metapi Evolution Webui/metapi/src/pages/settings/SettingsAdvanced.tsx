import { useEffect, useState, type ReactNode } from 'react';
import { Field, TextInput, TextArea, Toggle } from '../../components/EditDrawer';
import { useUiText } from '../../i18n/useUiText';
import { useToast } from '../../components/Toast';
import { testSystemProxy, fetchRuntimeSettings, updateRuntimeSettings, clearRuntimeCache, clearUsageData, factoryReset } from '../../lib/source';
import { finiteNumber, integerNumber, ROUTING_PRESETS, resolveRoutingProfilePreset, settingsDirty } from '../../lib/settingsParity';
import { runModelProbe } from '../../lib/settingsParityApi';
import { useLocalSettingsText } from './localSettingsText';
import { PARITY_ACTION_CLASS, PARITY_SELECT_CLASS } from '../../lib/settingsParityStyles';
import PayloadRulesEditor from './PayloadRulesEditor';
import DatabaseSettings from './DatabaseSettings';

const numberKeys = ['proxySessionChannelConcurrencyLimit', 'proxySessionChannelQueueWaitMs', 'routingFallbackUnitCost', 'proxyFirstByteTimeoutSec', 'tokenRouterFailureCooldownMaxSec'];
const arrayKeys = ['proxyErrorKeywords', 'globalBlockedBrands', 'globalAllowedModels'];
const saveKeys = ['systemProxyUrl', 'proxyEmptyContentFailEnabled', 'codexUpstreamWebsocketEnabled', 'responsesCompactFallbackToResponsesEnabled', 'modelAvailabilityProbeEnabled', 'routingWeights', ...numberKeys, ...arrayKeys];
function Section({title, desc, children}: {title: string; desc?: string; children: ReactNode}) {
  return <section className="card p-5"><h2 className="font-mono text-[11px] tracking-[0.2em] uppercase text-[color:var(--color-lime)]">{title}</h2>{desc && <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">{desc}</p>}<div className="mt-4 space-y-3">{children}</div></section>;
}
export default function SettingsAdvanced({runtime, onSaved, onDirtyChange}: {runtime?: Record<string, unknown>; onSaved?: (settings: Record<string, unknown>) => void; onDirtyChange?: (dirty: boolean) => void}) {
  const t = useUiText(); const local = useLocalSettingsText(); const {showToast} = useToast();
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null);
  const [payloadRules, setPayloadRules] = useState('{}'); const [savedPayload, setSavedPayload] = useState('{}');
  const [proxyTokenValue, setProxyTokenValue] = useState('');
  const [payloadEditorRevision, setPayloadEditorRevision] = useState(0);
  const [factoryResetConfirm, setFactoryResetConfirm] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const apply = (settings: Record<string, unknown>) => {
    const form = Object.fromEntries(saveKeys.map(key => [key, arrayKeys.includes(key) ? (Array.isArray(settings[key]) ? (settings[key] as string[]).join(', ') : '') : settings[key]]));
    setDraft(form); setSaved(structuredClone(form));
    const payload = JSON.stringify(settings.payloadRules ?? {}, null, 2); setPayloadRules(payload); setSavedPayload(payload); setProxyTokenValue(''); setPayloadEditorRevision(value => value + 1);
  };
  useEffect(() => {if (runtime) {apply(runtime); return;} let active = true; fetchRuntimeSettings().then(settings => {if (active) apply(settings as Record<string, unknown>);}).catch(error => {if (active) setError(error instanceof Error ? error.message : t('ui.settings.err_load'));}); return () => {active = false;};}, [runtime]);
  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true); setError('');
    try {await action(); showToast(message);} catch (error) {setError(error instanceof Error ? error.message : t('ui.adv.err_op'));}
    finally {setBusy(false);}
  };
  const patch = (key: string, value: unknown) => setDraft(previous => ({...previous, [key]: value}));
  const save = () => {
    if (!draft) return;
    let payload: Record<string, unknown>;
    try {
      const rules = JSON.parse(payloadRules.trim() || '{}');
      if (!rules || typeof rules !== 'object' || Array.isArray(rules)) throw new Error(t('ui.adv.payload_rules_json'));
      payload = {...draft, payloadRules: rules, proxyEmptyContentFailEnabled: draft.proxyEmptyContentFailEnabled};
      for (const key of numberKeys) payload[key] = key === 'routingFallbackUnitCost' ? finiteNumber(draft[key], Number.MIN_VALUE) : integerNumber(draft[key], key === 'proxySessionChannelConcurrencyLimit' || key === 'tokenRouterFailureCooldownMaxSec' ? 1 : 0);
      for (const key of arrayKeys) payload[key] = String(draft[key] ?? '').split(',').map(item => item.trim()).filter(Boolean);
      if (proxyTokenValue.trim()) payload.proxyToken = proxyTokenValue.trim();
    } catch {setError(local('Invalid number or payload JSON.', '數值或 payload JSON 無效。', '数值或 payload JSON 无效。')); return;}
    if (draft.modelAvailabilityProbeEnabled === true && saved?.modelAvailabilityProbeEnabled !== true && !window.confirm(local('Enabling probes sends requests to upstreams and may incur charges. Continue?', '啟用探測會傳送上游請求，可能產生費用。是否繼續？', '启用探测会发送上游请求，可能产生费用。是否继续？'))) return;
    void run(async () => {await updateRuntimeSettings(payload); const next = await fetchRuntimeSettings() as Record<string, unknown>; apply(next); onSaved?.(next);}, t('ui.settings.saved'));
  };
  const cancel = () => {if (saved) setDraft(structuredClone(saved)); setPayloadRules(savedPayload); setProxyTokenValue(''); setPayloadEditorRevision(value => value + 1); setError('');};
  const input = (label: string, key: string, type = 'text') => <Field label={label}><TextInput type={type} value={String(draft?.[key] ?? '')} onChange={event => patch(key, event.target.value)} /></Field>;
  const toggle = (label: string, key: string) => <Field label={label}><Toggle checked={draft?.[key] === true} onChange={value => patch(key, value)} /></Field>;
  const dirty = settingsDirty(draft, saved) || payloadRules !== savedPayload || !!proxyTokenValue;
  useEffect(() => {onDirtyChange?.(dirty);}, [dirty, onDirtyChange]);
  const preset = draft?.routingWeights ? resolveRoutingProfilePreset(draft.routingWeights as typeof ROUTING_PRESETS.balanced) : 'custom';
  return <div className="space-y-5">
    {error && <p role="alert">{error}</p>}
    {!draft ? <button
 className={PARITY_ACTION_CLASS}
onClick={() => run(async () => apply(await fetchRuntimeSettings() as Record<string, unknown>), t('ui.settings.saved'))}>{local('Reload settings', '重新載入設定', '重新加载设置')}</button> : <fieldset disabled={busy} className="space-y-5 min-w-0">
      <Section title={t('ui.settings.adv_proxy_title')} desc={t('ui.settings.adv_proxy_desc')}>
        {input(t('ui.settings.adv_proxy_title'), 'systemProxyUrl')}
        <button
 className={PARITY_ACTION_CLASS}
disabled={busy} onClick={() => run(() => testSystemProxy({proxyUrl: String(draft.systemProxyUrl ?? '')}), t('ui.settings.adv_proxy_tested'))}>{t('ui.settings.adv_test')}</button>
      </Section>
      <Section title={t('ui.settings.adv_fail_title')} desc={t('ui.settings.adv_fail_desc')}>
        <TextArea value={String(draft.proxyErrorKeywords ?? '')} onChange={event => patch('proxyErrorKeywords', event.target.value)} rows={2} />
        {toggle(t('ui.settings.adv_empty_content'), 'proxyEmptyContentFailEnabled')}
      </Section>
      <Section title={t('ui.settings.adv_payload_title')} desc={t('ui.settings.adv_payload_desc')}><PayloadRulesEditor key={payloadEditorRevision} value={payloadRules} onChange={setPayloadRules} /></Section>
      <Section title={t('ui.settings.adv_codex_title')} desc={t('ui.settings.adv_codex_desc')}>
        {toggle(t('ui.settings.adv_websocket'), 'codexUpstreamWebsocketEnabled')}
        {toggle(t('ui.settings.adv_responses_fallback'), 'responsesCompactFallbackToResponsesEnabled')}
        {input(t('ui.settings.adv_concurrency'), 'proxySessionChannelConcurrencyLimit', 'number')}
        {input(local('Queue wait (milliseconds, 0 disables waiting)', '排隊等待（毫秒，0 停用等待）', '排队等待（毫秒，0 禁用等待）'), 'proxySessionChannelQueueWaitMs', 'number')}
      </Section>
      <Section title={t('ui.settings.adv_probe_title')} desc={t('ui.settings.adv_probe_desc')}>
        {toggle(t('ui.settings.adv_probe_enabled'), 'modelAvailabilityProbeEnabled')}
        <button
 className={PARITY_ACTION_CLASS}
disabled={busy || saved?.modelAvailabilityProbeEnabled !== true} onClick={() => {
          if (!window.confirm(local('Probe all models now? Upstream requests may incur charges.', '立即探測所有模型？上游請求可能產生費用。', '立即探测所有模型？上游请求可能产生费用。'))) return;
          void run(runModelProbe, local('Model availability probe queued.', '模型可用性探測已排程。', '模型可用性探测已排队。'));
        }}>{t('ui.settings.adv_probe_run')}</button>
      </Section>
      <Section title={t('ui.settings.adv_proxy_token')} desc={t('ui.settings.adv_proxy_token_desc')}>
        <TextInput type="password" value={proxyTokenValue} onChange={event => setProxyTokenValue(event.target.value)} />
        <button
 className={PARITY_ACTION_CLASS}
disabled={busy} onClick={() => {const bytes = crypto.getRandomValues(new Uint8Array(24)); setProxyTokenValue('sk-' + Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''));}}>{t('ui.settings.adv_regenerate')}</button>
      </Section>
      <Section title={t('ui.settings.adv_route_strategy')} desc={t('ui.settings.adv_route_strategy_desc')}>
        <Field label={t('ui.settings.adv_preset')}><select
 className={PARITY_SELECT_CLASS}
value={preset} onChange={event => {if (event.target.value !== 'custom') patch('routingWeights', {...ROUTING_PRESETS[event.target.value as keyof typeof ROUTING_PRESETS]});}}>
          <option value="custom">{local('Custom', '自訂', '自定义')}</option><option value="balanced">{t('ui.status.balanced')}</option>
          <option value="cost">{local('Cost first', '成本優先', '成本优先')}</option><option value="stable">{local('Stability first', '穩定優先', '稳定优先')}</option>
        </select></Field>
        {input(t('ui.settings.adv_fallback_cost'), 'routingFallbackUnitCost', 'number')}
        {input(t('ui.settings.adv_first_byte'), 'proxyFirstByteTimeoutSec', 'number')}
        {input(local('Failure cooldown (seconds)', '失敗冷卻（秒）', '失败冷却（秒）'), 'tokenRouterFailureCooldownMaxSec', 'number')}
      </Section>
      <Section title={t('ui.settings.adv_blocklist')} desc={t('ui.settings.adv_blocklist_desc')}>
        {input(t('ui.settings.adv_blocked_brands'), 'globalBlockedBrands')}{input(t('ui.settings.adv_allowed_models'), 'globalAllowedModels')}
      </Section>
      <div className="card p-4 flex flex-wrap gap-3"><button
 className={PARITY_ACTION_CLASS}
disabled={busy || !dirty} onClick={save}>{t('ui.common.save')}</button><button
 className={PARITY_ACTION_CLASS}
disabled={busy || !dirty} onClick={cancel}>{t('ui.common.cancel')}</button>{dirty && <span>{local('Unsaved changes', '尚未儲存變更', '尚未保存更改')}</span>}</div>
    </fieldset>}
    <DatabaseSettings />
    <Section title={t('ui.settings.adv_factory_title')} desc={t('ui.settings.adv_factory_desc')}>
      <div className="flex flex-wrap gap-3">
        <button
 className={PARITY_ACTION_CLASS}
disabled={busy} onClick={() => {if (window.confirm(t('ui.settings.adv_clear_cache_confirm'))) void run(clearRuntimeCache, t('ui.settings.saved'));}}>{t('ui.settings.adv_clear_cache')}</button>
        <button
 className={PARITY_ACTION_CLASS}
disabled={busy} onClick={() => {if (window.confirm(t('ui.settings.adv_clear_usage_confirm'))) void run(clearUsageData, t('ui.settings.saved'));}}>{t('ui.settings.adv_clear_usage')}</button>
        <button
 className={PARITY_ACTION_CLASS}
disabled={busy} onClick={() => setFactoryResetConfirm(true)}>{t('ui.settings.adv_factory_reset')}</button>
        {factoryResetConfirm && <div className="rounded-lg border border-[color:var(--color-rose)]/40 bg-[color:var(--color-rose)]/10 p-4 space-y-3"><p>{t('ui.settings.adv_factory_confirm')}</p><button className={PARITY_ACTION_CLASS} disabled={busy} onClick={() => setFactoryResetConfirm(false)}>{t('ui.common.cancel')}</button><button className={PARITY_ACTION_CLASS} disabled={busy} onClick={() => {if (window.confirm(t('ui.settings.adv_factory_confirm'))) {setFactoryResetConfirm(false); void run(factoryReset, t('ui.settings.adv_factory_done'));}}}>{t('ui.settings.adv_factory_reset')}</button></div>}
      </div>
    </Section>
  </div>;
}
