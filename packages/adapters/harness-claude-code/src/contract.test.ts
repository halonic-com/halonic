import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addHarnessEnvironment, type HarnessBridge, type HarnessEvent } from "@halonicjs/ports";
import { FakeSandboxSession, harnessContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  claudeAnswering,
  claudeFailing,
  claudeFinishing,
  MemorySettingsFolder,
} from "./fake-claude.test-helper.ts";
import { FakeProbe, ran } from "./fake-probe.test-helper.ts";
import { claudeCodeHarness } from "./harness.ts";

/** A probe the run cases never ask: they don't call `detect`. */
const unusedProbe = {
  ask: async () => {
    throw new Error("The run cases don't detect Claude Code");
  },
};

function newHarness() {
  return claudeCodeHarness({ probe: unusedProbe, settings: new MemorySettingsFolder() });
}

harnessContract("claude-code", {
  make: async () => newHarness(),
  finishing: claudeFinishing,
  failing: claudeFailing,
});

/** The lines of a recorded Claude Code run in `fixtures/`. */
function recorded(name: string): string[] {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line !== "");
}

// Claude Code is the first real adapter to pass the harness contract suite,
// so the port's requirement becomes active (build plan A2). This case proves
// it on a recorded run, which calls a tool through the bridge.
verifies("ports.harness-stream", () => {
  describe("Claude Code as a harness", () => {
    it("ends a recorded run with one agent.finished for the task, and leaves bridge calls to the bridge", async () => {
      const bridge: HarnessBridge = { url: "http://127.0.0.1:4100", token: "made-up-token" };
      const harness = newHarness();
      const profile = {
        workingFolder: "/agents/writer/work",
        tempFolder: "/sessions/one/temp",
        settingsFolder: "/agents/writer/settings",
        readOnlyPaths: [],
        deniedPaths: [],
        env: {},
        network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
        timeLimitMs: 60_000,
      };
      const env = addHarnessEnvironment(profile.env, harness.environment?.(bridge, profile) ?? {});
      const session = new FakeSandboxSession({
        profile: { ...profile, env },
        program: claudeAnswering(recorded("claude-code-2.1.321.jsonl")),
      });
      const task = {
        runId: "run-1",
        hubId: "acme",
        agentId: "writer",
        instructions: "",
        prompt: "Hi",
      };

      const events: HarnessEvent[] = [];
      for await (const event of harness.start(task, session, bridge)) events.push(event);

      expect(events.at(-1)).toEqual({
        type: "agent.finished",
        agent: "writer",
        output: "I sent the summary to the team.",
      });
      const taskFinishes = events.filter(
        (event) => event.type === "agent.finished" && !event.parent,
      );
      expect(taskFinishes).toHaveLength(1);
      expect(JSON.stringify(events)).not.toContain("mcp__halonic__");
    });
  });
});

verifies("harness-claude-code.detect", () => {
  describe("claudeCodeHarness: detect", () => {
    it("is the claude-code harness, and finds claude through its probe", async () => {
      const probe = { ask: async () => ({ status: "missing" as const }) };
      const harness = claudeCodeHarness({ probe });

      expect([harness.id, harness.name]).toEqual(["claude-code", "Claude Code"]);
      expect(await harness.detect()).toEqual({ status: "missing" });
    });

    it("passes the agent's settings folder on to the sign-in check", async () => {
      const probe = new FakeProbe({
        "claude --version": ran(0, "2.1.321 (Claude Code)"),
        "claude auth status": ran(1, JSON.stringify({ loggedIn: false })),
      });
      const harness = claudeCodeHarness({ probe });

      await harness.detect({ settingsFolder: "/halonic-data/settings/writer" });
      expect(probe.asked).toContain(
        "CLAUDE_CONFIG_DIR=/halonic-data/settings/writer claude auth status",
      );
    });
  });
});
