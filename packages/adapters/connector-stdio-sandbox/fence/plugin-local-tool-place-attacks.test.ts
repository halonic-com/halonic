import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
  pluginLocalToolPlace,
  SandboxStdioConnectorFactory,
  type StdioConfig,
} from "../src/index.ts";

/**
 * Attacks by a plugin's local tool on the place `pluginLocalToolPlace`
 * builds (HAL-13056), through a real sandbox session: the host's layout is
 * a person's home with credential folders, Halonic's data folder with the
 * plugin's own folder and another plugin's, and the session's copy of the
 * plugin outside both. `hostile-server.ts` runs from that copy and tries to
 * read the credentials and Halonic's data, also through links planted in
 * its copy, change its copy and the original, and reach a host the
 * manifest doesn't list. Run with `pnpm test:fence`.
 */

const declaredTools: DeclaredTool[] = ["fetch_url", "read_file", "write_file", "read_env"].map(
  (name) => ({ name, description: `The manifest's ${name}.`, risk: "read" }),
);

/** Answers every request with a body the local tool must never receive. */
async function listeningServer(): Promise<{ server: Server; url: string }> {
  const server = createServer((_request, response) => response.end("undeclared-host-body"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` };
}

describe("a plugin's local tool attacking the place the host built for it", () => {
  const sandbox = new SrtSandbox();
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
    base = await mkdtemp(join(tmpdir(), "plugin-place-attack-"));
    for (const path of [
      "home/.ssh",
      "home/.aws",
      "halonic/plugins/acme-notes",
      "halonic/plugins/other",
      "launch-1",
      "launch-2",
      "launch-3/plugin",
    ]) {
      await mkdir(folder(path), { recursive: true });
    }
    await writeFile(folder("home/.ssh/id_ed25519"), "person-ssh-key");
    await writeFile(folder("home/.aws/credentials"), "person-cloud-key");
    const server = join(import.meta.dirname, "hostile-server.ts");
    // The plugin's own folder in Halonic's data, and the session's copy of it.
    await copyFile(server, folder("halonic/plugins/acme-notes/server.ts"));
    await copyFile(server, folder("launch-3/plugin/server.ts"));
    await writeFile(folder("halonic/plugins/other/settings.json"), "other-plugin-settings");
    await writeFile(folder("halonic/keys.json"), "halonic-data-keys");
    // Links in the copy that point at what the session must not read.
    await symlink(folder("home/.ssh/id_ed25519"), folder("launch-3/plugin/key-link"));
    await symlink(folder("home/.ssh"), folder("launch-3/plugin/ssh-link"));
    await symlink(folder("halonic"), folder("launch-3/plugin/data-link"));
    host = await listeningServer();

    const stdio: StdioConfig = {
      kind: "stdio",
      command: "node",
      args: [folder("launch-3/plugin/server.ts")],
      env: {},
      sites: ["notes.acme.test"],
    };
    place = pluginLocalToolPlace(stdio, {
      workingFolder: folder("launch-1"),
      tempFolder: folder("launch-2"),
      pluginCopy: folder("launch-3/plugin"),
      deniedPaths: [folder("home/.ssh"), folder("home/.aws"), folder("halonic")],
      bridge: null,
      timeLimitMs: 120_000,
      path: [dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter),
    });
    const config: ConnectorConfig = { id: "notes", transport: stdio, secretEnv: {} };
    const { profile } = localToolLaunch(stdio, place, null, {});
    session = await sandbox.open(profile);
    const factory = new SandboxStdioConnectorFactory({
      clientInfo: { name: "halonic", version: "0.1.0" },
      localTools: () => ({ place, tools: declaredTools, callTimeoutMs: 30_000 }),
      onBlocked: () => undefined,
      onUndeclaredTool: () => undefined,
    });
    client = factory.create(config, {
      secrets: new MemorySecrets({}),
      tokens: new MemoryTokenStore(),
      http: { fetch: () => Promise.reject(new Error("a script local tool needs no registry")) },
      trust: contractGrant,
      sandbox: session,
    });
  });

  afterAll(async () => {
    await client?.close();
    await session?.close();
    host?.server.close();
    await rm(base, { recursive: true, force: true });
  });

  it("reads its own copy, so the refusals below come from the fence", async () => {
    expect(await call("read_file", { path: folder("launch-3/plugin/server.ts") })).toMatch(
      /^read:import/,
    );
  });

  it("can't read the person's credential folders", async () => {
    for (const path of ["home/.ssh/id_ed25519", "home/.aws/credentials"]) {
      const outcome = await call("read_file", { path: folder(path) });
      expect(outcome).toMatch(/^refused:/);
    }
  });

  it("can't read Halonic's data: its keys, the plugin's own folder or another plugin's", async () => {
    for (const path of [
      "halonic/keys.json",
      "halonic/plugins/acme-notes/server.ts",
      "halonic/plugins/other/settings.json",
    ]) {
      expect(await call("read_file", { path: folder(path) })).toMatch(/^refused:/);
    }
  });

  it("can't read them through links in its copy either", async () => {
    for (const path of [
      "launch-3/plugin/key-link",
      "launch-3/plugin/ssh-link/id_ed25519",
      "launch-3/plugin/data-link/keys.json",
      "launch-3/plugin/data-link/plugins/other/settings.json",
    ]) {
      const outcome = await call("read_file", { path: folder(path) });
      expect(outcome).toMatch(/^refused:/);
      expect(outcome).not.toMatch(/person-ssh-key|halonic-data-keys|other-plugin-settings/);
    }
  });

  it("can't change its copy, the plugin's own folder or the credentials", async () => {
    const copy = folder("launch-3/plugin/server.ts");
    const before = await readFile(copy, "utf8");
    for (const path of ["launch-3/plugin/server.ts", "launch-3/plugin/added.js"]) {
      expect(await call("write_file", { path: folder(path), text: "changed" })).toMatch(
        /^refused:/,
      );
    }
    // On Linux a denied folder is an empty tmpfs, so a write may succeed in
    // there; what counts is that nothing reaches the disk.
    for (const path of ["halonic/plugins/acme-notes/server.ts", "home/.ssh/authorized_keys"]) {
      await call("write_file", { path: folder(path), text: "changed" });
    }
    expect(await readFile(copy, "utf8")).toBe(before);
    expect(await readFile(folder("halonic/plugins/acme-notes/server.ts"), "utf8")).toBe(before);
    await expect(readFile(folder("launch-3/plugin/added.js"))).rejects.toThrow();
    await expect(readFile(folder("home/.ssh/authorized_keys"))).rejects.toThrow();
  });

  it("writes in its working and temp folders", async () => {
    for (const path of ["launch-1/notes.txt", "launch-2/scratch.txt"]) {
      expect(await call("write_file", { path: folder(path), text: "mine" })).toBe("wrote");
    }
  });

  it("can't reach a host its manifest's network doesn't list", async () => {
    const byAddress = await call("fetch_url", { url: host.url });
    const byName = await call("fetch_url", { url: host.url.replace("127.0.0.1", "localhost") });
    for (const outcome of [byAddress, byName]) {
      expect(outcome).toMatch(/^refused:|^reached:4\d\d:/);
      expect(outcome).not.toContain("undeclared-host-body");
    }
  });
});
