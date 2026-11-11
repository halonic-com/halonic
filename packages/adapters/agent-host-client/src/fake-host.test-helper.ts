import type {
  AgentHostAnswer,
  AgentHostRequestRoute,
  AgentHostStreamAnswer,
  AgentHostStreamRoute,
  AgentHostTransport,
} from "./transport.ts";

/** One stream the fake host has open: the test writes its lines and ends it. */
export class FakeStream {
  readonly #lines: ReadableStream<unknown>;
  #controller!: ReadableStreamDefaultController<unknown>;
  #ended = false;
  readonly ended: Promise<void>;
  readonly body: unknown;
  readonly signal: AbortSignal;

  constructor(body: unknown, signal: AbortSignal) {
    this.body = body;
    this.signal = signal;
    this.#lines = new ReadableStream({
      start: (controller) => {
        this.#controller = controller;
      },
    });
    this.ended = new Promise((resolve) => {
      const end = () => {
        this.end();
        resolve();
      };
      if (signal.aborted) end();
      else signal.addEventListener("abort", end, { once: true });
    });
  }

  send(line: unknown): void {
    this.#controller.enqueue(line);
  }

  end(): void {
    if (this.#ended) return;
    this.#ended = true;
    this.#controller.close();
  }

  async *lines(): AsyncIterable<unknown> {
    const reader = this.#lines.getReader();
    for (;;) {
      const next = await reader.read();
      if (next.done) return;
      yield next.value;
    }
  }
}

type RequestHandler = (body: unknown) => AgentHostAnswer | Promise<AgentHostAnswer>;

/**
 * An in-memory agent host. A test answers each route it expects; a call to
 * any other is a 404, as the real host answers an unknown path. Stream
 * routes open a {@link FakeStream} the test drives, unless `refuseStream`
 * names an answer for that route.
 */
export class FakeHost implements AgentHostTransport {
  readonly calls: { route: string; body: unknown }[] = [];
  readonly streams: { route: AgentHostStreamRoute; stream: FakeStream }[] = [];
  readonly #handlers = new Map<string, RequestHandler>();
  readonly #refusals = new Map<string, AgentHostAnswer>();
  readonly #opened: (() => void)[] = [];

  answer(route: AgentHostRequestRoute, handler: RequestHandler | AgentHostAnswer): this {
    this.#handlers.set(route, typeof handler === "function" ? handler : () => handler);
    return this;
  }

  refuseStream(route: AgentHostStreamRoute, answer: AgentHostAnswer): this {
    this.#refusals.set(route, answer);
    return this;
  }

  /** The next stream opened on `route`, once it is. */
  nextStream(route: AgentHostStreamRoute): Promise<FakeStream> {
    const open = this.streams.length;
    return new Promise((resolve) => {
      const check = () => {
        const found = this.streams.slice(open).find((each) => each.route === route);
        if (found) resolve(found.stream);
        else this.#opened.push(check);
      };
      check();
    });
  }

  async request(route: AgentHostRequestRoute, body?: unknown): Promise<AgentHostAnswer> {
    this.calls.push({ route, body });
    const handler = this.#handlers.get(route);
    if (handler === undefined) return notFound();
    return handler(body);
  }

  async stream(
    route: AgentHostStreamRoute,
    body: unknown,
    options: { readonly signal: AbortSignal },
  ): Promise<AgentHostStreamAnswer> {
    this.calls.push({ route, body });
    const refusal = this.#refusals.get(route);
    if (refusal !== undefined) return { ok: false, answer: refusal };
    const stream = new FakeStream(body, options.signal);
    this.streams.push({ route, stream });
    for (const check of this.#opened.splice(0)) check();
    return { ok: true, lines: stream.lines() };
  }
}

export function ok(body: unknown): AgentHostAnswer {
  return { status: 200, body };
}

export function refused(status: number, kind: string, message: string): AgentHostAnswer {
  return { status, body: { error: { kind, message } } };
}

function notFound(): AgentHostAnswer {
  return refused(404, "not_found", "No such route.");
}
