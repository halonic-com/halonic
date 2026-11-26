import type { BridgeApprovalDecision, HarnessRun } from "@halonicjs/ports";
import { earlyHedgeConfig } from "@halonicjs/retry-detectors";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { RunBridgeApprovals } from "../run/bridge-approvals.ts";
import { startLimits } from "./harness-test-kit.test-helper.ts";
import { askedPeople, hedgePorts, pilotCall, runPilotOn } from "./hedge-test-kit.test-helper.ts";

/**
 * Pilot ports whose first attempt hangs until its first checkpoint, which
 * starts the second next to it: every score spawns a successor and none
 * stops the attempt, and each reading of the clock moves it 4 minutes on.
 */
function twoAttemptsAtOnce() {
  const ports = hedgePorts();
  ports.harness.hangs = true;
  let ms = Date.parse("2026-11-26T09:00:00.000Z");
  ports.options = {
    ...ports.options,
    earlyHedge: {
      ...ports.options.earlyHedge,
      config: earlyHedgeConfig({ enabled: true, spawnAbove: 0, stopAbove: 1 }),
      now: () => (ms += 240_000),
    },
  };
  return ports;
}

/**
 * Has the bridge of the second attempt ask for an OK to run a Halonic tool
 * as it starts, by the attempt id its bridge was opened with, as Studio's
 * `approvalsOf` looks it up (HAL-19425). Once that question is answered,
 * every other attempt crashes, so the step goes on to its fallback.
 */
function secondAttemptAsks(ports: ReturnType<typeof hedgePorts>) {
  const bridgeCalls = new RunBridgeApprovals();
  const bridgeAnswers: Promise<BridgeApprovalDecision>[] = [];
  const others: HarnessRun[] = [];
  const asked = { openAttempts: 0 };
  let answered = false;
  const start = ports.harness.start.bind(ports.harness);
  ports.harness.start = (task) => {
    const run = start(task);
    if (task.model === "opus") return run;
    if (ports.harness.tasks.length !== 2) {
      others.push(run);
      if (answered) void run.cancel();
      return run;
    }
    asked.openAttempts = ports.harness.tasks.length;
    const attemptId = ports.bridgeAgents.at(-1)?.attemptId;
    const request = { callId: "bridge-1", tool: "send_email", args: {} };
    const signal = new AbortController().signal;
    const answer = bridgeCalls.of("run_1", attemptId).request(request, { signal });
    bridgeAnswers.push(answer);
    void answer.then(() => {
      answered = true;
      for (const other of others) void other.cancel();
    });
    return run;
  };
  return { call: { ...pilotCall, bridgeCalls }, bridgeAnswers, asked };
}

verifies("engine.harness-early-hedge", () => {
  describe("a bridge approval while two attempts run at once", () => {
    it("stops only the asking attempt as approval-requested, and never reaches the run's approvals", async () => {
      const ports = twoAttemptsAtOnce();
      const people = askedPeople();
      const { call, bridgeAnswers, asked } = secondAttemptAsks(ports);
      const timers = startLimits();
      void timers.waitUp(1);

      const { output } = await runPilotOn(ports, {
        call,
        approvals: people.approvals,
        limits: timers.limits,
      });

      expect(asked.openAttempts).toBe(2);
      const attemptIds = ports.bridgeAgents.map(({ attemptId }) => attemptId);
      expect(attemptIds.every((id) => id !== undefined)).toBe(true);
      expect(new Set(attemptIds).size).toBe(attemptIds.length);
      expect(await Promise.all(bridgeAnswers)).toEqual([
        expect.objectContaining({ approved: false }),
      ]);
      expect(people.asked).toEqual([]);
      const requested = ports.decisions.filter(({ kind }) => kind === "approval-requested");
      expect(requested).toEqual([expect.objectContaining({ attempt: 2 })]);
      expect(ports.decisions).toContainEqual(
        expect.objectContaining({ kind: "failed", attempt: 1 }),
      );
      expect(output).toBe("from opus");
      expect(ports.folders.released).toEqual(ports.folders.opened);
    });
  });
});
