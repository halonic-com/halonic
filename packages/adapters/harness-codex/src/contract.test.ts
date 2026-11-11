import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  addHarnessEnvironment,
  type HarnessBridge,
  type HarnessEvent,
  type SandboxProfile,
} from "@halonicjs/ports";
import { FakeSandboxSession, harnessContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { bridgeToken } from "./app-server-events.test-helper.ts";
import { codexFailing, codexFinishing, MemorySettingsFolder } from "./fake-codex.test-helper.ts";
import { FakeProbe, ran } from "./fake-probe.test-helper.ts";
import { codexHarness } from "./harness.ts";

/** A probe the run cases never ask: they don't call `detect`. */
const unusedProbe = {
  ask: async () => {
    throw new Error("The run cases don't detect Codex");
  },
};

function newHarness() {
  return codexHarness({ probe: unusedProbe, settings: new MemorySettingsFolder() });
}

harnessContract("codex", {
  make: async () => newHarness(),
  finishing: codexFinishing,
  failing: codexFailing,
});

/**
 * A fake `codex app-server` that answers `thread/start` with the thread of
 * a recorded run in `fixtures/`, and after `turn/start` prints what Codex
 * printed in that run, then waits for its input to end.
 */
function codexReplaying(name: string) {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line !== "");
  const printed = lines.filter((line) => "method" in (JSON.parse(line) as object));
  const threadId = /"thread":\{"id":"([^"]+)"/.exec(lines.join("\n"))?.[1];
  return async (io: { readLine(): Promise<string | null>; write(text: string): void }) => {
    for (let line = await io.readLine(); line !== null; line = await io.readLine()) {
      const { id, method } = JSON.parse(line) as { id?: number; method?: string };
      if (id === undefined) continue;
      const result =
        method === "thread/start" ? { thread: { id: threadId } } : { turn: { id: "t" } };
      const replies = method === "turn/start" ? printed : [];
      for (const reply of [JSON.stringify({ id, result }), ...replies]) io.write(`${reply}\n`);
    }
    return 0;
  };
}

verifies("harness-codex.start", () => {
  describe("Codex as a harness", () => {
    it("ends a recorded run with one agent.finished for the task, and leaves bridge calls to the bridge", async () => {
      const bridge: HarnessBridge = { url: "http://127.0.0.1:4100", token: bridgeToken };
      const harness = newHarness();
      const profile: SandboxProfile = {
        workingFolder: "/workspace",
        tempFolder: "/sessions/one/temp",
        settingsFolder: "/agents/coder/settings",
        readOnlyPaths: [],
        deniedPaths: [],
        env: {},
        network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
        timeLimitMs: 60_000,
      };
      const env = addHarnessEnvironment(profile.env, harness.environment?.(bridge, profile) ?? {});
      const session = new FakeSandboxSession({
        profile: { ...profile, env },
        program: codexReplaying("codex-0.166.0-mcp.jsonl"),
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

      const taskFinishes = events.filter(
        (event) => event.type === "agent.finished" && !event.parent,
      );
      expect(taskFinishes).toEqual([events.at(-1)]);
      expect(events.some((event) => event.type === "tool.called")).toBe(true);
      expect(JSON.stringify(events)).not.toContain("mcp__halonic__");
      expect(session.running).toBe(0);
    });
  });
});

verifies("harness-codex.detect", () => {
  describe("codexHarness: detect", () => {
    it("is the codex harness, and finds codex through its probe", async () => {
      const probe = { ask: async () => ({ status: "missing" as const }) };
      const harness = codexHarness({ probe });

      expect([harness.id, harness.name]).toEqual(["codex", "Codex"]);
      expect(await harness.detect()).toEqual({ status: "missing" });
    });

    it("passes the agent's settings folder on to the sign-in check", async () => {
      const probe = new FakeProbe({
        "codex --version": ran(0, "codex-cli 0.167.0"),
        "codex login status": ran(1, "", "Not logged in\n"),
      });
      const harness = codexHarness({ probe });

      await harness.detect({ settingsFolder: "/halonic-data/settings/writer" });
      expect(probe.asked).toContain("CODEX_HOME=/halonic-data/settings/writer codex login status");
    });
  });
});
