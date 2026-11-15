import { waitUntil } from "@halonicjs/testing-spec";
/**
 * Watching a run through a real `RunObject` in workerd: the byte stream `watch` returns has to
 * cross the Durable Object call, carry the events a client appends meanwhile, and close after the
 * ending event, and `DurableRunEvents` has to follow a run through that stream. The Node tests cover
 * the rest of the behaviour over `node:sqlite`.
 */

import { env } from "cloudflare:workers";
import type { RunEvent } from "@halonicjs/events";
import { completed, entered, started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { DurableRunEvents } from "../durable-run-events.ts";
import { SuiteCase } from "./suite-case.ts";
import type { TestRunObject } from "./test-run-object.ts";

export { TestRunObject } from "./test-run-object.ts";

/** What the runner binds for this suite (see `run-watch.test.ts`). */
interface TestEnv {
  RUNS: DurableObjectNamespace<TestRunObject>;
}

/** A run object of a case of its own, with the time the suite gives it. */
function newRunObject() {
  const caseId = crypto.randomUUID();
  const { RUNS } = env as TestEnv;
  const runs = new SuiteCase().namespace(RUNS);
  return { runId: `${caseId}-run`, object: runs.get(runs.idFromName(`${caseId}-run`)) };
}

async function readEvents(stream: ReadableStream<Uint8Array>): Promise<RunEvent[]> {
  const text = await new Response(stream).text();
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as RunEvent);
}

describe("RunObject watch in workerd", () => {
  it("streams stored and new events across the call, and closes after the ending event", async () => {
    const { runId, object } = newRunObject();
    await object.append(runId, 0, [started(runId), entered(runId, 2)]);
    const stream = await object.watch(1);
    await object.append(runId, 2, [entered(runId, 3)]);
    await object.append(runId, 3, [completed(runId, 4)]);
    expect((await readEvents(stream)).map((event) => event.seq)).toEqual([2, 3, 4]);
  });

  it("refuses a run with no events", async () => {
    const { object } = newRunObject();
    await expect(object.watch()).rejects.toThrow("no events");
  });
});

/** Follows a run through `DurableRunEvents`, and resolves `closed` when the stream is over. */
function follow(runId: string, afterSeq: number) {
  const { RUNS } = env as TestEnv;
  const told: (number | string)[] = [];
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const events = new DurableRunEvents({ namespace: RUNS });
  const subscription = events.subscribe(runId, afterSeq, {
    onEvent: (event) => told.push(event.seq),
    onClose: (error) => {
      told.push(error === undefined ? "end" : "error");
      resolveClosed();
    },
  });
  return { told, closed, subscription };
}

describe("DurableRunEvents in workerd", () => {
  it("follows a run live, gives each event once in order, and ends after the ending event", async () => {
    const { runId, object } = newRunObject();
    await object.append(runId, 0, [started(runId), entered(runId, 2)]);
    const { told, closed } = follow(runId, 0);
    await object.append(runId, 2, [entered(runId, 3)]);
    await object.append(runId, 3, [completed(runId, 4)]);
    await closed;
    expect(told).toEqual([1, 2, 3, 4, "end"]);
  });

  it("resumes after the last seq a client saw, without a repeat", async () => {
    const { runId, object } = newRunObject();
    await object.append(runId, 0, [started(runId), entered(runId, 2), entered(runId, 3)]);
    const first = follow(runId, 0);
    await waitUntil(
      "first.told to equal [1, 2, 3]",
      () => JSON.stringify(first.told) === JSON.stringify([1, 2, 3]),
    );
    expect(first.told).toEqual([1, 2, 3]);
    first.subscription.close();
    await object.append(runId, 3, [entered(runId, 4), completed(runId, 5)]);
    const second = follow(runId, 3);
    await second.closed;
    expect(second.told).toEqual([4, 5, "end"]);
  });

  it("reports a run with no events as a break", async () => {
    const { runId } = newRunObject();
    const { told, closed } = follow(runId, 0);
    await closed;
    expect(told).toEqual(["error"]);
  });
});
