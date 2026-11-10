import type { RunEvent, RunEventBody } from "@halonicjs/events";
import type { RunEventListener } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { RunFeed } from "./run-feed.ts";

const started: RunEventBody = {
  type: "run.started",
  hubId: "acme",
  workflowId: "reply",
  input: {},
  kind: "run",
  definitionsVersion: "sha-1",
};
const entered: RunEventBody = { type: "state.entered", state: "draft" };
const completed: RunEventBody = { type: "run.completed", state: "sent", context: {} };

/** Appends the bodies to the run's log, numbered after its last event. */
async function append(runs: KernelRuns, runId: string, ...bodies: RunEventBody[]): Promise<void> {
  const lastSeq = runs.logs.get(runId)?.length ?? 0;
  const events = bodies.map((body, index) => ({
    ...body,
    runId,
    seq: lastSeq + index + 1,
    at: "2026-11-10T09:00:00.000Z",
  }));
  await runs.append(runId, lastSeq, events);
}

/** A listener that keeps what it gets, and a promise that settles when the stream closes. */
function recording() {
  const events: RunEvent[] = [];
  let closes = 0;
  let closeWith: (error: Error | undefined) => void = () => {};
  const closed = new Promise<Error | undefined>((resolve) => {
    closeWith = resolve;
  });
  const listener: RunEventListener = {
    onEvent: (event) => events.push(event),
    onClose: (error) => {
      closes += 1;
      closeWith(error);
    },
  };
  return { events, closed, listener, closes: () => closes };
}

verifies("engine.local-run-subscribe", () => {
  it("gives the stored events after afterSeq, then new ones, and closes when the run ends", async () => {
    const runs = new KernelRuns();
    const feed = new RunFeed(runs);
    await append(runs, "r-acme", started, entered, entered);
    const { events, closed, listener } = recording();

    feed.subscribe("r-acme", 1, listener, Promise.resolve());
    expect(events).toEqual([]);
    await append(runs, "r-acme", completed);
    feed.notify("r-acme");

    expect(await closed).toBeUndefined();
    expect(events.map((event) => event.seq)).toEqual([2, 3, 4]);
  });

  it("closes at once for a run that has already ended", async () => {
    const runs = new KernelRuns();
    await append(runs, "r-acme", started, completed);
    const { events, closed, listener } = recording();

    new RunFeed(runs).subscribe("r-acme", 2, listener, Promise.resolve());

    expect(await closed).toBeUndefined();
    expect(events).toEqual([]);
  });

  it("closes with an error for a run that doesn't exist, or an engine that failed to start", async () => {
    const feed = new RunFeed(new KernelRuns());
    const missing = recording();
    const broken = recording();

    feed.subscribe("r-missing", 0, missing.listener, Promise.resolve());
    feed.subscribe("r-acme", 0, broken.listener, Promise.reject(new Error("store offline")));

    expect((await missing.closed)?.message).toBe('Run "r-missing" doesn\'t exist.');
    expect((await broken.closed)?.message).toBe("store offline");
  });

  it("calls the listener no more once the caller closes it", async () => {
    const runs = new KernelRuns();
    const feed = new RunFeed(runs);
    await append(runs, "r-acme", started);
    const { events, listener, closes } = recording();

    const subscription = feed.subscribe("r-acme", 0, listener, Promise.resolve());
    subscription.close();
    subscription.close();
    await append(runs, "r-acme", completed);
    feed.notify("r-acme");
    for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();

    expect(events).toEqual([]);
    expect(closes()).toBe(0);
  });
});
