import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import type { RunnerFence } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import type { QuestionTerminal } from "../../output/question.ts";
import type { PluginSetup } from "../../plugin-host.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { createTrustCommand } from "../trust/command.ts";
import { pluginCommandWith } from "./command.ts";

let folder: string;
let fence: RunnerFence;
let asked: number;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-plugin-off-here-"));
  fence = { state: "not-fenced", reason: "container" };
  asked = 0;
});

afterEach(async () => {
  await removeTestFolder(folder);
});

function setup(): PluginSetup {
  return {
    profile: {
      platform: process.platform === "win32" ? "windows" : "linux",
      homeFolder: folder,
      variables: { HALONIC_HOME: join(folder, "profile") },
    },
    clock: { now: () => new Date("2026-11-21T09:00:00.000Z") },
    pluginCodeFence: async () => {
      asked += 1;
      return fence;
    },
  };
}

/** Weather, with a backend, or Lister, with only a program. Example data only. */
function manifest(backend: boolean): string {
  if (!backend) {
    return `id: lister
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
  }
  return `id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.weather.example]
  tools:
    - { name: get_forecast, description: The forecast., risk: read, untrusted: true }
`;
}

/** Writes a plugin's source folder and returns it. */
async function source(id: string, backend: boolean): Promise<string> {
  const folderOf = join(folder, "sources", id);
  await mkdir(join(folderOf, "backend"), { recursive: true });
  await mkdir(join(folderOf, "tools"), { recursive: true });
  await writeFile(join(folderOf, "tools", "server.js"), "// a program\n");
  await writeFile(join(folderOf, "plugin.yaml"), manifest(backend));
  await writeFile(join(folderOf, "backend", "index.js"), "export default {};\n");
  return folderOf;
}

async function plugin(...args: string[]) {
  return await pluginIn(undefined, ...args);
}

async function pluginIn(terminal: Terminal | undefined, ...args: string[]) {
  const io = captureIo(folder);
  const code = await runCli(["plugin", ...args], io, [pluginCommandWith(setup())], {
    ...(terminal === undefined ? {} : { terminal }),
  });
  return { code, io };
}

async function trust(...args: string[]) {
  const io = captureIo(folder);
  const machine = () => ({
    store: new FileTrustStore(join(folder, "profile", "trust")),
    clock: { now: () => new Date("2026-11-21T09:00:00.000Z") },
    commandSearch: { path: undefined, endings: [] },
  });
  const code = await runCli(["trust", ...args], io, [createTrustCommand(machine, setup())]);
  return { code, io };
}

/** Adds Weather without a terminal, so it is off, and returns its fingerprint. */
async function addOff(): Promise<string> {
  const added = await plugin("add", await source("weather", true));
  return added.io.stdout.at(-1) ?? "";
}

const reasonLines = [
  "  Halonic is running inside a container, and the sandbox can't start there. Run Halonic on the computer itself, not in a container.",
  "  Or allow this in the Halonic desktop app: Settings › Plugins › Weather › Review. The halonic command runs plugin code only in the sandbox.",
];

/** A terminal on stdin where the user types `answers`, keeping what was written to stderr. */
function terminalTyping(...answers: string[]) {
  const written: string[] = [];
  const questions: QuestionTerminal = {
    write: (text) => written.push(text),
    readLine: async () => answers.shift(),
  };
  const terminal: Terminal = {
    env: { LANG: "en_US.UTF-8", NO_COLOR: "1" },
    platform: "linux",
    stdoutIsTerminal: true,
    stderrIsTerminal: true,
    questions,
  };
  return { terminal, written: () => written.join("") };
}

verifies("cli.commands.plugin.off-here", () => {
  it("says a plugin trusted with trust --plugin is off here, why, and where to allow it", async () => {
    const fingerprint = await addOff();

    const first = await trust("--plugin", "weather", "--yes", "--fingerprint", fingerprint);
    const again = await trust("--plugin", "weather");

    expect(first.code).toBe(exitCode.ok);
    expect(first.io.stdout).toEqual([
      "! Weather is trusted, but off on this computer until you allow plugins and integrations to run without the sandbox.",
      ...reasonLines,
    ]);
    expect(again.code).toBe(exitCode.ok);
    expect(again.io.stdout).toEqual([
      "! Weather is already trusted, but off on this computer until you allow plugins and integrations to run without the sandbox.",
      ...reasonLines,
    ]);
  });

  it("says plugin add's trusted plugin is off here, and gives the reason in --json", async () => {
    const fingerprint = await addOff();
    await plugin("remove", "weather", "--yes");
    const folderOf = join(folder, "sources", "weather");

    const added = await plugin("add", folderOf, "--yes", "--fingerprint", fingerprint);
    await plugin("remove", "weather", "--yes");
    const json = await plugin("add", folderOf, "--yes", "--fingerprint", fingerprint, "--json");

    expect(added.code).toBe(exitCode.ok);
    expect(added.io.stdout.slice(-3)).toEqual([
      "! Added Weather 1.2.0. It's trusted, but off on this computer until you allow plugins and integrations to run without the sandbox.",
      ...reasonLines,
    ]);
    expect(JSON.parse(json.io.stdout.join("\n"))).toMatchObject({
      status: "on",
      offOnThisComputer: "container",
    });
  });

  it("lists a plugin that is on but off here with the reason under it", async () => {
    await trust("--plugin", "weather", "--yes", "--fingerprint", await addOff());

    const listed = await plugin("list");
    const json = await plugin("list", "--json");

    expect(listed.io.stdout[0]).toMatch(/^Weather .*! off on this computer$/u);
    expect(listed.io.stdout.slice(1)).toEqual(reasonLines);
    expect(JSON.parse(json.io.stdout.join("\n")).plugins[0]).toMatchObject({
      status: "on",
      offOnThisComputer: "container",
    });
  });

  it("gives the CLI's own fix for a sandbox that isn't set up, never Studio's Settings", async () => {
    fence = { state: "not-fenced", reason: "setup-needed" };
    await trust("--plugin", "weather", "--yes", "--fingerprint", await addOff());

    const listed = await plugin("list");

    expect(listed.io.stdout.slice(1)).toEqual([
      "  The sandbox's one-time setup isn't done for this version of Halonic. Use Halonic inside WSL 2 on this computer.",
      reasonLines[1],
    ]);
    expect(listed.io.stdout.join("\n")).not.toContain("Settings");
  });

  it("says it stays off here, why and where to allow it before asking to trust it", async () => {
    const { terminal, written } = terminalTyping("y");

    const added = await pluginIn(terminal, "add", await source("weather", true));

    expect(added.code).toBe(exitCode.ok);
    const warning =
      "! Trusting Weather won't turn it on here: it stays off on this computer until you allow plugins and integrations to run without the sandbox.";
    // Right above the question, after the check and its fingerprint.
    expect(written()).toContain(
      [warning, ...reasonLines, "", "Trust Weather and turn it on? [y/N] "].join("\n"),
    );
  });

  it("asks without the warning in the sandbox", async () => {
    fence = { state: "fenced" };
    const { terminal, written } = terminalTyping("n");

    await pluginIn(terminal, "add", await source("weather", true));

    expect(written()).toContain("Trust Weather and turn it on?");
    expect(written()).not.toContain("won't turn it on here");
  });

  it("says on as before in the sandbox, and doesn't ask for a plugin without a backend", async () => {
    fence = { state: "fenced" };
    await trust("--plugin", "weather", "--yes", "--fingerprint", await addOff());
    expect((await plugin("list")).io.stdout).toEqual([expect.stringMatching(/✓ on$/u)]);

    fence = { state: "not-fenced", reason: "container" };
    await plugin("remove", "weather", "--yes");
    asked = 0;
    const lister = await source("lister", false);
    const fingerprint = (await plugin("add", lister)).io.stdout.at(-1) ?? "";
    await plugin("remove", "lister", "--yes");
    const added = await plugin("add", lister, "--yes", "--fingerprint", fingerprint);
    expect(added.code).toBe(exitCode.ok);
    expect(added.io.stdout.at(-1)).toBe("✓ Added Lister 1.0.0. It's on.");
    expect(asked).toBe(0);
  });
});
