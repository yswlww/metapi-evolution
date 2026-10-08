import { useEffect, useRef, useState } from 'react';
import { EditDrawer, Field, TextInput } from '../../components/EditDrawer';
import { useManagementText } from '../../lib/managementParityText';
import { apiGet, apiPost, apiPut } from '../../lib/client';
import { useToast } from '../../components/Toast';
export default function AccountModels({ account, onClose }: { account: any; onClose: () => void }) {
  const l = useManagementText(); const { showToast } = useToast();
  const [models, setModels] = useState<Array<{ name: string; latencyMs?: number; isManual?: boolean }>>([]);
  const [disabled, setDisabled] = useState<Set<string>>(new Set()); const [manual, setManual] = useState(''); const [search, setSearch] = useState(''); const [busy, setBusy] = useState(true); const [loaded, setLoaded] = useState(false);
  const siteId = Number(account.siteId ?? account.site?.id);
  const alive = useRef(true);
  const load = async () => { setBusy(true); try { const [result, state] = await Promise.all([apiGet<{ models: typeof models }>(`/api/accounts/${account.id}/models`), apiGet<{ models: string[] }>(`/api/sites/${siteId}/disabled-models`)]); if (!alive.current) return; setModels(result.models); setDisabled(new Set(state.models)); setLoaded(true); } catch(e) { if (alive.current) showToast(e instanceof Error ? e.message : l('loadFailed')); } finally { if (alive.current) setBusy(false); } };
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, [account.id]);
  const run = async (operation: () => Promise<unknown>) => { setBusy(true); try { await operation(); await load(); } catch(e) { showToast(e instanceof Error ? e.message : l('saveFailed')); } finally { setBusy(false); } };
  const save = async () => { setBusy(true); try { await apiPut(`/api/sites/${siteId}/disabled-models`, { models: [...disabled] }); try { await apiPost('/api/routes/rebuild', { refreshModels: false }); } catch(e) { showToast(e instanceof Error ? e.message : l('saveFailed')); return; } showToast(l('saved')); onClose(); } catch(e) { showToast(e instanceof Error ? e.message : l('saveFailed')); } finally { setBusy(false); } };
  return <EditDrawer open title={`${l('models')} · ${account.username}`} onClose={onClose} footer={<><button onClick={onClose}>{l('cancel')}</button><button disabled={busy || !loaded} onClick={save}>{l('save')}</button></>}>
    <p className="text-xs">{l('disableModels')}</p>
    <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={() => run(async () => { const result = await apiPost<any>(`/api/models/check/${account.id}`); if (result.refresh && result.refresh.status !== 'success') throw new Error(result.message || result.refresh.errorMessage || l('failed')); })}>{l('refresh')}</button><button disabled={busy || !loaded} onClick={() => setDisabled(new Set())}>{l('enableAll')}</button><button disabled={busy || !loaded} onClick={() => setDisabled(new Set([...disabled, ...models.map(m => m.name)]))}>{l('disableAll')}</button><button disabled={busy || !loaded} onClick={() => setDisabled(prev => { const next = new Set(prev); models.forEach(m => next.has(m.name) ? next.delete(m.name) : next.add(m.name)); return next; })}>{l('invert')}</button></div>
    <TextInput value={search} onChange={e => setSearch(e.target.value)} placeholder={l('search')} />
    {busy && <p>{l('loading')}</p>}
    <div className="max-h-80 overflow-auto">{models.filter(m => m.name.toLowerCase().includes(search.toLowerCase())).map(m => <label key={m.name} className="flex gap-2 p-2"><input type="checkbox" disabled={busy} checked={!disabled.has(m.name)} onChange={() => setDisabled(prev => { const next = new Set(prev); next.has(m.name) ? next.delete(m.name) : next.add(m.name); return next; })} /><span className="break-all">{m.name}</span><span>{m.latencyMs == null ? '' : `${m.latencyMs}ms`}{m.isManual ? ` · ${l('manual')}` : ''}</span></label>)}</div>
    <Field label={l('addModels')}><TextInput value={manual} onChange={e => setManual(e.target.value)} /><button disabled={busy || !manual.trim()} onClick={() => run(async () => { await apiPost(`/api/accounts/${account.id}/models/manual`, { models: manual.split(/[,，\n]/).map(m => m.trim()).filter(Boolean) }); setManual(''); })}>{l('add')}</button></Field>
  </EditDrawer>;
}
