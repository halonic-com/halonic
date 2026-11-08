/**
 * Web-standard values for the host (multi-cloud ADR 5.1, C14).
 *
 * The constructors and functions that go with the interfaces in
 * `web-types.d.ts`: `fetch`, `new Request()`, `crypto.subtle`, streams and
 * timers. Only the host preset loads this file, so the core can name these
 * types but never call them: "no timers in the core" is a compile error.
 * Every runtime the host runs on (Node, Workers, browsers) has all of them.
 * Nothing Node-specific (`Buffer`, `process`, `require`) is here.
 *
 * Signatures copy `lib.dom`. Add a value only when the host needs it.
 */

// --- Constructors for the types in web-types.d.ts ---------------------------

declare var URL: {
  prototype: URL;
  new (url: string | URL, base?: string | URL): URL;
  canParse(url: string | URL, base?: string | URL): boolean;
  parse(url: string | URL, base?: string | URL): URL | null;
};

declare var URLSearchParams: {
  prototype: URLSearchParams;
  new (
    init?: [string, string][] | Record<string, string> | string | URLSearchParams,
  ): URLSearchParams;
};

declare var Headers: {
  prototype: Headers;
  new (init?: HeadersInit): Headers;
};

declare var Request: {
  prototype: Request;
  new (input: RequestInfo | URL, init?: RequestInit): Request;
};

declare var Response: {
  prototype: Response;
  new (body?: BodyInit | null, init?: ResponseInit): Response;
  error(): Response;
  json(data: unknown, init?: ResponseInit): Response;
  redirect(url: string | URL, status?: number): Response;
};

declare var AbortSignal: {
  prototype: AbortSignal;
  abort(reason?: unknown): AbortSignal;
  any(signals: AbortSignal[]): AbortSignal;
  timeout(milliseconds: number): AbortSignal;
};

interface AbortController {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}

declare var AbortController: {
  prototype: AbortController;
  new (): AbortController;
};

declare var TextEncoder: {
  prototype: TextEncoder;
  new (): TextEncoder;
};

declare var TextDecoder: {
  prototype: TextDecoder;
  new (label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean }): TextDecoder;
};

declare var crypto: Crypto;

// --- Streams ----------------------------------------------------------------

interface QueuingStrategy<T = unknown> {
  highWaterMark?: number;
  size?: (chunk: T) => number;
}

interface ReadableStreamDefaultController<R = unknown> {
  readonly desiredSize: number | null;
  close(): void;
  enqueue(chunk?: R): void;
  error(reason?: unknown): void;
}

interface UnderlyingDefaultSource<R = unknown> {
  cancel?: (reason?: unknown) => void | PromiseLike<void>;
  pull?: (controller: ReadableStreamDefaultController<R>) => void | PromiseLike<void>;
  start?: (controller: ReadableStreamDefaultController<R>) => unknown;
}

declare var ReadableStream: {
  prototype: ReadableStream;
  new <R = unknown>(
    underlyingSource?: UnderlyingDefaultSource<R>,
    strategy?: QueuingStrategy<R>,
  ): ReadableStream<R>;
};

interface WritableStreamDefaultController {
  readonly signal: AbortSignal;
  error(reason?: unknown): void;
}

interface UnderlyingSink<W = unknown> {
  abort?: (reason?: unknown) => void | PromiseLike<void>;
  close?: () => void | PromiseLike<void>;
  start?: (controller: WritableStreamDefaultController) => unknown;
  write?: (chunk: W, controller: WritableStreamDefaultController) => void | PromiseLike<void>;
}

declare var WritableStream: {
  prototype: WritableStream;
  new <W = unknown>(
    underlyingSink?: UnderlyingSink<W>,
    strategy?: QueuingStrategy<W>,
  ): WritableStream<W>;
};

interface TransformStreamDefaultController<O = unknown> {
  readonly desiredSize: number | null;
  enqueue(chunk?: O): void;
  error(reason?: unknown): void;
  terminate(): void;
}

interface Transformer<I = unknown, O = unknown> {
  flush?: (controller: TransformStreamDefaultController<O>) => void | PromiseLike<void>;
  start?: (controller: TransformStreamDefaultController<O>) => unknown;
  transform?: (
    chunk: I,
    controller: TransformStreamDefaultController<O>,
  ) => void | PromiseLike<void>;
}

declare var TransformStream: {
  prototype: TransformStream;
  new <I = unknown, O = unknown>(
    transformer?: Transformer<I, O>,
    writableStrategy?: QueuingStrategy<I>,
    readableStrategy?: QueuingStrategy<O>,
  ): TransformStream<I, O>;
};

// --- Functions --------------------------------------------------------------

declare function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;

/**
 * Opaque: a number in browsers and Workers, an object in Node. Store it as
 * `ReturnType<typeof setTimeout>`, so the same code also type-checks against
 * `@types/node` in tests, and only pass it to `clearTimeout`/`clearInterval`.
 */
interface TimerHandle {
  readonly __timerHandle: never;
}

declare function setTimeout(handler: () => void, timeout?: number): TimerHandle;
declare function clearTimeout(handle: TimerHandle | undefined): void;
declare function setInterval(handler: () => void, timeout?: number): TimerHandle;
declare function clearInterval(handle: TimerHandle | undefined): void;
declare function queueMicrotask(callback: () => void): void;
