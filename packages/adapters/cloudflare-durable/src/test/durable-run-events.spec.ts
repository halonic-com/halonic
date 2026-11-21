// `DurableRunEvents` inside workerd, over a watch stream the test writes by hand (see
// `durable-run-events.test.ts`). `run-watch.spec.ts` follows a real run object's stream.

import type { RunEvent } from "@halonicjs/events";
import type { RunEventListener } from "@halonicjs/ports";
import { completed, entered, started } from "@halonicjs/testing-contracts";
import { waitUntil } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { DurableRunEvents } from "../durable-run-events.ts";
import type { RunObjectApi } from "../run-object-api.ts";
import { eventLine } from "../run-watchers.ts";

const runId = "run-1";

/** A watch stream the test writes to by hand, and what the run object was asked. */
function fakeObject() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start: (c) => {
      controller = c;
    },
    cancel: () => {
      cancelled = true;
    },
  });
  const asked: { name: string; afterSeq: number | undefined }[] = [];
  return {
    stream,
    asked,
    send: (...events: RunEvent[]) => {
      for (const event of events) controller.enqueue(eventLine(event));
    },
    sendBytes: (bytes: Uint8Array) => controller.enqueue(bytes),
    end: () => controller.close(),
    break: (error: Error) => controller.error(error),
    wasCancelled: () => cancelled,
    namespace: {
      idFromName: (name: string) => name,
      get: (name: string): RunObjectApi =>
        ({
          watch: async (afterSeq?: number) => {
            asked.push({ name, afterSeq });
            return stream;
          },
        }) as unknown as RunObjectApi,
    },
  };
}

/** A listener that notes what it is told, and resolves `closed` when the stream is over. */
function noteListener() {
  const told: (number | string)[] = [];
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const listener: RunEventListener = {
    onEvent: (event) => told.push(event.seq),
    onClose: (error) => {
      told.push(error === undefined ? "end" : `error: ${error.message}`);
      resolveClosed();
    },
  };
  return { told, closed, listener };
}

describe("DurableRunEvents", () => {
  it("passes the events in order and ends when the stream closes", async () => {
    const object = fakeObject();
    const { told, closed, listener } = noteListener();
    new DurableRunEvents({ namespace: object.namespace }).subscribe(runId, 1, listener);
    object.send(entered(runId, 2), entered(runId, 3));
    object.send(completed(runId, 4));
    object.end();
    await closed;
    expect(told).toEqual([2, 3, 4, "end"]);
    expect(object.asked).toEqual([{ name: runId, afterSeq: 1 }]);
  });

  it("reads an event that arrives in pieces, and the last line without a newline", async () => {
    const object = fakeObject();
    const { told, closed, listener } = noteListener();
    new DurableRunEvents({ namespace: object.namespace }).subscribe(runId, 0, listener);
    const first = eventLine(started(runId));
    const second = eventLine(entered(runId, 2));
    object.sendBytes(first.slice(0, 10));
    object.sendBytes(first.slice(10));
    object.sendBytes(second.slice(0, second.byteLength - 1));
    object.end();
    await closed;
    expect(told).toEqual([1, 2, "end"]);
  });

  it("tells the listener when the stream breaks, so the caller asks again", async () => {
    const object = fakeObject();
    const { told, closed, listener } = noteListener();
    new DurableRunEvents({ namespace: object.namespace }).subscribe(runId, 0, listener);
    object.send(started(runId));
    await waitUntil("told to equal [1]", () => JSON.stringify(told) === JSON.stringify([1]));
    expect(told).toEqual([1]);
    object.break(new Error("object reset"));
    await closed;
    expect(told).toEqual([1, "error: object reset"]);
  });

  it("tells the listener when the object refuses the watch", async () => {
    const { told, closed, listener } = noteListener();
    const namespace = {
      idFromName: (name: string) => name,
      get: () =>
        ({
          watch: async () => Promise.reject(new Error("no events")),
        }) as unknown as RunObjectApi,
    };
    new DurableRunEvents({ namespace }).subscribe(runId, 0, listener);
    await closed;
    expect(told).toEqual(["error: no events"]);
  });

  it("frees the watcher when a line is not JSON", async () => {
    const object = fakeObject();
    const { told, closed, listener } = noteListener();
    new DurableRunEvents({ namespace: object.namespace }).subscribe(runId, 0, listener);
    object.sendBytes(new TextEncoder().encode("not json\n"));
    await closed;
    expect(told).toHaveLength(1);
    expect(String(told[0])).toMatch(/^error: /);
    expect(object.wasCancelled()).toBe(true);
  });

  it("frees the watcher when the listener throws", async () => {
    const object = fakeObject();
    let resolveClosed!: (error: Error | undefined) => void;
    const closed = new Promise<Error | undefined>((resolve) => {
      resolveClosed = resolve;
    });
    const listener: RunEventListener = {
      onEvent: () => {
        throw new Error("listener broke");
      },
      onClose: (error) => resolveClosed(error),
    };
    new DurableRunEvents({ namespace: object.namespace }).subscribe(runId, 0, listener);
    object.send(started(runId));
    expect((await closed)?.message).toBe("listener broke");
    expect(object.wasCancelled()).toBe(true);
  });

  it("never calls the listener before subscribe returns", async () => {
    const object = fakeObject();
    object.send(started(runId));
    object.end();
    const { told, closed, listener } = noteListener();
    new DurableRunEvents({ namespace: object.namespace }).subscribe(runId, 0, listener);
    expect(told).toEqual([]);
    await closed;
    expect(told).toEqual([1, "end"]);
  });

  it("stops and frees the watcher on close, with no call to the listener", async () => {
    const object = fakeObject();
    const { told, listener } = noteListener();
    const subscription = new DurableRunEvents({ namespace: object.namespace }).subscribe(
      runId,
      0,
      listener,
    );
    object.send(started(runId));
    await new Promise((resolve) => setTimeout(resolve, 0));
    subscription.close();
    subscription.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(object.wasCancelled()).toBe(true);
    expect(told).toEqual([1]);
  });

  it("frees the watcher when closed before the object answers", async () => {
    const object = fakeObject();
    const { told, listener } = noteListener();
    const subscription = new DurableRunEvents({ namespace: object.namespace }).subscribe(
      runId,
      0,
      listener,
    );
    subscription.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(object.wasCancelled()).toBe(true);
    expect(told).toEqual([]);
  });

  it("uses the name prefix to find the run's object", async () => {
    const object = fakeObject();
    const { closed, listener } = noteListener();
    new DurableRunEvents({ namespace: object.namespace, namePrefix: "case-" }).subscribe(
      runId,
      0,
      listener,
    );
    object.end();
    await closed;
    expect(object.asked[0]?.name).toBe("case-run-1");
  });
});
