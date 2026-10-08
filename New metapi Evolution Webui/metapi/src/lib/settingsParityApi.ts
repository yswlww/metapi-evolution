import { apiGet, apiPost, apiPut } from './client';
import { databasePayload, type DatabaseDraft } from './settingsParity';
export type DatabaseRuntime = {active: {dialect: string; connection: string; ssl: boolean}; saved?: {dialect: string; connection: string; ssl: boolean} | null; restartRequired: boolean};
export function getDatabaseRuntime() { return apiGet<DatabaseRuntime>('/api/settings/database/runtime'); }
export function saveDatabaseRuntime(draft: DatabaseDraft) { return apiPut<DatabaseRuntime>('/api/settings/database/runtime', databasePayload(draft)); }
export function runModelProbe() { return apiPost<{jobId?: string; status?: string}>('/api/models/probe', {}); }
