import type { RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { StreamingExecutor, settle } from "./testing/streaming-executor.ts";
import { maxResubscribes, RunFollowStopped, WorkflowRuns } from "./workflow-runs.ts";

const enteredReview: RunEventBody = { type: "state.entered", state: "review" };
const waiting: RunEventBody = { type: "run.waiting", state: "review", events: ["approve"] };
const received: RunEventBody = { type: "event.received", event: "approve" };
const completed: RunEventBody = { type: "run.completed", state: "send", context: {} };
const failed: RunEventBody = { type: "run.failed", state: "review", error: "boom" };

function workflowFile(id: string): string {
  return `id: ${id}\nname: ${id}\ninitial: done\nstates:\n  done:\n    type: final\n`;
}

/** Acme's hubs `sales` and `support`, each with a workflow `reply`; `support` also has `support-reply`. */
async function acme(): Promise<LoadedWorkspace> {
  return loadWorkspace(
    new TestDefinitionStore({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "hubs/sales/hub.yaml": "id: sales\nname: Sales\n",
      "hubs/sales/workflows/reply.workflow.yaml": workflowFile("reply"),
      "hubs/support/hub.yaml": "id: support\nname: Support\n",
      "hubs/support/workflows/reply.workflow.yaml": workflowFile("reply"),
      "hubs/support/workflows/support-reply.workflow.yaml": workflowFile("support-reply"),
    }),
  );
}

verifies("app.run-start", () => {
  it("starts the named workflow in its hub with the input and follows the run", async () => {
    const executor = new StreamingExecutor();
    executor.onStart = [enteredReview, completed];

    const result = await new WorkflowRuns(executor).startRun(await acme(), "support-reply", {
      ticket: 42,
    });

    expect(executor.starts).toEqual([
      { hubId: "support", workflowId: "support-reply", input: { ticket: 42 } },
    ]);
    if (result.found !== "one") throw new Error(`found ${result.found}`);
    expect(result.run.summary.status).toBe("completed");
    expect(result.run.events.map((event) => event.type)).toEqual([
      "run.started",
      "state.entered",
      "run.completed",
    ]);
  });

  it("starts nothing when several hubs have the workflow", async () => {
    const executor = new StreamingExecutor();

    const result = await new WorkflowRuns(executor).startRun(await acme(), "reply", {});

    expect(result).toEqual({ found: "several", workflowId: "reply", hubIds: ["sales", "support"] });
    expect(executor.starts).toEqual([]);
  });

  it("starts nothing when no hub has the workflow", async () => {
    const executor = new StreamingExecutor();

    const result = await new WorkflowRuns(executor).startRun(await acme(), "nightly", {});

    expect(result).toEqual({ found: "none" });
    expect(executor.starts).toEqual([]);
  });

  it("starts nothing when the signal is already aborted", async () => {
    const executor = new StreamingExecutor();
    const signal = AbortSignal.abort();

    const start = new WorkflowRuns(executor).startRun(
      await acme(),
      "support-reply",
      {},
      { signal },
    );

    await expect(start).rejects.toThrow();
    expect(executor.starts).toEqual([]);
  });
});

verifies("app.run-follow", () => {
  it("misses no event of a run that failed before the follow began", async () => {
    const executor = new StreamingExecutor();
    executor.onStart = [enteredReview, failed];
    const runs = new WorkflowRuns(executor);
    const summary = await executor.start({ hubId: "support", workflowId: "x", input: {} });

    const run = await runs.follow(summary.id);

    expect(executor.subscribed).toEqual([{ runId: summary.id, afterSeq: 0 }]);
    expect(run.summary.status).toBe("failed");
    expect(run.events.map((event) => event.type)).toEqual([
      "run.started",
      "state.entered",
      "run.failed",
    ]);
  });

  it("ends when the run waits after the follow began", async () => {
    const executor = new StreamingExecutor();
    const runs = new WorkflowRuns(executor);
    const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });

    const follow = runs.follow(id);
    await settle();
    executor.append(id, enteredReview, waiting);

    const run = await follow;
    expect(run.summary.status).toBe("waiting");
    expect(run.summary.accepts).toEqual(["approve"]);
    expect(executor.openStreams(id)).toBe(0);
  });

  it("goes past a wait at or before `after`", async () => {
    const executor = new StreamingExecutor();
    executor.onStart = [enteredReview, waiting];
    const runs = new WorkflowRuns(executor);
    const { id, lastSeq } = await executor.start({ hubId: "support", workflowId: "x", input: {} });
    executor.append(id, received);

    const follow = runs.follow(id, { after: lastSeq });
    await settle();
    executor.append(id, completed);

    const run = await follow;
    expect(run.summary.status).toBe("completed");
    expect(run.events.at(0)?.type).toBe("run.started");
  });

  it("gives the log as it stands when the stream ends without an error", async () => {
    const executor = new StreamingExecutor();
    const runs = new WorkflowRuns(executor);
    const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });

    const follow = runs.follow(id);
    await settle();
    executor.close(id);

    expect((await follow).summary.status).toBe("running");
  });

  it("fails with the stream's error when it breaks before any event", async () => {
    const executor = new StreamingExecutor();
    const runs = new WorkflowRuns(executor);
    const broken = new Error("connection dropped");

    const follow = runs.follow("run_zz");
    await settle();
    executor.close("run_zz", broken);

    await expect(follow).rejects.toBe(broken);
    expect(executor.subscribed).toHaveLength(1);
  });

  it("fails as not found for a run without events", async () => {
    const executor = new StreamingExecutor();
    const runs = new WorkflowRuns(executor);

    const follow = runs.follow("run_zz");
    await settle();
    executor.close("run_zz");

    await expect(follow).rejects.toMatchObject({ kind: "not_found" });
  });

  describe("when the signal is aborted", () => {
    it("closes the stream and fails with the events seen so far", async () => {
      const executor = new StreamingExecutor();
      executor.onStart = [enteredReview];
      const runs = new WorkflowRuns(executor);
      const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });
      const controller = new AbortController();

      const follow = runs.follow(id, { signal: controller.signal });
      await settle();
      controller.abort();

      const error: unknown = await follow.catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(RunFollowStopped);
      expect((error as RunFollowStopped).runId).toBe(id);
      expect((error as RunFollowStopped).events.map((event) => event.type)).toEqual([
        "run.started",
        "state.entered",
      ]);
      expect(executor.openStreams(id)).toBe(0);
    });

    it("stops at once when it was aborted before the follow began", async () => {
      const executor = new StreamingExecutor();
      const runs = new WorkflowRuns(executor);
      const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });

      const follow = runs.follow(id, { signal: AbortSignal.abort() });

      await expect(follow).rejects.toBeInstanceOf(RunFollowStopped);
      await settle();
      expect(executor.openStreams(id)).toBe(0);
    });
  });
});

