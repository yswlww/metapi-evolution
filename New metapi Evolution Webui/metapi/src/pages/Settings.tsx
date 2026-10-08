import { useEffect, useState } from 'react';
import { Bell, Save, ShieldCheck, SlidersHorizontal, Terminal } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { Field, TextInput, Toggle } from '../components/EditDrawer';
import { useUiText } from '../i18n/useUiText';
import { useToast } from '../components/Toast';
import SettingsAdvanced from './settings/SettingsAdvanced';
import { useLocalSettingsText } from './settings/localSettingsText';
import ChannelConfigDrawer from './notifications/ChannelConfigDrawer';
import { NOTIFY_KINDS, NOTIFICATION_FIELDS, type NotifyKind } from '../lib/settingsParityNotifications';
import { integerNumber, SettingsInputError, settingsDirty, mergeSettingsDraft } from '../lib/settingsParity';
import { PARITY_SELECT_CLASS, PARITY_ACTION_CLASS } from '../lib/settingsParityStyles';
import { fetchRuntimeSettings, updateRuntimeSettings, testNotification } from '../lib/source';

type TabKey = 'general' | 'notify' | 'security' | 'advanced';
const generalKeys = ['checkinCron', 'checkinScheduleMode', 'checkinIntervalHours', 'balanceRefreshCron', 'logCleanupCron', 'logCleanupRetentionDays', 'logCleanupUsageLogsEnabled', 'logCleanupProgramLogsEnabled', 'tokenRouterFailureCooldownMaxSec', 'routingWeights', 'adminIpAllowlist'];
const notifyEnabledKeys = NOTIFY_KINDS.map(kind => NOTIFICATION_FIELDS[kind][0].key);
function RowField({label, desc, value, onChange, suffix}: {label: string; desc?: string; value: string; onChange: (value: string) => void; suffix?: string}) {
  return <div className="card p-4"><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div className="min-w-0"><div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--color-muted)]">{label}</div>{desc && <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">{desc}</p>}</div><div className="flex items-center gap-2">{suffix && <span className="font-mono text-xs text-[color:var(--color-muted)]">{suffix}</span>}<TextInput aria-label={label} value={value} onChange={event => onChange(event.target.value)} /></div></div></div>;
}
export default function SettingsPage() {
  const t = useUiText(); const local = useLocalSettingsText(); const {showToast} = useToast();
  const [tab, setTab] = useState<TabKey>('general');
  const [advancedDirty, setAdvancedDirty] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null);
  const [runtime, setRuntime] = useState<Record<string, unknown>>({});
  const [configKind, setConfigKind] = useState<NotifyKind | null>(null);
  const [saving, setSaving] = useState(false); const [testing, setTesting] = useState(false); const [error, setError] = useState('');
  const formFrom = (settings: Record<string, unknown>) => Object.fromEntries([...generalKeys, ...notifyEnabledKeys].map(key => [key, key === 'adminIpAllowlist' ? (Array.isArray(settings[key]) ? (settings[key] as string[]).join(', ') : '') : settings[key]]));
  const apply = (settings: Record<string, unknown>) => {setRuntime(settings); const form = formFrom(settings); setDraft(form); setSaved(structuredClone(form)); setError('');};
  const reload = async () => apply(await fetchRuntimeSettings() as Record<string, unknown>);
  useEffect(() => {let active = true; fetchRuntimeSettings().then(settings => {if (active) apply(settings as Record<string, unknown>);}).catch(error => {if (active) setError(error instanceof Error ? error.message : t('ui.settings.err_load'));}); return () => {active = false;};}, []);
  const patch = (key: string, value: unknown) => setDraft(previous => ({...previous, [key]: value}));
  const dirty = settingsDirty(draft, saved);
  const saveAll = async () => {
    if (!draft) return;
    setSaving(true); setError('');
    try {
      const payload: Record<string, unknown> = {...draft, adminIpAllowlist: String(draft.adminIpAllowlist ?? '').split(',').map(item => item.trim()).filter(Boolean)};
      for (const key of ['checkinIntervalHours', 'logCleanupRetentionDays', 'tokenRouterFailureCooldownMaxSec']) {
        payload[key] = integerNumber(draft[key], 1);
      }
      await updateRuntimeSettings(payload); await reload(); showToast(t('ui.settings.saved'));
    } catch (error) {setError(error instanceof SettingsInputError ? local('Check numeric settings: positive whole numbers are required.', '請檢查數值設定：必須是正整數。', '请检查数值设置：必须是正整数。') : error instanceof Error ? error.message : t('ui.toast.save_failed'));}
    finally {setSaving(false);}
  };
  const cancelAll = () => {if (saved) setDraft(structuredClone(saved)); setConfigKind(null); setError(''); showToast(t('ui.settings.cancelled'));};
  const mergeSavedRuntime = (next: Record<string, unknown>) => {
    setRuntime(next);
    const form = formFrom(next);
    setDraft(previous => mergeSettingsDraft(previous, saved, form));
    setSaved(structuredClone(form));
  };
  const onChannelSaved = async () => {
    mergeSavedRuntime(await fetchRuntimeSettings() as Record<string, unknown>);
    showToast(t('ui.settings.saved'));
  };
  const row = (labelKey: string, descKey: string, key: string, suffix?: string) => <RowField label={t(labelKey)} desc={t(descKey)} value={String(draft?.[key] ?? '')} onChange={value => patch(key, value)} suffix={suffix} />;
  return <div className="space-y-8">
    <PageHeader eyebrow={t('ui.settings.eyebrow')} title={t('ui.settings.title')} description={t('ui.settings.desc')} actions={draft && tab !== 'advanced' ? <span className={`chip chip-${dirty ? 'amber' : 'lime'}`}>{dirty ? local('Unsaved', '尚未儲存', '尚未保存') : t('ui.settings.saved_badge')}</span> : undefined} />
    {error && <div role="alert">{error}<button className={PARITY_ACTION_CLASS} type="button" onClick={() => reload().catch(error => setError(String(error)))}>{local('Reload', '重新載入', '重新加载')}</button></div>}
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
      <nav className="card h-fit p-3">{([
        {key: 'general', label: t('ui.settings.tab_general'), icon: <SlidersHorizontal size={14} />},
        {key: 'notify', label: t('ui.settings.tab_notify'), icon: <Bell size={14} />},
        {key: 'security', label: t('ui.settings.tab_security'), icon: <ShieldCheck size={14} />},
        {key: 'advanced', label: t('ui.settings.tab_advanced'), icon: <Terminal size={14} />},
      ] as const).map(item => <button key={item.key} type="button" onClick={() => {if (tab === 'advanced' && advancedDirty && !window.confirm(local('Discard unsaved advanced changes?', '捨棄未儲存的進階變更？', '丢弃未保存的高级更改？'))) return; setTab(item.key);}} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${tab === item.key ? 'bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]' : 'text-[color:var(--color-fg)]/75 hover:bg-white/[0.03]'}`}>{item.icon}{item.label}</button>)}</nav>
      <div className="space-y-4">
        {tab === 'advanced' ? <SettingsAdvanced runtime={draft ? runtime : undefined} onSaved={mergeSavedRuntime} onDirtyChange={setAdvancedDirty} /> : draft && <fieldset disabled={saving} className="space-y-4 min-w-0">
          {tab === 'general' && <>
            <div className="card p-4"><Field label={local('Checkin schedule mode', '簽到排程模式', '签到排程模式')}><select className={PARITY_SELECT_CLASS}
value={String(draft.checkinScheduleMode ?? 'cron')} onChange={event => patch('checkinScheduleMode', event.target.value)}><option value="cron">Cron</option><option value="interval">{local('Interval', '間隔', '间隔')}</option></select></Field></div>
            {draft.checkinScheduleMode === 'interval' ? <RowField label={local('Checkin interval', '簽到間隔', '签到间隔')} value={String(draft.checkinIntervalHours ?? '')} onChange={value => patch('checkinIntervalHours', value)} suffix={local('hours', '小時', '小时')} /> : row('ui.settings.checkin_cron', 'ui.settings.checkin_cron_desc', 'checkinCron')}
            {row('ui.settings.balance_cron', 'ui.settings.balance_cron_desc', 'balanceRefreshCron')}
            {row('ui.settings.log_cleanup_cron', 'ui.settings.log_cleanup_cron_desc', 'logCleanupCron')}
            {row('ui.settings.log_cleanup_retention', 'ui.settings.log_cleanup_retention_desc', 'logCleanupRetentionDays', local('days', '天', '天'))}
            <div className="card p-4"><h2 className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--color-muted)]">{t('ui.settings.log_cleanup_scopes')}</h2><p className="mt-1 text-xs">{t('ui.settings.log_cleanup_scopes_desc')}</p><div className="mt-3 space-y-2">{(['logCleanupUsageLogsEnabled', 'logCleanupProgramLogsEnabled'] as const).map((key, index) => <Field key={key} label={t(index ? 'ui.settings.log_cleanup_program' : 'ui.settings.log_cleanup_usage')}><Toggle checked={draft[key] === true} onChange={value => patch(key, value)} /></Field>)}</div></div>
            {row('ui.settings.cooldown', 'ui.settings.cooldown_desc', 'tokenRouterFailureCooldownMaxSec', local('s', '秒', '秒'))}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{(['cost', 'balance', 'usage'] as const).map(name => {
              const weights = draft.routingWeights as Record<string, number> | undefined;
              const key = `${name}Weight`; const value = (weights?.[key] ?? 0) * 100;
              return <div key={name} className="card p-4"><div className="flex items-center justify-between"><label className="font-mono text-[10px]">{t(`ui.settings.weight_${name}`)}</label><span>{value}</span></div><p className="mt-1 text-xs">{t(`ui.settings.weight_${name}_desc`)}</p><input aria-label={t(`ui.settings.weight_${name}`)} type="range" min={0} max={100} step={0.1} value={value} onChange={event => patch('routingWeights', {...weights, [key]: Number(event.target.value) / 100})} className="mt-3 w-full accent-[color:var(--color-lime)]" /></div>;
            })}</div>
          </>}
          {tab === 'notify' && <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{NOTIFY_KINDS.map(kind => {
              const enabledKey = NOTIFICATION_FIELDS[kind][0].key;
              return <div key={kind} className="card p-4 flex items-start gap-3"><Bell size={16} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h3 className="font-display text-lg">{t(`ui.settings.notify_${kind}`)}</h3><Toggle checked={draft[enabledKey] === true} onChange={value => patch(enabledKey, value)} /></div><p className="mt-1 text-xs">{t(`ui.settings.notify_${kind}_desc`)}</p><button type="button" className="mt-3 rounded-md border border-[color:var(--color-border)] px-2.5 py-1 font-mono text-[10px]" onClick={() => setConfigKind(kind)}>{t('ui.common.configure')}</button></div></div>;
            })}</div>
            <p>{local('Tests use saved settings and send to all enabled channels.', '測試使用已儲存設定，傳送至所有已啟用渠道。', '测试使用已保存设置，发送至所有已启用渠道。')}</p>
            <button className={PARITY_ACTION_CLASS} disabled={testing} onClick={async () => {setTesting(true); try {await testNotification(); showToast(t('ui.settings.notify_test_sent'));} catch (error) {showToast(String(error));} finally {setTesting(false);}}}>{testing ? t('ui.common.testing') : t('ui.common.test')}</button>
          </>}
          {tab === 'security' && <>{row('ui.settings.ip_allow', 'ui.settings.ip_allow_desc', 'adminIpAllowlist')}<p className="text-xs">{local('The proxy token can be rotated in Advanced settings.', '可在進階設定輪換代理令牌。', '可在高级设置轮换代理令牌。')}</p></>}
          <div className="flex items-center justify-end gap-2 pt-2"><button type="button" disabled={saving || !dirty} onClick={cancelAll} className="h-9 rounded-lg border border-[color:var(--color-border)] px-4 font-mono text-xs">{t('ui.common.cancel')}</button><button type="button" disabled={saving || !dirty} onClick={saveAll} className="flex h-9 items-center gap-1.5 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-xs text-[color:var(--color-ink)]"><Save size={13} />{saving ? local('Saving…', '儲存中…', '保存中…') : t('ui.common.save')}</button></div>
        </fieldset>}
      </div>
    </div>
    {configKind && <ChannelConfigDrawer kind={configKind} settings={runtime} onClose={() => setConfigKind(null)} onSaved={onChannelSaved} />}
  </div>;
}
