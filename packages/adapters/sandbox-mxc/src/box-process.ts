import { Readable, Writable } from "node:stream";
import type { SandboxExit, SandboxProcess } from "@halonicjs/ports";
import type { MxcProcess } from "./mxc-process.ts";

/** A program in a box: MXC's process, as the port's {@link SandboxProcess}, and why it ended. */
export class BoxProcess {
  readonly stdin: WritableStream<Uint8Array>;
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  /** Settles when the program and everything it started has ended. Never rejects. */
  readonly exited: Promise<SandboxExit>;
  readonly #process: MxcProcess;
  #stopped = false;
  #timedOut = false;

  constructor(process: MxcProcess) {
    this.#process = process;
    this.stdin = process.standardInput
      ? (Writable.toWeb(process.standardInput) as WritableStream<Uint8Array>)
      : new WritableStream<Uint8Array>();
    this.stdout = readable(process.standardOutput);
    this.stderr = readable(process.standardError);
    this.exited = this.#wait();
  }

  /**
   * Ends the program and everything it started, and resolves when they have
   * ended. `timedOut` says the session's time limit did it.
   */
  async stop(timedOut = false): Promise<void> {
    this.#stopped = true;
    this.#timedOut ||= timedOut;
    await this.#process.kill();
    await this.exited;
  }

  /** The program as the port gives it to a caller. */
  asSandboxProcess(stderr: ReadableStream<Uint8Array> = this.stderr): SandboxProcess {
    return {
      stdin: this.stdin,
      stdout: this.stdout,
      stderr,
      exited: this.exited,
      kill: () => this.stop(),
    };
  }

  #reason(limitRanOut: boolean): SandboxExit["reason"] {
    if (this.#timedOut || limitRanOut) return "timeout";
    return this.#stopped ? "stopped" : "exited";
  }

  async #wait(): Promise<SandboxExit> {
    let code: number | null = 1;
    let limitRanOut = false;
    try {
      const done = await this.#process.wait();
      code = done.exitCode;
      limitRanOut = done.timedOut;
    } catch {
      // MXC can't say how it ended: that is a failure, not a clean exit.
    } finally {
      try {
        this.#process.dispose();
      } catch {
        // Nothing is left to free.
      }
    }
    const reason = this.#reason(limitRanOut);
    return { code, signal: code === null && this.#stopped ? "SIGKILL" : null, reason };
  }
}

/** A program's output as a web stream; an empty one when MXC gave none. */
function readable(stream: Readable | null): ReadableStream<Uint8Array> {
  if (stream === null) {
    return new ReadableStream<Uint8Array>({
      start: (controller) => controller.close(),
    });
  }
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}
