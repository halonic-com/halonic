import { KindedError } from "@halonicjs/std";
import { agentCantRunWords, EngineNotAnswering } from "@halonicjs/studio-feature-routines/api";
import { StartRefused } from "@halonicjs/studio-feature-workflows/api";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WindowCantStart } from "../engine/page-refusal.ts";
import { setup, weekly, weeklyFile } from "./workspace-routines.test-helper.ts";

// Run now, apart from the rest of the host so neither file passes the 500-line limit (HAL-15082).
verifies("studio.workspace-routines", () => {
  it("starts the target through the engine, and refuses what can't start", async () => {
    const started: unknown[] = [];
    const { host } = setup({
      engine: {
        start: async (start, trigger) => {
          started.push(["agent" in start ? start.agent.agentId : "", trigger.routineKey]);
          return { id: "run-1" };
        },
      },
    });
    expect(await host.runNow?.(weekly)).toEqual({
      started: true,
      runId: "run-1",
      shortId: "run-1",
    });
    expect(started).toEqual([["analyst", "acme/weekly-report"]]);

    const gone = setup({ engine: { start: async () => ({ id: "x" }) } }, [], {
      "hubs/acme/workflows/routines/lost.routine.yaml": weeklyFile.replace("analyst", "nobody"),
    });
    expect(await gone.host.runNow?.({ hubId: "acme", id: "lost" })).toEqual({
      started: false,
      refusal: { reason: "target-not-found" },
    });
    const untrusted = setup({
      trusted: async () => false,
      engine: { start: async () => ({ id: "x" }) },
    });
    expect(await untrusted.host.runNow?.(weekly)).toEqual({
      started: false,
      refusal: { reason: "not-trusted" },
    });
    expect((await untrusted.host.list())[0]?.pausedUntilTrusted).toBe(true);
  });

  it("says the engine isn't answering when it can't be reached, and has no Run now without one", async () => {
    const down = setup({
      engine: {
        start: async () => {
          throw new KindedError("unavailable", "closed");
        },
      },
    });
    await expect(down.host.runNow?.(weekly)).rejects.toThrow(EngineNotAnswering);
    expect(setup().host.runNow).toBeUndefined();
  });

  it.each([
    [
      "with a step in Studio",
      new WindowCantStart(
        "Analyst runs in Claude Code, which Halonic can't start yet.",
        "Set Analyst to Halonic on its Harness page to run it now.",
      ),
    ],
    // The engine answered, but agent runs aren't built yet (HAL-14647).
    ["while agent runs aren't built", new WindowCantStart(agentCantRunWords.line)],
    [
      "with a terminal command",
      new StartRefused({
        reason: "Analyst uses a connector, which Studio can't start yet.",
        fix: "To start it, run this in a terminal:",
        command: "halonic run reply",
      }),
    ],
  ])("keeps the window's own reason for an agent it can't start, %s", async (_, windowRefusal) => {
    const refused = setup({
      engine: {
        start: async () => {
          throw windowRefusal;
        },
      },
    });
    const refusal = await refused.host.runNow?.(weekly).catch((error: unknown) => error);
    expect(refusal).toBe(windowRefusal);
    expect(refusal).not.toBeInstanceOf(EngineNotAnswering);
  });
});

verifies("studio.start-asks-trust", () => {
  it("passes the window's trust check on to Run now, and has none without it", async () => {
    const askTrust = async () => "trusted" as const;
    expect(await setup({ askTrust }).host.askTrust?.()).toBe("trusted");
    expect(setup().host.askTrust).toBeUndefined();
  });
});
