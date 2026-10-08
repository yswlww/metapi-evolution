import { useEffect, useRef, useState } from 'react';
import { EditDrawer, Field, TextInput } from '../../components/EditDrawer';
import { useUiText } from '../../i18n/useUiText';
import { oauthApi, pollOAuthSession, type AuthorizationSession } from './oauthApi';
import { useOAuthText } from './useOAuthText';
const button = 'rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs';
export function AuthorizationPanel({ session, onComplete, onClose }: { session: AuthorizationSession; onComplete: () => Promise<void>; onClose: () => void }) {
  const text = useOAuthText();
  const t = useUiText();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [error, setError] = useState<string | null>(null);
  const [callback, setCallback] = useState('');
  const [manualVisible, setManualVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const mounted = useRef(true);
  const callbackController = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    callbackController.current = new AbortController();
    const timer = setTimeout(() => setManualVisible(true), Math.max(0, session.instructions?.manualCallbackDelayMs ?? 0));
    const stop = pollOAuthSession(session.state, oauthApi.session, result => {
      clearTimeout(timer);
      setStatus(result.status);
      if (result.status === 'success') void onComplete();
      else setError(result.error ?? null);
    }, failure => { clearTimeout(timer); setStatus('error'); setError(failure instanceof Error ? failure.message : null); });
    return () => { mounted.current = false; callbackController.current?.abort(); stop(); clearTimeout(timer); };
  }, [session.state]);
  const consent = session.verificationUriComplete ?? session.verificationUri ?? session.authorizationUrl;
  const safeConsent = consent && /^https?:\/\//i.test(consent) ? consent : null;
  return <EditDrawer open onClose={onClose} title={t('ui.oauth.flow_label')} footer={<button className={button} onClick={onClose}>{t('ui.common.cancel')}</button>}>
    <p role="status">{text(status === 'pending' ? 'waiting' : status === 'success' ? 'success' : 'failed')}</p>
    {error && <p role="alert">{error === 'error' ? text('error') : error}</p>}
    {status === 'pending' && <>
      {safeConsent && <a className={button} href={safeConsent} target="_blank" rel="noopener noreferrer">{text('authorize')}</a>}
      {session.userCode && <Field label={text('code')}><TextInput readOnly value={session.userCode} /></Field>}
      {session.instructions?.redirectUri && <Field label={text('redirect')}><TextInput readOnly value={session.instructions.redirectUri} /></Field>}
      {[session.instructions?.sshTunnelCommand, session.instructions?.sshTunnelKeyCommand].filter(Boolean).map((command, index) => <Field key={index} label={text('tunnel')}><pre className="overflow-auto whitespace-pre-wrap text-xs">{command}</pre></Field>)}
      {manualVisible && !session.userCode && <Field label={text('callback')}><TextInput value={callback} onChange={e => setCallback(e.target.value)} /><button className={button} disabled={submitting || !callback.trim()} onClick={async () => {
        setSubmitting(true); setError(null);
        try { await oauthApi.callback(session.state, callback.trim(), callbackController.current?.signal); if (mounted.current) setCallback(''); }
        catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : null); }
        finally { if (mounted.current) setSubmitting(false); }
      }}>{text('submit')}</button></Field>}
    </>}
  </EditDrawer>;
}
export function OAuthModelsDrawer({ accountId, name, onClose, onRefresh }: { accountId: number; name: string; onClose: () => void; onRefresh: () => Promise<void> }) {
  const text = useOAuthText(); const t = useUiText();
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let cancelled = false; const controller = new AbortController(); setLoading(true); setError(null);
    void oauthApi.models(accountId, refreshKey > 0, controller.signal).then(result => { if (!cancelled) { setData(result); if (refreshKey > 0) void onRefresh(); } }).catch(failure => { if (!cancelled) setError(failure instanceof Error ? failure.message : null); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [accountId, refreshKey]);
  return <EditDrawer open onClose={onClose} title={`${text('models')} · ${name}`} footer={<><button className={button} onClick={onClose}>{t('ui.common.cancel')}</button><button className={button} disabled={loading} onClick={() => setRefreshKey(key => key + 1)}>{text('refresh')}</button></>}>
    {loading && <p role="status">{t('ui.common.loading')}</p>}{error && <p role="alert">{error === 'error' ? text('error') : error}</p>}
    {!loading && data && <><p>{data.totalCount ?? data.models?.length ?? 0} · {text('disabled')}: {data.disabledCount ?? 0}</p>{!data.models?.length && <p>{text('noModels')}</p>}{data.models?.map((model: any) => <div key={model.name} className="border-b border-[color:var(--color-border)] py-3 text-sm"><span>{model.name}</span>{model.latencyMs != null && <span> · {model.latencyMs}ms</span>}{model.disabled && <span> · {text('disabled')}</span>}{model.isManual && <span> · {text('manual')}</span>}</div>)}</>}
  </EditDrawer>;
}
