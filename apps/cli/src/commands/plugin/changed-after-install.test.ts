import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import type { QuestionTerminal } from "../../output/question.ts";
import { openPluginService, type PluginSetup } from "../../plugin-host.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { pluginCommandWith } from "./command.ts";

// The attack P3 lists last: a file in the plugins folder changed after the
// plugin was added and trusted, such as by another program. The plugin
// turns off until a person trusts it again (P2's fingerprint); this checks
// it end to end, through the commands a person runs.

let folder: string;
let setup: PluginSetup;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-plugin-changed-"));
  setup = {
    profile: {
      platform: process.platform === "win32" ? "windows" : "linux",
      homeFolder: folder,
      variables: { HALONIC_HOME: join(folder, "profile") },
    },
    clock: { now: () => new Date("2026-11-12T09:00:00.000Z") },
  };
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const manifest = `id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.weather.example]
  tools:
    - { name: get_forecast, description: The forecast., risk: read, untrusted: true }
`;

/** A terminal where the user answers y to every question. */
function terminalSayingYes(): Terminal {
  const questions: QuestionTerminal = { write: () => {}, readLine: async () => "y" };
  return {
    env: { LANG: "en_US.UTF-8", NO_COLOR: "1" },
    platform: "linux",
    stdoutIsTerminal: true,
    stderrIsTerminal: true,
    questions,
  };
}

async function plugin(args: readonly string[], terminal?: Terminal) {
  const io = captureIo(folder);
  const code = await runCli(["plugin", ...args], io, [pluginCommandWith(setup)], {
    ...(terminal === undefined ? {} : { terminal }),
  });
  return { code, io };
}

verifies("cli.commands.plugin.list", () => {
  it("turns a plugin off when a file in its folder changes after it was trusted", async () => {
    const source = join(folder, "sources", "weather");
    await mkdir(join(source, "backend"), { recursive: true });
    await writeFile(join(source, "plugin.yaml"), manifest);
    await writeFile(join(source, "backend", "index.js"), "export default {};\n");
    expect((await plugin(["add", source], terminalSayingYes())).code).toBe(exitCode.ok);
    const service = openPluginService(setup);
    expect(service.tools(await service.load())).toHaveLength(1);

    await writeFile(
      join(folder, "profile", "plugins", "weather", "backend", "index.js"),
      "export default { sneaky: true };\n",
    );

    const { code, io } = await plugin(["list"]);
    expect(code).toBe(exitCode.ok);
    expect(io.stdout.join("\n")).toContain(
      "! changed since you trusted it · halonic trust --plugin weather",
    );
    expect(service.tools(await service.load())).toEqual([]);
  });
});
