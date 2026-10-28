import type { ServerResponse } from 'node:http';
import { getLocalUpdateTask } from './updateCenterTaskService.js';

export async function streamLocalUpdateTask(id: string, response: ServerResponse): Promise<void> {
  response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
  let closed = false;
  let lastSeq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  response.once('close', () => { closed = true; clearTimeout(timer); });
  const event = (name: string, data: unknown) => response.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  const poll = async () => {
    if (closed) return;
    try {
      const task = await getLocalUpdateTask(id);
      if (closed) return;
      if (!task) { event('done', { status: 'unknown' }); response.end(); return; }
      for (const log of task.logs) {
        if (log.seq > lastSeq) { event('log', log); lastSeq = log.seq; }
      }
      if (task.status === 'failed' || task.status === 'succeeded') { event('done', { status: task.status }); response.end(); return; }
      response.write(': keep-alive\n\n');
      timer = setTimeout(() => { void poll(); }, 500);
      timer.unref();
    } catch { if (!closed) response.end(); }
  };
  await poll();
}
