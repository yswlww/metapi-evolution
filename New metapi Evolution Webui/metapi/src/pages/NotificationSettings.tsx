import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { TextInput } from '../components/EditDrawer';
import { useUiText } from '../i18n/useUiText';
import { useLang } from '../contexts/LangContext';
import { useToast } from '../components/Toast';
import { fetchRuntimeSettings, updateRuntimeSettings, testNotification } from '../lib/source';
import { NOTIFY_KINDS, NOTIFICATION_FIELDS, type NotifyKind } from '../lib/settingsParityNotifications';
import ChannelConfigDrawer from './notifications/ChannelConfigDrawer';
import { PARITY_ACTION_CLASS, PARITY_SELECT_CLASS } from '../lib/settingsParityStyles';

export default function NotificationSettings() {
  const t = useUiText();
  const {lang} = useLang();
  const {showToast} = useToast();
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | { key: string }>('');
  const mounted = useRef(true);
  const savedCooldown = useRef('300');
  const [drawer, setDrawer] = useState<NotifyKind | null>(null);
  const [cooldown, setCooldown] = useState('300');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async (resetCooldown = false) => {
    const data = await fetchRuntimeSettings() as Record<string, unknown>;
    if (!mounted.current) return;
    const nextCooldown = String(data.notifyCooldownSec ?? 300);
    const previousSaved = savedCooldown.current;
    savedCooldown.current = nextCooldown;
    setSettings(data);
    setCooldown(previous => resetCooldown || previous === previousSaved ? nextCooldown : previous);
    setError('');
  }, []);
  useEffect(() => {
    mounted.current = true;
    void reload(true).catch(error => {
      if (mounted.current) setError(error instanceof Error ? error.message : { key: 'ui.settings.err_load' });
    });
    return () => { mounted.current = false; };
  }, [reload]);
  const run = async (action: () => Promise<unknown>, message: string, resetCooldown = false) => {
    setBusy(true);
    try { await action(); await reload(resetCooldown); showToast(message); }
    catch (error) { showToast(error instanceof Error ? error.message : t('ui.toast.save_failed')); }
    finally { if (mounted.current) setBusy(false); }
  };
  const index = lang === 'zh-Hant' ? 1 : lang === 'zh-Hans' ? 2 : 0;
  return <div className="space-y-8">
    <PageHeader eyebrow={t('ui.notif.eyebrow')} title={t('ui.notif.title')} description={t('ui.notif.desc')} />
    {error && <div role="alert">{typeof error === 'string' ? error : t(error.key)}<button
 className={PARITY_ACTION_CLASS}
onClick={() => reload().catch(error => setError(String(error)))}>{['Retry', '重試', '重试'][index]}</button></div>}
    <div className="card p-4 space-y-3">
      <label>{t('ui.notif.cooldown')}<TextInput type="number" min={0} value={cooldown} disabled={busy || !settings} onChange={event => setCooldown(event.target.value)} /></label>
      <p>{t('ui.notif.cooldown_hint')}</p>
      <button
 className={PARITY_ACTION_CLASS}
disabled={busy || !settings} onClick={() => {
        const value = Number(cooldown);
        if (!Number.isFinite(value) || value < 0) { showToast(t('ui.toast.save_failed')); return; }
        void run(() => updateRuntimeSettings({notifyCooldownSec: value}), t('ui.notif.cooldown_saved'), true);
      }}>{t('ui.common.save')}</button>
    </div>
    <TextInput aria-label={t('ui.notif.search_ph')} placeholder={t('ui.notif.search_ph')} value={query} onChange={event => setQuery(event.target.value)} />
    <select className={PARITY_SELECT_CLASS} aria-label={t('ui.notif.filter_status')} value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">{t('ui.notif.all_statuses')}</option><option value="enabled">{t('ui.notif.enabled')}</option><option value="disabled">{t('ui.notif.status_disabled')}</option></select>
    {!settings && !error && <p>{t('ui.common.loading')}</p>}
    {settings && <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {NOTIFY_KINDS.filter(kind => {
        const enabled = settings[NOTIFICATION_FIELDS[kind][0].key] === true;
        const matchesStatus = statusFilter === 'all' || (enabled ? 'enabled' : 'disabled') === statusFilter;
        const fieldValues = NOTIFICATION_FIELDS[kind].filter(field => field.type !== 'password').map(field => settings[field.key]);
        return matchesStatus && [kind, t(`ui.settings.notify_${kind}`), ...fieldValues].join(' ').toLowerCase().includes(query.toLowerCase());
      }).map(kind => {
        const enabledKey = NOTIFICATION_FIELDS[kind][0].key;
        const enabled = settings[enabledKey] === true;
        const destination = kind === 'telegram' ? settings.telegramChatId : kind === 'smtp' ? settings.smtpHost : kind === 'webhook' ? settings.webhookUrl : kind === 'bark' ? settings.barkUrl : settings.serverChanKeyMasked ? ['Stored key', '已儲存密鑰', '已保存密钥'][index] : '';
        return <section key={kind} className="card p-4 space-y-3">
          <h2 className="font-display text-xl flex items-center gap-2"><Bell size={16} />{t(`ui.settings.notify_${kind}`)}</h2>
          <span className="chip">{enabled ? t('ui.common.enabled') : t('ui.status.disabled')}</span>
          <p className="break-all">{typeof destination === 'string' && destination || t('ui.notif.not_configured')}</p>
          <p className="text-xs text-[color:var(--color-muted)]">{['Delivery history is not provided by the runtime settings API.', '執行階段設定 API 未提供傳送歷史。', '运行时设置 API 未提供发送历史。'][index]}</p>
          <div className="flex gap-3">
            <button
 className={PARITY_ACTION_CLASS}
disabled={busy} onClick={() => run(() => updateRuntimeSettings({[enabledKey]: !enabled}), enabled ? t('ui.notif.channel_disabled') : t('ui.notif.channel_enabled'))}>{enabled ? t('ui.notif.disable') : t('ui.notif.enable')}</button>
            <button
 className={PARITY_ACTION_CLASS}
disabled={busy} onClick={() => setDrawer(kind)}>{t('ui.notif.configure')}</button>
          </div>
        </section>;
      })}
    </div>}
    <div className="card p-4 space-y-3">
      <p>{['Tests send to all enabled channels using saved settings.', '測試使用已儲存設定，傳送至所有已啟用渠道。', '测试使用已保存设置，发送至所有已启用渠道。'][index]}</p>
      <button
 className={PARITY_ACTION_CLASS}
disabled={busy || !settings} onClick={() => run(testNotification, t('ui.notif.test_ok'))}>{busy ? t('ui.notif.testing') : t('ui.notif.test')}</button>
    </div>
    {drawer && settings && <ChannelConfigDrawer kind={drawer} settings={settings} onClose={() => setDrawer(null)} onSaved={reload} />}
  </div>;
}
