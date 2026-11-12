import { PassThrough } from "node:stream";
import type { ProgramLaunch, ProgramStarter, RunningProgram } from "@halonicjs/adapter-mcp";

/** A tool as an MCP server lists it in `tools/list`. */
export interface ListedMcpTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

/**
 * Stdio MCP servers in this process: each program started answers
 * `initialize` and lists {@link FakeMcpServers.tools} as they are when it is
 * asked, so a test can change a tool between two listings.
 */
export class FakeMcpServers implements ProgramStarter {
  /** Every program started, in order. */
  readonly started: ProgramLaunch[] = [];
  /** How many programs are running now. */
  running = 0;
  /** What the next `tools/list` returns. */
  tools: ListedMcpTool[];

  constructor(tools: ListedMcpTool[]) {
    this.tools = tools;
  }

  async start(launch: ProgramLaunch): Promise<RunningProgram> {
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
    return {
      write: async (text) => {
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
