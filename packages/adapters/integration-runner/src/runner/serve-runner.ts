// The runner's side of the bridge: it says `ready`, waits for `start`, gives
// the integration its host, says what the integration declares, and runs the
// tool calls Halonic sends. Halonic is
// the trusted side, so a frame from it that breaks the protocol ends the
// runner with an error rather than being worked around.

import { AsyncLocalStorage } from "node:async_hooks";
import { integrationWait } from "@halonicjs/integration-kit";
import type { IntegrationConnection, IntegrationHost } from "@halonicjs/ports";
import { parse } from "@halonicjs/schema-kit";
import { FrameLineWriter, FrameTooLargeError, readFrameLines } from "../frame-lines.ts";
import {
  type HalonicFrame,
  halonicFrame,
  type IntegrationDeclaration,
  type RunnerFrame,
} from "../frames.ts";
import { BridgedHttp } from "./bridged-http.ts";

/**
 * What a fenced integration gets: the same host as in-process, but without
 * `tokens`, because no token value crosses the bridge (design HAL-958,
 * section 3.5). The loader refuses a sheet that declares tokens.
 */
export type RunnerHost = Omit<IntegrationHost, "tokens">;

/** The integration connected to its host, and what its code declares. */
export interface ConnectedIntegration {
  /** Its name, version and tools, which Halonic checks against the permission sheet. */
  declaration: IntegrationDeclaration;
  connection: IntegrationConnection;
}

/** What {@link serveRunner} needs. */
export interface ServeRunnerOptions {
  /** Frames from Halonic: the runner's stdin. */
  input: ReadableStream<Uint8Array>;
  /** Frames to Halonic: the runner's stdout. */
  output: WritableStream<Uint8Array>;
  /** The nonce Halonic gave this start, sent back in `ready`. */
  nonce: string;
  /** Connects the integration to its host, once `start` has arrived. */
  connect(host: RunnerHost): Promise<ConnectedIntegration>;
}

/** Halonic sent something the runner can't follow. The runner ends. */
export class RunnerProtocolError extends Error {
  override readonly name = "RunnerProtocolError";
}

/**
 * Serves one integration until Halonic closes the runner's stdin, then
 * closes the connection.
 *
 * @throws {RunnerProtocolError} when Halonic's frames break the protocol
 */
export async function serveRunner(options: ServeRunnerOptions): Promise<void> {
  const writer = new FrameLineWriter(options.output);
  const send = (frame: RunnerFrame) => {
    void writer.write(frame).catch(() => {
      // Halonic has closed the channel and is stopping the runner; nothing is left to tell it.
    });
  };
  send({ type: "ready", nonce: options.nonce });
  const frames = readFrameLines(options.input)[Symbol.asyncIterator]();
  const start = await nextFrame(frames);
  if (start?.type !== "start")
    throw new RunnerProtocolError("the first frame from Halonic was not start");
  const calls = new CallRunner(send);
  const http = new BridgedHttp(send, () => calls.current());
  const { declaration, connection } = await options.connect({
    http,
    settings: Object.freeze({ ...start.settings }),
    wait: integrationWait,
  });
  sendDeclaration(send, declaration);
  try {
    for (
      let frame = await nextFrame(frames);
      frame !== undefined;
      frame = await nextFrame(frames)
    ) {
      switch (frame.type) {
        case "call":
          calls.run(frame.call, () =>
            connection.callTool(frame.name, frame.args, calls.signal(frame.call)),
          );
          break;
        case "cancel":
          calls.cancel(frame.call);
          break;
        case "ping":
          send({ type: "pong", n: frame.n });
          break;
        case "start":
          throw new RunnerProtocolError("a second start");
        default:
          http.take(frame);
      }
    }
  } finally {
    calls.cancelAll();
    await connection.close();
  }
  // Only on a normal end: after a protocol error Halonic may no longer read, and the close would wait for it.
  await writer.close();
}

/**
 * Sends `declared` with only the fields the protocol knows, so a tool with an
 * extra field of its own still declares. Halonic checks each value.
 *
 * @throws {Error} when the declaration doesn't fit in one frame
 */
function sendDeclaration(
  send: (frame: RunnerFrame) => void,
  declaration: IntegrationDeclaration,
): void {
  const tools = declaration.tools.map(({ name, description, parameters, risk, untrusted }) => ({
    name,
    description,
    parameters,
    risk,
    ...(untrusted === undefined ? {} : { untrusted }),
  }));
  try {
    send({ type: "declared", name: declaration.name, version: declaration.version, tools });
  } catch (error) {
    if (!(error instanceof FrameTooLargeError)) throw error;
    throw new Error("the integration's tools are too large to declare in one frame", {
      cause: error,
    });
  }
}

async function nextFrame(frames: AsyncIterator<unknown>): Promise<HalonicFrame | undefined> {
  const next = await frames.next();
  if (next.done === true) return undefined;
  const parsed = parse(halonicFrame, next.value);
  if (!parsed.ok) throw new RunnerProtocolError("a frame from Halonic outside the protocol");
  return parsed.value;
}

/**
 * The tool calls running in the runner. Each runs with its number in an
 * async context, so `host.http` can tell Halonic which call a request
 * belongs to, and Halonic refuses one from a call that has ended (A37).
 */
class CallRunner {
  readonly #send: (frame: RunnerFrame) => void;
  readonly #context = new AsyncLocalStorage<number>();
  readonly #aborts = new Map<number, AbortController>();

  constructor(send: (frame: RunnerFrame) => void) {
    this.#send = send;
  }

  /** The call the code asking runs in, if any. */
  current(): number | undefined {
    return this.#context.getStore();
  }

  /** The signal the integration gets for a call; `cancel` aborts it. */
  signal(call: number): AbortSignal {
    const abort = new AbortController();
    this.#aborts.set(call, abort);
    return abort.signal;
  }

  run(call: number, callTool: () => Promise<string>): void {
    void this.#context
      .run(call, async () => callTool())
      .then(
        (text) => this.#answer(call, { text }),
        (error: unknown) => this.#answer(call, { error: describe(error) }),
      );
  }

  cancel(call: number): void {
    this.#aborts.get(call)?.abort(new DOMException("The tool call was cancelled.", "AbortError"));
  }

  cancelAll(): void {
    for (const call of this.#aborts.keys()) this.cancel(call);
  }

  #answer(call: number, outcome: { text: string } | { error: string }): void {
    this.#aborts.delete(call);
    try {
      this.#send({ type: "result", call, ...outcome });
    } catch (error) {
      if (!(error instanceof FrameTooLargeError)) throw error;
      this.#send({ type: "result", call, error: "the tool result is too large to send" });
    }
  }
}

/** An error as one line of text for Halonic, which filters it before anyone sees it. */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
