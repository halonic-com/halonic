// The core preset lets ports and core code name the Web types (ADR 5.1, C14).

export interface HttpClient {
  send(request: Request, signal?: AbortSignal): Promise<Response>;
}

export interface BlobStore {
  read(key: string): Promise<ReadableStream<Uint8Array> | null>;
  write(key: string, body: ReadableStream<Uint8Array>): Promise<void>;
}

export async function readText(response: Response): Promise<string> {
  return response.ok ? await response.text() : "";
}

export function contentType(request: Request): string | null {
  return request.headers.get("content-type");
}

export function pathOf(url: URL): string {
  return url.pathname + url.search;
}

export function sha256(crypto: Crypto, data: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", data);
}

export function encode(encoder: TextEncoder, text: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(text);
}

export function decode(decoder: TextDecoder, bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function stopIfAborted(signal: AbortSignal): void {
  signal.throwIfAborted();
}
