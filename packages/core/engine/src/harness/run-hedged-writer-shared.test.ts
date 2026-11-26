import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { stillOpen } from "./harness-test-kit.test-helper.ts";
import {
  answerCosting,
  askedPeople,
  hedgePorts,
  runPilotOn,
  writerCallWith,
} from "./hedge-test-kit.test-helper.ts";
import { HarnessLimitError } from "./step-limits.ts";

verifies("engine.harness-early-hedge", () => {
  it("stops every attempt, with no fallback, once together they spent the agent's maxCost", async () => {
    const ports = hedgePorts();
    ports.harness.events = [answerCosting(0.6)];
    ports.harness.error = new Error("The writer crashed.");

    const { error, written } = await runPilotOn(ports, {
      call: writerCallWith({ harnessLimits: { maxCost: 1 } }),
    });

    expect(error).toBeInstanceOf(HarnessLimitError);
    expect((error as HarnessLimitError).failureCause.code).toBe("harness.max-cost");
    expect(ports.harness.tasks.map(({ model }) => model)).not.toContain("opus");
    // A model call of an attempt that never ships still goes to the run's log, for its budget.
    expect(written.filter(({ type }) => type === "llm.response")).toHaveLength(2);
    expect(ports.folders.released).toEqual(ports.folders.opened);
    expect(stillOpen(ports.steps)).toBe(0);
  });

  it("gives the fallback only what the attempts left of the agent's limits", async () => {
    const ports = hedgePorts();
    ports.harness.events = [answerCosting(0.5)];
    ports.harness.error = new Error("The writer crashed.");

    const { output } = await runPilotOn(ports, {
      call: writerCallWith({ harnessLimits: { maxCost: 2, maxSteps: 30 } }),
    });

    expect(output).toBe("from opus");
    const fallback = ports.bridgeAgents.at(-1)?.file.harnessLimits;
    expect(fallback?.maxCost).toBeCloseTo(0.5);
    // Turns are counted per attempt, so the fallback keeps all of its own.
    expect(fallback?.maxSteps).toBe(30);
  });

  it("stops an attempt that asks for an OK without asking anyone, and says so apart from failures", async () => {
    const ports = hedgePorts();
    const people = askedPeople();
    ports.harness.events = [
      { type: "approval.requested", agent: "writer", tool: "shell", args: {}, callId: "tool-1" },
    ];

    const { output } = await runPilotOn(ports, { approvals: people.approvals });

    expect(people.asked).toEqual([]);
    expect(ports.harness.sent).toEqual([]);
    expect(ports.decisions).toContainEqual(
      expect.objectContaining({ kind: "approval-requested", attempt: 1 }),
    );
    expect(ports.decisions.filter(({ kind }) => kind === "failed")).toEqual([]);
    expect(output).toBe("from opus");
    expect(stillOpen(ports.steps)).toBe(0);
  });
});
