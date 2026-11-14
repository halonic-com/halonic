import type { RunEvent } from "@halonicjs/events";
import { completed, entered, failed, started } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { NodeRunSql } from "./node/node-sql.spec.ts";
import { type AlarmSlot, RunState } from "./run-state.ts";
import { maxWatchers, RunWatchers } from "./run-watchers.ts";

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

const noAlarm: AlarmSlot = { set: async () => {}, clear: async () => {} };

function newState(): RunState {
  return new RunState({
    sql: new NodeRunSql(),
    alarm: noAlarm,
    clock: () => ({ now: () => new Date() }),
    nap: async () => {},
    listener: () => ({ onTimer: async () => {} }),
    runList: () => ({ publish: async () => {} }),
  });
}

/** A state whose log holds events 1 to `count`, the first being `run.started`. */
async function stateWithLog(count: number): Promise<RunState> {
  const state = newState();
  const events = [
    started(runId),
    ...Array.from({ length: count - 1 }, (_, i) => entered(runId, i + 2)),
  ];
  await state.append(runId, 0, events);
  return state;
}

verifies("cloudflare-durable.run-events", () => {
  describe("RunState watch", () => {
    it("gives the stored events after the seq, then each event as it is stored", async () => {
      const state = await stateWithLog(3);
      const reader = (await state.watch(1)).getReader();
      await state.append(runId, 3, [entered(runId, 4)]);
      await state.append(runId, 4, [completed(runId, 5)]);
      expect((await readUntilDone(reader)).map((event) => event.seq)).toEqual([2, 3, 4, 5]);
    });

    it("closes normally after the ending event, whichever event type ends the run", async () => {
      const state = await stateWithLog(2);
      const stream = await state.watch();
      await state.append(runId, 2, [failed(runId, 3)]);
      expect(await readAll(stream)).toEqual([1, 2, 3]);
    });

    it("sends a run that has already ended and closes at once", async () => {
      const state = await stateWithLog(2);
      await state.append(runId, 2, [completed(runId, 3)]);
      expect(await readAll(await state.watch(1))).toEqual([2, 3]);
    });

    it("gives a client that resumes after its last seq no event twice", async () => {
      const state = await stateWithLog(3);
      const first = (await state.watch()).getReader();
      expect(parseLines((await first.read()).value as Uint8Array).map((e) => e.seq)).toEqual([1]);
      await first.cancel();
      await state.append(runId, 3, [entered(runId, 4), completed(runId, 5)]);
      expect(await readAll(await state.watch(1))).toEqual([2, 3, 4, 5]);
    });

    it("gives every watcher every event, in order", async () => {
      const state = await stateWithLog(1);
      const streams = await Promise.all([state.watch(), state.watch(), state.watch(1)]);
      await state.append(runId, 1, [entered(runId, 2)]);
      await state.append(runId, 2, [completed(runId, 3)]);
      expect(await Promise.all(streams.map(readAll))).toEqual([
        [1, 2, 3],
        [1, 2, 3],
        [2, 3],
      ]);
    });

    it("refuses a run with no events", async () => {
      await expect(newState().watch()).rejects.toThrow("no events");
    });

    it("gives nothing of an append that conflicted", async () => {
      const state = await stateWithLog(2);
      const stream = await state.watch(2);
      const lost = await state.append(runId, 1, [entered(runId, 2), completed(runId, 3)]);
      expect(lost.ok).toBe(false);
      await state.append(runId, 2, [completed(runId, 3)]);
      expect(await readAll(stream)).toEqual([3]);
    });
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
});
