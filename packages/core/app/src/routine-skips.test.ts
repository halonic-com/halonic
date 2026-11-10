import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { shortHash, skipsKeyByHash } from "./routine-ids.ts";
import {
  addSkips,
  MAX_SKIP_RECORDS,
  type SkippedTimes,
  type SkipRecord,
  SkipRecords,
} from "./routine-skips.ts";
import { TestCoordination } from "./testing/memory-coordination.ts";

const workspace = "ws-7f3a2c";
const routine = "acme/support-replies";
const monday = new Date("2026-11-09T08:12:00Z");

const skip = (
  reason: SkippedTimes["reason"],
  from: string,
  to: string,
  count: number,
): SkippedTimes => ({ reason, from: new Date(from), to: new Date(to), count });

const busyAt = (hour: string): SkippedTimes =>
  skip("busy", `2026-11-09T${hour}:00Z`, `2026-11-09T${hour}:00Z`, 1);

verifies("app.skip-records", () => {
  it("keeps a tick's skips as rows with reason, range, count and decision time", async () => {
    const records = new SkipRecords(new TestCoordination(), workspace);
    const latest = skip("latest", "2026-11-06T19:00Z", "2026-11-09T07:00Z", 61);
    expect(await records.add(routine, [latest], null, monday)).toBe(true);
    expect(await records.read(routine)).toEqual([
      {
        reason: "latest",
        from: "2026-11-06T19:00:00.000Z",
        to: "2026-11-09T07:00:00.000Z",
        count: 61,
        decidedAt: "2026-11-09T08:12:00.000Z",
      },
    ]);
    expect(await records.read("acme/daily")).toEqual([]);
  });

  it("continues the newest row unless a run was due in between", () => {
    const first = addSkips([], [busyAt("10")], new Date("2026-11-09T09:00Z"), monday);
    const later = new Date("2026-11-09T11:00:20Z");
    const continued = addSkips(first, [busyAt("11")], new Date("2026-11-09T09:00Z"), later);
    expect(continued).toEqual([
      {
        reason: "busy",
        from: "2026-11-09T10:00:00.000Z",
        to: "2026-11-09T11:00:00.000Z",
        count: 2,
        decidedAt: "2026-11-09T11:00:20.000Z",
      },
    ]);
    const afterRun = addSkips(first, [busyAt("11")], new Date("2026-11-09T10:30Z"), later);
    expect(afterRun.map((row) => [row.from, row.count])).toEqual([
      ["2026-11-09T11:00:00.000Z", 1],
      ["2026-11-09T10:00:00.000Z", 1],
    ]);
  });

  it("gives each reason its own row, and adds nothing for a range it already holds", () => {
    const window = skip("window", "2026-10-25T19:00Z", "2026-11-02T08:00Z", 182);
    const cap = skip("cap", "2026-11-02T09:00Z", "2026-11-05T04:00Z", 68);
    const rows = addSkips([], [cap, window], null, monday);
    expect(rows.map((row) => row.reason)).toEqual(["cap", "window"]);
    expect(addSkips(rows, [cap], null, monday)).toEqual(rows);
  });

  it("keeps the minimum mark when rows merge", () => {
    const counted = { ...skip("missed", "2026-11-01T00:00Z", "2026-11-08T00:00Z", 10_000) };
    const rows = addSkips([], [{ ...counted, countIsMinimum: true }], null, monday);
    const merged = addSkips(
      rows,
      [skip("missed", "2026-11-09T00:00Z", "2026-11-09T01:00Z", 2)],
      null,
      monday,
    );
    expect(merged).toMatchObject([{ count: 10_002, countIsMinimum: true }]);
  });

  it("keeps the newest 20 rows", () => {
    let rows: SkipRecord[] = [];
    for (let day = 1; day <= MAX_SKIP_RECORDS + 1; day++) {
      const at = `2026-10-${String(day).padStart(2, "0")}T06:00Z`;
      const reason = day % 2 === 0 ? "busy" : "missed";
      rows = addSkips(rows, [skip(reason, at, at, 1)], null, monday);
    }
    expect(rows.length).toBe(MAX_SKIP_RECORDS);
    expect(rows.at(-1)?.from).toBe("2026-10-02T06:00:00.000Z");
  });

  it("retries when another host stored the rows first", async () => {
    const coordination = new TestCoordination();
    const records = new SkipRecords(coordination, workspace);
    const key = skipsKeyByHash(workspace, shortHash(routine));
    const compareAndSet = coordination.compareAndSet.bind(coordination);
    let raced = false;
    coordination.compareAndSet = async (target, expected, next) => {
      if (!raced) {
        raced = true;
        const other = addSkips([], [busyAt("06")], null, monday);
        await compareAndSet(key, null, JSON.stringify(other));
      }
      return compareAndSet(target, expected, next);
    };
    expect(await records.add(routine, [busyAt("07")], null, monday)).toBe(true);
    expect(await records.read(routine)).toMatchObject([
      { from: "2026-11-09T06:00:00.000Z", count: 2 },
    ]);
  });

  it("reads a damaged value as no rows, and leaves out rows that aren't rows", async () => {
    const coordination = new TestCoordination();
    const records = new SkipRecords(coordination, workspace);
    const key = skipsKeyByHash(workspace, shortHash(routine));
    coordination.values.set(key, "{not json");
    expect(await records.read(routine)).toEqual([]);
    const good = addSkips([], [busyAt("06")], null, monday);
    coordination.values.set(key, JSON.stringify([...good, { reason: "asleep" }, 3, null]));
    expect(await records.read(routine)).toEqual(good);
  });

  it("deletes a removed routine's rows, and keeps when the queue was lost", async () => {
    const records = new SkipRecords(new TestCoordination(), workspace);
    await records.add(routine, [busyAt("06")], null, monday);
    await records.forget(shortHash(routine));
    expect(await records.read(routine)).toEqual([]);
    expect(await records.lastQueueLoss()).toBeNull();
    await records.queueLost(monday);
    expect(await records.lastQueueLoss()).toBe("2026-11-09T08:12:00.000Z");
  });
});
