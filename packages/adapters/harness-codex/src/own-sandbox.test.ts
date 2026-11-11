import type {
  HarnessBridge,
  HarnessEvent,
  HarnessRun,
  HarnessTask,
  SandboxProfile,
} from "@halonicjs/ports";
import { FakeSandboxSession } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { codexFinishing, MemorySettingsFolder } from "./fake-codex.test-helper.ts";
import { codexHarness } from "./harness.ts";

// Codex's own sandbox, by where the run is: on outside Halonic's fence where
// it works, off inside the fence (requirement `harness-codex.config`).

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

/** A probe the run cases never ask: they don't call `detect`. */
const unusedProbe = {
  ask: async () => {
    throw new Error("The run cases don't detect Codex");
  },
};

function newHarness(ownSandbox: () => Promise<boolean> = async () => true) {
  return codexHarness({ probe: unusedProbe, settings: new MemorySettingsFolder(), ownSandbox });
}

/** A session inside the fence, the way the engine opens one. */
function openSession(program: typeof codexFinishing): FakeSandboxSession {
  return new FakeSandboxSession({ profile: engineProfile, program });
}

async function readAll(run: HarnessRun): Promise<{ events: HarnessEvent[]; error?: unknown }> {
  const events: HarnessEvent[] = [];
  try {
    for await (const event of run) events.push(event);
    return { events };
  } catch (error) {
    return { events, error };
  }
}

verifies("harness-codex.config", () => {
  describe("codexHarness: its own sandbox", () => {
    it("turns Codex's own sandbox on outside the fence, where it works", async () => {
      const thisComputer = new FakeSandboxSession({
        profile: engineProfile,
        program: codexFinishing,
        fence: { state: "off" },
      });
      const { events } = await readAll(newHarness().start(task, thisComputer, bridge));

      expect(events.at(-1)).toMatchObject({ type: "agent.finished" });
      expect(thisComputer.started[0]?.args.slice(-2)).toEqual([
        "-c",
        'sandbox_mode="workspace-write"',
      ]);
    });

    it("still starts outside the fence where Codex's own sandbox doesn't work, without it", async () => {
      const thisComputer = new FakeSandboxSession({
        profile: engineProfile,
        program: codexFinishing,
        fence: { state: "off" },
      });
      const harness = newHarness(async () => false);
      const { events } = await readAll(harness.start(task, thisComputer, bridge));

      expect(events.at(-1)).toMatchObject({ type: "agent.finished" });
      expect(thisComputer.started[0]?.args.join(" ")).not.toContain("sandbox_mode");
    });

    it("leaves Codex's own sandbox off inside the fence, without asking", async () => {
      let asked = 0;
      const harness = newHarness(async () => {
        asked += 1;
        return true;
      });
      const session = openSession(codexFinishing);
      await readAll(harness.start(task, session, bridge));

      expect(session.started[0]?.args.join(" ")).not.toContain("sandbox_mode");
      expect(asked).toBe(0);
    });
  });
});
