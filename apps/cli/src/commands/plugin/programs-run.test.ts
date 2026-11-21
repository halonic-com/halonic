import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import type { LocalToolState } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { openPluginService, type PluginSetup } from "../../plugin-host.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { pluginCommandWith } from "./command.ts";

let folder: string;
let asked: number;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-plugin-programs-"));
  asked = 0;
});

afterEach(async () => {
  await removeTestFolder(folder);
});

/** The plugin commands on a computer whose sandbox gives `state`, counting each time it's asked. */
function setupWith(state: LocalToolState): PluginSetup {
  return {
    profile: {
      platform: process.platform === "win32" ? "windows" : "linux",
      homeFolder: folder,
      variables: { HALONIC_HOME: join(folder, "profile") },
    },
    clock: { now: () => new Date("2026-11-21T09:00:00.000Z") },
    localToolState: async () => {
      asked += 1;
      return state;
    },
  };
}

const unavailable: LocalToolState = { kind: "sandbox-unavailable", reason: "container" };

/** A plugin with one program and no backend. Example data only. */
const programManifest = `id: lister
version: 1.0.0
sdk: 1
name: Lister
localTools:
  - id: files
    start:
      script: { program: node, path: tools/server.js }
    tools:
      - { name: list-files, description: Lists the files in a folder., risk: read, untrusted: true }
`;

/** A plugin with only a backend. Example data only. */
const backendManifest = `id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.example.com]
  tools:
    - { name: forecast, description: The forecast., risk: read, untrusted: true }
`;

/** Writes a plugin's source folder, with every file its manifest names. */
async function sourceOf(id: string, manifest: string): Promise<string> {
  const source = join(folder, "sources", id);
  await mkdir(join(source, "tools"), { recursive: true });
  await mkdir(join(source, "backend"), { recursive: true });
  await writeFile(join(source, "plugin.yaml"), manifest);
  await writeFile(join(source, "tools", "server.js"), "// a program\n");
  await writeFile(join(source, "backend", "index.js"), "export default {};\n");
  return source;
}

/** Adds and trusts a plugin, as an earlier `plugin add` would have. */
async function addTrusted(setup: PluginSetup, id: string, manifest: string): Promise<void> {
  const source = await sourceOf(id, manifest);
  const service = openPluginService(setup);
  const added = await service.add(new FileSystemFolderReader(source), {
    from: { kind: "folder", path: source },
    replace: false,
  });
  if (!added.ok || added.value.status === "broken") throw new Error("not added");
  await service.trust(id, added.value.fingerprint, "cli");
}

async function plugin(setup: PluginSetup, ...args: string[]) {
  const io = captureIo(folder);
  const code = await runCli(["plugin", ...args], io, [pluginCommandWith(setup)]);
  return { code, io };
}

verifies("cli.commands.plugin.programs-run", () => {
  it("says under each program in the trust check that it doesn't run while the sandbox can't start", async () => {
    const setup = setupWith(unavailable);
    const source = await sourceOf("lister", programManifest);

    const { code, io } = await plugin(setup, "add", source);

    expect(code).toBe(exitCode.notTrusted);
    const lines = [...io.stdout, ...io.stderr].join("\n");
    expect(lines).toMatch(
      /\n {2}files +node tools\/server\.js\n +Runs: Doesn't run now\. The sandbox can't start on this computer\n/u,
    );
  });

  it("says under each program that it runs in the agent sandbox when the sandbox works", async () => {
    const source = await sourceOf("lister", programManifest);

    const { io } = await plugin(setupWith({ kind: "ready" }), "add", source);

    expect([...io.stdout, ...io.stderr].join("\n")).toContain(
      "Runs: In the agent sandbox, in its own empty folder",
    );
  });

  it("marks a plugin that is on but whose programs can't run here", async () => {
    const setup = setupWith(unavailable);
    await addTrusted(setup, "lister", programManifest);
    await addTrusted(setup, "weather", backendManifest);

    const { code, io } = await plugin(setup, "list");

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toHaveLength(3);
    expect(io.stdout[0]).toMatch(/^Lister .*✓ on$/u);
    expect(io.stdout[1]).toBe(
      "  ! Programs: Doesn't run now. The sandbox can't start on this computer",
    );
    expect(io.stdout[2]).toMatch(/^Weather .*✓ on$/u);
  });

  it("shows where programs run without a mark when the sandbox works", async () => {
    const setup = setupWith({ kind: "ready" });
    await addTrusted(setup, "lister", programManifest);

    const { io } = await plugin(setup, "list");

    expect(io.stdout[1]).toBe("  Programs: In the agent sandbox, in its own empty folder");
  });

  it("gives each plugin's programsRun with --json, null without programs", async () => {
    const setup = setupWith(unavailable);
    await addTrusted(setup, "lister", programManifest);
    await addTrusted(setup, "weather", backendManifest);

    const { io } = await plugin(setup, "list", "--json");

    expect(JSON.parse(io.stdout.join("\n"))).toMatchObject({
      plugins: [
        { id: "lister", programsRun: "sandbox-unavailable" },
        { id: "weather", programsRun: null },
      ],
    });
  });

  it("doesn't ask the sandbox when no plugin has programs", async () => {
    const setup = setupWith(unavailable);
    await addTrusted(setup, "weather", backendManifest);

    const { io } = await plugin(setup, "list");

    expect(io.stdout).toHaveLength(1);
    expect(asked).toBe(0);
  });
});
