import type { FastifyInstance } from 'fastify';
import { saveUpdateCenterConfig } from '../../services/updateCenterConfigService.js';
import { getUpdateCenterStatus, refreshUpdateCenterStatusCache } from '../../services/updateCenterStatusService.js';
import { getLocalUpdateTask, LocalUpdateRequestError, startLocalUpdateTask } from '../../services/updateCenterTaskService.js';
import { streamLocalUpdateTask } from '../../services/updateCenterTaskStream.js';
import { parseUpdateCenterConfigPayload, parseUpdateCenterDeployPayload, parseUpdateCenterRollbackPayload } from '../../contracts/supportRoutePayloads.js';

export async function updateCenterRoutes(app: FastifyInstance) {
  app.get('/api/update-center/status', getUpdateCenterStatus);
  app.post('/api/update-center/check', async () => (await refreshUpdateCenterStatusCache()).status);
  app.put<{ Body: unknown }>('/api/update-center/config', async (request, reply) => {
    const parsed = parseUpdateCenterConfigPayload(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, message: parsed.error });
    return { success: true, config: await saveUpdateCenterConfig(parsed.data) };
  });
  app.post<{ Body: unknown }>('/api/update-center/deploy', async (request, reply) => {
    const parsed = parseUpdateCenterDeployPayload(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, message: parsed.error });
    try { return reply.code(202).send(await startLocalUpdateTask({ ...parsed.data, operation: 'deploy' })); }
    catch (error) {
      if (error instanceof LocalUpdateRequestError) return reply.code(error.statusCode).send({ success: false, message: error.message });
      throw error;
    }
  });
  app.post<{ Body: unknown }>('/api/update-center/rollback', async (request, reply) => {
    const parsed = parseUpdateCenterRollbackPayload(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, message: parsed.error });
    try { return reply.code(202).send(await startLocalUpdateTask({ operation: 'rollback' })); }
    catch (error) {
      if (error instanceof LocalUpdateRequestError) return reply.code(error.statusCode).send({ success: false, message: error.message });
      throw error;
    }
  });
  app.get<{ Params: { id: string } }>('/api/update-center/tasks/:id', async (request, reply) => {
    const task = await getLocalUpdateTask(request.params.id);
    if (!task) return reply.code(404).send({ success: false, message: 'task not found' });
    return { task };
  });
  app.get<{ Params: { id: string } }>('/api/update-center/tasks/:id/stream', async (request, reply) => {
    if (!await getLocalUpdateTask(request.params.id)) return reply.code(404).send({ success: false, message: 'task not found' });
    reply.hijack();
    await streamLocalUpdateTask(request.params.id, reply.raw);
  });
}
