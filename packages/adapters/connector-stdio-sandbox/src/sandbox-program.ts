import type { ProgramExit, RunningProgram } from "@halonicjs/adapter-mcp";
import type { SandboxProcess } from "@halonicjs/ports";

/**
 * A program a sandbox session started, as the MCP stdio transport talks to
 * it. It keeps the promises of `RunningProgram` on top of the sandbox's
 * web streams:
 *
 * - a write always settles: one waiting on a full input rejects once the
 *   program has ended, even when the sandbox's stream doesn't reject it;
 * - ending the input and signalling never throw;
 * - a reader that stops early cancels that output, so the sandbox can drop it.
 *
 * A sandbox has one way to stop a program, `kill`, which stops everything it
 * started. So both `terminate` and `kill` use it, and the transport's gentle
 * first step, closing the input, is the program's chance to end by itself.
 */
export function sandboxProgram(process: SandboxProcess): RunningProgram {
  return new SandboxRunningProgram(process);
}

class SandboxRunningProgram implements RunningProgram {
  readonly stdout: AsyncIterable<Uint8Array>;
  readonly stderr: AsyncIterable<Uint8Array>;
  readonly exited: Promise<ProgramExit>;
  readonly #process: SandboxProcess;
  readonly #input: WritableStreamDefaultWriter<Uint8Array>;
  readonly #encoder = new TextEncoder();
  /** Rejects once the program has ended, so a write still waiting fails then. */
  readonly #ended: Promise<never>;

  constructor(process: SandboxProcess) {
    this.#process = process;
    this.#input = process.stdin.getWriter();
    this.stdout = chunksOf(process.stdout);
    this.stderr = chunksOf(process.stderr);
    this.exited = process.exited.then(({ code, signal }) => ({ code, signal }));
    this.#ended = process.exited.then(() => {
      throw new Error("The program has ended and reads no more input.");
    });
    // Nobody may be writing when it ends; that is no error.
    this.#ended.catch(() => undefined);
  }

  async write(text: string): Promise<void> {
    const written = this.#input.write(this.#encoder.encode(text));
    // When the program ended first, the stream may reject this write later.
    written.catch(() => undefined);
    await Promise.race([written, this.#ended]);
  }

  endInput(): void {
    // Rejects when the input is already closed or broken, which is fine.
    this.#input.close().catch(() => undefined);
  }

  signal(_kind: "terminate" | "kill"): void {
    this.#process.kill().catch(() => undefined);
  }
}

/** A web stream's chunks, cancelling the stream when the reader stops early. */
async function* chunksOf(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      yield chunk.value;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
