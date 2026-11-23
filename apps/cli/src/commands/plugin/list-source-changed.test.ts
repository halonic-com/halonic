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
import { removeTestFolder } from "../../test/remove-folder.ts";
import { pluginCommandWith } from "./command.ts";

// `plugin list` says when the folder a plugin was copied from changed since
// the copy, with the command that updates it (C696 #3, HAL-16319).

let folder: string;
let setup: PluginSetup;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-plugin-list-source-"));
  setup = {
    profile: {
      platform: process.platform === "win32" ? "windows" : "linux",
      homeFolder: folder,
      variables: { HALONIC_HOME: join(folder, "profile") },
    },
    clock: { now: () => new Date("2026-11-11T09:00:00.000Z") },
    pluginCodeFence: async () => ({ state: "fenced" }),
  };
});

afterEach(async () => {
  await removeTestFolder(folder);
});

const manifest =
  "id: weather\nversion: 1.2.0\nsdk: 1\nname: Weather\nbackend:\n  hosts: [api.example.com]\n  tools:\n    - { name: forecast, description: The forecast., risk: read, untrusted: true }\n";

/** Adds and trusts the weather plugin from `<home>/<under>`, and gives that folder. */
async function addWeather(under = "sources/weather"): Promise<string> {
  const source = join(folder, ...under.split("/"));
  await mkdir(join(source, "backend"), { recursive: true });
  await writeFile(join(source, "plugin.yaml"), manifest);
  await writeFile(join(source, "backend", "index.js"), "export default {};\n");
  const service = openPluginService(setup);
  const added = await service.add(new FileSystemFolderReader(source), {
    from: { kind: "folder", path: source },
    replace: false,
  });
  if (!added.ok || added.value.status === "broken") throw new Error("weather wasn't added");
  await service.trust("weather", added.value.fingerprint, "cli");
  return source;
}

async function list(...args: string[]) {
  const io = captureIo(folder);
  const code = await runCli(["plugin", "list", ...args], io, [pluginCommandWith(setup)]);
  return { code, io };
}

verifies("cli.commands.plugin.list-source-changed", () => {
  it("says the folder changed since the copy, with the command that updates it", async () => {
    const source = await addWeather();
    await writeFile(join(source, "backend", "index.js"), "export default { edited: true };\n");

    const { code, io } = await list();

    expect(code).toBe(exitCode.ok);
    expect(io.stdout[1]).toBe(
      `  ! The folder changed since it was copied. To use your changes, run: halonic plugin add ~${sep}sources${sep}weather --update`,
    );
    const json = await list("--json");
    expect(JSON.parse(json.io.stdout.join("\n")).plugins[0]).toMatchObject({ sourceChanged: true });
  });

  it("says nothing for an unchanged folder, or one that only gained a private file", async () => {
    const source = await addWeather();
    await writeFile(join(source, ".env"), "KEY=1\n");

    const { io } = await list();

    expect(io.stdout).toHaveLength(1);
    const json = await list("--json");
    expect(JSON.parse(json.io.stdout.join("\n")).plugins[0]).toMatchObject({
      sourceChanged: false,
    });
  });

  it("says nothing for a folder that is gone", async () => {
    const source = await addWeather();
    await rm(source, { recursive: true });

    const { io } = await list();

    expect(io.stdout).toHaveLength(1);
    const json = await list("--json");
    expect(JSON.parse(json.io.stdout.join("\n")).plugins[0]).toMatchObject({ sourceChanged: null });
  });

  it("writes a folder with a space as one shell word, by its full path", async () => {
    const source = await addWeather("my sources/weather");
    await writeFile(join(source, "backend", "index.js"), "export default { edited: true };\n");

    const { io } = await list();

    expect(io.stdout[1]).toContain(`halonic plugin add "${source}" --update`);
  });
});
