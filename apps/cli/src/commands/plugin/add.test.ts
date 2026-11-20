import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withHomeAsTilde } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import type { QuestionTerminal } from "../../output/question.ts";
import { openPluginService, type PluginSetup } from "../../plugin-host.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
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
  await removeTestFolder(folder);
});

const manifest = (id: string, name: string) => `id: ${id}
version: 1.2.0
sdk: 1
name: ${name}
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

/**
 * Writes a valid plugin with the id `id` to `sources/<folderName>` and
 * returns that folder. `name` is the manifest's YAML for it.
 */
async function writeSource(id: string, folderName = id, name = "Weather"): Promise<string> {
  const source = join(folder, "sources", folderName);
  await mkdir(join(source, "backend"), { recursive: true });
  await writeFile(join(source, "plugin.yaml"), manifest(id, name));
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

/** Writes a valid weather plugin into `source`, which may be anywhere. */
async function writePluginAt(source: string): Promise<void> {
  await mkdir(join(source, "backend"), { recursive: true });
  await writeFile(join(source, "plugin.yaml"), manifest("weather", "Weather"));
  await writeFile(join(source, "backend", "index.js"), "export default {};\n");
}

async function add(args: readonly string[], terminal?: Terminal, cwd = folder) {
  const io = captureIo(cwd);
  const code = await runCli(["plugin", "add", ...args], io, [pluginCommandWith(setup)], {
    ...(terminal === undefined ? {} : { terminal }),
  });
  return { code, io };
}

/** The folder as the check shows it: the real home folder is `~`, even when the test folder sits in it. */
function shownFolder(location: string): string {
  const { platform, homeFolder } = nodeProfileEnvironment();
  return withHomeAsTilde(platform, homeFolder, location);
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
    const [entry] = await openPluginService(setup).load();
    const fingerprint = entry?.status === "trusted" ? entry.fingerprint : "";
    expect(fingerprint).toMatch(fullFingerprint);
    expect(written()).toBe(
      [
        "Trust Weather and turn it on?",
        "",
        "Tools for agents",
        "  Agents can use these through a connector. Each one asks a person first unless you change that.",
        "  Reads         get_forecast",
        "  Sends         post_alert",
        "",
        "Secrets",
        "  weather-key   goes only to api.weather.example",
        "",
        "Addresses",
        "  api.weather.example",
        "",
        "Folder",
        `  ${entry?.status === "trusted" ? shownFolder(entry.location) : ""}`,
        "",
        "Files",
        "  backend/index.js",
        "",
        "Plugin code runs apart from the rest of Halonic. Halonic doesn't check what the plugin does with what it's given.",
        "",
        "Fingerprint",
        `  ${fingerprint}`,
        "  Covers the manifest and the files above.",
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
    expect(io.stderr.join("\n")).toContain(
      "✕ That fingerprint doesn't match Weather as it is now.",
    );
    expect(await plugins()).toEqual(["new"]);
  });

  it("refuses a plugin whose name has a control character, and writes nothing", async () => {
    // YAML's "\e" is the escape character, which would start a terminal sequence.
    const source = await writeSource("weather", "weather", String.raw`"Wea\e[31mther"`);

    const { code, io } = await add([source], terminalTyping("y").terminal);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe(
      "✕ Couldn't add the plugin: plugin.yaml 4:7 name: don't use control characters or text-direction marks",
    );
    await expect(readdir(pluginsFolder())).rejects.toThrow();
    expect([...io.stdout, ...io.stderr].join("\n")).not.toContain("\u001b");
  });

  it("names the field of a refused value deep in the manifest", async () => {
    const source = await writeSource("weather");
    // YAML's "\u202E" turns the text after it around; one choice of many holds it.
    const settings = String.raw`  settings:
    units: { label: Units, type: choice, choices: [metric, "imp\u202Eerial"] }
