import {
  type AgentHostAnswer,
  AgentHostError,
  type AgentHostRequestRoute,
  type AgentHostStreamAnswer,
  type AgentHostStreamRoute,
  type AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import { TauriChannel } from "./tauri-channel.ts";
import { type TauriCallbacks, type TauriIpc, tauriChannelIpc } from "./tauri-ipc.ts";

/**
 * The shell keys a stream by the page and this number, and refuses a number
 * that is still open (`stream_in_use`). A module runs once per page, so one
 * counter here keeps every transport on the page apart.
 */
let nextStreamId = 1;

/**
 * The agent host as the desktop shell offers it to a page: the shell's
 * `agent_host_request`, `agent_host_stream` and `agent_host_stream_end`
 * commands (`apps/studio/src-tauri/src/agent_host.rs`). The shell starts the
 * host and keeps its launch token, so the page never sees it.
 *
 * A refusal from the shell (`unknown_route`, `host_unavailable`, ...) is an
 * {@link AgentHostError} with status `0`. The host's own refusals are
 * answers, as the transport promises.
 */
export class TauriAgentHostTransport implements AgentHostTransport {
  readonly #ipc: TauriIpc & TauriCallbacks;

  constructor(ipc: TauriIpc & TauriCallbacks) {
    this.#ipc = ipc;
  }

  /**
   * Calls a JSON route. Aborting stops waiting; the shell's call itself runs
   * to its own time limit, and its answer is dropped.
   */
  async request(
    route: AgentHostRequestRoute,
    body?: unknown,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<AgentHostAnswer> {
    const answer = await this.#invoke("agent_host_request", { route, body }, options.signal);
    return hostAnswer(route, answer);
  }

  async stream(
    route: AgentHostStreamRoute,
    body: unknown,
    options: { readonly signal: AbortSignal },
  ): Promise<AgentHostStreamAnswer> {
    const { signal } = options;
    signal.throwIfAborted();
    const stream = new ShellStream(this.#ipc, nextStreamId++);
    signal.addEventListener("abort", stream.hangUp, { once: true });
    stream.onFinish(() => signal.removeEventListener("abort", stream.hangUp));
    let start: unknown;
    try {
      start = await this.#invoke(
        "agent_host_stream",
        { route, stream: stream.id, body, channel: stream.channelArgument },
        signal,
      );
    } catch (error) {
      // Aborting has already hung up; a refusal means the shell opened nothing.
      stream.finish();
      throw error;
    }
    if (isRecord(start) && "answer" in start) {
      stream.finish();
      return { ok: false, answer: hostAnswer(route, start["answer"]) };
    }
    if (!isRecord(start) || start["stream"] !== stream.id) {
      stream.hangUp();
      throw invalid(route);
    }
    return { ok: true, lines: stream.lines() };
  }

  /** Invokes `command`, turning the shell's refusal into an {@link AgentHostError}. */
  async #invoke(command: string, args: Record<string, unknown>, signal?: AbortSignal) {
    signal?.throwIfAborted();
    try {
      return await untilAborted(this.#ipc.invoke(command, args), signal);
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      throw shellRefusal(error);
    }
  }
}

/**
 * The shell's IPC as an agent host transport, or `undefined` when the page
 * isn't running in the shell.
 *
 * @param page - the page's global object, usually `window`
 * @throws Error when the page has Tauri's internals without the functions
 *   it needs (see `tauriChannelIpc`)
 */
export function tauriAgentHostTransport(page: object): TauriAgentHostTransport | undefined {
  const ipc = tauriChannelIpc(page);
  return ipc === undefined ? undefined : new TauriAgentHostTransport(ipc);
}

/**
 * One stream: the channel its lines come on, and the lines as a queue the
 * engine reads. The shell sends `{ type: "line", line }` for each line, then
 * `{ type: "end" }`, or `{ type: "failed", message }` when the stream broke
 * off.
 */
class ShellStream {
  readonly id: number;
  readonly #ipc: TauriIpc & TauriCallbacks;
  readonly #channel: TauriChannel;
  readonly #lines: ReadableStream<unknown>;
  #controller!: ReadableStreamDefaultController<unknown>;
  #finished = false;
  readonly #onFinish: (() => void)[] = [];

  constructor(ipc: TauriIpc & TauriCallbacks, id: number) {
    this.id = id;
    this.#ipc = ipc;
    this.#lines = new ReadableStream({
      start: (controller) => {
        this.#controller = controller;
      },
    });
    this.#channel = new TauriChannel(ipc, (message) => this.#receive(message));
  }

  get channelArgument(): string {
    return this.#channel.argument;
  }

  onFinish(callback: () => void): void {
    this.#onFinish.push(callback);
  }

  /** Stops reading and ends the lines; `error` makes reading them throw it. */
  finish(error?: Error): void {
    if (this.#finished) return;
    this.#finished = true;
    this.#channel.close();
    if (error === undefined) this.#controller.close();
    else this.#controller.error(error);
    for (const callback of this.#onFinish) callback();
  }

  /**
   * Ends the stream from the page's side: the shell drops it, which hangs
   * up on the host, and the lines end. The shell answers nothing worth
   * waiting for, and an id that has already ended is fine for it.
   */
  readonly hangUp = (): void => this.#end();

  /** The lines; stopping before they end hangs up. */
  async *lines(): AsyncIterable<unknown> {
    const reader = this.#lines.getReader();
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) return;
        yield next.value;
      }
    } finally {
      reader.releaseLock();
      this.hangUp();
    }
  }

  #receive(message: unknown): void {
    if (!isRecord(message)) {
      this.#brokeOff("a message that isn't an object");
      return;
    }
    switch (message["type"]) {
      case "line":
        this.#controller.enqueue(message["line"]);
        return;
      case "end":
        this.finish();
        return;
      case "failed":
        this.finish(new AgentHostError(0, "stream_failed", String(message["message"])));
        return;
      default:
        this.#brokeOff(`a message of type ${JSON.stringify(message["type"])}`);
    }
  }

  #brokeOff(what: string): void {
    this.#end(
      new AgentHostError(0, "answer_invalid", `The shell sent ${what} on an agent host stream.`),
    );
  }

  #end(error?: Error): void {
    if (this.#finished) return;
    this.finish(error);
    this.#ipc.invoke("agent_host_stream_end", { stream: this.id }).catch(() => {});
  }
}

/** The host's answer as the shell passed it: `{ status, body }`. */
function hostAnswer(route: string, value: unknown): AgentHostAnswer {
  if (!isRecord(value) || typeof value["status"] !== "number" || !("body" in value)) {
    throw invalid(route);
  }
  return { status: value["status"], body: value["body"] };
}

function invalid(route: string): AgentHostError {
  return new AgentHostError(
    0,
    "answer_invalid",
    `The shell's answer to ${route} isn't what Halonic expects.`,
  );
}

/** The shell's refusal `{ kind, message }`, or anything else `invoke` rejected with. */
function shellRefusal(error: unknown): AgentHostError {
  if (isRecord(error) && typeof error["kind"] === "string") {
    const message = typeof error["message"] === "string" ? error["message"] : error["kind"];
    return new AgentHostError(
      0,
      error["kind"],
      `The shell refused the agent host call: ${message}.`,
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AgentHostError(0, "shell_failed", `The shell's agent host call failed: ${message}.`);
}

/** `promise`, or a rejection with `signal`'s reason once it aborts. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
