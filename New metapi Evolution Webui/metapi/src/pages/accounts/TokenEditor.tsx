import { useEffect, useState } from 'react';
import { EditDrawer, Field, TextInput, Toggle } from '../../components/EditDrawer';
import { useManagementText } from '../../lib/managementParityText';
import { buildTokenEditPayload } from '../../lib/managementParity';
import { apiGet, apiPut } from '../../lib/client';
import { useToast } from '../../components/Toast';
export function TokenGroupSelect({ accountId, value, onChange }: { accountId: number; value: string; onChange: (v: string) => void }) {
  const l = useManagementText(); const { showToast } = useToast(); const [groups, setGroups] = useState<string[]>([]); const [loading, setLoading] = useState(false);
  useEffect(() => { let alive = true; setGroups([]); if (!accountId) return; setLoading(true); apiGet<{ groups: string[]; success?: boolean; message?: string }>(`/api/account-tokens/groups/${accountId}`).then(r => { if (!alive) return; if (r.success === false) throw new Error(r.message || l('failed')); setGroups(r.groups || []); }).catch(e => { if (alive) showToast(e instanceof Error ? e.message : l('loadFailed')); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [accountId]);
  return <Field label={l('group')}><select disabled={loading || !accountId} value={value} onChange={e => onChange(e.target.value)} className="w-full rounded border p-2 bg-[color:var(--color-panel)]">{[...new Set(['default', value, ...groups])].map(g => <option key={g} value={g}>{g || '—'}</option>)}</select>{loading && <span>{l('loading')}</span>}</Field>;
}
export default function TokenEditor({ token, onClose, onSaved }: { token: any; onClose: () => void; onSaved: () => Promise<void> }) {
  const l = useManagementText(); const { showToast } = useToast(); const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ name: token.name || '', token: '', group: token.tokenGroup || 'default', enabled: token.valueStatus === 'masked_pending' ? true : token.enabled !== false, isDefault: !!token.isDefault });
  const save = async () => { setSaving(true); try { const payload = buildTokenEditPayload(draft, token.valueStatus === 'masked_pending'); const result = await apiPut<any>(`/api/account-tokens/${token.id}`, payload); if (result.success === false) throw new Error(result.message || l('saveFailed')); await onSaved(); onClose(); showToast(l('saved')); } catch(e) { showToast(e instanceof Error ? e.message : l('saveFailed')); } finally { setSaving(false); } };
  return <EditDrawer open title={`${l('edit')} · ${token.name}`} onClose={onClose} footer={<><button onClick={onClose}>{l('cancel')}</button><button disabled={saving} onClick={save}>{l('save')}</button></>}>
    <Field label={l('name')}><TextInput value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} /></Field>
    <Field label={l('token')} hint={token.valueStatus === 'masked_pending' ? l('credentialMissing') : l('keepSecret')}><TextInput type="password" value={draft.token} onChange={e => setDraft(d => ({ ...d, token: e.target.value }))} /></Field>
    <TokenGroupSelect accountId={Number(token.accountId ?? token.account?.id)} value={draft.group} onChange={group => setDraft(d => ({ ...d, group }))} />
    <Toggle checked={draft.enabled} onChange={enabled => setDraft(d => ({ ...d, enabled }))} label={l('enabled')} /><Toggle checked={draft.isDefault} onChange={isDefault => setDraft(d => ({ ...d, isDefault }))} label={l('default')} />
  </EditDrawer>;
}
