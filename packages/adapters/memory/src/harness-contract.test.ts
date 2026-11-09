// The harness contract lives in @halonicjs/testing-contracts, whose code is
// measured in this package's run (its "measuredIn"), so the harness that
// proves the suite runs here.
import type {
  Harness,
  HarnessBridge,
  HarnessEvent,
  HarnessInput,
  HarnessRun,
  HarnessTask,
  SandboxProcess,
  SandboxSession,
} from "@halonicjs/ports";
import { type FakeProgram, harnessContract, readText } from "@halonicjs/testing-contracts";

/** The lines of a program's output, without their line breaks. */
async function* lines(output: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of output) {
    buffer += decoder.decode(chunk, { stream: true });
    let end = buffer.indexOf("\n");
    while (end !== -1) {
      yield buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      end = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  if (buffer !== "") yield buffer;
}

/**
 * A run of the {@link scriptHarness}: it sends the prompt as one JSON line
 * and waits for a `{"type":"result"}` line back.
 */
class ScriptRun implements HarnessRun {
  readonly #task: HarnessTask;
  readonly #bridge: HarnessBridge;
  readonly #process: Promise<SandboxProcess>;
  #ended = false;
  #cancelled = false;

  constructor(task: HarnessTask, session: SandboxSession, bridge: HarnessBridge) {
    this.#task = task;
    this.#bridge = bridge;
    this.#process = session.start({ program: "script-agent", args: [] });
    // A program that can't start is reported by the stream, not here.
    this.#process.catch(() => undefined);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<HarnessEvent> {
    try {
      const process = await this.#process;
      const input = process.stdin.getWriter();
      await input.write(
        new TextEncoder().encode(`${JSON.stringify({ prompt: this.#task.prompt })}\n`),
      );
      let output: unknown;
      for await (const line of lines(process.stdout)) {
        const message = JSON.parse(line) as { type: string; text?: string };
        if (message.type === "result") output = message.text;
      }
      const exit = await process.exited;
      if (this.#cancelled) throw new Error("The run was cancelled");
      if (exit.code !== 0) {
        const reason = (await readText(process.stderr)).replaceAll(
          this.#bridge.token,
          "[run token]",
        );
        // The program's own words go in the cause, which the suite checks too.
        throw new Error(`script-agent stopped with code ${exit.code}`, { cause: reason });
      }
      yield { type: "agent.finished", agent: this.#task.agentId, output };
    } finally {
      this.#ended = true;
    }
  }

  async send(_input: HarnessInput): Promise<void> {
    if (this.#ended) throw new Error("The run has ended");
    throw new Error("script-agent takes no answers");
  }

  async cancel(): Promise<void> {
    if (this.#ended) return;
    this.#cancelled = true;
    // A program that never started has nothing to stop.
    const process = await this.#process.catch(() => null);
    await process?.kill();
  }
}

/**
 * The smallest harness that keeps the port's promises, to prove the suite.
 * Not a real adapter. Like the built-in loop, it sets no environment.
 */
const scriptHarness: Harness = {
  id: "script",
  name: "Script",
  detect: async () => ({ status: "ready", version: "1.0.0" }),
  start: (task, session, bridge) => new ScriptRun(task, session, bridge),
};

/** The script harness, giving its program the bridge's address and token, as a program harness does. */
const scriptHarnessWithEnvironment: Harness = {
  ...scriptHarness,
  environment: (bridge) => ({ SCRIPT_BRIDGE_URL: bridge.url, SCRIPT_RUN_TOKEN: bridge.token }),
};

/** script-agent doing its task: it reads the prompt and answers it. */
const answers: FakeProgram = async (io) => {
  await io.readLine();
  io.write(`${JSON.stringify({ type: "result", text: "Teal." })}\n`);
  return 0;
};

/** script-agent failing like a provider refusing the key: it reads the prompt, then fails. */
function refuses(message: string): FakeProgram {
  return async (io) => {
    await io.readLine();
    io.writeError(message);
    return 1;
  };
}

harnessContract("script harness", {
  make: async () => scriptHarness,
  finishing: answers,
  failing: refuses,
});

harnessContract("script harness with environment", {
  make: async () => scriptHarnessWithEnvironment,
  finishing: answers,
  failing: refuses,
});
