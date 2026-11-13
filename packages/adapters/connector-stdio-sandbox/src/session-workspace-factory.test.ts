import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactoryContext,
  Sandbox,
  SandboxCapabilities,
  SandboxCheck,
  SandboxProfile,
} from "@halonicjs/ports";
import { contractGrant, FakeSandboxSession } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, expect, it } from "vitest";
import { contractProgram } from "./fake-mcp-program.spec.ts";
import { SandboxStdioConnectorFactory } from "./sandbox-connector.ts";
import { SessionWorkspaceFactory } from "./session-workspace-factory.ts";

const mail: ConnectorConfig = {
  id: "mail",
  transport: {
    kind: "stdio",
    command: "node",
    args: ["tools/mail.js"],
    env: { MAIL_MODE: "quiet" },
    sites: ["mail.acme.test"],
  },
  secretEnv: { MAIL_TOKEN: "mail-token" },
};

/** A sandbox that opens fake sessions, and keeps them. */
class FakeSandbox implements Sandbox {
  checked: SandboxCheck = { ok: true, reason: null, missing: [] };
  readonly sessions: FakeSandboxSession[] = [];
  check = async () => this.checked;
  capabilities = (): SandboxCapabilities => {
    throw new Error("not used");
  };
  async open(profile: SandboxProfile) {
    const session = new FakeSandboxSession({ profile, program: contractProgram([]) });
    this.sessions.push(session);
    return session;
  }
}

verifies("connector-stdio-sandbox.workspace-connector-session", () => {
  let sandbox: FakeSandbox;
  let made: string[];
  let removed: string[];
  let unfenced: ConnectorConfig[];
  let factory: SessionWorkspaceFactory;
  let context: ConnectorFactoryContext;

  beforeEach(() => {
    sandbox = new FakeSandbox();
    made = [];
    removed = [];
    unfenced = [];
    factory = new SessionWorkspaceFactory({
      sandbox,
      sandboxed: (setupOf) =>
        new SandboxStdioConnectorFactory({
          clientInfo: { name: "halonic", version: "0.1.0" },
          localTools: () => undefined,
          workspaceConnectors: setupOf,
          onBlocked: () => undefined,
          onUndeclaredTool: () => undefined,
        }),
      unfenced: {
        transport: "stdio",
        create: (config) => {
          unfenced.push(config);
          return {
            id: config.id,
            listTools: async () => [],
            callTool: async () => "",
            close: async () => {},
          } as ConnectorClient;
        },
      },
      folders: {
        create: async () => {
          const folder = `/halonic/folder-${made.length}`;
          made.push(folder);
          return folder;
        },
        remove: async (folder) => {
          removed.push(folder);
        },
      },
      runners: {} as never,
      deniedPaths: ["/halonic/data"],
      path: "/usr/bin",
      timeLimitMs: 60_000,
      callTimeoutMs: 30_000,
    });
    context = {
      secrets: new MemorySecrets({ "mail-token": "token-value" }),
      tokens: new MemoryTokenStore(),
      http: { fetch: () => Promise.reject(new Error("no network here")) },
      trust: contractGrant,
      workspaceRoot: "/work/space",
      workingFolders: ["/work/space/files/agents/writer"],
    };
  });

  it("opens the session with the profile Halonic builds, and starts the program in it", async () => {
    const client = factory.create(mail, context);
    expect((await client.listTools()).length).toBeGreaterThan(0);
    const [session] = sandbox.sessions;
    expect(session?.profile).toMatchObject({
      readOnlyPaths: ["/work/space"],
      env: { MAIL_MODE: "quiet", MAIL_TOKEN: "token-value" },
      network: { bridge: null, allowedSites: ["mail.acme.test"] },
    });
    expect(session?.profile.deniedPaths).toEqual(
      expect.arrayContaining(["/halonic/data", "/work/space/files/agents/writer"]),
    );
    expect(session?.started[0]).toMatchObject({ program: "node", cwd: "/work/space" });
    expect(unfenced).toEqual([]);
    await client.close();
  });

  it("starts as before, without a session, when the sandbox doesn't work", async () => {
    sandbox.checked = {
      ok: false,
      reason: "bubblewrap-missing",
      missing: ["bubblewrap is not installed"],
    } as SandboxCheck;
    await factory.create(mail, context).listTools();
    expect(sandbox.sessions).toEqual([]);
    expect(unfenced).toEqual([mail]);
  });

  it("opens a new session with new folders once the last one has ended", async () => {
    const client = factory.create(mail, context);
    await client.listTools();
    await sandbox.sessions[0]?.close();
    await client.listTools();
    expect(sandbox.sessions).toHaveLength(2);
    expect(new Set(made).size).toBe(made.length);
    expect(removed).toEqual(expect.arrayContaining(made.slice(0, 2)));
    await client.close();
  });

  it("closes its session and removes its folders when it closes", async () => {
    const client = factory.create(mail, context);
    await client.listTools();
    await client.close();
    expect(sandbox.sessions[0]?.fence.state).toBe("stopped");
    expect(removed.sort()).toEqual([...made].sort());
  });

  it("keeps each run's setup apart when two clients of one connector are open", async () => {
    const other: ConnectorFactoryContext = {
      ...context,
      workspaceRoot: "/other/space",
      workingFolders: ["/other/space/files/agents/editor"],
    };
    const first = factory.create(mail, context);
    const second = factory.create(mail, other);
    await first.listTools();
    await second.listTools();
    await second.close();
    expect((await first.listTools()).length).toBeGreaterThan(0);
    expect(sandbox.sessions[0]?.profile.readOnlyPaths).toEqual(["/work/space"]);
    expect(sandbox.sessions[1]?.profile.readOnlyPaths).toEqual(["/other/space"]);
    await first.close();
  });

  it("opens no session for a connector that closed while it was starting", async () => {
    const client = factory.create(mail, context);
    const listing = client.listTools().catch(() => undefined);
    await client.close();
    await listing;
    expect(sandbox.sessions.every((session) => session.fence.state === "stopped")).toBe(true);
  });
});
