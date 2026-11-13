import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import type { ConnectorClient, ConnectorConfig, SandboxSession } from "@halonicjs/ports";
import { contractGrant } from "@halonicjs/testing-contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  localToolLaunch,
  SandboxStdioConnectorFactory,
  type StdioConfig,
  type WorkspaceConnectorSetting,
  workspaceConnectorPlace,
} from "../src/index.ts";

/**
 * Attacks by one of a workspace's own `stdio` connectors (D45), through the
 * sandboxed stdio connector and a real sandbox session. It uses the same
 * `hostile-server.ts` as the plugin local tool's attacks, started from the
 * workspace the way `node tools/mail.js` would be. It tries to reach a host
 * the connector file doesn't list, read a file an agent wrote (condition 6
 * on HAL-4739), read this computer's environment, and change the workspace
 * and files outside its own folder. Like the local tool's, these need a
 * machine where the sandbox starts, and run with `pnpm test:fence`.
 */

const declaredSecret = "mail-token-for-the-attack-test";
const hostCanary = { name: "HALONIC_WORKSPACE_CONNECTOR_CANARY", value: "host-only-canary-value" };

/** Answers every request with a body the connector must never receive. */
async function listeningServer(): Promise<{ server: Server; url: string }> {
  const server = createServer((_request, response) => response.end("undeclared-host-body"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` };
}

describe("a workspace connector trying to get out of its sandbox session", () => {
  const sandbox = new SrtSandbox();
  let base: string;
  let session: SandboxSession;
  let client: ConnectorClient;
  let host: { server: Server; url: string };

  const folder = (...parts: string[]) => join(base, ...parts);

  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool(name, args);

  beforeAll(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), "workspace-connector-attack-")));
    for (const path of [
      "work",
      "temp",
      "workspace/tools",
      "workspace/files/agents/writer",
      "data",
    ]) {
      await mkdir(folder(path), { recursive: true });
    }
    await copyFile(
      join(import.meta.dirname, "hostile-server.ts"),
      folder("workspace/tools/mail.ts"),
    );
    await writeFile(folder("workspace/files/agents/writer/lib.txt"), "agent-written-file");
    await writeFile(folder("workspace/notes.txt"), "workspace-original");
    await writeFile(folder("data/keys.json"), "halonic-data-keys");
    await writeFile(folder("outside.txt"), "outside-original");
    host = await listeningServer();
    process.env[hostCanary.name] = hostCanary.value;

    const stdio: StdioConfig = {
      kind: "stdio",
      command: "node",
      args: ["tools/mail.ts"],
      env: { MAIL_MODE: "quiet" },
      sites: ["mail.acme.test"],
    };
    const setting: WorkspaceConnectorSetting = {
      workingFolder: folder("work"),
      tempFolder: folder("temp"),
      workspaceRoot: folder("workspace"),
      agentWorkingFolders: [folder("workspace/files/agents/writer")],
      deniedPaths: [folder("data")],
      bridge: null,
      timeLimitMs: 120_000,
      path: [dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter),
    };
    const config: ConnectorConfig = {
      id: "mail",
      transport: stdio,
      secretEnv: { MAIL_TOKEN: "mail-token" },
    };
    const place = workspaceConnectorPlace(stdio, setting);
    const { profile } = localToolLaunch(stdio, place, null, { MAIL_TOKEN: declaredSecret });
    session = await sandbox.open(profile);
    const factory = new SandboxStdioConnectorFactory({
      clientInfo: { name: "halonic", version: "0.1.0" },
      localTools: () => undefined,
      workspaceConnectors: () => ({ setting, callTimeoutMs: 30_000 }),
      onBlocked: () => undefined,
      onUndeclaredTool: () => undefined,
    });
    client = factory.create(config, {
      secrets: new MemorySecrets({ "mail-token": declaredSecret }),
      tokens: new MemoryTokenStore(),
      http: { fetch: () => Promise.reject(new Error("a script connector needs no registry")) },
      trust: contractGrant,
      sandbox: session,
    });
  });

  afterAll(async () => {
    delete process.env[hostCanary.name];
    await client?.close();
    await session?.close();
    host?.server.close();
    await rm(base, { recursive: true, force: true });
  });

  it("sees only its own settings, its secret and what Halonic sets, not this computer's environment", async () => {
    const env = JSON.parse(await call("read_env")) as Record<string, string>;
    // The declared values arrive, so a program that never ran can't pass this.
    expect(env["MAIL_MODE"]).toBe("quiet");
    expect(env["MAIL_TOKEN"]).toBe(declaredSecret);
    expect(env[hostCanary.name]).toBeUndefined();
    expect(JSON.stringify(env)).not.toContain(hostCanary.value);
  });

  it("can't reach a host its file doesn't list, by address or by name", async () => {
    const byAddress = await call("fetch_url", { url: host.url });
    const byName = await call("fetch_url", { url: host.url.replace("127.0.0.1", "localhost") });
    const outside = await call("fetch_url", { url: "http://example.com/" });
    for (const outcome of [byAddress, byName, outside]) {
      expect(outcome).toMatch(/^refused:|^reached:4\d\d:/);
    }
    expect(byAddress + byName).not.toContain("undeclared-host-body");
    expect(outside).not.toContain("Example Domain");
  });

  it("can't read a file an agent wrote, though the workspace around it is readable", async () => {
    expect(await call("read_file", { path: folder("workspace/notes.txt") })).toBe(
      "read:workspace-original",
    );
    expect(
      await call("read_file", { path: folder("workspace/files/agents/writer/lib.txt") }),
    ).toMatch(/^refused:/);
  });

  it("can't read Halonic's data", async () => {
    expect(await call("read_file", { path: folder("data/keys.json") })).toMatch(/^refused:/);
  });

  it("writes only in its own working folder: not the workspace, not outside", async () => {
    expect(await call("write_file", { path: folder("work/mail.txt"), text: "mine" })).toBe("wrote");
    for (const path of [folder("workspace/notes.txt"), folder("outside.txt")]) {
      expect(await call("write_file", { path, text: "changed" })).toMatch(/^refused:/);
    }
    expect(await readFile(folder("workspace/notes.txt"), "utf8")).toBe("workspace-original");
    expect(await readFile(folder("outside.txt"), "utf8")).toBe("outside-original");
  });
});