verifies("app.run-follow-resubscribe", () => {
  it("subscribes again after the last event it saw when the stream breaks", async () => {
    const executor = new StreamingExecutor();
    executor.onStart = [enteredReview];
    const runs = new WorkflowRuns(executor);
    const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });

    const follow = runs.follow(id);
    await settle();
    executor.close(id, new Error("connection dropped"));
    await settle();
    executor.append(id, completed);

    const run = await follow;
    expect(executor.subscribed).toEqual([
      { runId: id, afterSeq: 0 },
      { runId: id, afterSeq: 2 },
    ]);
    expect(run.summary.status).toBe("completed");
    expect(run.events.map((event) => event.seq)).toEqual([1, 2, 3]);
  });

  it(`fails with the stream's error after ${maxResubscribes} breaks in a row without a new event`, async () => {
    const executor = new StreamingExecutor();
    const runs = new WorkflowRuns(executor);
    const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });
    const broken = new Error("connection dropped");

    const follow = runs.follow(id);
    const outcome = follow.catch((thrown: unknown) => thrown);
    for (let attempt = 0; attempt <= maxResubscribes; attempt += 1) {
      await settle();
      executor.close(id, broken);
    }

    expect(await outcome).toBe(broken);
    expect(executor.subscribed).toHaveLength(maxResubscribes + 1);
    expect(executor.openStreams(id)).toBe(0);
  });

  it("counts the breaks again after a new event", async () => {
    const executor = new StreamingExecutor();
    const runs = new WorkflowRuns(executor);
    const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });

    const follow = runs.follow(id);
    for (let attempt = 0; attempt < maxResubscribes; attempt += 1) {
      await settle();
      executor.close(id, new Error("connection dropped"));
    }
    await settle();
    executor.append(id, enteredReview);
    for (let attempt = 0; attempt < maxResubscribes; attempt += 1) {
      executor.close(id, new Error("connection dropped"));
      await settle();
    }
    executor.append(id, waiting);

    expect((await follow).summary.status).toBe("waiting");
    expect(executor.subscribed).toHaveLength(2 * maxResubscribes + 1);
  });
});

