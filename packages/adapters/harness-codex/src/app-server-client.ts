import { readLines } from "@halonicjs/adapter-harness-kit";
import type { SandboxProcess } from "@halonicjs/ports";
import { isPlainObject, SecretScrubber } from "@halonicjs/std";

/**
 * The longest line Halonic reads from `codex app-server`, in characters.
 * A notification can carry a whole command's output or a file's diff, so
 * the limit is generous; it only stops a program that never ends a line.
 */
export const maxMessageLength = 16 * 1024 * 1024;

/** The id of a JSON-RPC request. Halonic numbers its own; Codex may use either kind. */
export type RequestId = string | number;

/**
 * A message Codex sent on its own: a notification such as `item/completed`,
 * or, with an `id`, a request that waits for {@link AppServerClient.respond},
 * such as `item/commandExecution/requestApproval`.
 */
export type AppServerMessage =
  | { kind: "notification"; method: string; params: unknown }
  | { kind: "request"; id: RequestId; method: string; params: unknown };

/** Who Halonic is, as `initialize` tells Codex. */
export interface ClientInfo {
  name: string;
  title: string;
  version: string;
}

/** What the client needs to talk to one `codex app-server`. */
export interface AppServerClientOptions {
  /** The running `codex app-server`, started in the sandbox. */
  process: Pick<SandboxProcess, "stdin" | "stdout">;
  /**
   * Hears each message Codex sends on its own, in order. When it throws,
   * the client stops reading, and {@link AppServerClient.closed} gives that
   * error.
   */
  onMessage: (message: AppServerMessage) => void;
  /** The run's bridge token. It is in Codex's environment; no error the client makes contains it. */
  bridgeToken: string;
}

/** A request Halonic sent and waits for the answer to. */
interface Pending {
  method: string;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * Talks JSON-RPC with `codex app-server` over its standard input and
 * output, one JSON object per line (requirement `harness-codex.app-server-client`).
 * Codex leaves out JSON-RPC's `"jsonrpc": "2.0"` field, and so does the
 * client.
 *
 * It sends requests and matches each answer to its request by id, hands
 * every other message to `onMessage`, and answers Codex's own requests with
 * {@link respond}. It starts reading at once; {@link closed} settles when
 * Codex's output ends.
 *
 * @example
 * const client = new AppServerClient({ process, onMessage: (message) => queue.push(message), bridgeToken });
 * await client.initialize({ name: "halonic", title: "Halonic", version });
 * const { thread } = await client.request("thread/start", { cwd: profile.workingFolder });
 */
export class AppServerClient {
  /**
   * Settles when Codex's output ends: with `undefined` at a normal end, or
   * with the error that stopped the reading, such as a line that isn't
   * JSON-RPC or an error `onMessage` threw. It never rejects.
   */
  readonly closed: Promise<Error | undefined>;
  readonly #writer: WritableStreamDefaultWriter<Uint8Array>;
  readonly #onMessage: (message: AppServerMessage) => void;
  readonly #scrubber = new SecretScrubber();
  readonly #pending = new Map<RequestId, Pending>();
  #nextId = 0;
  /** Set once Codex's output has ended: why new requests can't be answered. */
  #ended: Error | undefined;

  constructor(options: AppServerClientOptions) {
    this.#writer = options.process.stdin.getWriter();
    this.#onMessage = options.onMessage;
    this.#scrubber.remember(options.bridgeToken);
    this.closed = this.#readAll(options.process.stdout);
  }

  /** Whether Codex's output has ended, so no request can be answered any more. */
  get ended(): boolean {
    return this.#ended !== undefined;
  }

  /**
   * Opens the conversation: the `initialize` request, then the
   * `initialized` notification. Codex answers nothing else before it.
   */
  async initialize(clientInfo: ClientInfo): Promise<void> {
    await this.request("initialize", { clientInfo, capabilities: null });
    await this.notify("initialized");
  }

