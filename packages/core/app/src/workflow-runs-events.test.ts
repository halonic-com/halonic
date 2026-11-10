import type { RunEvent, RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { StreamingExecutor, settle } from "./testing/streaming-executor.ts";
import { RunFollowStopped, WorkflowRuns } from "./workflow-runs.ts";

const enteredReview: RunEventBody = { type: "state.entered", state: "review" };
const waiting: RunEventBody = { type: "run.waiting", state: "review", events: ["approve"] };
const received: RunEventBody = { type: "event.received", event: "approve" };
const enteredSend: RunEventBody = { type: "state.entered", state: "send" };
const completed: RunEventBody = { type: "run.completed", state: "send", context: {} };

/** What one call of `onEvent` saw: the event, and how long the log was with it last. */
interface Seen {
  readonly type: RunEvent["type"];
  readonly seq: number;
  readonly logLength: number;
  readonly eventIsLast: boolean;
}

/** An `onEvent` that notes each call, and the calls it noted. */
function recorder(): {
  seen: Seen[];
  onEvent: (event: RunEvent, events: readonly RunEvent[]) => void;
} {
  const seen: Seen[] = [];
  return {
    seen,
    onEvent: (event, events) => {
      seen.push({
        type: event.type,
        seq: event.seq,
        logLength: events.length,
        eventIsLast: events.at(-1) === event,
      });
    },
  };
}

verifies("app.run-follow-events", () => {
  it("is called once per event, oldest first, the stored events before the new ones", async () => {
    const executor = new StreamingExecutor();
    executor.onStart = [enteredReview];
    const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });
    const { seen, onEvent } = recorder();

    const follow = new WorkflowRuns(executor).follow(id, { onEvent });
    await settle();
    executor.append(id, waiting);
    await follow;

    expect(seen).toEqual([
      { type: "run.started", seq: 1, logLength: 1, eventIsLast: true },
      { type: "state.entered", seq: 2, logLength: 2, eventIsLast: true },
      { type: "run.waiting", seq: 3, logLength: 3, eventIsLast: true },
    ]);
  });

  it("sees the event that stops the follow, and none after it", async () => {
    const executor = new StreamingExecutor();
    // The stored log goes on past the wait, so the stream replays more
    // events after the one that stops the follow.
    executor.onStart = [enteredReview, waiting, received, enteredSend, completed];
    const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });
    const { seen, onEvent } = recorder();

    const run = await new WorkflowRuns(executor).follow(id, { onEvent });

    expect(run.summary.status).toBe("waiting");
    expect(seen.map((call) => call.type)).toEqual(["run.started", "state.entered", "run.waiting"]);
  });

  it("is never called once the signal stopped the follow, while events still arrive", async () => {
    const executor = new StreamingExecutor();
    executor.onStart = [enteredReview, received, enteredSend];
    const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });
    const controller = new AbortController();
    const types: RunEvent["type"][] = [];

    const follow = new WorkflowRuns(executor).follow(id, {
      signal: controller.signal,
      onEvent: (event) => {
        types.push(event.type);
        // Ctrl C while the stored events are still being replayed.
        if (event.seq === 2) controller.abort();
      },
    });

    const error: unknown = await follow.catch((thrown: unknown) => thrown);
    executor.append(id, completed);
    await settle();
    expect(error).toBeInstanceOf(RunFollowStopped);
    expect((error as RunFollowStopped).events.map((event) => event.seq)).toEqual([1, 2]);
    expect(types).toEqual(["run.started", "state.entered"]);
    expect(executor.openStreams(id)).toBe(0);
  });

  it("makes the follow fail with what it throws, and closes the stream", async () => {
    const executor = new StreamingExecutor();
    executor.onStart = [enteredReview];
    const { id } = await executor.start({ hubId: "support", workflowId: "x", input: {} });
    const broken = new Error("cannot draw");
    let calls = 0;

    const follow = new WorkflowRuns(executor).follow(id, {
      onEvent: () => {
        calls += 1;
        throw broken;
      },
    });

    await expect(follow).rejects.toBe(broken);
    executor.append(id, completed);
    expect(calls).toBe(1);
    expect(executor.openStreams(id)).toBe(0);
  });

  it("reaches the follow of a run that `startRun` started", async () => {
    const executor = new StreamingExecutor();
    executor.onStart = [enteredReview, completed];
    const workspace = await loadWorkspace(
      new TestDefinitionStore({
        "workspace.yaml": "id: acme\nname: Acme\n",
        "hubs/support/hub.yaml": "id: support\nname: Support\n",
        "hubs/support/workflows/support-reply.workflow.yaml":
          "id: support-reply\nname: support-reply\ninitial: done\nstates:\n  done:\n    type: final\n",
      }),
    );
    const { seen, onEvent } = recorder();

    await new WorkflowRuns(executor).startRun(workspace, "support-reply", {}, { onEvent });

    expect(seen.map((call) => call.type)).toEqual([
      "run.started",
      "state.entered",
      "run.completed",
    ]);
  });
});
