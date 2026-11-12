import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import type { QuestionTerminal } from "../../output/question.ts";
import { openPluginService, type PluginSetup } from "../../plugin-host.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { pluginCommandWith } from "../plugin/command.ts";
import { createTrustCommand } from "./command.ts";

const fullFingerprint = /^hpf1:[0-9a-f]{64}$/u;

let folder: string;
let setup: PluginSetup;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-trust-plugin-"));
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

const manifest = `id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.weather.example]
  tools:
    - { name: get_forecast, description: The forecast., risk: read, untrusted: true }
`;

/** Adds Weather to the profile without a terminal, so it is off, and returns its fingerprint. */
async function addWeatherOff(): Promise<string> {
  const source = join(folder, "sources", "weather");
  await mkdir(join(source, "backend"), { recursive: true });
  await writeFile(join(source, "plugin.yaml"), manifest);
  await writeFile(join(source, "backend", "index.js"), "export default {};\n");
  const io = captureIo(folder);
  await runCli(["plugin", "add", source], io, [pluginCommandWith(setup)]);
  return io.stdout.at(-1) ?? "";
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

async function trust(args: readonly string[], terminal?: Terminal) {
  const io = captureIo(folder);
  const machine = () => ({
    store: new FileTrustStore(join(folder, "profile", "trust")),
    clock: { now: () => new Date("2026-11-11T09:00:00.000Z") },
    commandSearch: { path: undefined, endings: [] },
  });
  const code = await runCli(["trust", ...args], io, [createTrustCommand(machine, setup)], {
    ...(terminal === undefined ? {} : { terminal }),
  });
  return { code, io };
}

/** Weather's folder in the profile, once it is added. */
const weatherFolder = () => join(folder, "profile", "plugins", "weather");

const plugins = async () => (await openPluginService(setup).load()).map((entry) => entry.status);

verifies("cli.commands.trust.plugin", () => {
  it("shows the plugin's check, asks, and turns it on with yes", async () => {
    await addWeatherOff();
    const { terminal, written } = terminalTyping("y");

    const { code, io } = await trust(["--plugin", "weather"], terminal);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Weather is on now."]);
    expect(written()).toContain("Tools for agents\n  Reads         get_forecast");
    expect(written().endsWith("Trust Weather and turn it on? [y/N] ")).toBe(true);
    expect(await plugins()).toEqual(["trusted"]);
  });

  it("leaves it off and exits 3 on no", async () => {
    await addWeatherOff();
    const { terminal } = terminalTyping("n");

    const { code, io } = await trust(["--plugin", "weather"], terminal);

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stdout).toEqual(["! Weather is still off. Nothing from it runs until you trust it."]);
    expect(await plugins()).toEqual(["new"]);
  });

  it("without a terminal leaves it off, with the check on stderr and the bare fingerprint last on stdout", async () => {
    const added = await addWeatherOff();

    const { code, io } = await trust(["--plugin", "weather"]);

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stderr[0]).toBe("Trust Weather and turn it on?");
    expect(io.stderr.slice(-2)).toEqual([
      "! Weather is off, because there's no terminal to ask you to trust it.",
      "  Review it with halonic trust --plugin weather, then pass --yes --fingerprint <fingerprint>.",
    ]);
    expect(io.stdout).toEqual([added]);
    expect(added).toMatch(fullFingerprint);
    expect(await plugins()).toEqual(["new"]);
  });

  it("turns it on with --yes and its fingerprint, asking nothing, then says it's already on", async () => {
    const fingerprint = await addWeatherOff();
    const { terminal, written } = terminalTyping();

    const first = await trust(
      ["--plugin", "weather", "--yes", "--fingerprint", fingerprint],
      terminal,
    );
    const again = await trust(["--plugin", "weather"], terminal);

    expect(first.code).toBe(exitCode.ok);
    expect(first.io.stdout).toEqual(["✓ Weather is on now."]);
    expect(written()).toBe("");
    expect(again.code).toBe(exitCode.ok);
    expect(again.io.stdout).toEqual(["✓ Weather is already on. Nothing changed since 11 Nov."]);
  });

  it("leaves it off and exits 3 when the --fingerprint isn't the current one", async () => {
    await addWeatherOff();

    const { code, io } = await trust([
      "--plugin",
      "weather",
      "--yes",
      "--fingerprint",
      `hpf1:${"0".repeat(64)}`,
    ]);

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stderr.join("\n")).toContain("it changed since that fingerprint was made.");
    expect(await plugins()).toEqual(["new"]);
  });

  it("refuses --yes without --fingerprint, and --plugin with --dir, as wrong usage", async () => {
    await addWeatherOff();

    const yesAlone = await trust(["--plugin", "weather", "--yes"]);
    const withDir = await trust(["--plugin", "weather", "--dir", "."]);

    expect(yesAlone.code).toBe(exitCode.usage);
    expect(yesAlone.io.stderr.join("\n")).toContain("--yes needs --fingerprint");
    expect(withDir.code).toBe(exitCode.usage);
    expect(withDir.io.stderr.join("\n")).toContain("--plugin can't go with --dir.");
    expect(await plugins()).toEqual(["new"]);
  });

  it("names the nearest plugin for an id that isn't added", async () => {
    await addWeatherOff();

    const { code, io } = await trust(["--plugin", "wether"]);

    expect(code).toBe(exitCode.notFound);
    expect(io.stderr.join("\n")).toContain(
      `✕ Couldn't trust wether: there's no plugin called "wether". Did you mean weather?`,
    );
    expect(io.stderr.join("\n")).toContain("See them with halonic plugin list.");
  });

  it("turns it off again with --remove", async () => {
    const fingerprint = await addWeatherOff();
    await trust(["--plugin", "weather", "--yes", "--fingerprint", fingerprint]);

    const { code, io } = await trust(["--plugin", "weather", "--remove"]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "✓ Removed trust for Weather. Nothing from this plugin runs until you trust it.",
    ]);
    expect(await plugins()).toEqual(["new"]);
  });

  it("leaves it off and exits 3 on Enter, the empty answer", async () => {
    await addWeatherOff();
    const { terminal } = terminalTyping("");

    const { code, io } = await trust(["--plugin", "weather"], terminal);

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stdout).toEqual(["! Weather is still off. Nothing from it runs until you trust it."]);
    expect(await plugins()).toEqual(["new"]);
  });

  it("asks nothing with CI set, even in a terminal, and leaves it off with the fingerprint last", async () => {
    const added = await addWeatherOff();
    const { terminal, written } = terminalTyping("y");
    const inCi = { ...terminal, env: { ...terminal.env, CI: "true" } };

    const { code, io } = await trust(["--plugin", "weather"], inCi);

    expect(code).toBe(exitCode.notTrusted);
    expect(written()).toBe("");
    expect(io.stderr.join("\n")).toContain("there's no terminal to ask you to trust it.");
    expect(io.stdout).toEqual([added]);
    expect(await plugins()).toEqual(["new"]);
  });

  it("trusts nothing when the files change during the question, and gives their fingerprint now", async () => {
    const shown = await addWeatherOff();
    const terminal: Terminal = {
      ...terminalTyping().terminal,
      questions: {
        write: () => undefined,
        readLine: async () => {
          await writeFile(join(weatherFolder(), "backend", "index.js"), "export default 1;\n");
          return "y";
        },
      },
    };

    const { code, io } = await trust(["--plugin", "weather"], terminal);

    const [now] = await openPluginService(setup).load();
    const current = now?.status === "new" ? now.fingerprint : "";
    expect(code).toBe(exitCode.notTrusted);
    expect(io.stderr.join("\n")).toContain("it changed since that fingerprint was made.");
    expect(current).toMatch(fullFingerprint);
    expect(current).not.toBe(shown);
    expect(io.stdout.at(-1)).toBe(current);
  });

  it("trusts nothing when the files break during the question, and says it can't be read", async () => {
    await addWeatherOff();
    const terminal: Terminal = {
      ...terminalTyping().terminal,
      questions: {
        write: () => undefined,
        readLine: async () => {
          await writeFile(join(weatherFolder(), "plugin.yaml"), "id: [weather\n");
          return "y";
        },
      },
    };

    const { code, io } = await trust(["--plugin", "weather"], terminal);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.join("\n")).toContain("See them with halonic plugin list.");
    expect(io.stdout.some((line) => fullFingerprint.test(line))).toBe(false);
    expect(await plugins()).toEqual(["broken"]);
  });

  it("exits 3 for a --fingerprint that isn't the current one, also when it's already on", async () => {
    const fingerprint = await addWeatherOff();
    await trust(["--plugin", "weather", "--yes", "--fingerprint", fingerprint]);

    const { code, io } = await trust([
      "--plugin",
      "weather",
      "--yes",
      "--fingerprint",
      `hpf1:${"0".repeat(64)}`,
    ]);

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stderr.join("\n")).toContain("it changed since that fingerprint was made.");
    expect(io.stdout.at(-1)).toBe(fingerprint);
    expect(await plugins()).toEqual(["trusted"]);
  });

  it("refuses a plugin that can't be read or checked, and trusts nothing", async () => {
    await addWeatherOff();
    await writeFile(join(weatherFolder(), "plugin.yaml"), "id: [weather\n");

    const { code, io } = await trust(["--plugin", "weather"]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.join("\n")).toContain("See them with halonic plugin list.");
    expect(await plugins()).toEqual(["broken"]);
  });

  it("refuses --plugin with --list as wrong usage", async () => {
    await addWeatherOff();

    const { code, io } = await trust(["--plugin", "weather", "--list"]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.join("\n")).toContain("--plugin can't go with --list.");
  });

  it("ignores --yes with --remove, as workspace trust does", async () => {
    const fingerprint = await addWeatherOff();
    await trust(["--plugin", "weather", "--yes", "--fingerprint", fingerprint]);

    const { code } = await trust(["--plugin", "weather", "--remove", "--yes"]);

    expect(code).toBe(exitCode.ok);
    expect(await plugins()).toEqual(["new"]);
  });

  it("names no plugin for --remove on an id that isn't added", async () => {
    await addWeatherOff();

    const { code, io } = await trust(["--plugin", "nothing-here", "--remove"]);

    expect(code).toBe(exitCode.notFound);
    expect(io.stderr.join("\n")).toContain(`there's no plugin called "nothing-here".`);
    expect(await plugins()).toEqual(["new"]);
  });
});
