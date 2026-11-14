import {
  addHarnessEnvironment,
  type HarnessBridge,
  type HarnessEvent,
  type HarnessRun,
  type HarnessTask,
  type SandboxProfile,
} from "@halonicjs/ports";
import { type FakeProgram, FakeSandboxSession, idleProgram } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  assistantLine,
  claudeFinishing,
  MemorySettingsFolder,
  withExitReason,
  withInputFailingAfterPrompt,
} from "./fake-claude.test-helper.ts";
import { claudeCodeHarness } from "./harness.ts";

const unusedProbe = {
  ask: async () => {
    throw new Error("The run cases don't detect Claude Code");
  },
};

const harness = claudeCodeHarness({
  probe: unusedProbe,
  settings: new MemorySettingsFolder(),
  ownSandbox: async () => true,
});

const task: HarnessTask = {
  runId: "run-1",
  hubId: "acme",
  agentId: "writer",
  instructions: "Answer in one short sentence.",
  prompt: "Name a colour of the sea.",
  model: "claude-sonnet-5-5",
};

const bridge: HarnessBridge = {
  url: "http://127.0.0.1:4100",
  token: `made-up-token-${crypto.randomUUID()}`,
};

const profile: SandboxProfile = {
  workingFolder: "/agents/writer/work",
  tempFolder: "/sessions/one/temp",
  settingsFolder: "/agents/writer/settings",
  readOnlyPaths: [],
  deniedPaths: [],
  env: { PATH: "/usr/bin", HOME: "/agents/writer/home" },
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 60_000,
};

function openSession(program: FakeProgram): FakeSandboxSession {
  const env = addHarnessEnvironment(profile.env, harness.environment?.(bridge, profile) ?? {});
  return new FakeSandboxSession({ profile: { ...profile, env }, program });
}

async function readAll(run: HarnessRun): Promise<{ events: HarnessEvent[]; error?: unknown }> {
  const events: HarnessEvent[] = [];
  try {
    for await (const event of run) events.push(event);
  } catch (error) {
    return { events, error };
  }
  return { events };
}

verifies("harness-claude-code.start", () => {
  describe("claudeCodeHarness: how a run ends", () => {
    it("says Claude Code was stopped when the sandbox stops it before its result", async () => {
      const session = openSession(idleProgram);
      const reading = readAll(harness.start(task, session, bridge));
      await session.whenStarted();
      await session.close();

      const { error } = await reading;

      expect(String(error)).toContain("Claude Code was stopped before it finished");
    });

    it("says Claude Code ran out of time when the sandbox reports a timeout", async () => {
      const session = withExitReason(
        openSession(async () => 0),
        "timeout",
      );

      const { error } = await readAll(harness.start(task, session, bridge));

      expect(String(error)).toContain("Claude Code ran out of time before it finished");
    });

    it("refuses a message once the run has ended", async () => {
      const run = harness.start(task, openSession(claudeFinishing), bridge);
      await readAll(run);

      await expect(run.send({ type: "answer", text: "More." })).rejects.toThrow(
        "The Claude Code run has ended.",
      );
    });

    it("rejects a message with the run-ended error when the live run's input write fails, and the run still ends", async () => {
      const inner = openSession(async (io) => {
        await io.readLine();
        io.write(`${assistantLine("Working.")}\n`);
        // The program waits for a message that never arrives.
        await io.readLine();
        return 1;
      });
      const session = withInputFailingAfterPrompt(inner);
      const run = harness.start(task, session, bridge);
      const reading = readAll(run);
      await inner.whenStarted();

      await expect(run.send({ type: "answer", text: "More." })).rejects.toThrow(
        "The Claude Code run has ended.",
      );
      await run.cancel();

      const { error } = await reading;
      expect(String(error)).toContain("The Claude Code run was cancelled.");
    });

    it("cancels without error once the run has ended", async () => {
      const run = harness.start(task, openSession(claudeFinishing), bridge);
      await readAll(run);

      await expect(run.cancel()).resolves.toBeUndefined();
    });
  });
});
