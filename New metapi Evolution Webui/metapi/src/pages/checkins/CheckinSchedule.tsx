import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '../../lib/client';
import { buildSchedulePayload } from '../../lib/managementParity';
import { useManagementText } from '../../lib/managementParityText';
import { Field, TextInput } from '../../components/EditDrawer';
import { useToast } from '../../components/Toast';
export default function CheckinSchedule({ onSaved }: { onSaved: () => void }) {
  const l = useManagementText(); const { showToast } = useToast(); const [mode, setMode] = useState<'cron' | 'interval'>('cron'); const [cron, setCron] = useState(''); const [hours, setHours] = useState(''); const [loaded, setLoaded] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; apiGet<any>('/api/settings/runtime').then(r => { if (!alive) return; setMode(r.checkinScheduleMode === 'interval' ? 'interval' : 'cron'); setCron(r.checkinCron || ''); setHours(String(r.checkinIntervalHours ?? '')); setLoaded(true); }).catch(e => { if (alive) showToast(e instanceof Error ? e.message : l('loadFailed')); }); return () => { alive = false; }; }, []);
  const save = async () => { setBusy(true); try { const result = await apiPut<{ success?: boolean; error?: string }>('/api/checkin/schedule', buildSchedulePayload(mode, cron, hours)); if (result.error || result.success === false) throw new Error(result.error || l('saveFailed')); showToast(l('saved')); onSaved(); } catch(e) { showToast(e instanceof Error ? e.message : l('saveFailed')); } finally { setBusy(false); } };
  return <section className="card space-y-3 p-4"><Field label={l('schedule')}><select disabled={!loaded || busy} value={mode} onChange={e => setMode(e.target.value as 'cron' | 'interval')}><option value="cron">{l('cron')}</option><option value="interval">{l('interval')}</option></select></Field>{mode === 'cron' ? <Field label={`${l('cron')} (UTC+8)`}><TextInput value={cron} onChange={e => setCron(e.target.value)} /></Field> : <Field label={l('interval')}><TextInput type="number" min={1} max={24} step={1} value={hours} onChange={e => setHours(e.target.value)} /></Field>}<button disabled={!loaded || busy} onClick={save}>{l('save')}</button></section>;
}
