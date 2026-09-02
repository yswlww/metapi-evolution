import { describe, expect, it, vi } from 'vitest';
import { createProxyStreamLifecycle } from './protocolLifecycle.js';

describe('createProxyStreamLifecycle', () => {
  it('cancels the upstream reader and preserves a transform error', async () => {
    const transformError = new Error('transform failed');
    const cancel = vi.fn().mockRejectedValue(new Error('cancel failed'));
    const releaseLock = vi.fn();
    const end = vi.fn();
    const reader = {
      read: vi.fn().mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: event\n\n') }),
      cancel,
      releaseLock,
    };

    const lifecycle = createProxyStreamLifecycle({
      reader,
      response: { end },
      pullEvents: () => ({ events: ['event'], rest: '' }),
      handleEvent: () => { throw transformError; },
    });

    await expect(lifecycle.run()).rejects.toBe(transformError);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(transformError);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
