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
import { codexCodingToolsArgs } from "./config.ts";
import { codexFinishing, MemorySettingsFolder } from "./fake-codex.test-helper.ts";
import { codexHarness } from "./harness.ts";

const unusedProbe = {
  ask: async () => {
    throw new Error("The coding tools cases don't detect Codex");
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
  prompt: "Find where the colour is set.",
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

/** Codex's arguments, in a session with `fence`. */
async function argsWith(fence: SandboxFence | undefined, runTask: HarnessTask = task) {
  const session = new FakeSandboxSession({ profile, program: codexFinishing });
  // A fence state the port doesn't know, or none at all, as a broken sandbox might report.
  Object.defineProperty(session, "fence", { get: () => fence });
  const harness = codexHarness({
    probe: unusedProbe,
    settings: new MemorySettingsFolder(),
    ownSandbox: async () => false,
  });
  await drain(harness.start(runTask, session, bridge));
  return session.started[0]?.args ?? [];
}

async function drain(run: HarnessRun): Promise<void> {
  try {
    for await (const _event of run);
  } catch {
    // A session that isn't fenced refuses to start; the cases read the arguments.
  }
}

/** Whether any argument names the coding tools server. */
function namesServer(args: readonly string[]): boolean {
  return args.some((arg) => arg.includes("halonic-tools"));
}

verifies("harness-codex.coding-tools", () => {
  describe("codexHarness: coding tools server", () => {
    it("names the server for a fenced run, with only the read-only tools", async () => {
      const args = await argsWith({ state: "fenced" });

      expect(args.slice(-4)).toEqual([
        "-c",
        'mcp_servers.halonic-tools.command="/opt/halonic/node"',
        "-c",
        'mcp_servers.halonic-tools.args=["/opt/halonic/cli.js","coding-tools","--temp-folder","/sessions/one/temp","--tools","read-only","--max-test-seconds","600"]',
      ]);
    });

    it.each<[string, SandboxFence | undefined]>([
      ["off", { state: "off" }],
      ["not fenced", { state: "not-fenced", reason: "A probe got through." }],
      ["stopped", { state: "stopped" }],
      ["unknown", { state: "maybe" } as unknown as SandboxFence],
      ["missing", undefined],
    ])("names no server when the fence state is %s", async (_name, fence) => {
      expect(namesServer(await argsWith(fence))).toBe(false);
    });

    it("names no server when the host gave none", async () => {
      const { codingTools: _left, ...withoutServer } = task;
      expect(namesServer(await argsWith({ state: "fenced" }, withoutServer))).toBe(false);
    });
  });

  describe("codexCodingToolsArgs", () => {
    it("writes each argument as a TOML string, so a quote in a path can't end it", () => {
      const [, , , args] = codexCodingToolsArgs({ command: "node", args: ['a"b', "c\\d"] });

      expect(args).toBe('mcp_servers.halonic-tools.args=["a\\"b","c\\\\d"]');
    });
  });
});
