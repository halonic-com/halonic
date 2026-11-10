import {
  brokenToolName,
  contractServerAnswer,
  contractServerTools,
  type ReachedCall,
} from "@halonicjs/testing-contracts";
import type { LaunchFolders } from "../pinned/launch-folders.ts";
import type { ProgramExit, ProgramLaunch, ProgramStarter, RunningProgram } from "./program.ts";

/** A one-way byte stream a test writes into and the transport reads. */
class Pipe implements AsyncIterable<Uint8Array> {
  readonly #chunks: Uint8Array[] = [];
  #ended = false;
  #wake: (() => void) | undefined;

  push(chunk: Uint8Array): void {
    this.#chunks.push(chunk);
    this.#notify();
  }

  end(): void {
    this.#ended = true;
    this.#notify();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
    for (;;) {
      const chunk = this.#chunks.shift();
      if (chunk !== undefined) {
        yield chunk;
        continue;
      }
      if (this.#ended) return;
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
    }
  }

  #notify(): void {
    const wake = this.#wake;
    this.#wake = undefined;
    wake?.();
  }
}

/** What the fake server does with one message the client sent. */
export type FakeHandler = (message: Record<string, unknown>, program: FakeProgram) => void;

/** How the fake program reacts to being stopped. */
export interface StopBehaviour {
  /** Ends when its input closes, as a well-behaved server does. */
  readonly endsOnInputEnd: boolean;
  /** Ends on `terminate`; `kill` always ends it. */
  readonly endsOnTerminate: boolean;
}

const wellBehaved: StopBehaviour = { endsOnInputEnd: true, endsOnTerminate: true };

/** An in-process program that speaks MCP over fake standard streams. */
export class FakeProgram implements RunningProgram {
  readonly launch: ProgramLaunch;
  /** Every message the client sent, in order. */
  readonly received: Record<string, unknown>[] = [];
  /** The stop steps it was given, in order: `end-input`, `terminate`, `kill`. */
  readonly stopSteps: string[] = [];
  readonly stdout = new Pipe();
  readonly stderr = new Pipe();
  readonly exited: Promise<ProgramExit>;
  #running = true;
  #resolveExit: (exit: ProgramExit) => void = () => undefined;
  readonly #handler: FakeHandler;
  readonly #stop: StopBehaviour;

  constructor(launch: ProgramLaunch, handler: FakeHandler, stop: StopBehaviour = wellBehaved) {
    this.launch = launch;
    this.#handler = handler;
    this.#stop = stop;
    this.exited = new Promise((resolve) => {
      this.#resolveExit = resolve;
    });
  }

  get running(): boolean {
    return this.#running;
  }

  async write(text: string): Promise<void> {
    if (!this.#running) throw new Error("write after end");
    for (const line of text.split("\n").filter((part) => part !== "")) {
      const message = JSON.parse(line) as Record<string, unknown>;
      this.received.push(message);
      this.#handler(message, this);
    }
  }

  endInput(): void {
    this.stopSteps.push("end-input");
    if (this.#stop.endsOnInputEnd) this.exit();
  }

  signal(kind: "terminate" | "kill"): void {
    this.stopSteps.push(kind);
    if (kind === "kill" || this.#stop.endsOnTerminate) this.exit();
  }

  /** Sends one message on standard output, as one line. */
  send(message: unknown): void {
    this.sendRaw(`${JSON.stringify(message)}\n`);
  }

  /** Sends text on standard output exactly as given. */
  sendRaw(text: string): void {
    this.stdout.push(new TextEncoder().encode(text));
  }

  /** Ends the program on its own. */
  exit(code = 0): void {
    if (!this.#running) return;
    this.#running = false;
    this.stdout.end();
    this.stderr.end();
    this.#resolveExit({ code, signal: null });
  }
}

/** A starter that starts fake programs and counts them. */
export class FakeStarter implements ProgramStarter {
  readonly programs: FakeProgram[] = [];
  readonly #handler: FakeHandler;
  readonly #stop: StopBehaviour | undefined;

  constructor(handler: FakeHandler, stop?: StopBehaviour) {
    this.#handler = handler;
    this.#stop = stop;
  }

  async start(launch: ProgramLaunch): Promise<RunningProgram> {
    const program = new FakeProgram(launch, this.#handler, this.#stop);
    this.programs.push(program);
    return program;
  }

  counts(): { started: number; running: number } {
    return {
      started: this.programs.length,
      running: this.programs.filter((program) => program.running).length,
    };
  }
}

/** The contract's tools as an MCP server lists them, risk and untrusted in `_meta`. */
export const contractMcpTools = contractServerTools.map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.parameters,
  ...(tool.risk === undefined && tool.untrusted === undefined
    ? {}
    : {
        _meta: {
          ...(tool.risk === undefined ? {} : { "com.halonic/risk": tool.risk }),
          ...(tool.untrusted === undefined ? {} : { "com.halonic/untrusted": tool.untrusted }),
        },
      }),
}));

/**
 * The contract's MCP server: it answers `initialize`, lists
 * {@link contractMcpTools} and answers calls with `contractServerAnswer`,
 * recording each call that reached it in `reached`.
 */
export function contractServer(reached: ReachedCall[]): FakeHandler {
  return (message, program) => {
    const { id, method, params } = message;
    if (typeof id !== "number") return;
    const answer = (result: unknown) => program.send({ jsonrpc: "2.0", id, result });
    if (method === "initialize") {
      answer({ protocolVersion: "2025-11-25", capabilities: { tools: {} } });
    } else if (method === "tools/list") {
      answer({ tools: contractMcpTools });
    } else if (method === "tools/call") {
      callContractTool(params as { name: string; arguments: Record<string, unknown> }, {
        reached,
        answer,
        refuse: () => program.send({ jsonrpc: "2.0", id, error: { code: -32602, message: "x" } }),
      });
    }
  };
}

function callContractTool(
  call: { name: string; arguments: Record<string, unknown> },
  reply: { reached: ReachedCall[]; answer: (result: unknown) => void; refuse: () => void },
): void {
  if (!contractServerTools.some((tool) => tool.name === call.name)) {
    reply.refuse();
    return;
  }
  reply.reached.push({ name: call.name, args: call.arguments });
  const text =
    call.name === brokenToolName ? "it broke" : contractServerAnswer(call.name, call.arguments);
  reply.answer({ content: [{ type: "text", text }], isError: call.name === brokenToolName });
}

/** Launch folders that exist only as names, remembering which are still there. */
export class FakeFolders implements LaunchFolders {
  readonly #present = new Set<string>();
  #created = 0;

  async create(): Promise<string> {
    this.#created += 1;
    const folder = `/acme/launch/halonic-connector-${this.#created}`;
    this.#present.add(folder);
    return folder;
  }

  async remove(folder: string): Promise<void> {
    this.#present.delete(folder);
  }

  /** The folders created and not yet removed. */
  present(): string[] {
    return [...this.#present];
  }
}

/** Launch folders for a connector that must never create one: it starts no pinned program. */
export const unusedFolders: LaunchFolders = {
  create: () => Promise.reject(new Error("this test starts no pinned program")),
  remove: () => Promise.reject(new Error("this test starts no pinned program")),
};
