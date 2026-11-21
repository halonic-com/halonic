import { engineRouteOf } from "./engine-routes.ts";
import { TauriChannel } from "./tauri-channel.ts";
import type { TauriCallbacks, TauriIpc } from "./tauri-ipc.ts";

/**
 * The address `tauriEngineFetch` answers for. `.invalid` never resolves, so a request that went
 * to the network by mistake fails rather than reaching anyone; the shell knows the engine's real
 * address and token, and the page never does.
 */
export const engineBaseUrl = "http://engine.invalid";

/** Sends one request to the window's engine, as `fetch` would. */
export type EngineFetch = (request: Request) => Promise<Response>;

/**
 * Why the shell didn't take a call to the engine: its refusal's `kind` (`engine_unavailable`
 * when no engine runs for the window's workspace, `unknown_route`, `bad_param`, `io`, …), or
 * `answer_invalid` when the shell's answer isn't one Halonic expects. The engine's own refusals
 * are answers, not this.
 */
export class EngineCallRefused extends Error {
  override readonly name = "EngineCallRefused";
  readonly kind: string;

  constructor(kind: string, message: string) {
    super(message);
    this.kind = kind;
  }
}

/**
 * The shell keys a stream by the page and this number, and refuses a number that is still open
 * (`stream_in_use`). A module runs once per page, so one counter keeps every fetch apart.
 */
let nextStreamId = 1;

/**
 * The window's engine through the shell's `engine_request`, `engine_stream` and
 * `engine_stream_end` commands (`apps/studio/src-tauri/src/engine.rs`), as a `fetch` for
 * `createRemoteExecutor`. A request names the engine's route by its method and path on
 * {@link engineBaseUrl}; the shell gets the route's name and params, never a URL, and keeps the
 * engine's token. A stream route's answer is a body of server-sent events, rebuilt from the
 * channel's messages. Aborting the request stops waiting, and ends a stream.
 *
 * @throws EngineCallRefused when the request isn't to a route of the shell's table, or the shell refuses it
 */
export function tauriEngineFetch(ipc: TauriIpc & TauriCallbacks): EngineFetch {
  return async (request) => {
    const url = new URL(request.url);
    const call = url.origin === engineBaseUrl ? engineRouteOf(request.method, url) : undefined;
    if (call === undefined) {
      throw new EngineCallRefused("unknown_route", "That isn't a route of the engine.");
    }
    const { route, params } = call;
    if (call.answer === "stream") return openStream(ipc, route, params, request.signal);
    const text = await request.text();
    const body: unknown = text === "" ? undefined : JSON.parse(text);
    return jsonResponse(
      route,
      await invoke(ipc, "engine_request", { route, params, body }, request.signal),
    );
  };
}

