import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import type { QuestionTerminal } from "../../output/question.ts";
import { openPluginService, type PluginSetup } from "../../plugin-host.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { manualClock } from "../../test/manual-clock.ts";
import { pluginCommandWith } from "./command.ts";
import { type GitExporter, type GitSource, gitSourceOf } from "./git-source.ts";

const commit = "3f2c1ab".padEnd(40, "0");

let folder: string;
/** What the fake exporter was asked for, and the folder it wrote to. */
let exports: { source: GitSource; destination: string }[];

const manifest = `id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.weather.example]
  tools:
    - { name: get_forecast, description: The forecast., risk: read, untrusted: true }
`;

/** Writes a valid plugin where git would, without reaching any remote. */
const fakeExporter: GitExporter = async (source, destination) => {
  exports.push({ source, destination });
  await mkdir(join(destination, "backend"), { recursive: true });
  await writeFile(join(destination, "plugin.yaml"), manifest);
  await writeFile(join(destination, "backend", "index.js"), "export default {};\n");
  return { commit, branch: source.commit === undefined ? "main" : undefined };
};

function setupWith(exportGit?: GitExporter): PluginSetup {
  return {
    profile: {
      platform: process.platform === "win32" ? "windows" : "linux",
      homeFolder: folder,
      variables: { HALONIC_HOME: join(folder, "profile") },
    },
    clock: { now: () => new Date("2026-11-12T09:00:00.000Z") },
    ...(exportGit === undefined ? {} : { exportGit }),
  };
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-plugin-add-git-"));
  exports = [];
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

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

async function plugin(args: readonly string[], setup: PluginSetup, terminal?: Terminal) {
  const io = captureIo(folder);
  const code = await runCli(["plugin", ...args], io, [pluginCommandWith(setup)], {
    ...(terminal === undefined ? {} : { terminal }),
  });
  return { code, io };
}

const pluginsFolder = () => join(folder, "profile", "plugins");

/**
 * An `https://` address on example.com with the user `me`, `password` and
 * `path`, put together so no file holds an address with a password. Not
 * through `URL`, which would add a `/` where there is no path.
 */
function withPassword(password: string, path: string): string {
  return ["https://me:", password, "@example.com", path].join("");
}

verifies("cli.commands.plugin.add-git", () => {
  describe("gitSourceOf", () => {
    it.each([
      ["https://github.com/acme/weather", "https://github.com/acme/weather", undefined],
      ["https://github.com/acme/weather@v1.2.0", "https://github.com/acme/weather", "v1.2.0"],
      ["ssh://git@example.com/acme/weather", "ssh://git@example.com/acme/weather", undefined],
      ["ssh://git@example.com/acme/weather@main", "ssh://git@example.com/acme/weather", "main"],
      ["git@example.com:weather", "git@example.com:weather", undefined],
      ["ext::sh -c touch% marker", "ext::sh -c touch% marker", undefined],
    ])("reads %s as a git address", (source, address, at) => {
      expect(gitSourceOf(source)).toEqual({ address, commit: at });
    });

    it.each(["./weather", "weather", "/srv/plugins/weather", "plugins\\weather"])(
      "reads %s as a folder",
      (source) => {
        expect(gitSourceOf(source)).toBeNull();
      },
    );
  });

  it("adds the default branch's latest commit, says which, and keeps the address and full commit", async () => {
    const setup = setupWith(fakeExporter);

    const { code, io } = await plugin(
      ["add", "https://github.com/acme/weather"],
      setup,
      terminalSayingYes(),
    );

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      `! Using commit 3f2c1ab, the latest on main. Add @${commit} to pin it.`,
      "✓ Added Weather 1.2.0. It's on.",
    ]);
    expect(exports.map((each) => each.source)).toEqual([
      { address: "https://github.com/acme/weather", commit: undefined },
    ]);
    expect(await openPluginService(setup).install("weather")).toMatchObject({
      source: { kind: "git", address: "https://github.com/acme/weather", commit },
    });
  });

  it("exports the commit after @, with no line about the latest", async () => {
    const { code, io } = await plugin(
      ["add", "https://github.com/acme/weather@v1.2.0"],
      setupWith(fakeExporter),
      terminalSayingYes(),
    );

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Added Weather 1.2.0. It's on."]);
    expect(exports[0]?.source.commit).toBe("v1.2.0");
  });

  it("deletes the exported copy outside the profile once the plugin is added", async () => {
    await plugin(["add", "https://github.com/acme/weather"], setupWith(fakeExporter));

    const exported = exports[0]?.destination ?? "";
    expect(exported.startsWith(join(folder, "profile"))).toBe(false);
    await expect(access(exported)).rejects.toThrow();
    expect(await readdir(pluginsFolder())).toEqual(["weather"]);
  });

  it.each([
    ["a transport that runs a program", "ext::sh -c touch% marker"],
    ["a local path as file://", "file:///srv/weather.git"],
    ["a commit that is an option", "https://example.com/weather.git@--upload-pack=touch"],
    ["a commit that is a range", "https://example.com/weather.git@main..other"],
  ])("refuses %s before git reaches anything, and writes nothing", async (_name, source) => {
    const { code, io } = await plugin(["add", source], setupWith());

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.join("\n")).toContain("Can't use");
    expect(io.stderr.join("\n")).toContain("Check the folder or git address.");
    await expect(readdir(pluginsFolder())).rejects.toThrow();
  });

  it.each([
    ["with no path", ""],
    ["with a path", "/acme/weather"],
  ])(
    "refuses an address with a password %s and prints the password on no line",
    async (_name, path) => {
      const source = withPassword("hunter2", path);
      const clock = manualClock();
      // Slow enough that a live line started before the export would show.
      const slowExporter: GitExporter = async (exported, destination) => {
        clock.advance(1_500);
        return await fakeExporter(exported, destination);
      };
      const live: string[] = [];
      const terminal: Terminal = {
        ...terminalSayingYes(),
        stderr: { write: (text) => live.push(text), columns: () => 80 },
      };
      const io = captureIo(folder);

      const code = await runCli(
        ["plugin", "add", source],
        io,
        [pluginCommandWith(setupWith(slowExporter))],
        {
          terminal,
          clock,
        },
      );

      for (const line of [...io.stdout, ...io.stderr, ...live]) {
        expect(line).not.toContain("hunter2");
      }
      expect(code).toBe(exitCode.usage);
      expect(exports).toEqual([]);
      expect(io.stderr.join("\n")).toContain("Can't use that git address");
    },
  );
});
