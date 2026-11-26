import type { BridgeApprovalDecision, HarnessTask } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { RunBridgeApprovals } from "../run/bridge-approvals.ts";
import { stillOpen } from "./harness-test-kit.test-helper.ts";
import { askedPeople, hedgePorts, pilotCall, runPilotOn } from "./hedge-test-kit.test-helper.ts";

/**
 * Has each harness run that `asks` picks ask its bridge for an OK to run a
 * Halonic tool as it starts, as a bridge does for a tool that needs one.
 * The bridge's approvals are the engine's for the run, as a host serves
 * them; `bridgeAnswers` keeps what the bridge was told.
 */
function bridgeAsksOn(ports: ReturnType<typeof hedgePorts>, asks: (task: HarnessTask) => boolean) {
  const bridgeCalls = new RunBridgeApprovals();
  const bridgeAnswers: Promise<BridgeApprovalDecision>[] = [];
  const start = ports.harness.start.bind(ports.harness);
  ports.harness.start = (task) => {
    const run = start(task);
    if (asks(task)) {
      const request = {
        callId: `bridge-${bridgeAnswers.length + 1}`,
        tool: "send_email",
        args: {},
      };
      const signal = new AbortController().signal;
      bridgeAnswers.push(bridgeCalls.of("run_1").request(request, { signal }));
    }
    return run;
  };
  return { call: { ...pilotCall, bridgeCalls }, bridgeAnswers };
}

const onFallback = (task: HarnessTask) => task.model === "opus";

verifies("engine.harness-early-hedge", () => {
  describe("a Halonic tool the bridge asks an OK for", () => {
    it("stops the attempt as approval-requested, and never reaches the run's approvals", async () => {
      const ports = hedgePorts();
      const people = askedPeople();
      ports.harness.hangs = true;
      const { call, bridgeAnswers } = bridgeAsksOn(ports, (task) => !onFallback(task));

      const { output } = await runPilotOn(ports, { call, approvals: people.approvals });

      expect(people.asked).toEqual([]);
      expect(bridgeAnswers.length).toBeGreaterThan(0);
      for (const answer of await Promise.all(bridgeAnswers)) {
        expect(answer.approved).toBe(false);
      }
      expect(ports.decisions).toContainEqual(
        expect.objectContaining({ kind: "approval-requested", attempt: 1 }),
      );
      expect(ports.decisions.filter(({ kind }) => kind === "failed")).toEqual([]);
      expect(output).toBe("from opus");
      expect(ports.folders.released).toEqual(ports.folders.opened);
      expect(stillOpen(ports.steps)).toBe(0);
    });

    it("goes to the run's approvals from the fallback, which runs as the step itself", async () => {
      const ports = hedgePorts();
      const people = askedPeople();
      ports.harness.error = new Error("The writer crashed.");
      const { call, bridgeAnswers } = bridgeAsksOn(ports, onFallback);

      const { output } = await runPilotOn(ports, { call, approvals: people.approvals });

      expect(output).toBe("from opus");
      expect(await Promise.all(bridgeAnswers)).toEqual([{ approved: true }]);
      expect(people.asked).toEqual(["send_email"]);
    });
  });
});
