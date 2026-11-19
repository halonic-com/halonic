import { PassThrough } from "node:stream";
import {
  type ProgramLaunch,
  ProgramNotFoundError,
  type ProgramStarter,
  type RunningProgram,
} from "@halonicjs/adapter-mcp";

/** A tool as an MCP server lists it in `tools/list`. */
export interface ListedMcpTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  /** What the server adds about the tool, such as its risk under `com.halonic/risk`. */
  readonly _meta?: Readonly<Record<string, unknown>>;
}

/**
 * Stdio MCP servers in this process: each program started answers
 * `initialize` and lists {@link FakeMcpServers.tools} as they are when it is
 * asked, so a test can change a tool between two listings. A program
 * named in {@link FakeMcpServers.missing} isn't on this computer, and one
 * named in {@link FakeMcpServers.stopsAtStart} exits as soon as it starts.
 */
export class FakeMcpServers implements ProgramStarter {
  /** Every program started, in order. */
  readonly started: ProgramLaunch[] = [];
  /** How many programs are running now. */
  running = 0;
  /** What the next `tools/list` returns. */
  tools: ListedMcpTool[];
  /** The programs that aren't on this computer: starting one fails as the real starter does. */
  readonly missing = new Set<string>();
  /** The programs that exit as soon as they start, as `false` does. */
  readonly stopsAtStart = new Set<string>();

  constructor(tools: ListedMcpTool[]) {
    this.tools = tools;
  }

  async start(launch: ProgramLaunch): Promise<RunningProgram> {
    if (this.missing.has(launch.program)) throw new ProgramNotFoundError(launch.program);
    this.started.push(launch);
    this.running += 1;
    const stdout = new PassThrough();
    let resolveExit: () => void = () => undefined;
    const exited = new Promise<{ code: number; signal: null }>((resolve) => {
      resolveExit = () => resolve({ code: 0, signal: null });
    });
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      this.running -= 1;
      stdout.end();
      resolveExit();
    };
    if (this.stopsAtStart.has(launch.program)) end();
    return {
      write: async (text) => {
        if (ended) throw new Error("write after end");
        for (const line of text.split("\n").filter((part) => part !== "")) {
          const answer = this.answerTo(JSON.parse(line) as { id?: number; method?: string });
          if (answer !== undefined) stdout.write(`${JSON.stringify(answer)}\n`);
        }
      },
      endInput: end,
      signal: end,
      stdout,
      stderr: new PassThrough({ emitClose: true }).end(),
      exited,
    };
  }

  private answerTo(message: { id?: number; method?: string }): unknown {
    if (message.id === undefined) return undefined;
    const result =
      message.method === "initialize"
        ? { protocolVersion: "2025-11-25", capabilities: { tools: {} } }
        : { tools: this.tools };
    return { jsonrpc: "2.0", id: message.id, result };
  }
}
