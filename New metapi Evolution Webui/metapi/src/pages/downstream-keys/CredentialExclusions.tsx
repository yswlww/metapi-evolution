import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/client';
import { buildCredentialOptions, credentialRefKey, type CredentialRef } from '../../lib/managementParity';
import { useManagementText } from '../../lib/managementParityText';
import { useToast } from '../../components/Toast';
export default function CredentialExclusions({ value, onChange }: { value: CredentialRef[]; onChange: (value: CredentialRef[]) => void }) {
  const l = useManagementText(); const { showToast } = useToast(); const [options, setOptions] = useState<ReturnType<typeof buildCredentialOptions>>([]); const [query, setQuery] = useState(''); const [loaded, setLoaded] = useState(false);
  useEffect(() => { let alive = true; Promise.all([apiGet<{ accounts: any[] }>('/api/accounts'), apiGet<any[]>('/api/account-tokens')]).then(([accounts, tokens]) => { if (alive) { setOptions(buildCredentialOptions(accounts.accounts ?? [], tokens)); setLoaded(true); } }).catch(e => { if (alive) showToast(e instanceof Error ? e.message : l('loadFailed')); }); return () => { alive = false; }; }, []);
  const selected = new Set(value.map(credentialRefKey));
  // Keep previously stored references selectable even when their owner disappears.
  const allOptions = [...options, ...value.filter(ref => !options.some(o => credentialRefKey(o.ref) === credentialRefKey(ref))).map(ref => ({ ref, label: `#${ref.accountId}${ref.kind === 'account_token' ? ` / #${ref.tokenId}` : ''}` }))];
  return <section className="space-y-2"><h3>{l('credentials')}</h3><input className="w-full rounded border bg-[color:var(--color-panel)] p-2" aria-label={l('search')} value={query} placeholder={l('search')} onChange={e => setQuery(e.target.value)} />{!loaded && <p>{l('loading')}</p>}<div className="max-h-56 overflow-auto">{allOptions.filter(o => o.label.toLowerCase().includes(query.toLowerCase())).map(o => <label key={credentialRefKey(o.ref)} className="flex gap-2 py-2"><input type="checkbox" checked={selected.has(credentialRefKey(o.ref))} onChange={() => onChange(selected.has(credentialRefKey(o.ref)) ? value.filter(ref => credentialRefKey(ref) !== credentialRefKey(o.ref)) : [...value, o.ref])} /><span>{l(o.ref.kind === 'account_token' ? 'explicitToken' : 'apiKey')} · {o.label}</span></label>)}</div></section>;
}
