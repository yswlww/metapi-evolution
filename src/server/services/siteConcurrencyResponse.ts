import type { ProxySiteLease } from './proxyChannelCoordinator.js';

function copyResponse(response: Response, body: BodyInit | null): Response {
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

/**
 * Transfers release ownership from the endpoint operation to the response body.
 */
export function bindSiteLeaseToResponse(
  response: Response,
  lease: ProxySiteLease,
  signal?: AbortSignal,
): Response {
  lease.markTransferred();

  if (!response.body) {
    lease.release();
    return copyResponse(response, null);
  }

  const sourceBody = response.body;
  let sourceReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let released = false;
  let disposed = false;

  const release = () => {
    if (released) return;
    released = true;
    lease.release();
  };

  const touch = () => {
    lease.touch();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener('abort', onAbort);
  };

  const onAbort = () => {
    release();
    if (sourceReader) {
      void sourceReader.cancel().catch(() => {});
    }
  };

  const wrappedBody = new ReadableStream<Uint8Array>({
    start(controller) {
      try {
        sourceReader = sourceBody.getReader();
        if (signal?.aborted) {
          onAbort();
          controller.close();
          return;
        }
        signal?.addEventListener('abort', onAbort, { once: true });
      } catch (error) {
        dispose();
        release();
        controller.error(error);
      }
    },

    async pull(controller) {
      if (!sourceReader) {
        dispose();
        release();
        controller.close();
        return;
      }
      if (signal?.aborted) {
        onAbort();
        dispose();
        controller.close();
        return;
      }

      touch();
      try {
        const { done, value } = await sourceReader.read();
        if (done) {
          dispose();
          release();
          controller.close();
          return;
        }
        touch();
        controller.enqueue(value);
      } catch (error) {
        dispose();
        release();
        controller.error(error);
      }
    },

    async cancel(reason) {
      dispose();
      try {
        await sourceReader?.cancel(reason);
      } finally {
        release();
      }
    },
  });

  return copyResponse(response, wrappedBody);
}
