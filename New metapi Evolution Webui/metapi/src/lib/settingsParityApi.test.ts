import { beforeEach, describe, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => ({get: vi.fn(), put: vi.fn(), post: vi.fn()}));
vi.mock('./client', () => ({apiGet: request.get, apiPut: request.put, apiPost: request.post}));
import { getDatabaseRuntime, saveDatabaseRuntime, runModelProbe } from './settingsParityApi';
beforeEach(() => {request.get.mockReset(); request.put.mockReset(); request.post.mockReset();});
describe('settings parity API contracts', () => {
  it('calls the dedicated model availability probe, not discovery/rebuild or a proxy test', async () => {
    request.post.mockResolvedValue({jobId: 'probe-task'});
    await runModelProbe();
    expect(request.post).toHaveBeenCalledWith('/api/models/probe', {});
  });
  it('reads and writes runtime DB configuration with SSL but no migration overwrite flag', async () => {
    await getDatabaseRuntime();
    await saveDatabaseRuntime({dialect: 'postgres', connectionString: ' postgres://real/db ', ssl: true, overwrite: true});
    expect(request.get).toHaveBeenCalledWith('/api/settings/database/runtime');
    expect(request.put).toHaveBeenCalledWith('/api/settings/database/runtime', {dialect: 'postgres', connectionString: 'postgres://real/db', ssl: true});
  });
});
