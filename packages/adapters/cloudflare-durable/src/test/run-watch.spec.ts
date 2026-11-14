/**
 * Watching a run through a real `RunObject` in workerd: the byte stream `watch` returns has to
 * cross the Durable Object call, carry the events a client appends meanwhile, and close after the
 * ending event. The Node tests cover the rest of the behaviour over `node:sqlite`.
 */

import { env } from "cloudflare:workers";
import type { RunEvent } from "@halonicjs/events";
import { completed, entered, started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { cases, SuiteClock, type TestRunObject } from "./test-run-object.ts";

export { TestRunObject } from "./test-run-object.ts";

/** What the runner binds for this suite (see `run-watch.test.ts`). */
interface TestEnv {
  RUNS: DurableObjectNamespace<TestRunObject>;
}

/** A run object of a case of its own, so the suite's clock and listener are found by its name. */
function newRunObject() {
  const caseId = crypto.randomUUID();
  const noListener = { onTimer: async () => {}, onTick: async () => {} };
  cases.set(caseId, {
    clock: new SuiteClock(),
    listener: noListener,
    runList: { publish: async () => {} },
    objectNames: new Set(),
  });
  const { RUNS } = env as TestEnv;
  return { runId: `${caseId}-run`, object: RUNS.get(RUNS.idFromName(`${caseId}-run`)) };
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
