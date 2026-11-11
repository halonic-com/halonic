import type { Workflow } from "@halonicjs/format";
import type { BlobRef, ChatResponse } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  approvalWorkflow,
  KernelBlobs,
  KernelRuns,
  replyWorkflow,
  writerAgent,
} from "../kernel/kernel-test-kit.test-helper.ts";
import { readRun } from "../kernel/step.ts";
import { textAnswer } from "../testing/scripted-model.ts";
import { childStart, receiverOf } from "./child-runs.ts";
import { runsOn } from "./local-runs-test-kit.test-helper.ts";
import type { RunProposalFolders } from "./proposal-folders.ts";

/** A parent whose first state runs `child` with the parent's `from`, and keeps its context as `verdict`. */
function onboard(child: string): Workflow {
  return {
    version: 1,
    id: "onboard",
    name: "Onboard a customer",
    initial: "check",
    context: {},
    states: {
      check: {
        type: "workflow",
        workflow: child,
        input: { from: "{{input.from}}" },
        output: "verdict",
        on: [{ to: "welcome", event: "done" }],
      },
      welcome: { type: "final", on: [] },
    },
    layout: {},
  };
}

/** A person approves first, then the writer drafts the reply. */
const review: Workflow = {
  ...replyWorkflow,
  id: "review",
  initial: "decide",
  states: {
    ...replyWorkflow.states,
    decide: { type: "wait", on: [{ to: "draft", event: "approve" }] },
  },
};

/** A workflow that ends as soon as it starts. */
const instant: Workflow = {
  ...replyWorkflow,
  id: "instant",
  initial: "sent",
  context: { ready: true },
};

const workflows = { approval: approvalWorkflow(), reply: replyWorkflow, review, instant };

const start = { hubId: "acme", workflowId: "onboard", input: { from: "support" } };

function childRuns(
  child: string,
  answers: (ChatResponse | Error)[] = [textAnswer("Dear support")],
  blobs?: KernelBlobs,
) {
  const setup = { workflow: onboard(child), workflows, ...(blobs === undefined ? {} : { blobs }) };
  return runsOn(answers, new KernelRuns(), setup);
}

/** Blobs that keep the first definitions, then refuse to keep any more. */
class FullBlobs extends KernelBlobs {
  override async put(data: Uint8Array, mediaType: string): Promise<BlobRef> {
    if (this.blobs.size > 0) throw new Error("The disk is full.");
    return super.put(data, mediaType);
  }
}

/** Proposal folders whose `end` breaks its contract and throws for one run. */
class BrokenFolders implements RunProposalFolders {
  async open(): Promise<string> {
    return "<data>/proposals/run";
  }

  async folderOf(): Promise<string | null> {
    return null;
  }

  async end(runId: string): Promise<void> {
    if (runId === "run_5") throw new Error("The proposal folder is locked.");
  }
}

