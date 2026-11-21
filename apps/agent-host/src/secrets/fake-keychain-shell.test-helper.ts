import { encodeFrame, type Frame, FrameKind } from "../stdio/frame-codec.ts";
import type { ShellSecretAnswer, ShellSecretRequest } from "./shell-secrets-channel.ts";

/**
 * A stand-in for Studio's shell on the host's secrets channel: it answers
 * each request on id 0 from an in-memory keychain, as the shell's
 * `host_secrets` handler answers from the OS keychain. Tests write made-up
 * values only.
 */
export class FakeKeychainShell {
  /** The keychain, by the name the shell keeps (`remote_host_key`). */
  readonly stored = new Map<string, string>();
  /** Each request's `op` and name, in order; never a value. */
  readonly asked: string[] = [];
  /** When set, every request fails with this kind, as on a system without a keychain. */
  failWith: string | undefined;
  /** When set, every `delete` fails with this kind, as a keychain that won't let go of a value. */
  failDeleteWith: string | undefined;
  /** When set, `set` keeps this instead of the value it was given, as a broken keychain would. */
  keepInstead: string | undefined;
  readonly #send: (frame: Buffer) => void;

  /** @param send - writes a frame to the host's input */
  constructor(send: (frame: Buffer) => void) {
    this.#send = send;
  }

  /** Answers one frame the host sent on id 0. */
  take(frame: Frame): void {
    const request = JSON.parse(frame.bytes.toString("utf8")) as ShellSecretRequest;
    this.asked.push(`${request.op} ${request.name}`);
    const answer = this.#answer(request);
    this.#send(encodeFrame(0, FrameKind.data, Buffer.from(JSON.stringify(answer))));
  }

  #answer(request: ShellSecretRequest): ShellSecretAnswer {
    if (this.failWith !== undefined) {
      return { ok: false, kind: this.failWith, message: "No keychain on this system." };
    }
    if (request.op === "delete" && this.failDeleteWith !== undefined) {
      return { ok: false, kind: this.failDeleteWith, message: "The keychain refused." };
    }
    if (request.op === "get") return { ok: true, value: this.stored.get(request.name) ?? null };
    if (request.op === "set") this.stored.set(request.name, this.keepInstead ?? request.value);
    else this.stored.delete(request.name);
    return { ok: true, value: null };
  }
}
