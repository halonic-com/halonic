// The host preset has the Web values on top of the core's Web types (ADR 5.1, C14).

export async function getText(url: string): Promise<string> {
  const response = await fetch(new Request(url, { signal: AbortSignal.timeout(1_000) }));
  return response.text();
}

export function jsonResponse(data: unknown): Response {
  return Response.json(data, { status: 200, headers: new Headers({ "x-halonic": "1" }) });
}

export function withQuery(base: string, key: string, value: string): string {
  const url = new URL(base);
  url.searchParams.set(key, value);
  return url.href;
}

export async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

export function bytesOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

export function upperCase(): TransformStream<string, string> {
  return new TransformStream<string, string>({
    transform(chunk, controller) {
      controller.enqueue(chunk.toUpperCase());
    },
  });
}

export function later(run: () => void): () => void {
  const controller = new AbortController();
  const handle: ReturnType<typeof setTimeout> = setTimeout(run, 10);
  controller.signal.addEventListener("abort", () => clearTimeout(handle), { once: true });
  queueMicrotask(() => {});
  return () => controller.abort();
}

export function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