verifies("engine.local-child-runs", () => {
  it("starts the child at once and waits with it; an event for the parent goes to the child", async () => {
    const { executor, runs, scheduler } = childRuns("approval");

    const waiting = await executor.start(start);

    expect(waiting).toMatchObject({
      id: "run_1",
      status: "waiting",
      accepts: ["approve", "reject"],
    });
    expect(await runs.get("run_1.2")).toMatchObject({ hubId: "acme", workflowId: "approval" });
    expect(runs.logs.get("run_1.2")?.[0]).toMatchObject({
      input: { from: "support" },
      kind: "run",
      parent: { runId: "run_1", state: "check", depth: 1 },
    });

    const done = await executor.send("run_1", "approve", { note: "ok" });

    expect(done).toMatchObject({
      status: "completed",
      context: { verdict: { outcome: "pending", lastEvent: { note: "ok" } } },
    });
    // Only the child's own 2d timer is left; the parent heard from it at once.
    expect([...scheduler.timers.keys()]).toEqual([JSON.stringify(["run_1.2", "timer:3:2"])]);
  });

  it("completes the parent in the same call when the child ends at once", async () => {
    const { executor } = childRuns("instant");

    expect(await executor.start(start)).toMatchObject({
      status: "completed",
      context: { verdict: { ready: true } },
    });
  });

  it("goes on once the child's model call is done", async () => {
    const { executor, runs, scheduler } = childRuns("reply");

    expect(await executor.start(start)).toMatchObject({ status: "running" });
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { verdict: { reply: "Dear support" } },
    });
  });

  it("fails the parent when the child fails", async () => {
    const { executor, runs, scheduler } = childRuns("reply", [new Error("socket hang up")]);
    await executor.start(start);
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      error: expect.stringContaining('Workflow "reply" failed: socket hang up'),
    });
  });

  it("fails the parent when the child asks for an effect it can't carry out", async () => {
    const setup = {
      workflow: onboard("reply"),
      workflows,
      agents: { writer: writerAgent("codex") },
    };
    const { executor, runs } = runsOn([], new KernelRuns(), setup);

    await executor.start(start);

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      error: expect.stringContaining("can't carry out a run-harness effect"),
    });
  });

  it("fails the parent with the reason when the child can't start", async () => {
    const { executor } = childRuns("approval", [], new FullBlobs());

    expect(await executor.start(start)).toMatchObject({
      status: "failed",
      error: 'Workflow "approval" failed: The child run couldn\'t start: The disk is full.',
    });
  });

  it("tells a waiting parent that its child ended as interrupted when the engine stopped", async () => {
    const before = childRuns("review");
    await before.executor.start(start);
    // The child moves on to its model call; the engine stops before it is made.
    await before.executor.send("run_1", "approve");

    const setup = { workflow: onboard("review"), workflows, blobs: before.blobs };
    const after = runsOn([], before.runs, setup);
    await after.executor.start({ ...start, runId: "run_9" });
    await after.scheduler.runDue();

    expect(await before.runs.get("run_1.2")).toMatchObject({ reason: "interrupted" });
    expect(await before.runs.get("run_1")).toMatchObject({
      status: "failed",
      error: expect.stringContaining('Workflow "review" failed: The engine stopped'),
    });
  });

  it("isn't stuck when it can't set the timer that tells a parent its child was interrupted", async () => {
    const before = childRuns("review");
    await before.executor.start(start);
    await before.executor.send("run_1", "approve");
    const setup = { workflow: onboard("review"), workflows, blobs: before.blobs };
    const after = runsOn([], before.runs, setup);
    const schedule = after.scheduler.schedule.bind(after.scheduler);
    let down = true;
    after.scheduler.schedule = async (key, timerId, at) => {
      if (down) throw new Error("The scheduler is down.");
      return schedule(key, timerId, at);
    };

    await expect(after.executor.start({ ...start, runId: "run_9" })).rejects.toThrow(
      "The scheduler is down.",
    );
    down = false;

    expect(await after.executor.start({ ...start, runId: "run_9" })).toMatchObject({
      status: "waiting",
    });
  });

  it("tells a waiting parent its child was interrupted even when a folder's end throws", async () => {
    const before = childRuns("review");
    await before.executor.start(start);
    // A top-level run on the same store that the engine stops while it waits for its model call.
    const other = runsOn([], before.runs, { blobs: before.blobs });
    await other.executor.start({ ...start, runId: "run_5", workflowId: "reply" });
    await before.executor.send("run_1", "approve");
    const setup = {
      workflow: onboard("review"),
      workflows,
      blobs: before.blobs,
      proposalFolders: new BrokenFolders(),
    };
    const after = runsOn([], before.runs, setup);

    await expect(after.executor.start({ ...start, runId: "run_9" })).rejects.toThrow(
      "The proposal folder is locked.",
    );
    await after.scheduler.runDue();

    expect(await before.runs.get("run_5")).toMatchObject({ reason: "interrupted" });
    expect(await before.runs.get("run_1")).toMatchObject({
      status: "failed",
      error: expect.stringContaining('Workflow "review" failed: The engine stopped'),
    });
  });

  it("lets an error after the child started through, and doesn't fail the parent with it", async () => {
    const { executor, runs, scheduler } = childRuns("reply");
    const schedule = scheduler.schedule.bind(scheduler);
    scheduler.schedule = async (key, timerId, at) => {
      if (key === "run_1.2") throw new Error("The scheduler is down.");
      return schedule(key, timerId, at);
    };

    await expect(executor.start(start)).rejects.toThrow("The scheduler is down.");

    expect(await runs.get("run_1.2")).toMatchObject({ status: "running" });
    expect(await runs.get("run_1")).not.toMatchObject({ status: "failed" });
  });
});

describe("child runs", () => {
  it("can't start a child whose workflow the parent's definitions don't have", async () => {
    const { executor, runs, blobs } = childRuns("approval");
    await executor.start(start);
    const parent = await readRun(runs, "run_1");
    if (parent === null) throw new Error("expected the parent run");
    const effect = {
      type: "start-child" as const,
      childRunId: "run_1.9",
      state: "check",
      workflowId: "billing",
      input: {},
      depth: 1,
    };

    await expect(childStart(blobs, parent, effect, "")).rejects.toThrow(
      'have no workflow "billing"',
    );
  });

  it("gives an event to the run itself when it doesn't wait on a child", async () => {
    const { executor, runs } = childRuns("reply");
    await executor.start(start);

    expect(await receiverOf(runs, "run_1")).toBe("run_1");
    expect(await receiverOf(runs, "r-missing")).toBe("r-missing");
  });
});
