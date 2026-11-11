// A runner process made of in-memory streams, and a hand-driven runner that
// writes whatever frames a test wants, to play a hostile integration.

import { secretForms } from "@halonicjs/integration-kit";
import type {
  IntegrationHttpClient,
  IntegrationRequestInit,
  SandboxExit,
  SandboxProcess,
} from "@halonicjs/ports";
import { readFrameLines } from "./frame-lines.ts";
import type { HalonicFrame, IntegrationDeclaration } from "./frames.ts";
import type { ConnectRunnerOptions } from "./halonic/connect-runner.ts";
import type { RunnerBlock } from "./halonic/limits.ts";

/** A fake secret value; never a real key. */
export const fakeSecret = "sk-fake-0123456789";

/** The nonce the tests' runners are started with. */
export const testNonce = "nonce-for-this-start";

/** What the tests' integration declares: the two tools {@link bridgeOptions} lists, and `run`. */
export const testDeclaration: IntegrationDeclaration = {
  name: "weather",
  version: "1.0.0",
  tools: ["forecast", "echo", "run"].map((name) => ({
    name,
    description: `The ${name} tool.`,
    parameters: { type: "object", properties: {} },
    risk: "read",
  })),
};

/** A runner process whose streams the test holds the other ends of. */
export interface FakeRunnerProcess {
  process: SandboxProcess;
  /** What Halonic writes to the runner's stdin. */
  runnerInput: ReadableStream<Uint8Array>;
  /** What the runner writes to its stdout. */
  runnerOutput: WritableStream<Uint8Array>;
  /** The runner's stderr. */
  stderr: WritableStreamDefaultWriter<Uint8Array>;
  /** How often Halonic killed it. */
  kills(): number;
  /** Ends the process by itself, as a crash would. */
  exit(code: number): void;
}

export function fakeRunnerProcess(): FakeRunnerProcess {
  let endStdout: () => void = () => undefined;
  const stdin = new TransformStream<Uint8Array, Uint8Array>();
  const stdout = new TransformStream<Uint8Array, Uint8Array>({
    start: (controller) => {
      endStdout = () => controller.terminate();
    },
  });
  const stderr = new TransformStream<Uint8Array, Uint8Array>();
  let markExited: (exit: SandboxExit) => void = () => undefined;
  const exited = new Promise<SandboxExit>((resolve) => {
    markExited = resolve;
  });
  let kills = 0;
  const end = (exit: SandboxExit) => {
    endStdout();
    markExited(exit);
  };
  return {
    process: {
      stdin: stdin.writable,
      stdout: stdout.readable,
      stderr: stderr.readable,
      exited,
      kill: async () => {
        kills += 1;
        end({ code: null, signal: "SIGKILL", reason: "stopped" });
      },
    },
    runnerInput: stdin.readable,
    runnerOutput: stdout.writable,
    stderr: stderr.writable.getWriter(),
    kills: () => kills,
    exit: (code) => end({ code, signal: null, reason: "exited" }),
  };
}

/** A runner the test drives frame by frame. */
export class HandDrivenRunner {
  readonly #writer: WritableStreamDefaultWriter<Uint8Array>;
  readonly #frames: AsyncIterator<unknown>;
  readonly #encoder = new TextEncoder();

  constructor(fake: FakeRunnerProcess) {
    this.#writer = fake.runnerOutput.getWriter();
    this.#frames = readFrameLines(fake.runnerInput)[Symbol.asyncIterator]();
  }

  /** Writes one frame as JSON, or a raw line as it is. */
  async send(frame: object | string): Promise<void> {
    const line = typeof frame === "string" ? frame : `${JSON.stringify(frame)}\n`;
    await this.#writer.write(this.#encoder.encode(line));
  }

  /** Writes raw bytes. */
  async sendBytes(bytes: Uint8Array): Promise<void> {
    await this.#writer.write(bytes);
  }

  /** The next frame Halonic sent. */
  async next(): Promise<HalonicFrame> {
    const next = await this.#frames.next();
    if (next.done === true) throw new Error("Halonic closed the runner's stdin");
    return next.value as HalonicFrame;
  }

  /** Says `ready`, takes the `start` frame and, when it is one, declares {@link testDeclaration}. */
  async start(nonce = testNonce): Promise<HalonicFrame> {
    await this.send({ type: "ready", nonce });
    const start = await this.next();
    if (start.type === "start") await this.send({ type: "declared", ...testDeclaration });
    return start;
  }
}

/** One request the fake kit client got. */
export interface SentRequest {
  url: string;
  init: IntegrationRequestInit;
}

/** A kit client that answers with what the test gives it, and records each request. */
export function fakeKitClient(
  answer: (url: string, init: IntegrationRequestInit) => Promise<Response> | Response,
): IntegrationHttpClient & { sent: SentRequest[] } {
  const sent: SentRequest[] = [];
  return {
    sent,
    fetch: async (url, init = {}) => {
      sent.push({ url, init });
      return answer(url, init);
    },
  };
}

/** The options for `connectRunner`, with the fake process and a record of blocks and stderr. */
export function bridgeOptions(
  fake: FakeRunnerProcess,
  overrides: Partial<ConnectRunnerOptions> = {},
): ConnectRunnerOptions & { blocks: RunnerBlock[]; log: string[] } {
  const blocks: RunnerBlock[] = [];
  const log: string[] = [];
  return {
    process: fake.process,
    nonce: testNonce,
    settings: { baseUrl: "https://api.example.com" },
    tools: ["forecast", "echo"],
    http: fakeKitClient(() => new Response("{}")),
    secrets: secretForms([{ value: fakeSecret }]),
    onBlocked: (block) => blocks.push(block),
    onStderr: (text) => log.push(text),
    blocks,
    log,
    ...overrides,
  };
}
