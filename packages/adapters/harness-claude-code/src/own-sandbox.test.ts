import type {
  HarnessBridge,
  HarnessRun,
  HarnessTask,
  SandboxFence,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import { FakeSandboxSession } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { claudeFinishing, MemorySettingsFolder } from "./fake-claude.test-helper.ts";
import { claudeCodeHarness } from "./harness.ts";

// Claude Code's own sandbox where Halonic's fence isn't proven, though the
// session starts programs anyway: the defence against an adapter that breaks
// the port's promise to refuse them (requirement `harness-claude-code.command`).
// The `off` and `fenced` cases are in `harness.test.ts`.

/** A probe the run cases never ask: they don't call `detect`. */
const unusedProbe = {
  ask: async () => {
    throw new Error("The run cases don't detect Claude Code");
  },
};

const task: HarnessTask = {
  runId: "run-1",
  hubId: "acme",
  agentId: "writer",
  instructions: "",
  prompt: "Name a colour of the sea.",
};

const bridge: HarnessBridge = {
  url: "http://127.0.0.1:4100",
  token: `made-up-token-${crypto.randomUUID()}`,
};

const engineProfile: SandboxProfile = {
  workingFolder: "/agents/writer/work",
  tempFolder: "/sessions/one/temp",
  settingsFolder: "/agents/writer/settings",
  readOnlyPaths: [],
  deniedPaths: [],
  env: { PATH: "/usr/bin", HOME: "/agents/writer/home" },
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 60_000,
};

const unprovenFences: SandboxFence[] = [
  { state: "not-fenced", reason: "The canary file was readable." },
  { state: "stopped" },
];

function newHarness(ownSandbox: () => Promise<boolean>) {
  return claudeCodeHarness({
    probe: unusedProbe,
    settings: new MemorySettingsFolder(),
    ownSandbox,
  });
}

/** A session that breaks the port: its fence isn't proven, yet it starts Claude Code. */
function unprovenSession(fence: SandboxFence) {
  const inner = new FakeSandboxSession({ profile: engineProfile, program: claudeFinishing });
  const session: SandboxSession = {
    profile: inner.profile,
    fence,
    start: (command) => inner.start(command),
    onBlocked: (listener) => inner.onBlocked(listener),
    close: () => inner.close(),
  };
  return { session, started: inner.started };
}

/** Reads the run to its end; how it ends doesn't matter to these cases. */
async function drain(run: HarnessRun): Promise<void> {
  try {
    for await (const _event of run);
  } catch {
    // The cases check the command Claude Code was started with, not the run's outcome.
  }
}

verifies("harness-claude-code.command", () => {
  describe("claudeCodeHarness: its own sandbox where the fence isn't proven", () => {
    for (const fence of unprovenFences) {
      it(`turns Claude Code's own sandbox on when the fence is ${fence.state}, where it works`, async () => {
        const { session, started } = unprovenSession(fence);
        await drain(newHarness(async () => true).start(task, session, bridge));

        expect(started[0]?.args).toContain("--settings");
      });

      it(`leaves Claude Code's own sandbox off when the fence is ${fence.state}, where it doesn't work`, async () => {
        let asked = 0;
        const harness = newHarness(async () => {
          asked += 1;
          return false;
        });
        const { session, started } = unprovenSession(fence);
        await drain(harness.start(task, session, bridge));

        expect(asked).toBe(1);
        expect(started).toHaveLength(1);
        expect(started[0]?.args).not.toContain("--settings");
      });
    }
  });
});
