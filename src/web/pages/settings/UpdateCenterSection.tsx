import React, { useEffect, useRef, useState, type CSSProperties } from 'react';

import { api } from '../../api.js';
import ModernSelect from '../../components/ModernSelect.js';
import { useToast } from '../../components/Toast.js';
import { useIsMobile } from '../../components/useIsMobile.js';
import { isLocalUpdateReleaseTag, type SelfUpgradeSupport } from '../../../shared/localUpdateContract.js';

type UpdateCandidate = {
  normalizedVersion?: string;
  displayVersion?: string;
  tagName?: string;
  digest?: string | null;
  publishedAt?: string | null;
};

type UpdateCenterStatus = {
  currentVersion?: string;
  config?: {
    enabled: boolean;
    githubReleasesEnabled: boolean;
    dockerHubTagsEnabled: boolean;
    defaultDeploySource: 'github-release' | 'docker-hub-tag';
  };
  githubRelease?: UpdateCandidate | null;
  dockerHubTag?: UpdateCandidate | null;
  dockerHubRecentTags?: UpdateCandidate[] | null;
  selfUpgrade?: SelfUpgradeSupport;
  localUpdate?: { state: { phase: string; error: string | null }; canRollback: boolean; previousVersion: string | null };
  runningTask?: { id?: string; status?: string } | null;
  lastFinishedTask?: { id?: string; status?: string; finishedAt?: string | null } | null;
  runtime?: { lastCheckedAt?: string | null; lastCheckError?: string | null } | null;
};

const DEFAULT_CONFIG: NonNullable<UpdateCenterStatus['config']> = {
  enabled: false,
  githubReleasesEnabled: true,
  dockerHubTagsEnabled: true,
  defaultDeploySource: 'github-release',
};

const DEPLOY_SOURCE_OPTIONS = [
  { value: 'github-release', label: 'GitHub Releases' },
  { value: 'docker-hub-tag', label: 'Docker Hub' },
];

const sectionPanelStyle: CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: 12,
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--color-text-muted)',
  marginBottom: 4,
};

const summaryValueStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 6,
};

function getTaskBadge(status?: string | null) {
  if (status === 'succeeded') return { label: '成功', className: 'badge badge-success' };
  if (status === 'failed') return { label: '失败', className: 'badge badge-danger' };
  if (status === 'running' || status === 'pending') return { label: '进行中', className: 'badge badge-warning' };
  return { label: '无', className: 'badge' };
}

