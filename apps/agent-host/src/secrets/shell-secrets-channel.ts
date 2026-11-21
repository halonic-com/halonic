import {
  encodeFrame,
  type Frame,
  FrameKind,
  FrameStreamError,
  maxFrameBytes,
} from "../stdio/frame-codec.ts";
import { type HostConnection, hostConnectionId } from "../stdio/frame-stream.ts";
import type { FrameSink } from "../stdio/framed-connection.ts";

/** One request to the shell, for one of the host's own secrets (`name` in the keychain's form, `remote_host_key`). */
export type ShellSecretRequest =
  | { op: "get"; name: string }
  | { op: "set"; name: string; value: string }
  | { op: "delete"; name: string };

/**
 * The shell's answer: the value for `get` (`null` when none is stored, and
 * after `set` and `delete`), or why the keychain couldn't do it. `kind` is
 * the shell's error kind (`unavailable`, `denied`, …); `message` never holds
 * a value.
 */
export type ShellSecretAnswer =
  | { ok: true; value: string | null }
  | { ok: false; kind: string; message: string };

/**
 * The host's side of its secrets channel to Studio's shell (requirement
 * `agent-host.keychain-secrets`; the shell's side is
 * `studio.src-tauri.crates.agent-host.host-secrets-channel`). Requests and
 * answers travel as `data` frames on connection id 0, of the relay's frame
 * stream on Windows, or of standard input and output after the handshake on
 * macOS and Linux.
 *
 * The shell takes one request at a time and stops the host on a second one
 * sent before the first was answered, so requests wait here for their turn.
 * Anything the shell sends that isn't the answer to the waiting request
 * breaks the stream: the host stops, as on any other broken frame.
 *
 * @example
 * const channel = new ShellSecretsChannel();
 * demuxFrames(streams, accept, maxConnections, channel);
 * await channel.ask({ op: "get", name: "remote_host_key" }); // { ok: true, value: … }
 */
export class ShellSecretsChannel implements HostConnection {
  #sink: FrameSink | undefined;
  readonly #opened = Promise.withResolvers<void>();
  #waiting: { resolve(answer: ShellSecretAnswer): void; reject(error: Error): void } | undefined;
  /** The last request in line; the next one starts after it settled, the first once the stream runs. */
  #line: Promise<unknown> = this.#opened.promise;
  #closed: Error | undefined;

  open(sink: FrameSink): void {
    this.#sink = sink;
    this.#opened.resolve();
  }

  /**
   * Sends `request` once the stream runs and the requests before it are answered, and gives the
   * shell's answer.
   *
   * @throws RangeError when the request is longer than one frame; Error when the stream has ended
   *   or did before the answer came. No message holds a value.
   */
  ask(request: ShellSecretRequest): Promise<ShellSecretAnswer> {
    const turn = this.#line.then(() => this.#send(request));
    this.#line = turn.catch(() => undefined);
    return turn;
  }

  receive(frame: Frame): void {
    const waiting = this.#waiting;
    if (frame.kind !== FrameKind.data || waiting === undefined) {
      throw new FrameStreamError("The shell sent on the secrets channel without a request.");
    }
    let answer: ShellSecretAnswer;
    try {
      answer = answerOf(frame.bytes);
    } catch (error) {
      // Close here, while the request still waits, so it and every one behind it fail
      // instead of hanging, and none of them is sent on the broken stream.
      this.close(error instanceof Error ? error : new FrameStreamError(String(error)));
      throw error;
    }
    this.#waiting = undefined;
    waiting.resolve(answer);
  }

  close(reason: Error): void {
    this.#closed ??= reason;
    this.#waiting?.reject(channelClosed(reason));
    this.#waiting = undefined;
    // Requests still in line now fail instead of waiting for a stream that won't run.
    this.#opened.resolve();
  }

  #send(request: ShellSecretRequest): Promise<ShellSecretAnswer> {
    if (this.#closed !== undefined) return Promise.reject(channelClosed(this.#closed));
    const sink = this.#sink;
    if (sink === undefined) return Promise.reject(new Error("The secrets channel never opened."));
    const bytes = Buffer.from(JSON.stringify(request), "utf8");
    if (bytes.length > maxFrameBytes) {
      return Promise.reject(
        new RangeError(`A request to the keychain can be at most ${maxFrameBytes} bytes.`),
      );
    }
    return new Promise((resolve, reject) => {
      this.#waiting = { resolve, reject };
      sink.send(encodeFrame(hostConnectionId, FrameKind.data, bytes), (error) => {
        if (error) this.close(error);
      });
    });
  }
}

function channelClosed(reason: Error): Error {
  return new Error(`The secrets channel to Studio closed: ${reason.message}`);
}

/**
 * The answer in `bytes`, checked field by field.
 *
 * @throws {FrameStreamError} when it isn't one of the two answers, without its bytes
 */
function answerOf(bytes: Buffer): ShellSecretAnswer {
  let answer: unknown;
  try {
    answer = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new FrameStreamError("The shell's answer on the secrets channel isn't JSON.");
  }
  if (isAnswerShaped(answer, ["ok", "value"]) && answer.ok === true) {
    if (answer.value === null || typeof answer.value === "string") {
      return { ok: true, value: answer.value };
    }
  }
  if (isAnswerShaped(answer, ["ok", "kind", "message"]) && answer.ok === false) {
    if (typeof answer.kind === "string" && typeof answer.message === "string") {
      return { ok: false, kind: answer.kind, message: answer.message };
    }
  }
  throw new FrameStreamError("The shell's answer on the secrets channel isn't one the host knows.");
}

/** The fields an answer may have, each still to be checked. */
interface AnswerFields {
  ok?: unknown;
  value?: unknown;
  kind?: unknown;
  message?: unknown;
}

/** Whether `value` is an object with exactly the fields `keys`. */
function isAnswerShaped(
  value: unknown,
  keys: readonly (keyof AnswerFields)[],
): value is AnswerFields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const present = Object.keys(value);
  return present.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
