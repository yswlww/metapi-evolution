import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const RETIRED_MONITOR_API_PATHS = new Set([
  '/api/monitor/config',
  '/api/monitor/session',
]);
const RETIRED_MONITOR_PROXY_NAMESPACE = '/monitor-proxy';

function pathnameFromRequestUrl(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

export function isRetiredMonitorPath(url: string): boolean {
  const pathname = pathnameFromRequestUrl(url);
  return RETIRED_MONITOR_API_PATHS.has(pathname)
    || pathname === RETIRED_MONITOR_PROXY_NAMESPACE
    || pathname.startsWith(`${RETIRED_MONITOR_PROXY_NAMESPACE}/`);
}

async function retiredMonitorRouteGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!isRetiredMonitorPath(request.url)) return;

  reply.code(404).send({ error: 'Not found' });
}

export function registerRetiredMonitorRouteGuard(app: FastifyInstance): void {
  app.addHook('onRequest', retiredMonitorRouteGuard);
}