export default function UpdateCenterSection() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [status, setStatus] = useState<UpdateCenterStatus | null>(null);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [source, setSource] = useState<'github-release' | 'docker-hub-tag'>('github-release');
  const [logs, setLogs] = useState<string[]>([]);
  const [taskStatus, setTaskStatus] = useState('');
  const streamAbortRef = useRef<AbortController | null>(null);

  const applyStatus = (next: UpdateCenterStatus) => {
    setStatus(next);
    setConfig(next.config || DEFAULT_CONFIG);
    if (next.config?.defaultDeploySource) setSource(next.config.defaultDeploySource);
  };

  const loadStatus = async () => {
    setLoading(true);
    try {
      applyStatus(await api.getUpdateCenterStatus() as UpdateCenterStatus);
    } catch (error: any) {
      toast.error(error?.message || '加载更新中心失败');
    } finally {
      setLoading(false);
    }
  };

  const refreshStatus = async (showErrorToast = true) => {
    try {
      const next = await api.checkUpdateCenter() as UpdateCenterStatus;
      applyStatus(next);
      return next;
    } catch (error: any) {
      if (showErrorToast) toast.error(error?.message || '检查更新失败');
      throw error;
    }
  };

  useEffect(() => {
    void loadStatus();
    return () => { streamAbortRef.current?.abort(); };
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const result = await api.saveUpdateCenterConfig(config) as { config?: UpdateCenterStatus['config'] };
      const nextConfig = result.config || config;
      setConfig(nextConfig);
      setStatus((prev) => ({ ...(prev || {}), config: nextConfig }));
      toast.success('更新中心配置已保存');
    } catch (error: any) {
      toast.error(error?.message || '保存更新中心配置失败');
    } finally {
      setSaving(false);
    }
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      await refreshStatus(true);
      toast.success('已刷新更新信息');
    } catch {
      // refreshStatus already handled the toast
    } finally {
      setChecking(false);
    }
  };

  const streamTaskLogs = async (taskId: string) => {
    let completed = false;
    await api.streamUpdateCenterTaskLogs(taskId, {
      signal: streamAbortRef.current?.signal,
      onLog: (entry) => {
        const message = String(entry?.message || '').trim();
        if (!message) return;
        setLogs((prev) => [...prev, message].slice(-200));
      },
      onDone: (payload) => { completed = true; setTaskStatus(String(payload?.status || 'unknown')); },
    });
    if (!completed && !streamAbortRef.current?.signal.aborted) throw new Error('Service restarting; reconnecting to task status');
  };

  const runTask = async (start: () => Promise<{ task?: { id: string } }>, failureMessage: string) => {
    setDeploying(true);
    setLogs([]);
    setTaskStatus('running');
    streamAbortRef.current?.abort();
    streamAbortRef.current = new AbortController();
    let taskId = '';
    try {
      const response = await start();
      taskId = response.task?.id || '';
      if (!taskId) throw new Error('任务未返回 taskId');
      await streamTaskLogs(taskId);
    } catch (error: any) {
      if (taskId) {
        const deadline = Date.now() + 120_000;
        while (Date.now() < deadline && !streamAbortRef.current?.signal.aborted) {
          try {
            const result = await api.getUpdateCenterTask(taskId, streamAbortRef.current?.signal) as { task: { status: string; logs: Array<{ message: string }> } };
            setLogs(result.task.logs.map(entry => entry.message));
            setTaskStatus(result.task.status);
            if (result.task.status === 'succeeded' || result.task.status === 'failed') return;
          } catch { /* A process restart temporarily drops the HTTP connection. */ }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      if (!streamAbortRef.current?.signal.aborted) {
        setTaskStatus('failed');
        toast.error(error?.message || failureMessage);
      }
    } finally {
      setDeploying(false);
      void refreshStatus(false).catch(() => {});
    }
  };

  const supported = status?.selfUpgrade?.supported === true;
  const supportReasons = {
    'runner-required': '请先使用 runtime supervisor 启动，或更新 Docker 镜像。',
    'unsupported-arch': '此架构未提供升级包，请改用拉取新镜像更新。',
    'unsupported-platform': '应用内服务器升级仅支持 Linux。',
    'read-only-runtime': 'Runtime 目录为只读。',
  };
  const supportReason = status?.selfUpgrade?.reasonCode ? supportReasons[status.selfUpgrade.reasonCode] : status?.selfUpgrade?.reason;
  const candidates = source === 'github-release'
    ? (status?.githubRelease ? [status.githubRelease] : [])
    : (status?.dockerHubRecentTags?.length ? status.dockerHubRecentTags : status?.dockerHubTag ? [status.dockerHubTag] : []);
  const candidate = candidates[0];
  const taskBadge = getTaskBadge(taskStatus || status?.lastFinishedTask?.status);
  const deployDisabled = deploying || !supported || !config.enabled || !isLocalUpdateReleaseTag(candidate?.tagName) || candidate?.tagName?.replace(/^v/, '') === status?.currentVersion;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {loading && <div style={sectionPanelStyle}>加载中…</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
        <div style={sectionPanelStyle}>
          <div style={summaryLabelStyle}>当前运行版本</div>
          <div style={{ ...summaryValueStyle, fontFamily: 'var(--font-mono)' }}>{status?.currentVersion || '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>以当前容器内运行版本为准。</div>
        </div>
        <div style={sectionPanelStyle}>
          <div style={summaryLabelStyle}>本地升级</div>
          <div style={{ marginBottom: 6 }}>
            <span className={supported ? 'badge badge-success' : 'badge badge-warning'}>
              {supported ? '可用' : '不可用'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {supportReason || `架构 ${status?.selfUpgrade?.arch || '—'}`}
          </div>
        </div>
        <div style={sectionPanelStyle}>
          <div style={summaryLabelStyle}>最近任务</div>
          <div style={{ marginBottom: 6 }}><span className={taskBadge.className}>{taskBadge.label}</span></div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{status?.runtime?.lastCheckedAt || '尚未检查'}</div>
        </div>
      </div>

      {!supported && supportReason && (
        <div style={sectionPanelStyle} role="alert">{supportReason}</div>
      )}
      {status?.localUpdate?.state && <div style={sectionPanelStyle}>升级状态：{status.localUpdate.state.phase}{status.localUpdate.state.error && <p role="alert">{status.localUpdate.state.error}</p>}</div>}
      {status?.runtime?.lastCheckError && (
        <div style={sectionPanelStyle} role="alert">{status.runtime.lastCheckError}</div>
      )}

      <div style={sectionPanelStyle}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>升级配置</div>
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={config.enabled} onChange={(e) => setConfig((prev) => ({ ...prev, enabled: e.target.checked }))} />
            启用更新中心
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={config.githubReleasesEnabled} onChange={(e) => setConfig((prev) => ({ ...prev, githubReleasesEnabled: e.target.checked }))} />
            追踪 GitHub Releases
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={config.dockerHubTagsEnabled} onChange={(e) => setConfig((prev) => ({ ...prev, dockerHubTagsEnabled: e.target.checked }))} />
            追踪 Docker Hub 标签
          </label>
          <div>
            <div style={fieldLabelStyle}>默认部署来源</div>
            <ModernSelect
              value={config.defaultDeploySource}
              onChange={(value) => setConfig((prev) => ({ ...prev, defaultDeploySource: value as 'github-release' | 'docker-hub-tag' }))}
              options={DEPLOY_SOURCE_OPTIONS}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void saveConfig()}>
              {saving ? '保存中…' : '保存配置'}
            </button>
            <button type="button" className="btn" disabled={checking} onClick={() => void checkNow()}>
              {checking ? '检查中…' : '立即检查'}
            </button>
          </div>
        </div>
      </div>

      <div style={sectionPanelStyle}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>可升级版本</div>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <div style={fieldLabelStyle}>部署来源</div>
            <ModernSelect value={source} onChange={(value) => setSource(value as 'github-release' | 'docker-hub-tag')} options={DEPLOY_SOURCE_OPTIONS} />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            {candidate ? `${candidate.tagName} · ${candidate.displayVersion || candidate.normalizedVersion || ''}` : '没有可用候选版本'}
          </div>
          {candidate?.digest && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' }}>{candidate.digest}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={deployDisabled}
              onClick={() => void runTask(
                () => api.deployUpdateCenter({ source, targetTag: candidate?.tagName || '', targetDigest: candidate?.digest || null }),
                '升级失败',
              )}
            >
              {deploying ? '升级中…' : '升级'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={deploying || !supported || !config.enabled || status?.localUpdate?.canRollback !== true}
              onClick={() => void runTask(() => api.rollbackUpdateCenter(), '回退失败')}
            >
              {deploying ? '回退中…' : '回退到上一版本'}
            </button>
          </div>
        </div>
      </div>

      {(logs.length > 0 || taskStatus) && (
        <div style={sectionPanelStyle}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>任务日志 · {taskBadge.label}</div>
          <pre style={{ maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12, margin: 0 }}>
            {logs.join('\n') || '等待日志…'}
          </pre>
        </div>
      )}
    </div>
  );
}
