import type { RunEvent } from "@halonicjs/events";
import { completed, entered, failed, started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { sqlOfStorage } from "../run-sql.ts";
import { RunState } from "../run-state.ts";
import { maxWatchers, RunWatchers } from "../run-watchers.ts";
import { inObjectState } from "./state-host.ts";
import { SuiteClock } from "./suite-case.ts";

export { StateHostObject } from "./state-host.ts";

const runId = "run_1";
const decoder = new TextDecoder();

/** Reads every event of a stream until it closes; the reader's error is thrown. */
async function readAll(stream: ReadableStream<Uint8Array>): Promise<number[]> {
  return (await readUntilDone(stream.getReader())).map((event) => event.seq);
}

async function readUntilDone(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return events;
    events.push(...parseLines(value));
  }
}

function parseLines(chunk: Uint8Array): RunEvent[] {
  return decoder
    .decode(chunk)
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as RunEvent);
}

/** A run state over a Durable Object's own storage, on a clock years ahead, so its alarm never fires. */
function newState(storage: DurableObjectStorage): RunState {
  const clock = new SuiteClock();
  return new RunState({
    sql: sqlOfStorage(storage),
    alarm: { set: (atMs) => storage.setAlarm(atMs), clear: () => storage.deleteAlarm() },
    clock: () => clock,
    nap: async () => {},
    listener: () => ({ onTimer: async () => {} }),
    runList: () => ({ publish: async () => {} }),
  });
}

/** A state whose log holds events 1 to `count`, the first being `run.started`. */
async function stateWithLog(storage: DurableObjectStorage, count: number): Promise<RunState> {
  const state = newState(storage);
  const events = [
    started(runId),
    ...Array.from({ length: count - 1 }, (_, i) => entered(runId, i + 2)),
  ];
  await state.append(runId, 0, events);
  return state;
}

describe("RunState watch", () => {
  it("gives the stored events after the seq, then each event as it is stored", () =>
    inObjectState(async ({ storage }) => {
      const state = await stateWithLog(storage, 3);
      const reader = (await state.watch(1)).getReader();
      await state.append(runId, 3, [entered(runId, 4)]);
      await state.append(runId, 4, [completed(runId, 5)]);
      expect((await readUntilDone(reader)).map((event) => event.seq)).toEqual([2, 3, 4, 5]);
    }));

  it("closes normally after the ending event, whichever event type ends the run", () =>
    inObjectState(async ({ storage }) => {
      const state = await stateWithLog(storage, 2);
      const stream = await state.watch();
      await state.append(runId, 2, [failed(runId, 3)]);
      expect(await readAll(stream)).toEqual([1, 2, 3]);
    }));

  it("sends a run that has already ended and closes at once", () =>
    inObjectState(async ({ storage }) => {
      const state = await stateWithLog(storage, 2);
      await state.append(runId, 2, [completed(runId, 3)]);
      expect(await readAll(await state.watch(1))).toEqual([2, 3]);
    }));

  it("gives a client that resumes after its last seq no event twice", () =>
    inObjectState(async ({ storage }) => {
      const state = await stateWithLog(storage, 3);
      const first = (await state.watch()).getReader();
      expect(parseLines((await first.read()).value as Uint8Array).map((e) => e.seq)).toEqual([1]);
      await first.cancel();
      await state.append(runId, 3, [entered(runId, 4), completed(runId, 5)]);
      expect(await readAll(await state.watch(1))).toEqual([2, 3, 4, 5]);
    }));

  it("gives every watcher every event, in order", () =>
    inObjectState(async ({ storage }) => {
      const state = await stateWithLog(storage, 1);
      const streams = await Promise.all([state.watch(), state.watch(), state.watch(1)]);
      await state.append(runId, 1, [entered(runId, 2)]);
      await state.append(runId, 2, [completed(runId, 3)]);
      expect(await Promise.all(streams.map(readAll))).toEqual([
        [1, 2, 3],
        [1, 2, 3],
        [2, 3],
      ]);
    }));

  it("refuses a run with no events", () =>
    inObjectState(async ({ storage }) => {
      await expect(newState(storage).watch()).rejects.toThrow("no events");
    }));

  it("gives nothing of an append that conflicted", () =>
    inObjectState(async ({ storage }) => {
      const state = await stateWithLog(storage, 2);
      const stream = await state.watch(2);
      const lost = await state.append(runId, 1, [entered(runId, 2), completed(runId, 3)]);
      expect(lost.ok).toBe(false);
      await state.append(runId, 2, [completed(runId, 3)]);
      expect(await readAll(stream)).toEqual([3]);
    }));
});

describe("RunWatchers", () => {
  it("drops an event at or below the last seq it gave", async () => {
    const watchers = new RunWatchers();
    const stream = watchers.open(0, [started(runId), entered(runId, 2)]);
    watchers.publish([entered(runId, 2), entered(runId, 3), completed(runId, 4)]);
    expect(await readAll(stream)).toEqual([1, 2, 3, 4]);
  });

  it("stops serving a stream the reader cancelled", async () => {
    const watchers = new RunWatchers();
    const stream = watchers.open(0, [started(runId)]);
    expect(watchers.count).toBe(1);
    await stream.cancel();
    expect(watchers.count).toBe(0);
  });

  it("stops serving a stream once the run has ended", () => {
    const watchers = new RunWatchers();
    watchers.open(0, [started(runId)]);
    watchers.publish([completed(runId, 2)]);
    expect(watchers.count).toBe(0);
  });

  it("refuses a watcher beyond the limit", () => {
    const watchers = new RunWatchers();
    for (let i = 0; i < maxWatchers; i++) watchers.open(0, [started(runId)]);
    expect(() => watchers.open(0, [started(runId)])).toThrow(RangeError);
  });

  it("gives a reader a stored backlog bigger than the limit, even when an event arrives before it reads", async () => {
    const watchers = new RunWatchers();
    const big = (seq: number) => entered(runId, seq, "x".repeat(2 * 1024 * 1024));
    const stream = watchers.open(0, [started(runId), big(2), big(3), big(4)]);
    watchers.publish([completed(runId, 5)]);
    expect(await readAll(stream)).toEqual([1, 2, 3, 4, 5]);
  });

  it("errors a stream whose reader fell too far behind, and frees its place", async () => {
    const watchers = new RunWatchers();
    const stream = watchers.open(0, [started(runId)]);
    const big = entered(runId, 2, "x".repeat(5 * 1024 * 1024));
    watchers.publish([big]);
    watchers.publish([entered(runId, 3)]);
    expect(watchers.count).toBe(0);
    await expect(readAll(stream)).rejects.toThrow("fell too far behind");
  });
});
