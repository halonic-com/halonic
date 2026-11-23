import { appendFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import type { PluginSetup } from "../../plugin-host.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { pluginCommandWith } from "./command.ts";

let folder: string;
let setup: PluginSetup;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-plugin-record-damaged-"));
  setup = {
    profile: {
      platform: process.platform === "win32" ? "windows" : "linux",
      homeFolder: folder,
      variables: { HALONIC_HOME: join(folder, "profile") },
    },
    clock: { now: () => new Date("2026-11-22T09:00:00.000Z") },
  };
});

afterEach(async () => {
  await removeTestFolder(folder);
});

async function plugin(args: readonly string[]) {
  const io = captureIo(folder);
  const code = await runCli(["plugin", ...args], io, [pluginCommandWith(setup)]);
  return { code, io };
}

/** Adds a plugin `weather` without trusting it; adding keeps where it came from in a record file. */
async function addWeather(): Promise<void> {
  const source = join(folder, "sources", "weather");
  await mkdir(join(source, "backend"), { recursive: true });
  await writeFile(
    join(source, "plugin.yaml"),
    `id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.weather.example]
  tools:
    - { name: get_forecast, description: The forecast., risk: read, untrusted: true }
`,
  );
  await writeFile(join(source, "backend", "index.js"), "export default {};\n");
  await plugin(["add", source]);
}

/** The one record file adding a plugin writes: the plugins' sources. */
async function recordFile(): Promise<string> {
  const records = join(folder, "profile", "plugin-records");
  const files = (await readdir(records)).filter((name) => name.endsWith(".jsonl"));
  expect(files).toHaveLength(1);
  return join(records, files[0] ?? "");
}

verifies("cli.plugin-record-unreadable", () => {
  it("names a damaged record file, its line and the fix in plugin list and plugin remove", async () => {
    await addWeather();
    const file = await recordFile();
    await appendFile(file, "not a record\n");

    const list = await plugin(["list"]);
    const remove = await plugin(["remove", "weather", "--yes"]);

    const why = `the plugin record file ${file} is damaged at line 2: it is not JSON.`;
    const fix =
      "Delete line 2 from it, or delete the file, then run again. Deleting the file forgets where each plugin was added from; the plugins stay.";
    expect(list.code).toBe(exitCode.unavailable);
    expect(list.io.stderr.join("\n")).toContain(`✕ Couldn't list the plugins: ${why}\n  ${fix}`);
    expect(remove.code).toBe(exitCode.unavailable);
    expect(remove.io.stderr.join("\n")).toContain(`✕ Couldn't remove the plugin: ${why}\n  ${fix}`);
    expect(`${list.io.stderr.join("\n")}${remove.io.stderr.join("\n")}`).not.toContain("report it");
  });

  it("removes the plugin once the damaged file is deleted, as the fix says", async () => {
    await addWeather();
    const file = await recordFile();
    await appendFile(file, "not a record\n");
    await rm(file);

    const remove = await plugin(["remove", "weather", "--yes"]);

    expect(remove.code).toBe(exitCode.ok);
    expect(await readdir(join(folder, "profile", "plugins"))).toEqual([]);
  });
});
