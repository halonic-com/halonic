import type { HarnessEvent } from "@halonicjs/ports";
import { secretRemoved } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { HarnessEventFilter } from "./harness-event-filter.ts";

const bridgeToken = "made-up-run-token-0123456789";

function newFilter(): HarnessEventFilter {
  return new HarnessEventFilter({ agentId: "writer", bridgeToken });
}

const called: HarnessEvent = {
  type: "tool.called",
  agent: "writer",
  tool: "shell",
  args: { command: "ls" },
};
const finished: HarnessEvent = { type: "agent.finished", agent: "writer", output: "Done." };

verifies("harness-kit.event-filter", () => {
  describe("HarnessEventFilter", () => {
    it("removes the bridge token from every string, keys and nested values included", () => {
      const printed: HarnessEvent = {
        type: "tool.result",
        agent: "writer",
        tool: "shell",
        result: `HALONIC_RUN_TOKEN=${bridgeToken}\n`,
        outcome: "ok",
      };
      const args = { [bridgeToken]: [{ env: `token ${bridgeToken}` }] };
      const passed = newFilter().pass([printed, { ...called, args }]);
      expect(JSON.stringify(passed)).not.toContain(bridgeToken);
      expect(passed[0]).toEqual({ ...printed, result: `HALONIC_RUN_TOKEN=${secretRemoved}\n` });
    });

    it("lets the final agent.finished through once, and nothing after it", () => {
      const filter = newFilter();
      expect(filter.pass([called, finished, called])).toEqual([called, finished]);
      expect(filter.finished).toBe(true);
      expect(filter.pass([called, finished])).toEqual([]);
    });

    it("doesn't take a subagent's agent.finished as the final one", () => {
      const filter = newFilter();
      const subagent: HarnessEvent = { ...finished, agent: "Explore", parent: "writer" };
      expect(filter.pass([subagent, called])).toEqual([subagent, called]);
      expect(filter.finished).toBe(false);
    });

    it("makes errors without the bridge token", () => {
      const error = newFilter().error(`It failed: ${bridgeToken}`);
      expect(error.message).toBe(`It failed: ${secretRemoved}`);
    });
  });
});