async function openStream(
  ipc: TauriIpc & TauriCallbacks,
  route: string,
  params: Readonly<Record<string, string | number>>,
  signal: AbortSignal,
): Promise<Response> {
  const stream = new EngineStream(ipc, nextStreamId++);
  signal.addEventListener("abort", () => stream.hangUp(signal.reason), { once: true });
  let start: unknown;
  try {
    start = await invoke(
      ipc,
      "engine_stream",
      { route, stream: stream.id, params, channel: stream.channelArgument },
      signal,
    );
  } catch (error) {
    // Aborting has already hung up; a refusal means the shell opened nothing.
    stream.finish();
    throw error;
  }
  if (isRecord(start) && "answer" in start) {
    stream.finish();
    return jsonResponse(route, start["answer"]);
  }
  if (!isRecord(start) || start["stream"] !== stream.id) {
    stream.hangUp();
    throw invalid(route);
  }
  return new Response(stream.body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/**
 * One stream: the channel its events come on, as a body of server-sent events. The shell sends
 * `{ type: "event", event, data, id? }` for each event, then `{ type: "end" }`, or
 * `{ type: "failed", message }` when the stream broke off.
 */
class EngineStream {
  readonly id: number;
  readonly body: ReadableStream<Uint8Array>;
  readonly #ipc: TauriIpc;
  readonly #channel: TauriChannel;
  readonly #encoder = new TextEncoder();
  #controller!: ReadableStreamDefaultController<Uint8Array>;
  #finished = false;

  constructor(ipc: TauriIpc & TauriCallbacks, id: number) {
    this.id = id;
    this.#ipc = ipc;
    this.body = new ReadableStream({
      start: (controller) => {
        this.#controller = controller;
      },
      // The reader stopped before the end: the body is closed already, and the shell drops the
      // stream, which hangs up on the engine.
      cancel: () => {
        this.#stop();
        this.#tellShell();
      },
    });
    this.#channel = new TauriChannel(ipc, (message) => this.#receive(message));
  }

  get channelArgument(): string {
    return this.#channel.argument;
  }

  /** Stops reading and ends the body; `error` makes reading it throw that. */
  finish(error?: unknown): void {
    if (!this.#stop()) return;
    if (error === undefined) this.#controller.close();
    else this.#controller.error(error);
  }

  /** Ends the stream from the page's side, as {@link EngineStream.finish} does, and tells the shell. */
  hangUp(error?: unknown): void {
    if (this.#finished) return;
    this.finish(error);
    this.#tellShell();
  }

  /** Stops reading the channel; `false` when the stream had already finished. */
  #stop(): boolean {
    if (this.#finished) return false;
    this.#finished = true;
    this.#channel.close();
    return true;
  }

  /** The shell drops the stream, which hangs up on the engine. An id that has already ended is fine for it. */
  #tellShell(): void {
    this.#ipc.invoke("engine_stream_end", { stream: this.id }).catch((failure: unknown) => {
      console.error("Couldn't tell the shell an engine stream ended.", failure);
    });
  }

  #receive(message: unknown): void {
    if (!isRecord(message)) {
      this.hangUp(brokeOff("a message that isn't an object"));
      return;
    }
    switch (message["type"]) {
      case "event":
        this.#controller.enqueue(this.#encoder.encode(sseBlock(message)));
        return;
      case "end":
        this.finish();
        return;
      case "failed":
        // Not an `EngineCallRefused`: a stream that broke off can be opened again.
        this.finish(new Error(`The engine's stream broke off: ${String(message["message"])}.`));
        return;
      default:
        this.hangUp(brokeOff(`a message of type ${JSON.stringify(message["type"])}`));
    }
  }
}

/** One event as server-sent event lines: its id, its name, and a `data:` line for each line of its data. */
function sseBlock(message: Record<string, unknown>): string {
  const lines: string[] = [];
  if (typeof message["id"] === "string") lines.push(`id: ${message["id"]}`);
  lines.push(`event: ${String(message["event"])}`);
  for (const line of String(message["data"]).split("\n")) lines.push(`data: ${line}`);
  return `${lines.join("\n")}\n\n`;
}

/** The engine's answer as the shell passed it, `{ status, body }`, as a JSON response. */
function jsonResponse(route: string, answer: unknown): Response {
  if (!isRecord(answer) || typeof answer["status"] !== "number" || !("body" in answer)) {
    throw invalid(route);
  }
  const { status, body } = answer;
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Invokes `command`, turning the shell's refusal `{ kind, message }` into an {@link EngineCallRefused}. */
async function invoke(
  ipc: TauriIpc,
  command: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  signal.throwIfAborted();
  try {
    return await untilAborted(ipc.invoke(command, args), signal);
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (isRecord(error) && typeof error["kind"] === "string") {
      const message = typeof error["message"] === "string" ? error["message"] : error["kind"];
      throw new EngineCallRefused(error["kind"], `The shell refused the engine call: ${message}.`);
    }
    throw error;
  }
}

/** `promise`, or a rejection with `signal`'s reason once it aborts. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function invalid(route: string): EngineCallRefused {
  return new EngineCallRefused(
    "answer_invalid",
    `The shell's answer to ${route} isn't what Halonic expects.`,
  );
}

function brokeOff(what: string): EngineCallRefused {
  return new EngineCallRefused("answer_invalid", `The shell sent ${what} on an engine stream.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