verifies("app.run-cancel-on-abort", () => {
  it("cancels the run when the signal aborts, then fails as stopped", async () => {
    const executor = new StreamingExecutor();
    executor.onStart = [enteredReview];
    const runs = new WorkflowRuns(executor);
    const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });
    const controller = new AbortController();

    const follow = runs.follow(id, { signal: controller.signal });
    await settle();
    controller.abort();

    const error: unknown = await follow.catch((thrown: unknown) => thrown);
    expect(executor.cancels).toEqual([id]);
    expect(error).toBeInstanceOf(RunFollowStopped);
    expect((error as RunFollowStopped).cancelled).toBe(true);
    expect((error as RunFollowStopped).cancelError).toBeUndefined();
    expect(executor.summary(id)).toMatchObject({ status: "failed", reason: "cancelled" });
  });

  it("cancels the run when the signal was aborted before the follow began", async () => {
    const executor = new StreamingExecutor();
    const runs = new WorkflowRuns(executor);
    const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });

    const error: unknown = await runs
      .follow(id, { signal: AbortSignal.abort() })
      .catch((thrown: unknown) => thrown);

    expect(executor.cancels).toEqual([id]);
    expect((error as RunFollowStopped).cancelled).toBe(true);
  });

  it("fails as stopped with the cancel's error when the cancel fails", async () => {
    const executor = new StreamingExecutor();
    const refused = new Error("host unreachable");
    const runs = new WorkflowRuns({
      start: (request) => executor.start(request),
      subscribe: (runId, afterSeq, listener) => executor.subscribe(runId, afterSeq, listener),
      cancel: () => Promise.reject(refused),
    });
    const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });

    const error: unknown = await runs
      .follow(id, { signal: AbortSignal.abort() })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(RunFollowStopped);
    expect((error as RunFollowStopped).cancelled).toBe(false);
    expect((error as RunFollowStopped).cancelError).toBe(refused);
  });

  it("says it wasn't cancelled when the run had already ended by the cancel", async () => {
    const executor = new StreamingExecutor();
    const runs = new WorkflowRuns(executor);
    const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });
    executor.append(id, completed);

    const error: unknown = await runs
      .follow(id, { signal: AbortSignal.abort() })
      .catch((thrown: unknown) => thrown);

    expect(executor.cancels).toEqual([id]);
    expect(error).toBeInstanceOf(RunFollowStopped);
    expect((error as RunFollowStopped).cancelled).toBe(false);
    expect((error as RunFollowStopped).cancelError).toBeUndefined();
    expect(executor.summary(id).status).toBe("completed");
  });

  it("only stops following when the executor can't cancel", async () => {
    const executor = new StreamingExecutor();
    const runs = new WorkflowRuns({
      start: (request) => executor.start(request),
      subscribe: (runId, afterSeq, listener) => executor.subscribe(runId, afterSeq, listener),
    });
    const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });

    const error: unknown = await runs
      .follow(id, { signal: AbortSignal.abort() })
      .catch((thrown: unknown) => thrown);

    expect((error as RunFollowStopped).cancelled).toBe(false);
    expect(executor.summary(id).status).toBe("running");
  });
});
