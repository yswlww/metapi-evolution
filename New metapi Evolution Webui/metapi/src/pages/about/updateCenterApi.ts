import { apiGet, apiPut } from '../../lib/client';
import type { UpdateConfig } from './updateCenterContract';
export type UpdateTask = {id: string; status: string; error?: string | null; logs?: Array<{message?: string; timestamp?: string}>};
export function saveUpdateConfig(config: UpdateConfig) { return apiPut<{config: UpdateConfig}>('/api/update-center/config', config); }
export function getUpdateTask(id: string, signal?: AbortSignal) {return apiGet<{task: UpdateTask}>(`/api/update-center/tasks/${encodeURIComponent(id)}`, {signal});}
