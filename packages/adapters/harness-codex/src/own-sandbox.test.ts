import type {
  HarnessBridge,
  HarnessEvent,
  HarnessRun,
  HarnessTask,
  SandboxFence,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import { FakeSandboxSession } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  answer,
  CodexLog,
  codexFinishing,
  fakeCodex,
  MemorySettingsFolder,
} from "./fake-codex.test-helper.ts";
import { codexHarness } from "./harness.ts";

// Codex's own sandbox, by where the run is: on wherever Halonic's fence isn't
// proven, where it works; off inside the proven fence (requirement
// `harness-codex.config`).

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

/**
 * A session that breaks the port: its fence isn't proven, yet it starts
 * Codex. The own sandbox is the defence against such an adapter.
 */
function unprovenSession(fence: SandboxFence) {
  const inner = openSession(codexFinishing);
  const session: SandboxSession = {
    profile: inner.profile,
    fence,
    start: (command) => inner.start(command),
    onBlocked: (listener) => inner.onBlocked(listener),
    close: () => inner.close(),
  };
  return { session, started: inner.started };
}

const unprovenFences: SandboxFence[] = [
  { state: "not-fenced", reason: "The canary file was readable." },
  { state: "stopped" },
];

async function readAll(run: HarnessRun): Promise<{ events: HarnessEvent[]; error?: unknown }> {
  const events: HarnessEvent[] = [];
  try {
    for await (const event of run) events.push(event);
    return { events };
  } catch (error) {
    return { events, error };
  }
}

verifies("harness-codex.start", () => {
  describe("codexHarness: ask mode", () => {
    it("asks before every command in a session with no fence, and sets no policy inside the fence", async () => {
      const log = new CodexLog();
      const program = fakeCodex((codex) => answer(codex, "Teal."), log);
      const policyOf = () => {
        const params = log.requests.find(({ method }) => method === "thread/start")?.params;
        return (params as Record<string, unknown> | undefined)?.["approvalPolicy"];
      };

      const noFence = new FakeSandboxSession({
        profile: engineProfile,
        program,
        fence: { state: "off" },
      });
      await readAll(newHarness().start(task, noFence, bridge));
      expect(policyOf()).toBe("untrusted");

      log.requests.length = 0;
      await readAll(newHarness().start(task, openSession(program), bridge));
      expect(policyOf()).toBeUndefined();
    });
  });
});

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

    for (const fence of unprovenFences) {
      it(`turns Codex's own sandbox on when the fence is ${fence.state}, where it works`, async () => {
        const { session, started } = unprovenSession(fence);
        await readAll(newHarness().start(task, session, bridge));

        expect(started[0]?.args.slice(-2)).toEqual(["-c", 'sandbox_mode="workspace-write"']);
      });

      it(`leaves Codex's own sandbox off when the fence is ${fence.state}, where it doesn't work`, async () => {
        let asked = 0;
        const harness = newHarness(async () => {
          asked += 1;
          return false;
        });
        const { session, started } = unprovenSession(fence);
        await readAll(harness.start(task, session, bridge));

        expect(asked).toBe(1);
        expect(started).toHaveLength(1);
        expect(started[0]?.args.join(" ")).not.toContain("sandbox_mode");
      });
    }

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
