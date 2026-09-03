type PulledEventBatch<TEvent> = {
  events: TEvent[];
  rest: string;
};

type ProxyStreamReader = {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(reason?: unknown): Promise<unknown>;
  releaseLock(): void;
};

type ProxyStreamLifecycleInput<TEvent> = {
  reader: ProxyStreamReader | null | undefined;
  response: { end(): void };
  pullEvents(buffer: string): PulledEventBatch<TEvent>;
  handleEvent(event: TEvent): Promise<boolean | void> | boolean | void;
  onEof?: () => Promise<void> | void;
};

export function createProxyStreamLifecycle<TEvent>(input: ProxyStreamLifecycleInput<TEvent>) {
  const flushBuffer = async (buffer: string): Promise<{ rest: string; stop: boolean }> => {
    const pulled = input.pullEvents(buffer);
    for (const event of pulled.events) {
      if (await input.handleEvent(event)) {
        return {
          rest: pulled.rest,
          stop: true,
        };
      }
    }

    return {
      rest: pulled.rest,
      stop: false,
    };
  };

  return {
    async run(): Promise<void> {
      const reader = input.reader;
      if (!reader) {
        try {
          await input.onEof?.();
        } finally {
          input.response.end();
        }
        return;
      }

      const decoder = new TextDecoder();
      let sseBuffer = '';
      let shouldStop = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;

          sseBuffer += decoder.decode(value, { stream: true });
          const flushed = await flushBuffer(sseBuffer);
          sseBuffer = flushed.rest;
          if (!flushed.stop) continue;

          shouldStop = true;
          await reader.cancel().catch(() => {});
          break;
        }

        if (!shouldStop) {
          sseBuffer += decoder.decode();
          if (sseBuffer.trim().length > 0) {
            const flushed = await flushBuffer(`${sseBuffer}\n\n`);
            sseBuffer = flushed.rest;
            shouldStop = flushed.stop;
          }
        }

        if (!shouldStop) {
          await input.onEof?.();
        }
      } catch (error) {
        await reader.cancel(error).catch(() => {});
        throw error;
      } finally {
        reader.releaseLock();
        input.response.end();
      }
    },
  };
}
