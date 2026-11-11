import type { ConnectorConfig, SandboxProfile } from "@halonicjs/ports";
import {
  brokenToolName,
  contractServerAnswer,
  contractServerTools,
  type FakeProgram,
  type FakeProgramIo,
  type ReachedCall,
} from "@halonicjs/testing-contracts";
import { type LocalToolPlace, localToolLaunch, type StdioConfig } from "./local-tool-launch.ts";
import type { LocalToolSetup } from "./sandbox-connector.ts";

/** The contract's tools as an MCP server lists them, risk and untrusted in `_meta`. */
const contractMcpTools = contractServerTools.map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.parameters,
  _meta: {
    ...(tool.risk === undefined ? {} : { "com.halonic/risk": tool.risk }),
    ...(tool.untrusted === undefined ? {} : { "com.halonic/untrusted": tool.untrusted }),
  },
}));

/** How the fake server replies to one request, and the program it runs as. */
export interface FakeReply {
  answer(result: unknown): void;
  refuse(): void;
  readonly io: FakeProgramIo;
}

/** What the fake server does with one request. Returning `"crash"` ends the program with code 1. */
export type FakeRequestHandler = (
  request: { method: string; params: unknown },
  reply: FakeReply,
) => undefined | "crash";

/**
 * An MCP server as a program in a `FakeSandboxSession`: it reads one
 * JSON-RPC message per line and hands each request to `handle`, until its
 * input ends, it is stopped or `handle` crashes it.
 */
export function mcpProgram(handle: FakeRequestHandler): FakeProgram {
  return async (io) => {
    for (let line = await io.readLine(); line !== null; line = await io.readLine()) {
      const { id, method, params } = JSON.parse(line) as Record<string, unknown>;
      if (typeof id !== "number" || typeof method !== "string") continue;
      const send = (message: object) =>
        io.write(`${JSON.stringify({ jsonrpc: "2.0", id, ...message })}\n`);
      const outcome = handle(
        { method, params },
        {
          answer: (result) => send({ result }),
          refuse: () => send({ error: { code: -32602, message: "Unknown tool" } }),
          io,
        },
      );
      if (outcome === "crash") return 1;
    }
    return 0;
  };
}

/**
 * The contract's MCP server: it answers `initialize`, lists the contract's
 * tools and answers their calls with `contractServerAnswer`, recording each
 * call that reached it in `reached`.
 */
export function contractProgram(reached: ReachedCall[]): FakeProgram {
  return mcpProgram(({ method, params }, { answer, refuse }) => {
    if (method === "initialize") {
      answer({ protocolVersion: "2025-11-25", capabilities: { tools: {} } });
    } else if (method === "tools/list") {
      answer({ tools: contractMcpTools });
    } else if (method === "tools/call") {
      const call = params as { name: string; arguments: Record<string, unknown> };
      if (!contractServerTools.some((tool) => tool.name === call.name)) {
        refuse();
        return undefined;
      }
      reached.push({ name: call.name, args: call.arguments });
      const broken = call.name === brokenToolName;
      const text = broken ? "it broke" : contractServerAnswer(call.name, call.arguments);
      answer({ content: [{ type: "text", text }], isError: broken });
    }
    return undefined;
  });
}

/** A local tool started by a script with a program the person has, as its stdio config. */
export const scriptConfig: ConnectorConfig = {
  id: "notes",
  transport: { kind: "stdio", command: "node", args: ["server.js", "--serve"], env: {} },
  secretEnv: {},
};

/** Where the host set the local tool up: made-up folders, no runner. */
export const testPlace: LocalToolPlace = {
  workingFolder: "/halonic/local-tools/notes",
  tempFolder: "/halonic/tmp/notes",
  readOnlyPaths: ["/halonic/plugins/acme-notes"],
  deniedPaths: ["/halonic/data"],
  bridge: null,
  sites: ["notes.acme.test"],
  timeLimitMs: 60_000,
  path: "/usr/bin",
};

/** What the host set up for the contract's local tool: {@link testPlace}, the contract's tools declared as the server lists them. */
export const testSetup: LocalToolSetup = {
  place: testPlace,
  tools: contractServerTools.map(({ parameters: _schema, ...declared }) => declared),
  callTimeoutMs: 60_000,
};

/** The profile Halonic builds for {@link scriptConfig} at {@link testPlace}, without secrets. */
export const testProfile: SandboxProfile = localToolLaunch(
  scriptConfig.transport as StdioConfig,
  testPlace,
  null,
  {},
).profile;
