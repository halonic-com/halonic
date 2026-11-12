import type { RunVersion } from "@halonicjs/events";
import type { Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns, replyWorkflow, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { foldRun } from "../kernel/run-state.ts";
import { textAnswer } from "../testing/scripted-model.ts";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

/** A parent whose one state runs the reply workflow as a child run. */
const onboard: Workflow = {
  version: 1,
  id: "onboard",
  name: "Onboard a customer",
  initial: "reply",
  context: {},
  states: {
    reply: { type: "workflow", workflow: "reply", input: {}, on: [{ to: "done", event: "done" }] },
    done: { type: "final", on: [] },
  },
  layout: {},
};

const liveVersion: RunVersion = {
  reads: "live-version",
  commit: "4f2a9c1e0b7d",
  versionDate: "2026-11-10T09:42:00+01:00",
};

verifies("engine.run-records-its-version", () => {
  it("records the version the run read on its run.started", async () => {
    const { executor, runs } = runsOn([textAnswer("Dear support")], new KernelRuns());

    await executor.start({ ...replyStart, version: liveVersion });

    const log = runs.logs.get("run_1") ?? [];
    expect(log[0]).toMatchObject({ type: "run.started", version: liveVersion });
    expect(foldRun(log)).toMatchObject({ version: liveVersion });
  });

  it("asks for the definitions of the version the run records", async () => {
    const { executor, versionsAsked } = runsOn([textAnswer("Dear support")], new KernelRuns());

    await executor.start({ ...replyStart, version: liveVersion });

    expect(versionsAsked).toEqual([liveVersion]);
  });

  it("asks for the workspace as it is now when a start names no version", async () => {
    const { executor, versionsAsked } = runsOn([textAnswer("Dear support")], new KernelRuns());

    await executor.start(replyStart);

    expect(versionsAsked).toEqual([undefined]);
  });

  it("gives a child run the parent's version, and records it on the child's run.started", async () => {
    const { executor, runs, scheduler } = runsOn([textAnswer("Dear support")], new KernelRuns(), {
      workflow: onboard,
      workflows: { reply: replyWorkflow },
      agents: { writer: writerAgent() },
    });

    await executor.start({
      hubId: "acme",
      workflowId: "onboard",
      input: {},
      version: { reads: "saved-files" },
    });
    await scheduler.runDue();

    expect(runs.logs.get("run_1.2")?.[0]).toMatchObject({
      type: "run.started",
      version: { reads: "saved-files" },
    });
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("records no version for a run started without one", async () => {
    const { executor, runs } = runsOn([textAnswer("Dear support")], new KernelRuns());

    await executor.start(replyStart);

    const log = runs.logs.get("run_1") ?? [];
    expect(log[0]).not.toHaveProperty("version");
    expect(foldRun(log)).toMatchObject({ version: null });
  });
});
