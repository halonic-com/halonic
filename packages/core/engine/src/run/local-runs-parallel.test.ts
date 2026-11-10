import type { Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { textAnswer } from "../testing/scripted-model.ts";
import { runsOn } from "./local-runs-test-kit.test-helper.ts";

/** Two branches whose results go to `findings`; a failed branch gives `{ error }`. */
const research: Workflow = {
  version: 1,
  id: "research",
  name: "Research a topic",
  initial: "research",
  context: {},
  states: {
    research: {
      type: "parallel",
      branches: {
        web: { agent: "searcher", input: "Search the web" },
        notes: { agent: "reader", input: "Read the notes" },
      },
      output: "findings",
      continueOnError: true,
      on: [{ to: "done", event: "done" }],
    },
    done: { type: "final", on: [] },
  },
  layout: {},
};

const researchStart = { hubId: "acme", workflowId: "research", input: {} };

verifies("engine.parallel-state", () => {
  it("carries out every branch's call at once through the executor, then moves on", async () => {
    const { executor, model, runs, scheduler } = runsOn(
      [textAnswer("w"), textAnswer("n")],
      new KernelRuns(),
      { workflow: research },
    );
    await executor.start(researchStart);
    const timers = [...scheduler.timers.values()];
    expect(timers.map((timer) => timer.timerId)).toEqual(["call:call-1", "call:call-2"]);
    scheduler.timers.clear();

    await Promise.all(timers.map((timer) => executor.onTimer(timer)));

    expect(model.requests).toHaveLength(2);
    const summary = await runs.get("run_1");
    expect(summary).toMatchObject({ status: "completed", state: "done" });
    const findings = summary?.context["findings"] as Record<string, unknown>;
    expect(Object.keys(findings)).toEqual(["notes", "web"]);
    expect(new Set(Object.values(findings))).toEqual(new Set(["w", "n"]));
  });

  it("records a branch whose model call failed, and the run goes on", async () => {
    // Calls go in name order: notes (call-1) answers, then web (call-2) fails.
    const { executor, runs, scheduler } = runsOn(
      [textAnswer("n"), new Error("The model went away.")],
      new KernelRuns(),
      { workflow: research },
    );
    await executor.start(researchStart);

    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { web: { error: "The model went away." }, notes: "n" },
    });
    expect(runs.logs.get("run_1")).toContainEqual(
      expect.objectContaining({ type: "agent.finished", branch: "web", reason: "error" }),
    );
  });
});
