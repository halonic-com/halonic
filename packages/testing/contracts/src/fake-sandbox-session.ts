import type {
  SandboxBlock,
  SandboxBlockListener,
  SandboxCommand,
  SandboxExit,
  SandboxFence,
  SandboxProcess,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";

/** What a {@link FakeProgram} sees and can do while it runs. */
export interface FakeProgramIo {
  /** The command the harness started. */
  command: SandboxCommand;
  /** The session's profile, with the environment the program gets. */
  profile: SandboxProfile;
  /** The next line the harness wrote to standard input, without its line break; `null` once the input has ended. */
  readLine(): Promise<string | null>;
  /** Writes `text` to standard output. */
  write(text: string): void;
  /** Writes `text` to standard error. */
  writeError(text: string): void;
  /** Aborts when the program is stopped, by `kill` or by the session closing. */
  stopped: AbortSignal;
}

/**
 * A program as a function, for a {@link FakeSandboxSession} to run instead of
 * a real one. It runs until it returns its exit code. A harness's tests write
 * one that speaks the real program's protocol.
 */
export type FakeProgram = (io: FakeProgramIo) => Promise<number>;

/** A program that writes nothing and runs until it is stopped. */
export const idleProgram: FakeProgram = (io) =>
  new Promise((resolve) => {
    io.stopped.addEventListener("abort", () => resolve(0), { once: true });
  });

/** Reads a program's output to its end, as text. */
export async function readText(output: ReadableStream<Uint8Array>): Promise<string> {
  const reader = output.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

/** What a {@link FakeSandboxSession} is opened with. */
export interface FakeSandboxSessionOptions {
  profile: SandboxProfile;
  /** The program every command runs. */
  program: FakeProgram;
  /** The fence proof; fenced when absent. */
  fence?: SandboxFence;
}

/**
 * A `SandboxSession` that runs {@link FakeProgram}s, for harness tests. It
 * keeps the port's promises a harness relies on, so a harness that passes
 * against it won't be surprised by a real sandbox: `start` throws once the
 * session is closed or the fence isn't proven, `close` stops every program
 * and resolves once they have ended, and `exited` never rejects.
 *
 * It doesn't enforce the profile's time limit, so tests need no timers.
 */
export class FakeSandboxSession implements SandboxSession {
  readonly profile: SandboxProfile;
  /** Every command started, in order. */
  readonly started: SandboxCommand[] = [];
  readonly #program: FakeProgram;
  readonly #openFence: SandboxFence;
  readonly #processes: FakeProcess[] = [];
  readonly #listeners = new Set<SandboxBlockListener>();
  readonly #firstStart: Promise<void>;
  #markStarted: () => void = () => {};
  #closed = false;

  constructor(options: FakeSandboxSessionOptions) {
    this.profile = options.profile;
    this.#program = options.program;
    this.#openFence = options.fence ?? { state: "fenced" };
    this.#firstStart = new Promise((resolve) => {
      this.#markStarted = resolve;
    });
  }

  get fence(): SandboxFence {
    return this.#closed ? { state: "stopped" } : this.#openFence;
  }

  /** How many started programs haven't ended yet. */
  get running(): number {
    return this.#processes.filter((process) => !process.ended).length;
  }

  /** Resolves once the session has started its first program. */
  whenStarted(): Promise<void> {
    return this.#firstStart;
  }

  async start(command: SandboxCommand): Promise<SandboxProcess> {
    if (this.#closed) throw new Error("The sandbox session is closed");
    const fence = this.fence;
    if (fence.state === "not-fenced") throw new Error(`The sandbox isn't fenced: ${fence.reason}`);
    const process = new FakeProcess({ command, profile: this.profile }, this.#program);
    this.started.push(command);
    this.#processes.push(process);
    this.#markStarted();
    return process;
  }

  onBlocked(listener: SandboxBlockListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Reports `block` to every listener, as a real sandbox does when the fence refuses an access. */
  block(block: SandboxBlock): void {
    for (const listener of this.#listeners) listener(block);
  }

  async close(): Promise<void> {
    this.#closed = true;
    await Promise.all(this.#processes.map((process) => process.kill()));
  }
}

/** A program's output stream, written as text. */
class TextOutput {
  readonly stream: ReadableStream<Uint8Array>;
  readonly #encoder = new TextEncoder();
  #controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  #ended = false;

  constructor() {
    this.stream = new ReadableStream({
      start: (controller) => {
        this.#controller = controller;
      },
      // A reader that stops early cancels the output, as `readLines` does.
      // A real stream then takes no more writes and no close, and neither does this one.
      cancel: () => {
        this.#ended = true;
      },
    });
  }

  write(text: string): void {
    // A real program's output after it was stopped goes nowhere, too.
    if (this.#ended) return;
    this.#controller?.enqueue(this.#encoder.encode(text));
  }

  end(): void {
    if (this.#ended) return;
    this.#ended = true;
    this.#controller?.close();
  }
}

/** Reads standard input as lines of text. */
class LineInput {
  readonly #reader: ReadableStreamDefaultReader<Uint8Array>;
  readonly #decoder = new TextDecoder();
  #buffer = "";
  #done = false;

  constructor(input: ReadableStream<Uint8Array>) {
    this.#reader = input.getReader();
  }

  async readLine(): Promise<string | null> {
    while (!this.#buffer.includes("\n") && !this.#done) {
      const chunk = await this.#reader.read();
      if (chunk.done) this.#done = true;
      // `stream` keeps a character split across two chunks whole.
      else this.#buffer += this.#decoder.decode(chunk.value, { stream: true });
    }
    if (this.#buffer === "") return null;
    const end = this.#buffer.indexOf("\n");
    const line = end === -1 ? this.#buffer : this.#buffer.slice(0, end);
    this.#buffer = end === -1 ? "" : this.#buffer.slice(end + 1);
    return line;
  }

  /** Ends the input, so the harness's next write fails as it would on a stopped program. */
  async stop(): Promise<void> {
    this.#done = true;
    await this.#reader.cancel(new Error("The program has ended and reads no more input"));
  }
}

/** Resolves after the work already queued, timers included, has had its turn. */
function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** How much unread input a program's standard input holds, as much as a Linux pipe. */
const pipeBufferBytes = 65_536;

/** One running {@link FakeProgram}, behind the `SandboxProcess` interface. */
class FakeProcess implements SandboxProcess {
  readonly stdin: WritableStream<Uint8Array>;
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exited: Promise<SandboxExit>;
  ended = false;
  readonly #output = new TextOutput();
  readonly #errorOutput = new TextOutput();
  readonly #input: LineInput;
  readonly #stop = new AbortController();
  #killing: Promise<void> | null = null;
  #settle: (exit: SandboxExit) => void = () => {};

  constructor(run: Pick<FakeProgramIo, "command" | "profile">, program: FakeProgram) {
    // Like an operating system pipe, standard input holds writes the program
    // hasn't read yet, so a write doesn't wait for the program to read it.
    const input = new TransformStream<Uint8Array, Uint8Array>(
      {},
      { highWaterMark: pipeBufferBytes, size: (chunk) => chunk.byteLength },
    );
    this.stdin = input.writable;
    this.#input = new LineInput(input.readable);
    this.stdout = this.#output.stream;
    this.stderr = this.#errorOutput.stream;
    this.exited = new Promise((resolve) => {
      this.#settle = resolve;
    });
    void this.#run(run, program);
  }

  kill(): Promise<void> {
    // Every call waits for the same ending, so a second `kill` doesn't resolve
    // before the program has stopped.
    this.#killing ??= this.#stopProgram();
    return this.#killing;
  }

  async #stopProgram(): Promise<void> {
    if (this.ended) return;
    this.#stop.abort();
    // A real program takes a moment to die, so a harness that doesn't wait
    // for `kill` sees it still running.
    await nextMacrotask();
    await this.#end({ code: null, signal: "SIGKILL", reason: "stopped" });
  }

  async #run(run: Pick<FakeProgramIo, "command" | "profile">, program: FakeProgram): Promise<void> {
    const io: FakeProgramIo = {
      ...run,
      readLine: () => this.#input.readLine(),
      write: (text) => this.#output.write(text),
      writeError: (text) => this.#errorOutput.write(text),
      stopped: this.#stop.signal,
    };
    let code: number;
    try {
      code = await program(io);
    } catch (error) {
      // A fake program that throws crashes, like a real one: its error goes to standard error.
      this.#errorOutput.write(String(error));
      code = 1;
    }
    // A stopped program's ending belongs to `kill`, which reports it as stopped.
    if (this.#stop.signal.aborted) return;
    await this.#end({ code, signal: null, reason: "exited" });
  }

  async #end(exit: SandboxExit): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.#output.end();
    this.#errorOutput.end();
    await this.#input.stop();
    this.#settle(exit);
  }
}
