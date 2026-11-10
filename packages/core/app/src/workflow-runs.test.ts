import { type RunEvent, type RunEventBody, type RunSummary, summarize } from "@halonicjs/events";
import type {
  RunEventListener,
  RunExecutor,
  RunSubscription,
  StartRunRequest,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { RunFollowStopped, WorkflowRuns } from "./workflow-runs.ts";

const started: RunEventBody = {
  type: "run.started",
  hubId: "support",
  workflowId: "support-reply",
  input: {},
  kind: "run",
  definitionsVersion: "v1",
};
const enteredReview: RunEventBody = { type: "state.entered", state: "review" };
const waiting: RunEventBody = { type: "run.waiting", state: "review", events: ["approve"] };
const received: RunEventBody = { type: "event.received", event: "approve" };
const completed: RunEventBody = { type: "run.completed", state: "send", context: {} };
const failed: RunEventBody = { type: "run.failed", state: "review", error: "boom" };

/**
 * A `RunExecutor` that keeps run logs and streams them as the port says:
 * the stored events after `afterSeq` first, then new ones, never before
 * `subscribe` returns. A deliberate fake: core may not use adapters, not
 * even in tests.
 */
class StreamingExecutor implements Pick<RunExecutor, "start" | "subscribe"> {
  readonly starts: StartRunRequest[] = [];
  readonly subscribed: { runId: string; afterSeq: number }[] = [];
  /** Recorded by `start` after `run.started`, before it returns. */
  onStart: readonly RunEventBody[] = [];

  readonly #logs = new Map<string, RunEvent[]>();
  readonly #listeners = new Map<string, Set<RunEventListener>>();

  async start(request: StartRunRequest): Promise<RunSummary> {
    this.starts.push(request);
    const runId = `run_${this.starts.length}`;
    this.#logs.set(runId, []);
    this.append(runId, started, ...this.onStart);
    return this.summary(runId);
  }

  subscribe(runId: string, afterSeq: number, listener: RunEventListener): RunSubscription {
    this.subscribed.push({ runId, afterSeq });
    let open = true;
    queueMicrotask(() => {
      if (!open) return;
      for (const event of this.#logs.get(runId) ?? []) {
        if (event.seq > afterSeq) listener.onEvent(event);
      }
      this.#listenersOf(runId).add(listener);
    });
    return {
      close: () => {
        open = false;
        this.#listenersOf(runId).delete(listener);
      },
    };
  }

  /** Records events in a run's log and hands them to its open streams. */
  append(runId: string, ...bodies: readonly RunEventBody[]): void {
    const log = this.#logs.get(runId) ?? [];
    for (const body of bodies) {
      const event = { ...body, runId, seq: log.length + 1, at: "2026-11-10T10:00:00.000Z" };
      log.push(event);
      for (const listener of this.#listenersOf(runId)) listener.onEvent(event);
    }
    this.#logs.set(runId, log);
  }

  /** Ends a run's open streams, cleanly or with an error. */
  close(runId: string, error?: Error): void {
    for (const listener of this.#listenersOf(runId)) listener.onClose(error);
    this.#listenersOf(runId).clear();
  }

  openStreams(runId: string): number {
    return this.#listenersOf(runId).size;
  }

  summary(runId: string): RunSummary {
    const summary = summarize(this.#logs.get(runId) ?? []);
    if (summary === null) throw new Error(`no run ${runId}`);
    return summary;
  }

  #listenersOf(runId: string): Set<RunEventListener> {
    const listeners = this.#listeners.get(runId) ?? new Set();
    this.#listeners.set(runId, listeners);
    return listeners;
  }
}

/** Lets queued microtasks, such as a stream's replay, run. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
}

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

  it("fails with the stream's error when it breaks", async () => {
    const executor = new StreamingExecutor();
    const runs = new WorkflowRuns(executor);
    const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });
    const broken = new Error("connection dropped");

    const follow = runs.follow(id);
    await settle();
    executor.close(id, broken);

    await expect(follow).rejects.toBe(broken);
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
