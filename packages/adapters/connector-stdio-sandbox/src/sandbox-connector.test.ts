import { ConnectorStoppedError } from "@halonicjs/adapter-mcp";
import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import type {
  ConnectorConfig,
  ConnectorFactoryContext,
  SandboxBlock,
  SandboxFence,
} from "@halonicjs/ports";
import {
  contractGrant,
  type FakeProgram,
  FakeSandboxSession,
  type ReachedCall,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { SandboxNotFencedError, SandboxSessionEndedError } from "./errors.ts";
import { contractProgram, mcpProgram, testProfile } from "./fake-mcp-program.spec.ts";
import { type ConnectorBlock, SandboxStdioConnectorFactory } from "./sandbox-connector.ts";

const config: ConnectorConfig = {
  id: "notes",
  transport: { kind: "stdio", command: "notes-mcp", args: ["--serve"], env: {} },
  secretEnv: {},
};

const notFenced: SandboxFence = {
  state: "not-fenced",
  reason: "The probe reached a loopback port the fence should block.",
};

interface SetUpOptions {
  readonly program?: FakeProgram;
  readonly fence?: SandboxFence;
}

function setUp(options: SetUpOptions = {}) {
  const reached: ReachedCall[] = [];
  const sandbox = new FakeSandboxSession({
    profile: testProfile,
    program: options.program ?? contractProgram(reached),
    ...(options.fence === undefined ? {} : { fence: options.fence }),
  });
  const blocked: ConnectorBlock[] = [];
  const factory = new SandboxStdioConnectorFactory({
    clientInfo: { name: "halonic", version: "0.1.0" },
    onBlocked: (block) => blocked.push(block),
  });
  const context: ConnectorFactoryContext = {
    secrets: new MemorySecrets(),
    tokens: new MemoryTokenStore(),
    http: { fetch: () => Promise.reject(new Error("a local tool reaches no network here")) },
    trust: contractGrant,
    sandbox,
  };
  return { sandbox, factory, context, reached, blocked };
}

verifies("ports.connector-sandbox-session", () => {
  it("starts nothing while the fence isn't proven, whatever the person said about running without the sandbox", async () => {
    // The factory has no input for that yes at all: it can't change the answer.
    const { sandbox, factory, context } = setUp({ fence: notFenced });
    const start = vi.spyOn(sandbox, "start");
    const client = factory.create(config, context);
    const refused = client.listTools();
    await expect(refused).rejects.toThrow(SandboxNotFencedError);
    await expect(refused).rejects.toThrow(notFenced.reason);
    await expect(client.callTool("read_note", { id: "n-1" })).rejects.toThrow(
      SandboxNotFencedError,
    );
    expect(start).not.toHaveBeenCalled();
  });
});

verifies("connector-stdio-sandbox.session-start", () => {
  it("refuses to create a local tool's connector without a sandbox session", () => {
    const { factory, context } = setUp();
    const { sandbox: _left, ...noSandbox } = context;
    expect(() => factory.create(config, noSandbox)).toThrow(
      'Connector "notes" is a local tool, which starts only in a sandbox session, and it was given none.',
    );
  });

  it("without a grant, starts nothing in the session", async () => {
    const { sandbox, factory, context } = setUp();
    const start = vi.spyOn(sandbox, "start");
    const client = factory.create(config, { ...context, trust: null });
    await expect(client.listTools()).rejects.toThrow("starts only once its plugin is trusted");
    expect(start).not.toHaveBeenCalled();
  });

  it("starts the configured program and its arguments in the session's working folder", async () => {
    const { sandbox, factory, context } = setUp();
    const client = factory.create(config, context);
    await client.listTools();
    expect(sandbox.started).toEqual([{ program: "notes-mcp", args: ["--serve"] }]);
    await client.close();
  });

  it("refuses a pinned package and a folder to start in, until the profile carries them", async () => {
    const { sandbox, factory, context } = setUp();
    const pinned = {
      ...config.transport,
      pin: {
        registry: "npm",
        registryUrl: "https://registry.npmjs.org",
        package: "@acme/notes-mcp",
        version: "1.2.3",
      },
    } as const;
    await expect(
      factory.create({ ...config, transport: pinned }, context).listTools(),
    ).rejects.toThrow("pinned package");
    const elsewhere = { ...config.transport, cwd: "../other" };
    await expect(
      factory.create({ ...config, transport: elsewhere }, context).listTools(),
    ).rejects.toThrow("starts in the working folder Halonic chose for it");
    expect(sandbox.started).toEqual([]);
  });

  it("refuses another transport kind", () => {
    const { factory, context } = setUp();
    const http: ConnectorConfig = {
      ...config,
      transport: { kind: "http", url: "https://notes.acme.test/mcp", headers: {} },
    };
    expect(() => factory.create(http, context)).toThrow(
      'Connector "notes" uses http, but this factory serves stdio.',
    );
  });

  it("starts the program again after it stopped, in the same session, without trying the lost call again", async () => {
    let calls = 0;
    const program = mcpProgram(({ method }, { answer }) => {
      if (method === "initialize") {
        answer({ protocolVersion: "2025-11-25", capabilities: { tools: {} } });
      } else if (method === "tools/call") {
        calls += 1;
        if (calls === 1) return "crash";
        answer({ content: [{ type: "text", text: "done" }] });
      }
      return undefined;
    });
    const { sandbox, factory, context } = setUp({ program });
    const client = factory.create(config, context);
    await expect(client.callTool("read_note", {})).rejects.toThrow(
      'lost its program while its tool "read_note" ran',
    );
    expect(await client.callTool("read_note", {})).toBe("done");
    expect(calls).toBe(2);
    expect(sandbox.started).toHaveLength(2);
    await client.close();
  });

  it("stays stopped past the restart limit, without the program's error output", async () => {
    const program: FakeProgram = async (io) => {
      io.writeError("token=not-for-the-log\n");
      return 1;
    };
    const { sandbox, context } = setUp({ program });
    const factory = new SandboxStdioConnectorFactory({
      clientInfo: { name: "halonic", version: "0.1.0" },
      onBlocked: () => undefined,
      restartLimits: { maxRestarts: 1, windowMs: 60_000 },
    });
    const client = factory.create(config, context);
    await expect(client.listTools()).rejects.toThrow();
    await expect(client.listTools()).rejects.toThrow();
    const stopped = await client.listTools().catch((error: unknown) => error);
    expect(stopped).toBeInstanceOf(ConnectorStoppedError);
    expect((stopped as ConnectorStoppedError).errorOutput).toEqual([]);
    expect(sandbox.started).toHaveLength(2);
  });
});

verifies("connector-stdio-sandbox.blocked-events", () => {
  it("reports each access the sandbox refused, with the connector's id, until it is closed", async () => {
    const { sandbox, factory, context, blocked } = setUp();
    const client = factory.create(config, context);
    const block: SandboxBlock = { kind: "network", host: "tracker.example.test", port: 443 };
    sandbox.block(block);
    expect(blocked).toEqual([{ connectorId: "notes", block }]);
    await client.close();
    sandbox.block({ kind: "file", path: "/halonic/data/keys", access: "read" });
    expect(blocked).toHaveLength(1);
  });
});

verifies("connector-stdio-sandbox.session-ended", () => {
  it("throws a session-ended error once the session has ended, and starts nothing", async () => {
    const { sandbox, factory, context } = setUp();
    const client = factory.create(config, context);
    await sandbox.close();
    const start = vi.spyOn(sandbox, "start");
    await expect(client.listTools()).rejects.toThrow(SandboxSessionEndedError);
    expect(start).not.toHaveBeenCalled();
  });

  it("fails a call that waited when the session ended with the same error", async () => {
    const { promise: callArrived, resolve: arrive } = Promise.withResolvers<void>();
    const program = mcpProgram(({ method }, { answer }) => {
      if (method === "initialize") {
        answer({ protocolVersion: "2025-11-25", capabilities: { tools: {} } });
      }
      // A call is never answered: the session ends while it waits.
      if (method === "tools/call") arrive();
      return undefined;
    });
    const { sandbox, factory, context } = setUp({ program });
    const client = factory.create(config, context);
    const waiting = client.callTool("read_note", {});
    await callArrived;
    await sandbox.close();
    await expect(waiting).rejects.toThrow(SandboxSessionEndedError);
  });

  it("stops its program on close and leaves the session to its owner", async () => {
    const { sandbox, factory, context } = setUp();
    const close = vi.spyOn(sandbox, "close");
    const client = factory.create(config, context);
    await client.listTools();
    await client.close();
    expect(sandbox.running).toBe(0);
    expect(close).not.toHaveBeenCalled();
    expect(sandbox.fence).toEqual({ state: "fenced" });
  });
});
