import { useEffect, useState } from 'react';
import { Field, TextInput, Toggle } from '../../components/EditDrawer';
import { useUiText } from '../../i18n/useUiText';
import { useToast } from '../../components/Toast';
import { migrateExternalDatabase, testExternalDatabaseConnection } from '../../lib/source';
import { databasePayload, type DatabaseDraft } from '../../lib/settingsParity';
import { getDatabaseRuntime, saveDatabaseRuntime, type DatabaseRuntime } from '../../lib/settingsParityApi';
import { useLocalSettingsText } from './localSettingsText';
import { PARITY_ACTION_CLASS, PARITY_SELECT_CLASS } from '../../lib/settingsParityStyles';

export default function DatabaseSettings() {
  const t = useUiText(); const local = useLocalSettingsText(); const {showToast} = useToast();
  const [runtime, setRuntime] = useState<DatabaseRuntime | null>(null);
  const [draft, setDraft] = useState<DatabaseDraft>({dialect: 'sqlite', connectionString: '', ssl: false, overwrite: false});
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const applyRuntime = (data: DatabaseRuntime) => {
    setRuntime(data);
    const config = data.saved ?? data.active;
    setDraft({dialect: config.dialect as DatabaseDraft['dialect'], connectionString: '', ssl: config.ssl, overwrite: false});
  };
  useEffect(() => {let active = true; getDatabaseRuntime().then(data => {if (active) applyRuntime(data);}).catch(error => {if (active) setError(String(error));}); return () => {active = false;};}, []);
  const run = async (action: 'save' | 'test' | 'migrate') => {
    if (!draft.connectionString.trim()) {setError(t('ui.adv.conn_string_required')); return;}
    if (action === 'migrate' && !window.confirm(t('ui.settings.adv_migrate_confirm') + (draft.overwrite ? '\n' + local('Target data will be overwritten.', '目標資料將被覆寫。', '目标数据将被覆盖。') : ''))) return;
    setBusy(true); setError('');
    try {
      if (action === 'save') {applyRuntime(await saveDatabaseRuntime(draft)); showToast(local('Saved. Restart required to switch databases.', '已儲存。切換資料庫需重新啟動。', '已保存。切换数据库需重启。'));}
      else if (action === 'test') {await testExternalDatabaseConnection(databasePayload(draft)); showToast(t('ui.settings.adv_conn_ok'));}
      else {await migrateExternalDatabase(databasePayload(draft, true)); showToast(t('ui.settings.adv_migrated'));}
    } catch (error) {setError(error instanceof Error ? error.message : t('ui.adv.err_op'));}
    finally {setBusy(false);}
  };
  return <section className="card p-5"><fieldset disabled={busy} className="space-y-4 min-w-0">
    <h2 className="font-mono text-[11px] tracking-[0.2em] text-[color:var(--color-lime)]">{t('ui.settings.adv_db_title')}</h2>
    <p>{t('ui.settings.adv_db_desc')}</p>
    {error && <p role="alert">{error}</p>}
    {runtime && <div className="text-xs space-y-2">
      <p>{local('Active', '使用中', '使用中')}: {runtime.active.dialect} · {runtime.active.connection} · SSL {String(runtime.active.ssl)}</p>
      {runtime.saved && <p>{local('Saved', '已儲存', '已保存')}: {runtime.saved.dialect} · {runtime.saved.connection} · SSL {String(runtime.saved.ssl)}</p>}
      {runtime.restartRequired && <p>{local('Restart required', '需要重新啟動', '需要重启')}</p>}
    </div>}
    <Field label={local('Database dialect', '資料庫類型', '数据库类型')}><select
 className={PARITY_SELECT_CLASS}
value={draft.dialect} onChange={event => setDraft(d => ({...d, dialect: event.target.value as DatabaseDraft['dialect']}))}>
      <option value="sqlite">{t('ui.settings.adv_sqlite')}</option><option value="mysql">{t('ui.settings.adv_mysql')}</option><option value="postgres">{t('ui.settings.adv_postgres')}</option>
    </select></Field>
    <Field label={local('Connection string (enter actual credentials, not the masked display)', '連線字串（輸入實際憑證，不是遮罩顯示）', '连接字符串（输入实际凭证，不是脱敏显示）')}><TextInput type="password" value={draft.connectionString} onChange={event => setDraft(d => ({...d, connectionString: event.target.value}))} /></Field>
    <Field label="SSL"><Toggle checked={draft.ssl} onChange={ssl => setDraft(d => ({...d, ssl}))} /></Field>
    <Field label={local('Overwrite target database during migration', '遷移時覆寫目標資料庫', '迁移时覆盖目标数据库')}><Toggle checked={draft.overwrite} onChange={overwrite => setDraft(d => ({...d, overwrite}))} /></Field>
    <div className="flex flex-wrap gap-3">
      <button
 className={PARITY_ACTION_CLASS}
type="button" disabled={busy || !runtime} onClick={() => run('save')}>{t('ui.common.save')}</button>
      <button
 className={PARITY_ACTION_CLASS}
type="button" disabled={busy} onClick={() => run('test')}>{t('ui.settings.adv_test_conn')}</button>
      <button
 className={PARITY_ACTION_CLASS}
type="button" disabled={busy} onClick={() => run('migrate')}>{t('ui.settings.adv_migrate')}</button>
      <button
 className={PARITY_ACTION_CLASS}
type="button" disabled={busy || !runtime} onClick={() => {if (runtime) applyRuntime(runtime); setError('');}}>{t('ui.common.cancel')}</button>
    </div>
  </fieldset></section>;
}
