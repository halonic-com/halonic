import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import type {
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
import { cliConnectorFactories } from "./connector-machine.ts";
import { FakeMcpServers } from "./test/fake-mcp-servers.ts";

const notes: ConnectorConfig = {
  id: "notes",
  transport: {
    kind: "stdio",
    command: "node",
    args: ["tools/notes.js"],
    env: {},
    sites: ["notes.acme.test"],
  },
  secretEnv: {},
};

/** A sandbox that opens fake sessions whose program ends at once, and keeps them. */
class FakeSandbox implements Sandbox {
  checked: SandboxCheck = { ok: true, reason: null, missing: [] };
  readonly sessions: FakeSandboxSession[] = [];
  check = async () => this.checked;
  capabilities = (): SandboxCapabilities => {
    throw new Error("not used");
  };
  async open(profile: SandboxProfile) {
    const session = new FakeSandboxSession({ profile, program: async () => 1 });
    this.sessions.push(session);
    return session;
  }
}

verifies("cli.connector-sandbox", () => {
  let sandbox: FakeSandbox;
  let servers: FakeMcpServers;
  let context: ConnectorFactoryContext;

  const factories = () =>
    cliConnectorFactories(
      servers,
      { PATH: "/usr/bin" },
      { sandbox, deniedPaths: ["/halonic/data"] },
    );

  beforeEach(() => {
    sandbox = new FakeSandbox();
    servers = new FakeMcpServers([]);
    context = {
      secrets: new MemorySecrets(),
      tokens: new MemoryTokenStore(),
      http: { fetch: () => Promise.reject(new Error("no network here")) },
      trust: contractGrant,
      workspaceRoot: "/work/space",
      workingFolders: [],
    };
  });

  it("starts a connector in a session that denies Halonic's data, not through the unfenced starter", async () => {
    const client = factories().create(notes, context);
    // The fake program ends at once, so the MCP handshake fails; the start is what counts.
    await expect(client.listTools()).rejects.toThrow();
    expect(sandbox.sessions[0]?.profile.deniedPaths).toContain("/halonic/data");
    expect(sandbox.sessions[0]?.started[0]).toMatchObject({ program: "node" });
    expect(servers.started).toEqual([]);
    await client.close();
  });

  it("starts a connector on this computer, with no session, when the sandbox doesn't work", async () => {
    sandbox.checked = {
      ok: false,
      reason: "bubblewrap-missing",
      missing: ["bubblewrap is not installed"],
    };
    const client = factories().create(notes, context);
    await client.listTools();
    expect(sandbox.sessions).toEqual([]);
    expect(servers.started).toHaveLength(1);
    await client.close();
  });
});
