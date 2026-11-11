import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { openPluginService, type PluginSetup } from "../../plugin-host.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { pluginCommandWith } from "./command.ts";

let folder: string;
let setup: PluginSetup;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-plugin-list-"));
  setup = {
    profile: {
      platform: process.platform === "win32" ? "windows" : "linux",
      homeFolder: folder,
      variables: { HALONIC_HOME: join(folder, "profile") },
    },
    clock: { now: () => new Date("2026-11-11T09:00:00.000Z") },
  };
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const manifest = (id: string, name: string) =>
  `id: ${id}\nversion: 1.2.0\nsdk: 1\nname: ${name}\nbackend:\n  hosts: [api.example.com]\n  tools:\n    - { name: forecast, description: The forecast., risk: read, untrusted: true }\n`;

/** Adds the plugin `id`, from a folder of its own, and trusts it when `trusted`. */
async function addPlugin(id: string, name: string, trusted: boolean): Promise<string> {
  const source = join(folder, "sources", id);
  await mkdir(join(source, "backend"), { recursive: true });
  await writeFile(join(source, "plugin.yaml"), manifest(id, name));
  await writeFile(join(source, "backend", "index.js"), "export default {};\n");
  const service = openPluginService(setup);
  const added = await service.add(new FileSystemFolderReader(source), {
    from: { kind: "folder", path: source },
    replace: false,
  });
  if (!added.ok) throw new Error(`not added: ${JSON.stringify(added.error)}`);
  if (trusted && added.value.status !== "broken") {
    await service.trust(id, added.value.fingerprint, "cli");
  }
  return source;
}

async function list(...args: string[]) {
  const io = captureIo(folder);
  const code = await runCli(["plugin", ...args], io, [pluginCommandWith(setup)]);
  return { code, io };
}

verifies("cli.commands.plugin.list", () => {
  it("says how to add a plugin when there are none", async () => {
    const { code, io } = await list("list");

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "No plugins yet. Add one from a folder with halonic plugin add <folder>.",
    ]);
  });

  it("lists a trusted plugin as on and one never trusted with the command that trusts it", async () => {
    await addPlugin("weather", "Weather", true);
    await addPlugin("tides", "Tides", false);

    const { code, io } = await list();

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      `Tides     1.2.0   ~${sep}sources${sep}tides     ! not trusted yet · halonic trust --plugin tides`,
      `Weather   1.2.0   ~${sep}sources${sep}weather   ✓ on`,
    ]);
  });

  it("lists a folder that can't be read by its name and still lists the others", async () => {
    await addPlugin("tides", "Tides", false);
    await mkdir(join(folder, "profile", "plugins", "empty"), { recursive: true });

    const { code, io } = await list("list");

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toHaveLength(2);
    expect(io.stdout[0]).toMatch(/^empty .*✕ can't be read or checked$/);
  });

  it("gives each plugin's id, name, version, status and source with --json", async () => {
    const source = await addPlugin("tides", "Tides", false);

    const { io } = await list("list", "--json");

    expect(JSON.parse(io.stdout.join("\n"))).toMatchObject({
      ok: true,
      plugins: [
        {
          id: "tides",
          name: "Tides",
          version: "1.2.0",
          status: "notTrusted",
          source: { kind: "folder", path: source },
        },
      ],
    });
  });
});
