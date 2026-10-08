import { checkinDiagnostics } from '../../lib/managementParity';
import { useManagementText } from '../../lib/managementParityText';
export default function CheckinDiagnostics({ reason, message }: { reason: unknown; message: string }) {
  const l = useManagementText(); const details = checkinDiagnostics(reason, message);
  return <details className="max-w-md"><summary>{details.title || l('diagnostics')}</summary><dl className="space-y-1 py-2"><dt>{l('code')}</dt><dd>{details.code || '—'}</dd><dt>{l('category')}</dt><dd>{details.category || '—'}</dd><dt>{l('details')}</dt><dd className="whitespace-pre-wrap break-words">{details.detailHint || '—'}</dd><dt>{l('action')}</dt><dd className="whitespace-pre-wrap break-words">{details.actionHint || '—'}</dd><dt>{l('message')}</dt><dd className="whitespace-pre-wrap break-words">{details.message || '—'}</dd></dl></details>;
}
