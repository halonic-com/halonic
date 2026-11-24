import { join } from "node:path";
import type {
  CodingToolsServer,
  HarnessBridge,
  HarnessRun,
  HarnessTask,
  SandboxFence,
  SandboxProfile,
} from "@halonicjs/ports";
import { FakeSandboxSession } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { claudeFinishing, MemorySettingsFolder } from "./fake-claude.test-helper.ts";
import { claudeCodeHarness } from "./harness.ts";
import { claudeCodeSettingsFiles, codingToolsSettingsFile } from "./settings.ts";

const unusedProbe = {
  ask: async () => {
    throw new Error("The coding tools cases don't detect Claude Code");
  },
};

const server: CodingToolsServer = {
  program: "/opt/halonic/node",
  args: ["/opt/halonic/cli.js", "coding-tools"],
  codePaths: ["/opt/halonic"],
};

const task: HarnessTask = {
  runId: "run-1",
  hubId: "acme",
  agentId: "writer",
  instructions: "",
  prompt: "Fix the failing test.",
  codingTools: server,
};

const bridge: HarnessBridge = { url: "http://127.0.0.1:4100", token: "made-up-token" };

const profile: SandboxProfile = {
  workingFolder: "/agents/writer/work",
  tempFolder: "/sessions/one/temp",
  settingsFolder: "/agents/writer/settings",
  readOnlyPaths: [],
  deniedPaths: [],
  env: {},
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 600_000,
};

const toolsFile = join(profile.tempFolder, codingToolsSettingsFile);

/** Runs Claude Code to its end in a session with `fence`, and gives what it wrote and started. */
async function runWith(fence: SandboxFence | undefined, runTask: HarnessTask = task) {
  const settings = new MemorySettingsFolder();
  const session = new FakeSandboxSession({ profile, program: claudeFinishing });
  // A fence state the port doesn't know, or none at all, as a broken sandbox might report.
  Object.defineProperty(session, "fence", { get: () => fence });
  const harness = claudeCodeHarness({
    probe: unusedProbe,
    settings,
    ownSandbox: async () => false,
  });
  await drain(harness.start(runTask, session, bridge));
  return { written: settings.files.get(toolsFile), args: session.started[0]?.args ?? [] };
}

async function drain(run: HarnessRun): Promise<void> {
  try {
    for await (const _event of run);
  } catch {
    // A session that isn't fenced refuses to start; the cases read what was written before.
  }
}

verifies("harness-claude-code.coding-tools", () => {
  describe("claudeCodeHarness: coding tools server", () => {
    it("names the server for a fenced run, as a stdio child with all four tools and the step's time limit", async () => {
      const { written, args } = await runWith({ state: "fenced" });

      expect(JSON.parse(written ?? "null")).toEqual({
        mcpServers: {
          "halonic-tools": {
            type: "stdio",
            command: "/opt/halonic/node",
            args: [
              "/opt/halonic/cli.js",
              "coding-tools",
              "--temp-folder",
              profile.tempFolder,
              "--tools",
              "all",
              "--max-test-seconds",
              "600",
            ],
          },
        },
      });
      const config = args.indexOf("--mcp-config");
      expect(args.slice(config + 2, config + 4)).toEqual([toolsFile, "--strict-mcp-config"]);
    });

    it.each<[string, SandboxFence | undefined]>([
      ["off", { state: "off" }],
      ["not fenced", { state: "not-fenced", reason: "A probe got through." }],
      ["stopped", { state: "stopped" }],
      ["unknown", { state: "maybe" } as unknown as SandboxFence],
      ["missing", undefined],
    ])("names no server when the fence state is %s", async (_name, fence) => {
      const { written, args } = await runWith(fence);

      expect(written).toBeUndefined();
      expect(args).not.toContain(toolsFile);
    });

    it("names no server when the host gave none", async () => {
      const { codingTools: _left, ...withoutServer } = task;
      const { written, args } = await runWith({ state: "fenced" }, withoutServer);

      expect(written).toBeUndefined();
      expect(args).not.toContain(toolsFile);
    });
  });

  describe("settings.json: coding tools permissions", () => {
    const permissions = JSON.parse(claudeCodeSettingsFiles()["settings.json"] ?? "{}").permissions;

    it("allows the three read-only tools without asking", () => {
      expect(permissions.allow).toEqual(
        expect.arrayContaining([
          "mcp__halonic-tools__read_ranges",
          "mcp__halonic-tools__search",
          "mcp__halonic-tools__repo_map",
        ]),
      );
    });

    // An `ask` rule wins over every `allow` rule in Claude Code, so neither a
    // settings file nor an "always allow" answer lets run_tests skip the card.
    it("asks for every run_tests call, and allows neither it nor the whole server", () => {
      expect(permissions.ask).toEqual(["mcp__halonic-tools__run_tests"]);
      expect(permissions.allow).not.toContain("mcp__halonic-tools__run_tests");
      expect(permissions.allow).not.toContain("mcp__halonic-tools");
      expect(permissions.allow).not.toContain("mcp__halonic-tools__*");
    });
  });
});
