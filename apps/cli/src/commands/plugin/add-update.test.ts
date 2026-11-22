import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import type { QuestionTerminal } from "../../output/question.ts";
import { openPluginService, type PluginSetup } from "../../plugin-host.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { pluginCommandWith } from "./command.ts";

let folder: string;
let source: string;
let setup: PluginSetup;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-plugin-update-"));
  source = join(folder, "sources", "weather");
  setup = {
    profile: {
      platform: process.platform === "win32" ? "windows" : "linux",
      homeFolder: folder,
      variables: { HALONIC_HOME: join(folder, "profile") },
    },
    clock: { now: () => new Date("2026-11-11T09:00:00.000Z") },
    // In the sandbox, so a backend runs whatever this computer's sandbox says (HAL-15080).
    pluginCodeFence: async () => ({ state: "fenced" }),
  };
});

afterEach(async () => {
  await removeTestFolder(folder);
});

const manifest = (version = "1.2.0") => `id: weather
version: ${version}
sdk: 1
name: Weather
backend:
  hosts: [api.weather.example]
  tools:
    - { name: get_forecast, description: The forecast., risk: read, untrusted: true }
ui:
  settings:
    units: { label: Units, type: text }
`;

/** Writes the weather plugin to `source`, with `code` as its backend. */
async function writeSource(code = "export default {};\n", version?: string): Promise<void> {
  await mkdir(join(source, "backend"), { recursive: true });
  await writeFile(join(source, "plugin.yaml"), manifest(version));
  await writeFile(join(source, "backend", "index.js"), code);
}

/** A terminal on stdin where the user types `answers`. */
function terminalTyping(...answers: string[]): Terminal {
  const questions: QuestionTerminal = {
    write: () => {},
    readLine: async () => answers.shift(),
  };
  return {
    env: { LANG: "en_US.UTF-8", NO_COLOR: "1" },
    platform: "linux",
    stdoutIsTerminal: true,
    stderrIsTerminal: true,
    questions,
  };
}

async function add(args: readonly string[], terminal?: Terminal) {
  const io = captureIo(folder);
  const code = await runCli(["plugin", "add", ...args], io, [pluginCommandWith(setup)], {
    ...(terminal === undefined ? {} : { terminal }),
  });
  return { code, io };
}

/** Adds and trusts the weather plugin from `source`, and saves its setting units. */
async function addTrustedWithSetting(): Promise<void> {
  await writeSource();
  expect((await add([source], terminalTyping("y"))).code).toBe(exitCode.ok);
  const service = openPluginService(setup);
  const [entry] = await service.load();
  if (entry === undefined || entry.status === "broken") throw new Error("weather wasn't added");
  expect((await service.saveSettings(entry.plugin, { units: "metric" })).ok).toBe(true);
}

/** The weather plugin's status and saved settings now. */
async function weather() {
  const service = openPluginService(setup);
  const [entry] = await service.load();
  if (entry === undefined || entry.status === "broken") throw new Error("weather can't be read");
  return { status: entry.status, settings: await service.settings(entry.plugin) };
}

verifies("cli.commands.plugin.add-update", () => {
  it("puts an edited copy in place, asks again and keeps the settings", async () => {
    await addTrustedWithSetting();
    await writeSource("export default { edited: true };\n");

    const { code, io } = await add([source, "--update"], terminalTyping("y"));

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Updated Weather 1.2.0. It's on."]);
    expect(await weather()).toEqual({ status: "trusted", settings: { units: "metric" } });
  });

  it("leaves an edited copy updated but off on No, with its settings", async () => {
    await addTrustedWithSetting();
    await writeSource("export default { edited: true };\n");

    const { code, io } = await add([source, "--update"], terminalTyping("n"));

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stdout.join("\n")).toContain(
      "Weather is updated but off. Nothing from it runs until you trust it: halonic trust --plugin weather",
    );
    expect(await weather()).toEqual({ status: "changed", settings: { units: "metric" } });
  });

  it("says updated but off without a terminal", async () => {
    await addTrustedWithSetting();
    await writeSource("export default { edited: true };\n");

    const { code, io } = await add([source, "--update"]);

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stderr.join("\n")).toContain(
      "Weather is updated but off, because there's no terminal to ask you to trust it.",
    );
  });

  it("asks nothing when the files are the ones trusted, and says it's still on", async () => {
    await addTrustedWithSetting();

    const { code, io } = await add([source, "--update", "--json"]);

    expect(code).toBe(exitCode.ok);
    expect(JSON.parse(io.stdout.join("\n"))).toMatchObject({ status: "on", updated: true });
    const plain = await add([source, "--update"]);
    expect(plain.io.stdout).toEqual([
      "✓ Updated Weather 1.2.0. Its files are the ones you trusted, so it's still on.",
    ]);
  });

  it("adds a plugin that isn't added yet as without --update", async () => {
    await writeSource();

    const { code, io } = await add([source, "--update"], terminalTyping("y"));

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Added Weather 1.2.0. It's on."]);
  });

  it("refuses a copy that can't be checked and keeps the added one", async () => {
    await addTrustedWithSetting();
    await writeSource("export default {};\n", "1.0");

    const { code } = await add([source, "--update"], terminalTyping("y"));

    expect(code).toBe(exitCode.usage);
    expect(await weather()).toEqual({ status: "trusted", settings: { units: "metric" } });
  });
});
