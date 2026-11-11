import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
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

const fullFingerprint = /^hpf1:[0-9a-f]{64}$/u;

let folder: string;
let setup: PluginSetup;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-plugin-add-"));
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

const manifest = (id: string) => `id: ${id}
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.weather.example]
  secrets:
    weather-key:
      purpose: The forecast service's API key
      hosts: [api.weather.example]
      as: header
      header: x-api-key
  tools:
    - { name: get_forecast, description: The forecast., risk: read, untrusted: true }
    - { name: post_alert, description: Posts an alert., risk: send, untrusted: false, noun: { one: alert, many: alerts } }
ui:
  commands:
    - { id: forecast, title: Show the forecast, tool: get_forecast }
`;

/** Writes a valid plugin with the id `id` to `sources/<folderName>` and returns that folder. */
async function writeSource(id: string, folderName = id): Promise<string> {
  const source = join(folder, "sources", folderName);
  await mkdir(join(source, "backend"), { recursive: true });
  await writeFile(join(source, "plugin.yaml"), manifest(id));
  await writeFile(join(source, "backend", "index.js"), "export default {};\n");
  return source;
}

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

async function add(args: readonly string[], terminal?: Terminal) {
  const io = captureIo(folder);
  const code = await runCli(["plugin", "add", ...args], io, [pluginCommandWith(setup)], {
    ...(terminal === undefined ? {} : { terminal }),
  });
  return { code, io };
}

const plugins = async () => (await openPluginService(setup).load()).map((entry) => entry.status);
const pluginsFolder = () => join(folder, "profile", "plugins");

verifies("cli.commands.plugin.add", () => {
  it("shows Studio's sections in Studio's order without In Studio, asks, and trusts the copy on yes", async () => {
    const source = await writeSource("weather");
    const { terminal, written } = terminalTyping("y");

    const { code, io } = await add([source], terminal);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Added Weather 1.2.0. It's on."]);
    expect(written()).toBe(
      [
        "Trust Weather and turn it on?",
        "",
        "Tools for agents",
        "  Reads         get_forecast",
        "  Sends         post_alert · asks a person first",
        "",
        "Secrets",
        "  weather-key   goes only to api.weather.example",
        "",
        "Addresses",
        "  api.weather.example",
        "",
        "Plugin code runs apart from the rest of Halonic. Halonic doesn't check what the plugin does with what it's given.",
        "",
        "Trust Weather and turn it on? [y/N] ",
      ].join("\n"),
    );
    expect(await plugins()).toEqual(["trusted"]);
  });

  it("leaves the plugin added but off and exits 3 on no or Enter", async () => {
    for (const answer of ["n", ""]) {
      await rm(pluginsFolder(), { recursive: true, force: true });
      const source = await writeSource("weather");
      const { terminal } = terminalTyping(answer);

      const { code, io } = await add([source], terminal);

      expect(code).toBe(exitCode.notTrusted);
      expect(io.stdout).toEqual([
        "! Weather is added but off. Nothing from it runs until you trust it: halonic trust --plugin weather",
      ]);
      expect(await plugins()).toEqual(["new"]);
    }
  });

  it("without a terminal adds it off, with the check on stderr and the bare fingerprint last on stdout", async () => {
    const source = await writeSource("weather");

    const { code, io } = await add([source]);

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stderr[0]).toBe("Trust Weather and turn it on?");
    expect(io.stderr.slice(-2)).toEqual([
      "! Weather is added but off, because there's no terminal to ask you to trust it.",
      "  Review it with halonic trust --plugin weather, then pass --yes --fingerprint <fingerprint>.",
    ]);
    expect(io.stdout).toHaveLength(1);
    expect(io.stdout[0]).toMatch(fullFingerprint);
    expect(await plugins()).toEqual(["new"]);
  });

  it("trusts with --yes and the fingerprint of what was copied, asking nothing", async () => {
    const source = await writeSource("weather");
    const first = await add([source]);
    const fingerprint = first.io.stdout[0] ?? "";
    await rm(pluginsFolder(), { recursive: true, force: true });
    const { terminal, written } = terminalTyping();

    const { code, io } = await add([source, "--yes", "--fingerprint", fingerprint], terminal);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Added Weather 1.2.0. It's on."]);
    expect(written()).toBe("");
    expect(await plugins()).toEqual(["trusted"]);
  });

  it("leaves it added but off, and exits 3, when the --fingerprint isn't the copy's", async () => {
    const source = await writeSource("weather");

    const { code, io } = await add([source, "--yes", "--fingerprint", `hpf1:${"0".repeat(64)}`]);

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stderr.join("\n")).toContain("it changed since that fingerprint was made.");
    expect(await plugins()).toEqual(["new"]);
  });

  it("refuses --yes without --fingerprint before copying anything", async () => {
    const source = await writeSource("weather");

    const { code, io } = await add([source, "--yes"]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.join("\n")).toContain("--yes needs --fingerprint");
    await expect(readdir(pluginsFolder())).rejects.toThrow();
  });

  it("refuses an id that is already added and writes nothing more", async () => {
    await add([await writeSource("weather")]);
    const other = await writeSource("weather", "other");

    const { code, io } = await add([other]);

    expect(code).toBe(exitCode.conflict);
    expect(io.stderr.join("\n")).toContain("weather is already added.");
    expect(await readdir(pluginsFolder())).toEqual(["weather"]);
  });

  it("names the plugin's folder by its id, not by the source folder's name", async () => {
    await add([await writeSource("weather", "Weather-Plugin")]);

    expect(await readdir(pluginsFolder())).toEqual(["weather"]);
  });

  it("refuses a path that isn't a folder", async () => {
    const { code, io } = await add([join(folder, "nowhere")]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.join("\n")).toContain("isn't a folder");
    expect(io.stderr.join("\n")).toContain("Check the folder or git address.");
  });

  it("refuses a link inside the folder that points outside it, and writes nothing", async () => {
    const source = await writeSource("weather");
    await writeFile(join(folder, "outside.txt"), "not part of the plugin");
    await symlink(join(folder, "outside.txt"), join(source, "notes.txt"));

    const { code, io } = await add([source]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.join("\n")).toContain("Check the folder or git address.");
    await expect(readdir(pluginsFolder())).rejects.toThrow();
  });

  it("refuses a folder without a manifest, and writes nothing", async () => {
    const source = join(folder, "sources", "empty");
    await mkdir(source, { recursive: true });

    const { code } = await add([source]);

    expect(code).toBe(exitCode.usage);
    await expect(readdir(pluginsFolder())).rejects.toThrow();
  });
});
