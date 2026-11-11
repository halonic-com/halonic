import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
  type DeclaredTool,
  type LocalToolPlace,
  localToolLaunch,
  SandboxStdioConnectorFactory,
  type StdioConfig,
  type UndeclaredTool,
} from "../src/index.ts";

/**
 * Attacks by a plugin's local tool, through the sandboxed stdio connector
 * and a real sandbox session: `hostile-server.ts` tries to reach a host its
 * manifest doesn't list, read and change files outside its own folder,
 * read this computer's environment, and offer a tool its manifest doesn't
 * declare. Like `sandbox-srt`'s fence tests, these need a machine where the
 * sandbox starts, and run with `pnpm test:fence`.
 *
 * The fence decides reads by what it denies, so the host denies Halonic's
 * data and the other plugins' folders, and the program's own plugin folder
 * is read-only.
 */

/** The value of the one secret the manifest declares; made up for this test. */
const declaredSecret = "notes-token-for-the-attack-test";

/** A variable only this computer has, which the local tool must never see. */
const hostCanary = { name: "HALONIC_LOCAL_TOOL_CANARY", value: "host-only-canary-value" };

const declaredTools: DeclaredTool[] = ["fetch_url", "read_file", "write_file", "read_env"].map(
  (name) => ({ name, description: `The manifest's ${name}.`, risk: "read" }),
);

/** Answers every request with a body the local tool must never receive. */
async function listeningServer(): Promise<{ server: Server; url: string }> {
  const server = createServer((_request, response) => response.end("undeclared-host-body"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` };
}

describe("a plugin's local tool trying to get out of its sandbox session", () => {
  const sandbox = new SrtSandbox();
  const undeclared: UndeclaredTool[] = [];
  let base: string;
  let place: LocalToolPlace;
  let session: SandboxSession;
  let client: ConnectorClient;
  let host: { server: Server; url: string };

  const folder = (...parts: string[]) => join(base, ...parts);

  async function call(name: string, args: Record<string, unknown> = {}): Promise<string> {
    return client.callTool(name, args);
  }

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "local-tool-attack-"));
    for (const path of ["work", "temp", "plugins/acme-notes", "plugins/other", "data"]) {
      await mkdir(folder(path), { recursive: true });
    }
    await copyFile(
      join(import.meta.dirname, "hostile-server.ts"),
      folder("plugins/acme-notes/server.ts"),
    );
    await writeFile(folder("plugins/other/settings.json"), "other-plugin-settings");
    await writeFile(folder("data/keys.json"), "halonic-data-keys");
    await writeFile(folder("outside.txt"), "outside-original");
    host = await listeningServer();
    process.env[hostCanary.name] = hostCanary.value;

    place = {
      workingFolder: folder("work"),
      tempFolder: folder("temp"),
      readOnlyPaths: [folder("plugins/acme-notes")],
      deniedPaths: [folder("data"), folder("plugins/other")],
      bridge: null,
      sites: ["notes.acme.test"],
      timeLimitMs: 120_000,
      path: [dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter),
    };
    const stdio: StdioConfig = {
      kind: "stdio",
      command: "node",
      args: [folder("plugins/acme-notes/server.ts")],
      env: { NOTES_MODE: "quiet" },
    };
    const config: ConnectorConfig = {
      id: "notes",
      transport: stdio,
      secretEnv: { NOTES_TOKEN: "notes-token" },
    };
    const { profile } = localToolLaunch(stdio, place, null, { NOTES_TOKEN: declaredSecret });
    session = await sandbox.open(profile);
    const factory = new SandboxStdioConnectorFactory({
      clientInfo: { name: "halonic", version: "0.1.0" },
      localTools: () => ({ place, tools: declaredTools, callTimeoutMs: 30_000 }),
      onBlocked: () => undefined,
      onUndeclaredTool: (report) => undeclared.push(report),
    });
    client = factory.create(config, {
      secrets: new MemorySecrets({ "notes-token": declaredSecret }),
      tokens: new MemoryTokenStore(),
      http: { fetch: () => Promise.reject(new Error("a script local tool needs no registry")) },
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

  it("sees only its own settings, its declared secret and what Halonic sets, not this computer's environment", async () => {
    const env = JSON.parse(await call("read_env")) as Record<string, string>;
    // The declared values arrive, so a program that never ran can't pass this.
    expect(env["NOTES_MODE"]).toBe("quiet");
    expect(env["NOTES_TOKEN"]).toBe(declaredSecret);
    expect(env["HOME"]).toBe(place.workingFolder);
    expect(env[hostCanary.name]).toBeUndefined();
    expect(JSON.stringify(env)).not.toContain(hostCanary.value);
  });

  it("can't reach a host its manifest doesn't list, by address or by name", async () => {
    const byAddress = await call("fetch_url", { url: host.url });
    const byName = await call("fetch_url", { url: host.url.replace("127.0.0.1", "localhost") });
    const outside = await call("fetch_url", { url: "http://example.com/" });
    for (const outcome of [byAddress, byName, outside]) {
      expect(outcome).toMatch(/^refused:|^reached:4\d\d:/);
    }
    expect(byAddress + byName).not.toContain("undeclared-host-body");
    expect(outside).not.toContain("Example Domain");
  });

  it("can't read Halonic's data or another plugin's folder", async () => {
    expect(await call("read_file", { path: folder("data/keys.json") })).toMatch(/^refused:/);
    expect(await call("read_file", { path: folder("plugins/other/settings.json") })).toMatch(
      /^refused:/,
    );
  });

  it("writes only in its working folder: not its own plugin's code, not outside", async () => {
    expect(await call("write_file", { path: folder("work/notes.txt"), text: "mine" })).toBe(
      "wrote",
    );
    const ownCode = folder("plugins/acme-notes/server.ts");
    const before = await readFile(ownCode, "utf8");
    expect(await call("write_file", { path: ownCode, text: "changed" })).toMatch(/^refused:/);
    expect(await call("write_file", { path: folder("outside.txt"), text: "changed" })).toMatch(
      /^refused:/,
    );
    expect(await readFile(ownCode, "utf8")).toBe(before);
    expect(await readFile(folder("outside.txt"), "utf8")).toBe("outside-original");
  });

  it("can't offer a tool its manifest doesn't declare, and the tool is never called", async () => {
    const offered = (await client.listTools()).map((tool) => tool.name);
    expect(offered.sort()).toEqual(declaredTools.map((tool) => tool.name).sort());
    expect(undeclared).toContainEqual({ connectorId: "notes", toolName: "wipe_disk" });
    await expect(call("wipe_disk")).rejects.toThrow('has no tool "wipe_disk"');
    await expect(stat(folder("work/wiped"))).rejects.toThrow();
  });
});
