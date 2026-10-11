// Stream delta (text), done (result), and error events through a Web Response.
// Used by Vercel Node functions and the Vite dev adapter.

export interface SseWriter {
  response: Response;
  send: (event: string, data: unknown) => void;
  close: () => void;
}

export function sse(): SseWriter {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      c.enqueue(encoder.encode(": pace\n\n"));
    },
    cancel() {
      closed = true;
    }
  });
  const send = (event: string, data: unknown) => {
    if (closed || !controller) return;
    try {
      controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    } catch {
      closed = true;
    }
  };
  const close = () => {
    if (closed || !controller) return;
    closed = true;
    try {
      controller.close();
    } catch {
      /* already closed */
    }
  };
  const response = new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    }
  });
  return { response, send, close };
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
