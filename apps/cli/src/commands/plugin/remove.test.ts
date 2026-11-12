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

let folder: string;
let setup: PluginSetup;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-plugin-remove-"));
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

const manifest = (id: string, secrets: boolean, name: string) => `id: ${id}
version: 1.2.0
sdk: 1
name: ${name}
backend:
  hosts: [api.weather.example]
${
  secrets
    ? `  secrets:
    weather-key:
      purpose: The forecast service's API key
      hosts: [api.weather.example]
      as: header
      header: x-api-key
`
    : ""
}  tools:
    - { name: get_forecast, description: The forecast., risk: read, untrusted: true }
`;

/**
 * Writes a valid plugin with the id `id` to `sources/<id>` and returns that
 * folder. `name` is the manifest's YAML for it.
 */
async function writeSource(id: string, secrets = true, name = "Weather"): Promise<string> {
  const source = join(folder, "sources", id);
  await mkdir(join(source, "backend"), { recursive: true });
  await writeFile(join(source, "plugin.yaml"), manifest(id, secrets, name));
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

async function plugin(args: readonly string[], terminal?: Terminal) {
  const io = captureIo(folder);
  const code = await runCli(["plugin", ...args], io, [pluginCommandWith(setup)], {
    ...(terminal === undefined ? {} : { terminal }),
  });
  return { code, io };
}

/** Adds the plugin in `sources/<id>` and trusts it. */
async function addTrusted(id: string, secrets = true): Promise<void> {
  const added = await plugin(["add", await writeSource(id, secrets)], terminalTyping("y").terminal);
  expect(added.code).toBe(exitCode.ok);
}

const plugins = async () => (await openPluginService(setup).load()).map((entry) => entry.status);
const pluginsFolder = () => join(folder, "profile", "plugins");

verifies("cli.commands.plugin.remove", () => {
  it("asks first, naming the API key, and on yes removes the plugin and its trust", async () => {
    await addTrusted("weather");
    const { terminal, written } = terminalTyping("y");

    const { code, io } = await plugin(["remove", "weather"], terminal);

    expect(code).toBe(exitCode.ok);
    expect(written()).toBe(
      "Remove Weather? Its settings and the API key you entered are removed from this computer. [y/N] ",
    );
    expect(io.stdout).toEqual(["✓ Removed Weather 1.2.0 and its trust."]);
    expect(await readdir(pluginsFolder())).toEqual([]);
  });

  it("forgets the trust, so adding the same plugin again asks again", async () => {
    await addTrusted("weather");
    await plugin(["remove", "weather", "--yes"]);

    await plugin(["add", join(folder, "sources", "weather")], terminalTyping("n").terminal);

    expect(await plugins()).toEqual(["new"]);
  });

  it("asks the shorter question for a plugin without secrets", async () => {
    await addTrusted("weather", false);
    const { terminal, written } = terminalTyping("y");

    await plugin(["remove", "weather"], terminal);

    expect(written()).toBe("Remove Weather? Its settings are removed from this computer. [y/N] ");
  });

  it("removes nothing and exits 1 on no or Enter", async () => {
    await addTrusted("weather");
    for (const answer of ["n", ""]) {
      const { code, io } = await plugin(["remove", "weather"], terminalTyping(answer).terminal);

      expect(code).toBe(exitCode.failed);
      expect(io.stdout).toEqual(["Not removed. Weather is still added."]);
      expect(await plugins()).toEqual(["trusted"]);
    }
  });

  it("without a terminal and without --yes removes nothing and exits 2", async () => {
    await addTrusted("weather");

    const { code, io } = await plugin(["remove", "weather"]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr).toEqual([
      "✕ Removing Weather deletes its settings and secrets, and there's no terminal to ask you.",
      "  To remove it anyway, pass --yes.",
    ]);
    expect(await plugins()).toEqual(["trusted"]);
  });

  it("removes it with --yes, asking nothing", async () => {
    await addTrusted("weather");
    const { terminal, written } = terminalTyping();

    const { code, io } = await plugin(["remove", "weather", "--yes"], terminal);

    expect(code).toBe(exitCode.ok);
    expect(written()).toBe("");
    expect(io.stdout).toEqual(["✓ Removed Weather 1.2.0 and its trust."]);
  });

  it("names a near id when there's no plugin with exactly that id, and exits 4", async () => {
    await addTrusted("weather");

    const { code, io } = await plugin(["remove", "wether", "--yes"]);

    expect(code).toBe(exitCode.notFound);
    expect(io.stderr).toEqual([
      `✕ There's no plugin called "wether". Did you mean weather?`,
      "  See them with halonic plugin list.",
    ]);
    expect(await plugins()).toEqual(["trusted"]);
  });

  it("removes a plugin that can't be read, by its folder's name", async () => {
    await mkdir(join(pluginsFolder(), "junk"), { recursive: true });

    const { code, io } = await plugin(["remove", "junk", "--yes"]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Removed junk and its trust."]);
    expect(await readdir(pluginsFolder())).toEqual([]);
  });

  it("removes a link in the plugins folder itself, never what it points to", async () => {
    const outside = join(folder, "outside");
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "keep.txt"), "not part of any plugin");
    await mkdir(pluginsFolder(), { recursive: true });
    await symlink(
      outside,
      join(pluginsFolder(), "weather"),
      process.platform === "win32" ? "junction" : "dir",
    );

    const { code } = await plugin(["remove", "weather", "--yes"]);

    expect(code).toBe(exitCode.ok);
    expect(await readdir(pluginsFolder())).toEqual([]);
    expect(await readdir(outside)).toEqual(["keep.txt"]);
  });

  it("escapes a control character in the plugin's name on every line", async () => {
    // YAML's "\e" is the escape character, which would start a terminal sequence.
    const source = await writeSource("weather", true, String.raw`"Wea\e[31mther"`);
    expect((await plugin(["add", source], terminalTyping("y").terminal)).code).toBe(exitCode.ok);
    const shown = String.raw`Wea\u001b[31mther`;

    const asked = terminalTyping("n");
    const no = await plugin(["remove", "weather"], asked.terminal);
    const noTerminal = await plugin(["remove", "weather"]);
    const yes = await plugin(["remove", "weather"], terminalTyping("y").terminal);

    expect(asked.written()).toContain(`Remove ${shown}?`);
    expect(no.io.stdout).toEqual([`Not removed. ${shown} is still added.`]);
    expect(noTerminal.io.stderr[0]).toBe(
      `✕ Removing ${shown} deletes its settings and secrets, and there's no terminal to ask you.`,
    );
    expect(yes.io.stdout).toEqual([`✓ Removed ${shown} 1.2.0 and its trust.`]);
  });

  it("says which plugin to remove when no id is given", async () => {
    const { code, io } = await plugin(["remove"]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe("✕ Say which plugin to remove, by its id.");
  });
});
