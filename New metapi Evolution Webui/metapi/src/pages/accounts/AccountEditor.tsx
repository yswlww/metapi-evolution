import { useState } from 'react';
import { EditDrawer, Field, TextInput, Toggle } from '../../components/EditDrawer';
import { useManagementText } from '../../lib/managementParityText';
import { buildAccountEditPayload, type AccountEditDraft } from '../../lib/managementParity';
import { apiPut } from '../../lib/client';
import { useToast } from '../../components/Toast';
export default function AccountEditor({ account, onClose, onSaved }: { account: any; onClose: () => void; onSaved: () => Promise<void> }) {
  const l = useManagementText(); const { showToast } = useToast();
  let extra: any = {}; try { extra = JSON.parse(account.extraConfig || '{}'); } catch {}
  const [draft, setDraft] = useState<AccountEditDraft>({ username: account.username || '', status: account.status || 'active', checkinEnabled: account.checkinEnabled !== false, unitCost: account.unitCost == null ? '' : String(account.unitCost), proxyUrl: extra.proxyUrl || '', isPinned: !!account.isPinned, sortOrder: String(account.sortOrder ?? 0), accessToken: '', apiToken: '', refreshToken: '', tokenExpiresAt: extra.sub2apiAuth?.tokenExpiresAt ? String(extra.sub2apiAuth.tokenExpiresAt) : '' });
  const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); try { await apiPut(`/api/accounts/${account.id}`, buildAccountEditPayload(draft)); await onSaved(); onClose(); showToast(l('saved')); } catch(e) { showToast(e instanceof Error ? e.message : l('saveFailed')); } finally { setSaving(false); } };
  const input = (key: keyof AccountEditDraft, label: string, type = 'text') => <Field label={label}><TextInput type={type} value={String(draft[key] ?? '')} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} /></Field>;
  return <EditDrawer open onClose={onClose} title={`${l('edit')} · ${account.username}`} footer={<><button onClick={onClose}>{l('cancel')}</button><button disabled={saving} onClick={save}>{l('save')}</button></>}>
    {input('username', l('username'))}
    <Field label={l('status')}><select value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}><option value="active">{l('enabled')}</option><option value="disabled">{l('disabled')}</option><option value="expired">{l('expired')}</option></select></Field>
    {input('unitCost', l('cost'), 'number')}{input('proxyUrl', l('proxy'))}{input('sortOrder', l('order'), 'number')}
    <Toggle checked={draft.checkinEnabled} onChange={v => setDraft(d => ({ ...d, checkinEnabled: v }))} label={l('checkin')} />
    <Toggle checked={draft.isPinned} onChange={v => setDraft(d => ({ ...d, isPinned: v }))} label={l('pin')} />
    <p className="text-xs text-[color:var(--color-muted)]">{l('keepSecret')}</p>
    {input('accessToken', l('accessToken'), 'password')}{input('apiToken', l('apiKey'), 'password')}
    <Toggle checked={!!draft.clearAccessToken} onChange={v => setDraft(d => ({ ...d, clearAccessToken: v }))} label={l('clearSession')} />
    <Toggle checked={!!draft.clearApiToken} onChange={v => setDraft(d => ({ ...d, clearApiToken: v }))} label={l('clearKey')} />
    {account.site?.platform === 'sub2api' && <>{input('refreshToken', l('refreshToken'), 'password')}{input('tokenExpiresAt', l('expiry'), 'number')}<Toggle checked={!!draft.clearRefreshToken} onChange={v => setDraft(d => ({ ...d, clearRefreshToken: v }))} label={l('clearRefresh')} /></>}
  </EditDrawer>;
}