  /**
   * Sends a request and waits for its answer.
   *
   * @returns the answer's `result`
   * @throws Error when Codex answers with an error, or stops before it answers; the message never holds the bridge token
   */
  async request(method: string, params?: unknown): Promise<unknown> {
    if (this.#ended !== undefined) throw this.#ended;
    const id = this.#nextId++;
    const answered = new Promise<unknown>((resolve, reject) => {
      this.#pending.set(id, { method, resolve, reject });
    });
    // Codex's output can end while the write is pending, which rejects
    // `answered`; if the write then fails, nobody awaits `answered`, and an
    // unhandled rejection would stop Node.
    answered.catch(() => undefined);
    try {
      await this.#send({ id, method, params });
    } catch (error) {
      this.#pending.delete(id);
      throw error;
    }
    return answered;
  }

  /** Sends a notification, which Codex doesn't answer. */
  async notify(method: string, params?: unknown): Promise<void> {
    await this.#send({ method, params });
  }

  /** Answers a request Codex sent, with a result or with an error. */
  async respond(
    id: RequestId,
    answer: { result: unknown } | { error: { code: number; message: string } },
  ): Promise<void> {
    await this.#send({ id, ...answer });
  }

  async #send(message: Record<string, unknown>): Promise<void> {
    const line = `${JSON.stringify(message)}\n`;
    try {
      await this.#writer.write(new TextEncoder().encode(line));
    } catch (error) {
      // The error comes from the sandbox's pipe and could quote anything, so it is scrubbed too.
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(this.#scrubber.scrub(`Halonic couldn't write to Codex: ${reason}`));
    }
  }

  async #readAll(stdout: ReadableStream<Uint8Array>): Promise<Error | undefined> {
    let cause: Error | undefined;
    try {
      for await (const line of readLines(stdout, { maxLineLength: maxMessageLength })) {
        if (line.trim() !== "") this.#receive(line);
      }
    } catch (error) {
      cause = error instanceof Error ? error : new Error(String(error));
    }
    this.#end(cause);
    return cause;
  }

  #receive(line: string): void {
    const message = parseMessage(line);
    if (message === undefined) {
      // The line may hold anything Codex printed, the bridge token included,
      // so it isn't quoted.
      throw new Error("Codex printed a line that isn't JSON-RPC, so Halonic stopped the run.");
    }
    if ("method" in message) {
      this.#onMessage(message);
      return;
    }
    const pending = this.#pending.get(message.id);
    if (pending === undefined) return;
    this.#pending.delete(message.id);
    if ("error" in message) {
      pending.reject(
        new Error(this.#scrubber.scrub(`Codex refused \`${pending.method}\`: ${message.error}`)),
      );
    } else {
      pending.resolve(message.result);
    }
  }

  /** Fails every request still waiting, and every later one. */
  #end(cause: Error | undefined): void {
    for (const [id, { method, reject }] of this.#pending) {
      this.#pending.delete(id);
      reject(cause ?? stoppedBefore(method));
    }
    this.#ended = cause ?? new Error("Codex's app-server has stopped.");
  }
}

function stoppedBefore(method: string): Error {
  return new Error(`Codex's app-server stopped before it answered \`${method}\`.`);
}

/** A line Codex printed, read as one of the messages it can send. */
type ReceivedMessage =
  | AppServerMessage
  | { id: RequestId; result: unknown }
  | { id: RequestId; error: string };

/** The message on the line, or `undefined` when it isn't a JSON-RPC message. */
function parseMessage(line: string): ReceivedMessage | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isPlainObject(value)) return undefined;
  const { id, method, params } = value;
  const hasId = typeof id === "string" || typeof id === "number";
  if (typeof method === "string") {
    return hasId
      ? { kind: "request", id, method, params }
      : { kind: "notification", method, params };
  }
  if (!hasId) return undefined;
  if ("result" in value) return { id, result: value["result"] };
  if (isPlainObject(value["error"])) return { id, error: errorText(value["error"]) };
  return undefined;
}

/** A JSON-RPC error's message, with its code: "Invalid request (-32600)". */
function errorText(error: Record<string, unknown>): string {
  const message = typeof error["message"] === "string" ? error["message"] : "no message";
  return typeof error["code"] === "number" ? `${message} (${error["code"]})` : message;
}
