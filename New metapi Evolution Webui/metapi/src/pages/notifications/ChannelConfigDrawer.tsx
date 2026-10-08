import { useState } from 'react';
import { EditDrawer, Field, TextInput, Toggle } from '../../components/EditDrawer';
import { useUiText } from '../../i18n/useUiText';
import { useLang } from '../../contexts/LangContext';
import { NOTIFICATION_FIELDS, notificationDraft, notificationPayload, type NotifyKind } from '../../lib/settingsParityNotifications';
import { updateRuntimeSettings } from '../../lib/source';
import { PARITY_ACTION_CLASS } from '../../lib/settingsParityStyles';

const labels: Record<string, [string, string, string]> = {
  webhookEnabled: ['Enabled', '啟用', '启用'], webhookUrl: ['Webhook URL', 'Webhook 網址', 'Webhook 地址'],
  barkEnabled: ['Enabled', '啟用', '启用'], barkUrl: ['Bark URL', 'Bark 網址', 'Bark 地址'],
  serverChanEnabled: ['Enabled', '啟用', '启用'], serverChanKey: ['ServerChan key', 'ServerChan 密鑰', 'ServerChan 密钥'],
  telegramEnabled: ['Enabled', '啟用', '启用'], telegramApiBaseUrl: ['API base URL', 'API 基礎網址', 'API 基础地址'],
  telegramBotToken: ['Bot token', '機器人令牌', '机器人令牌'], telegramChatId: ['Chat ID', '聊天 ID', '聊天 ID'],
  telegramUseSystemProxy: ['Use system proxy', '使用系統代理', '使用系统代理'], telegramMessageThreadId: ['Topic / thread ID', '主題／執行緒 ID', '主题／线程 ID'],
  smtpEnabled: ['Enabled', '啟用', '启用'], smtpHost: ['SMTP host', 'SMTP 主機', 'SMTP 主机'], smtpPort: ['Port', '連接埠', '端口'],
  smtpSecure: ['TLS', 'TLS', 'TLS'], smtpUser: ['Username', '使用者名稱', '用户名'], smtpPass: ['Password', '密碼', '密码'],
  smtpFrom: ['Sender', '寄件者', '发件人'], smtpTo: ['Recipients', '收件者', '收件人'],
};

/** Both notification entry points use the same field contract and persistence path. */
export default function ChannelConfigDrawer({kind, settings, onClose, onSaved}: {
  kind: NotifyKind;
  settings: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const t = useUiText();
  const {lang} = useLang();
  const index = lang === 'zh-Hant' ? 1 : lang === 'zh-Hans' ? 2 : 0;
  const [draft, setDraft] = useState(() => notificationDraft(kind, settings));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await updateRuntimeSettings(notificationPayload(kind, draft));
      await onSaved();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : t('ui.toast.save_failed'));
    } finally { setBusy(false); }
  };
  return <EditDrawer open onClose={() => { if (!busy) onClose(); }} title={t(`ui.settings.notify_${kind}`)} eyebrow={t('ui.notif.configure_eyebrow')} footer={<>
    <button
 className={PARITY_ACTION_CLASS}
type="button" disabled={busy} onClick={onClose}>{t('ui.common.cancel')}</button>
    <button
 className={PARITY_ACTION_CLASS}
type="button" disabled={busy} onClick={save}>{t('ui.common.save')}</button>
  </>}>
    {error && <p role="alert">{error}</p>}
    <p className="text-xs text-[color:var(--color-muted)]">{[
      'Blank secret fields preserve stored credentials. Notification tests send to all enabled channels.',
      '留空的憑證欄位會保留已儲存憑證。通知測試會傳送至所有已啟用渠道。',
      '留空的凭证字段会保留已保存凭证。通知测试会发送至所有已启用渠道。',
    ][index]}</p>
    <fieldset disabled={busy} className="space-y-4 min-w-0">
    {NOTIFICATION_FIELDS[kind].map(field => <Field key={field.key} label={labels[field.key][index]}>
      {field.type === 'boolean' ? <Toggle checked={draft[field.key] === true} onChange={value => setDraft(prev => ({...prev, [field.key]: value}))} /> :
        <TextInput type={field.type} value={String(draft[field.key] ?? '')} onChange={event => setDraft(prev => ({...prev, [field.key]: event.target.value}))} />}
    </Field>)}
    </fieldset>
  </EditDrawer>;
}
