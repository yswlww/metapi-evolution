import { useEffect, useState } from 'react';
import { EditDrawer } from '../../components/EditDrawer';
import { apiGet } from '../../lib/client';
import { useManagementText } from '../../lib/managementParityText';
import { useToast } from '../../components/Toast';
type Usage = { totalRequests: number; successRequests: number; failedRequests: number; successRate: number | null; totalTokens: number; totalCost: number };
export default function KeyOverview({ id, onClose }: { id: number; onClose: () => void }) {
  const l = useManagementText(); const { showToast } = useToast(); const [data, setData] = useState<{ item: { name: string }; usage: { last24h: Usage | null; last7d: Usage | null; all: Usage | null } } | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { let alive = true; setData(null); setLoading(true); apiGet<typeof data>(`/api/downstream-keys/${id}/overview`).then(r => { if (alive) setData(r); }).catch(e => { if (alive) showToast(e instanceof Error ? e.message : l('loadFailed')); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [id]);
  return <EditDrawer open title={`${l('overview')} · ${data?.item.name ?? id}`} onClose={onClose}>{loading ? <p>{l('loading')}</p> : !data ? <p>{l('noData')}</p> : (['last24h', 'last7d', 'all'] as const).map(range => { const usage = data.usage[range]; return <section key={range} className="rounded border p-3"><h3>{l(range === 'all' ? 'history' : range)}</h3>{!usage ? <p>{l('noData')}</p> : <dl className="grid grid-cols-2 gap-2 text-sm"><dt>{l('requests')}</dt><dd>{usage.totalRequests}</dd><dt>{l('success')}</dt><dd>{usage.successRequests}</dd><dt>{l('failed')}</dt><dd>{usage.failedRequests}</dd><dt>{l('successRate')}</dt><dd>{usage.successRate == null ? '—' : `${usage.successRate}%`}</dd><dt>{l('tokens')}</dt><dd>{usage.totalTokens}</dd><dt>{l('totalCost')}</dt><dd>{usage.totalCost}</dd></dl>}</section>; })}</EditDrawer>;
}