`;
    await writeFile(join(source, "plugin.yaml"), manifest("weather", "Weather") + settings);

    const { code, io } = await add([source], terminalTyping("y").terminal);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe(
      "✕ Couldn't add the plugin: plugin.yaml 20:60 ui.settings.units.choices[1]: don't use control characters or text-direction marks",
    );
    await expect(readdir(pluginsFolder())).rejects.toThrow();
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
    expect(io.stderr.join("\n")).toContain(
      "To add another version, remove it first: halonic plugin remove weather",
    );
    expect(await readdir(pluginsFolder())).toEqual(["weather"]);
  });

  it("says why when the plugins folder is a link, and writes nothing through it", async () => {
    const outside = join(folder, "outside");
    await mkdir(outside);
    await mkdir(join(folder, "profile"));
    await symlink(outside, pluginsFolder(), process.platform === "win32" ? "junction" : "dir");

    const { code, io } = await add([await writeSource("weather")]);

    expect(code).toBe(exitCode.conflict);
    const stderr = io.stderr.join("\n");
    expect(stderr).toContain("is a link; plugins are written only into a plain folder.");
    expect(stderr).toContain("Replace it with a plain folder, then try again.");
    expect(stderr).not.toContain("can't explain yet");
    expect(await readdir(outside)).toEqual([]);
  });

  it("says why when the plugins folder is a file, and leaves the file", async () => {
    await mkdir(join(folder, "profile"));
    await writeFile(pluginsFolder(), "a file, not a folder");

    const { code, io } = await add([await writeSource("weather")]);

    expect(code).toBe(exitCode.conflict);
    const stderr = io.stderr.join("\n");
    expect(stderr).toContain("isn't a folder; plugins are written only into a plain folder.");
    expect(stderr).not.toContain("can't explain yet");
    expect(await readFile(pluginsFolder(), "utf8")).toBe("a file, not a folder");
  });

  it("leaves private folders out of the copy and says so in one line ahead of the check", async () => {
    const source = await writeSource("weather");
    await mkdir(join(source, ".ssh"));
    await writeFile(join(source, ".ssh", "id_ed25519"), "fake key\n");
    await mkdir(join(source, ".aws"));
    await writeFile(join(source, ".aws", "credentials"), "fake key\n");

    const { io } = await add([source]);

    const printed = [...io.stdout, ...io.stderr];
    expect(printed.filter((line) => line.includes("Not copied"))).toEqual([
      "! Not copied, because they're private: .aws, .ssh",
    ]);
    expect(printed.join("\n")).not.toContain("id_ed25519");
    expect(await readdir(join(pluginsFolder(), "weather"))).toEqual(["backend", "plugin.yaml"]);
  });

  it("names the plugin's folder by its id, not by the source folder's name", async () => {
    await add([await writeSource("weather", "Weather-Plugin")]);

    expect(await readdir(pluginsFolder())).toEqual(["weather"]);
  });

  it("refuses a path that isn't there", async () => {
    const { code, io } = await add(["./nowhere"]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr).toEqual([
      "✕ Couldn't add the plugin: there's no folder ./nowhere.",
      "  Check the folder or git address.",
    ]);
  });

  it("refuses a path that is a file", async () => {
    await writeFile(join(folder, "plugin.yaml"), "id: weather\n");

    const { code, io } = await add([join(folder, "plugin.yaml")]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.join("\n")).toContain("plugin.yaml isn't a folder.");
  });

  it("names the field of a manifest problem", async () => {
    const source = await writeSource("weather");
    const text = manifest("weather", "Weather").replace("risk: read", "risk: reed");
    await writeFile(join(source, "plugin.yaml"), text);

    const { code, io } = await add([source]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toMatch(
      /^✕ Couldn't add the plugin: plugin\.yaml 14:63 backend\.tools\[0\]\.risk: /u,
    );
    await expect(readdir(pluginsFolder())).rejects.toThrow();
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

  it.each([
    ["is the profile", () => join(folder, "profile")],
    ["holds the profile", () => folder],
    ["is inside the profile", () => join(folder, "profile", "stash")],
  ])("refuses a folder that %s, and copies nothing", async (_, source) => {
    await mkdir(join(folder, "profile", "trust"), { recursive: true });
    await writeFile(join(folder, "profile", "trust", "a.json"), "{}");
    await writePluginAt(source());

    const { code, io } = await add([source()]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe(
      "✕ Couldn't add the plugin: a plugin can't be added from Halonic's own data, or from a folder that holds it.",
    );
    await expect(readdir(pluginsFolder())).rejects.toThrow();
  });

  it("refuses a link into the profile, and copies nothing", async () => {
    await writePluginAt(join(folder, "profile", "stash"));
    const link = join(folder, "sources", "weather");
    await mkdir(join(folder, "sources"), { recursive: true });
    await symlink(join(folder, "profile", "stash"), link, "junction");

    const { code } = await add([link]);

    expect(code).toBe(exitCode.usage);
    await expect(readdir(pluginsFolder())).rejects.toThrow();
  });

  it.each([
    ["is the workspace's data", (workspace: string) => join(workspace, ".studio")],
    ["holds the workspace's data", (workspace: string) => workspace],
    ["is inside the workspace's data", (workspace: string) => join(workspace, ".studio", "x")],
  ])("refuses a folder that %s, and copies nothing", async (_, source) => {
    const workspace = join(folder, "work");
    await mkdir(join(workspace, ".studio"), { recursive: true });
    await writeFile(join(workspace, ".studio", "state.json"), "{}");
    await writePluginAt(source(workspace));

    const { code } = await add([source(workspace)], undefined, workspace);

    expect(code).toBe(exitCode.usage);
    await expect(readdir(pluginsFolder())).rejects.toThrow();
  });

  it("points at a plugin.yaml one folder down", async () => {
    const outer = join(folder, "sources", "outer");
    await mkdir(outer, { recursive: true });
    await writeSource("weather", join("outer", "weather"));

    const { code, io } = await add([outer]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr).toEqual([
      "✕ Couldn't add the plugin: the plugin folder has no plugin.yaml (or integration.yaml), so it isn't a plugin.",
      "  There's a plugin.yaml in weather/. Did you mean that folder?",
    ]);
    await expect(readdir(pluginsFolder())).rejects.toThrow();
  });

  it("says where in plugin.yaml a value is wrong, and that plugin.yaml is the fix", async () => {
    const source = await writeSource("weather");
    const text = await readFile(join(source, "plugin.yaml"), "utf8");
    await writeFile(join(source, "plugin.yaml"), text.replace("version: 1.2.0", "version: 1.2"));

    const { code, io } = await add([source]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr).toEqual([
      `✕ Couldn't add the plugin: plugin.yaml 2:10 version is a number here; write it in quotes, with three numbers, such as "1.0.0".`,
      "  Fix plugin.yaml, then run halonic plugin add again.",
    ]);
    await expect(readdir(pluginsFolder())).rejects.toThrow();
  });

  it("points at a tool name with a space, not at the command that uses it", async () => {
    const source = await writeSource("weather");
    const text = await readFile(join(source, "plugin.yaml"), "utf8");
    await writeFile(
      join(source, "plugin.yaml"),
      text.replace("{ name: get_forecast,", "{ name: get forecast,"),
    );

    const { code, io } = await add([source]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe(
      `✕ Couldn't add the plugin: plugin.yaml 14:15 backend.tools[0].name: the tool name "get forecast" has a space; use one word, such as get-forecast`,
    );
  });

  it("refuses a plugin for a newer SDK, saying what to do, and adds one for this SDK", async () => {
    const source = await writeSource("weather");
    const text = await readFile(join(source, "plugin.yaml"), "utf8");
    await writeFile(join(source, "plugin.yaml"), text.replace("sdk: 1", "sdk: 3"));

    const { code, io } = await add([source]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr).toEqual([
      "✕ Couldn't add the plugin: plugin.yaml sdk: This plugin needs a newer version of Halonic: it is built for plugin SDK 3, and this Halonic runs SDK 2. Update Halonic, or get a version of the plugin built for SDK 2 or older.",
    ]);
    await writeFile(join(source, "plugin.yaml"), text.replace("sdk: 1", "sdk: 2"));
    expect((await add([source])).code).toBe(exitCode.notTrusted);
    expect(await plugins()).toEqual(["new"]);
  });
});
