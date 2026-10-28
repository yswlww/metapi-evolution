import { useCallback, useEffect, useState } from 'react';
import { Field, Toggle } from '../../components/EditDrawer';
import { SectionTitle } from '../../components/PrototypeUI';
import { useUiText } from '../../i18n/useUiText';
import { useToast } from '../../components/Toast';
import { getUpdateCenterStatus, checkUpdateCenter, deployUpdateCenter, rollbackUpdateCenter } from '../../lib/source';
import { useLocalSettingsText } from '../settings/localSettingsText';
import { PARITY_ACTION_CLASS, PARITY_SELECT_CLASS } from '../../lib/settingsParityStyles';
import { settingsDirty } from '../../lib/settingsParity';
import { deployPayload, canRollback, type UpdateStatus, type UpdateConfig, type UpdateSource } from './updateCenterContract';
import { saveUpdateConfig, getUpdateTask, type UpdateTask } from './updateCenterApi';

export default function UpdateCenter({ onVersion }: { onVersion?: (version: string) => void }) {
  const t = useUiText(); const local = useLocalSettingsText(); const { showToast } = useToast();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [config, setConfig] = useState<UpdateConfig | null>(null); const [savedConfig, setSavedConfig] = useState<UpdateConfig | null>(null);
  const [source, setSource] = useState<UpdateSource>('github-release'); const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [taskId, setTaskId] = useState(''); const [task, setTask] = useState<UpdateTask | null>(null);
  useEffect(() => { if (status?.currentVersion) onVersion?.(status.currentVersion); }, [status?.currentVersion, onVersion]);
  const [taskRefresh, setTaskRefresh] = useState(0);
  const reload = useCallback(async (initialize = false) => {
    const data = await getUpdateCenterStatus() as UpdateStatus;
    setStatus(data);
    if (data.config) {
      setConfig(previous => initialize || !previous ? { ...data.config! } : previous);
      setSavedConfig(previous => initialize || !previous ? { ...data.config! } : previous);
      if (initialize) setSource(data.config.defaultDeploySource);
    }
    const id = data.runningTask?.id ?? data.lastFinishedTask?.id;
    if (id) setTaskId(id);
  }, []);
  useEffect(() => {
    let active = true; getUpdateCenterStatus().then(data => {
      if (!active) return;
      const value = data as UpdateStatus; setStatus(value);
      if (value.config) { setConfig({ ...value.config }); setSavedConfig({ ...value.config }); setSource(value.config.defaultDeploySource); }
      setTaskId(value.runningTask?.id ?? value.lastFinishedTask?.id ?? '');
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : t('ui.about.update_unreachable')); }); return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!taskId) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const result = await getUpdateTask(taskId, controller.signal);
        if (controller.signal.aborted) return;
        setTask(result.task);
        if (result.task.status === 'pending' || result.task.status === 'running') timer = setTimeout(poll, 1000);
        else await reload();
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : t('ui.about.err_operation')); }
    };
    setTask(null); void poll();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [taskId, taskRefresh, reload]);
  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true); setError('');
    try {
      const result = await action() as { task?: { id?: string } };
      await reload();
      if (result?.task?.id) setTaskId(result.task.id);
      showToast(message);
    } catch (error) { setError(error instanceof Error ? error.message : t('ui.about.err_operation')); }
    finally { setBusy(false); }
  };
  const supported = status?.selfUpgrade?.supported !== false;
  const candidates = source === 'github-release' ? status?.githubRelease ? [status.githubRelease] : [] : status?.dockerHubRecentTags?.length ? status.dockerHubRecentTags : status?.dockerHubTag ? [status.dockerHubTag] : [];
  const candidate = candidates.find(entry => entry.tagName === tag) ?? candidates[0];
  const selectedTag = candidate?.tagName ?? '';
  const running = status?.runningTask?.status === 'pending' || status?.runningTask?.status === 'running' || task?.status === 'pending' || task?.status === 'running';
  const deploy = () => {
    if (!candidate || !status?.config?.enabled || !supported) return;
    let payload: ReturnType<typeof deployPayload>;
    try { payload = deployPayload(source, candidate); } catch { setError(local('Select a deployable tag.', '請選擇可部署標籤。', '请选择可部署标签。')); return; }
    if (!window.confirm(local(`Upgrade to ${selectedTag}? The service restarts to activate it.`, `升級至 ${selectedTag}？服務會重啟以生效。`, `升级至 ${selectedTag}？服务会重启以生效。`))) return;
    void run(() => deployUpdateCenter(payload), t('ui.about.deploy_queued', { tag: selectedTag }));
  };
  const rollback = () => {
    if (!status || !canRollback(status)) return;
    if (!window.confirm(local('Roll back to the previous release? The service restarts to activate it.', '回退至上一版本？服務會重啟以生效。', '回退至上一版本？服务会重启以生效。'))) return;
    void run(() => rollbackUpdateCenter(), t('ui.about.rollback_queued'));
  };
  const configPatch = (key: keyof UpdateConfig, value: unknown) => setConfig(previous => previous ? { ...previous, [key]: value } : previous);
  const booleanFields: Array<[keyof UpdateConfig, string]> = [['enabled', local('Enabled', '啟用', '启用')], ['githubReleasesEnabled', local('Track GitHub releases', '追蹤 GitHub releases', '跟踪 GitHub releases')], ['dockerHubTagsEnabled', local('Track Docker Hub tags', '追蹤 Docker Hub 標籤', '跟踪 Docker Hub 标签')]];
  return <section className="space-y-4">
    <SectionTitle title={t('ui.about.update_center')} description={t('ui.about.update_desc')} eyebrow={t('ui.about.updates_eyebrow')} />
    {error && <p role="alert">{error}</p>}
    <div className="card p-5 space-y-4">
      <div><div className="font-mono text-[10px] text-[color:var(--color-muted)]">{t('ui.about.current')}</div><div className="font-display text-2xl">{status?.currentVersion ?? '—'}</div></div>
      {!supported && status?.selfUpgrade?.reason && <p role="alert">{status.selfUpgrade.reason}</p>}
      {status?.runtime?.lastCheckError && <p role="alert">{status.runtime.lastCheckError}</p>}
      <button className={PARITY_ACTION_CLASS} disabled={busy} onClick={() => run(checkUpdateCenter, t('ui.about.check_ok'))}>{busy ? t('ui.about.checking') : t('ui.about.check')}</button>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={local('Deploy source', '部署來源', '部署来源')}><select className={PARITY_SELECT_CLASS} value={source} onChange={event => { setSource(event.target.value as UpdateSource); setTag(''); }}><option value="github-release">GitHub Releases</option><option value="docker-hub-tag">Docker Hub</option></select></Field>
        <Field label={local('Target tag', '目標標籤', '目标标签')}><select className={PARITY_SELECT_CLASS} value={selectedTag} onChange={event => setTag(event.target.value)}>{!candidates.length && <option value="">{local('No candidate available', '沒有可用候選版本', '没有可用候选版本')}</option>}{candidates.map(entry => <option key={entry.tagName} value={entry.tagName}>{entry.tagName} · {entry.displayVersion}</option>)}</select></Field>
      </div>
      {candidate?.digest && <p className="break-all font-mono text-xs">{candidate.digest}</p>}
      {candidate?.url && <a href={candidate.url} target="_blank" rel="noopener noreferrer">{local('Release notes', '版本說明', '版本说明')}</a>}
      <button className={PARITY_ACTION_CLASS} disabled={busy || running || !supported || !status?.config?.enabled || !selectedTag} onClick={deploy}>{busy ? t('ui.about.deploying') : t('ui.about.deploy')}</button>
      <button className={PARITY_ACTION_CLASS} disabled={busy || running || !canRollback(status ?? {})} onClick={rollback}>{busy ? t('ui.about.rolling_back') : t('ui.about.rollback')}</button>
    </div>
    {config && <details className="card p-5"><summary>{local('Update center configuration', '更新中心設定', '更新中心配置')}</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">
      {booleanFields.map(([key, label]) => <Field key={key} label={label}><Toggle checked={config[key] === true} onChange={value => configPatch(key, value)} /></Field>)}
      <Field label={local('Default deploy source', '預設部署來源', '默认部署来源')}><select className={PARITY_SELECT_CLASS} value={config.defaultDeploySource} onChange={event => configPatch('defaultDeploySource', event.target.value)}><option value="github-release">GitHub Releases</option><option value="docker-hub-tag">Docker Hub</option></select></Field>
      <div className="flex gap-3"><button className={PARITY_ACTION_CLASS} disabled={busy || !settingsDirty(config, savedConfig)} onClick={() => run(async () => { const result = await saveUpdateConfig(config); setConfig({ ...result.config }); setSavedConfig({ ...result.config }); return result; }, t('ui.settings.saved'))}>{t('ui.common.save')}</button><button className={PARITY_ACTION_CLASS} disabled={busy} onClick={() => { if (savedConfig) setConfig({ ...savedConfig }); }}>{t('ui.common.cancel')}</button></div>
    </div></details>}
    {taskId && <div className="card p-5 space-y-3"><h3>{local('Task log', '任務日誌', '任务日志')} · {task?.status ?? '—'}</h3><p className="font-mono text-xs">{taskId}</p>{task?.error && <p role="alert">{task.error}</p>}<button className={PARITY_ACTION_CLASS} onClick={() => setTaskRefresh(value => value + 1)}>{local('Refresh task log', '刷新任務日誌', '刷新任务日志')}</button><pre className="overflow-auto max-h-96 whitespace-pre-wrap break-all text-xs">{task?.logs?.map(entry => entry.message ?? '').join('\n')}</pre></div>}
  </section>;
}
