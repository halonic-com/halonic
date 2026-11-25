import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AllRuns, allRunsPollMs, mergeRuns, type RunSource } from "./all-runs.ts";

interface Row {
  readonly id: string;
  readonly startedAt: string;
}

const acme = { id: "workspace:acme", name: "Acme Ops" };
const teamOne = { id: "paperclip:acme", name: "Paperclip · Acme" };
const teamTwo = { id: "paperclip:globex", name: "Paperclip · Globex" };

function row(id: string, time: string): Row {
  return { id, startedAt: `2026-11-25T${time}:00Z` };
}

function source(name: typeof acme, read: () => Promise<readonly Row[]>): RunSource<Row> {
  return { ...name, read };
}

verifies("services.all-runs", () => {
  describe("mergeRuns", () => {
    it("merges a workspace's and two teams' rows newest first", () => {
      const merged = mergeRuns([
        { source: acme, rows: [row("w1", "09:00"), row("w2", "12:00")] },
        { source: teamOne, rows: [row("t1", "11:00")] },
        { source: teamTwo, rows: [row("g1", "13:00"), row("g2", "08:00")] },
      ]);
      expect(merged.rows.map((run) => run.id)).toEqual(["g1", "w2", "t1", "w1", "g2"]);
      expect(merged.failures).toEqual([]);
    });

    it("orders runs that started at the same time by id, and a start that isn't a time last", () => {
      const merged = mergeRuns([
        { source: acme, rows: [{ id: "bad", startedAt: "soon" }, row("b", "10:00")] },
        { source: teamOne, rows: [row("a", "10:00")] },
      ]);
      expect(merged.rows.map((run) => run.id)).toEqual(["a", "b", "bad"]);
    });

    it("keeps the other sources' rows and names the source that failed", () => {
      const error = new Error("Paperclip didn't answer");
      const merged = mergeRuns([
        { source: acme, rows: [row("w1", "09:00")] },
        { source: teamOne, rows: [], error },
        { source: teamTwo, rows: [row("g1", "10:00")] },
      ]);
      expect(merged.rows.map((run) => run.id)).toEqual(["g1", "w1"]);
      expect(merged.failures).toEqual([{ source: teamOne, error }]);
    });
  });

  describe("AllRuns", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("keeps a failing team's last rows, marks its error, and clears it once it answers", async () => {
      let teamAnswer: () => Promise<readonly Row[]> = async () => [row("t1", "11:00")];
      const all = new AllRuns(async () => [
        source(acme, async () => [row("w1", "09:00")]),
        source(teamOne, () => teamAnswer()),
      ]);
      await all.refresh();
      expect(all.state.rows.map((run) => run.id)).toEqual(["t1", "w1"]);

      const error = new Error("Paperclip didn't answer");
      teamAnswer = () => Promise.reject(error);
      await all.refresh();
      expect(all.state.rows.map((run) => run.id)).toEqual(["t1", "w1"]);
      expect(all.state.failures).toEqual([{ source: teamOne, error }]);

      teamAnswer = async () => [];
      await all.refresh();
      expect(all.state.rows.map((run) => run.id)).toEqual(["w1"]);
      expect(all.state.failures).toEqual([]);
    });

    it("lists the other sources when a team fails from its first read", async () => {
      const error = new Error("Paperclip didn't answer");
      const all = new AllRuns(async () => [
        source(acme, async () => [row("w1", "09:00")]),
        source(teamTwo, () => Promise.reject(error)),
      ]);
      await all.refresh();
      expect(all.state.rows.map((run) => run.id)).toEqual(["w1"]);
      expect(all.state.failures).toEqual([{ source: teamTwo, error }]);
    });

    it("reads the sources the caller gives on each read, so a team connected later joins", async () => {
      const sources = [source(acme, async () => [row("w1", "09:00")])];
      const all = new AllRuns(async () => sources);
      await all.refresh();
      sources.push(source(teamTwo, async () => [row("g1", "10:00")]));
      await all.refresh();
      expect(all.state.rows.map((run) => run.id)).toEqual(["g1", "w1"]);
    });

    it("keeps the rows and says why when listing the sources fails", async () => {
      const error = new Error("The agent host isn't answering");
      let list: () => Promise<readonly RunSource<Row>[]> = async () => [
        source(acme, async () => [row("w1", "09:00")]),
      ];
      const all = new AllRuns(() => list());
      await all.refresh();
      list = () => Promise.reject(error);
      await all.refresh();
      expect(all.state).toMatchObject({ loaded: true, error });
      expect(all.state.rows.map((run) => run.id)).toEqual(["w1"]);
    });

    it("reads every 30 seconds while someone subscribes, and stops after the last leaves", async () => {
      const read = vi.fn(async () => [row("w1", "09:00")]);
      const all = new AllRuns(async () => [source(acme, read)]);
      const heard = vi.fn();
      const stop = all.subscribe(heard);
      const stopOther = all.subscribe(() => undefined);
      await vi.advanceTimersByTimeAsync(0);
      expect(read).toHaveBeenCalledTimes(1);
      expect(heard).toHaveBeenCalledTimes(1);

      stop();
      await vi.advanceTimersByTimeAsync(allRunsPollMs);
      expect(read).toHaveBeenCalledTimes(2);

      stopOther();
      await vi.advanceTimersByTimeAsync(allRunsPollMs * 3);
      expect(read).toHaveBeenCalledTimes(2);
    });

    it("reads at the interval it is given, until it is disposed", async () => {
      const read = vi.fn(async () => [row("w1", "09:00")]);
      const all = new AllRuns(async () => [source(acme, read)], { pollMs: 5_000 });
      all.subscribe(() => undefined);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(read).toHaveBeenCalledTimes(2);
      all.dispose();
      all.dispose();
      await vi.advanceTimersByTimeAsync(50_000);
      expect(read).toHaveBeenCalledTimes(2);
    });

    it("reads once more when asked during a read, never twice at once", async () => {
      let release: () => void = () => undefined;
      const read = vi.fn(
        () =>
          new Promise<readonly Row[]>((resolve) => {
            release = () => resolve([row("w1", "09:00")]);
          }),
      );
      const all = new AllRuns(async () => [source(acme, read)]);
      const first = all.refresh();
      const second = all.refresh();
      await vi.advanceTimersByTimeAsync(0);
      expect(read).toHaveBeenCalledTimes(1);
      release();
      await vi.advanceTimersByTimeAsync(0);
      expect(read).toHaveBeenCalledTimes(2);
      release();
      await Promise.all([first, second]);
      expect(all.state.rows).toHaveLength(1);
    });
  });
});
