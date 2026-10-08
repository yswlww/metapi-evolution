import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/client';
import { useManagementText } from '../../lib/managementParityText';
import { TextInput } from '../../components/EditDrawer';
import { useToast } from '../../components/Toast';
export default function SiteModelsChooser({ siteId, value, onChange }: { siteId: number; value: string; onChange: (value: string) => void }) {
  const l = useManagementText(); const { showToast } = useToast(); const [available, setAvailable] = useState<string[]>([]); const [query, setQuery] = useState('');
  useEffect(() => { let alive = true; setAvailable([]); apiGet<{ models: string[] }>(`/api/sites/${siteId}/available-models`).then(r => { if (alive) setAvailable(r.models ?? []); }).catch(e => { if (alive) showToast(e instanceof Error ? e.message : l('loadFailed')); }); return () => { alive = false; }; }, [siteId]);
  const disabled = new Set(value.split(/[,，\n]/).map(m => m.trim()).filter(Boolean));
  const models = [...new Set([...available, ...disabled])].sort();
  return <section className="space-y-2"><p className="text-xs">{l('disableModels')}</p><TextInput value={query} placeholder={l('search')} onChange={e => setQuery(e.target.value)} /><div className="flex flex-wrap gap-3"><button type="button" onClick={() => onChange('')}>{l('enableAll')}</button><button type="button" onClick={() => onChange(models.join(', '))}>{l('disableAll')}</button></div><div className="max-h-56 overflow-auto">{models.filter(m => m.toLowerCase().includes(query.toLowerCase())).map(m => <label key={m} className="flex gap-2 py-1"><input type="checkbox" checked={!disabled.has(m)} onChange={() => { disabled.has(m) ? disabled.delete(m) : disabled.add(m); onChange([...disabled].join(', ')); }} /><span className="break-all">{m}</span></label>)}</div></section>;
}
