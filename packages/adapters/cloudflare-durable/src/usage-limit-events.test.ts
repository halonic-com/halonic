import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  runningCountRow,
  type StopCode,
  stopRow,
  waitExpiredRow,
  waitStartRow,
} from "./usage-limit-events.ts";

const marker = "acme-marker-7f3a";
const base = { scope: "u/acme", runId: "run_1", at: 1_000 };

verifies("cloudflare-durable.usage-limit-events", () => {
  it("builds each kind from typed fields only", () => {
    expect(stopRow({ ...base, code: "plan.cost", phase: "reserve" })).toEqual({
      kind: "stop",
      id: "stop|u/acme|run_1|1000|plan.cost|reserve",
      ...base,
      code: "plan.cost",
      phase: "reserve",
    });
    expect(waitStartRow({ ...base, code: "plan.concurrency" })).toMatchObject({
      kind: "wait-start",
      code: "plan.concurrency",
    });
    expect(waitExpiredRow({ ...base, waitedSince: 400 })).toMatchObject({
      kind: "wait-expired",
      waitedSince: 400,
    });
    expect(runningCountRow({ scope: "o/acme", running: 3, change: 7, at: 1_000 })).toEqual({
      kind: "running-count",
      id: "running|o/acme|7",
      scope: "o/acme",
      running: 3,
      at: 1_000,
    });
  });

  it("carries no text from a run into any row", () => {
    const extra = { note: marker } as object;
    const rows = [
      stopRow({ ...base, code: "plan.none", ...extra }),
      waitStartRow({ ...base, code: "plan.member.steps", ...extra }),
      waitExpiredRow({ ...base, waitedSince: 0, ...extra }),
      stopRow({ ...base, code: "plan.cost", phase: "reserve", ...extra }),
      runningCountRow({ scope: "u/acme", running: 1, change: 1, at: 1, ...extra }),
    ];
    expect(JSON.stringify(rows)).not.toContain(marker);
  });

  describe("refuses what isn't typed", () => {
    it("without echoing a refused code", () => {
      expect(() => stopRow({ ...base, code: marker as StopCode })).toThrow(
        expect.objectContaining({ message: expect.not.stringContaining(marker) }),
      );
    });

    it("free text where an id, a code or a phase goes", () => {
      expect(() => stopRow({ ...base, runId: `${marker} hi`, code: "plan.none" })).toThrow(
        RangeError,
      );
      expect(() => stopRow({ ...base, scope: marker, code: "plan.none" })).toThrow(RangeError);
      expect(() => stopRow({ ...base, code: marker as StopCode })).toThrow(RangeError);
      expect(() => stopRow({ ...base, code: `plan.${marker}` as StopCode })).toThrow(RangeError);
      expect(() => waitStartRow({ ...base, code: "plan.member." as StopCode })).toThrow(RangeError);
      expect(() => stopRow({ ...base, code: "plan.none", phase: marker as "reserve" })).toThrow(
        RangeError,
      );
    });

    it("a number or time that isn't a whole number of 0 or more", () => {
      expect(() => runningCountRow({ scope: "u/acme", running: -1, change: 1, at: 1 })).toThrow(
        RangeError,
      );
      expect(() => runningCountRow({ scope: "u/acme", running: 1.5, change: 1, at: 1 })).toThrow(
        RangeError,
      );
      expect(() => stopRow({ ...base, at: Number.NaN, code: "plan.none" })).toThrow(RangeError);
      expect(() => waitExpiredRow({ ...base, waitedSince: 2_000 })).toThrow(RangeError);
      expect(() => waitExpiredRow({ ...base, waitedSince: marker as unknown as number })).toThrow(
        RangeError,
      );
      expect(() => runningCountRow({ scope: "u/acme", running: 1, change: -1, at: 1 })).toThrow(
        RangeError,
      );
      expect(() =>
        runningCountRow({
          scope: "u/acme",
          running: 1,
          change: marker as unknown as number,
          at: 1,
        }),
      ).toThrow(RangeError);
    });
  });

  it("gives the same event the same id and a different one another", () => {
    const stop = { ...base, code: "plan.cost" } as const;
    expect(stopRow(stop).id).toBe(stopRow(stop).id);
    expect(stopRow(stop).id).not.toBe(stopRow({ ...stop, at: 5_000 }).id);
    expect(stopRow(stop).id).not.toBe(stopRow({ ...stop, scope: "o/acme" }).id);
    expect(waitExpiredRow({ ...base, waitedSince: 1 }).id).toBe(
      waitExpiredRow({ ...base, waitedSince: 1, at: 9_000 }).id,
    );
    expect(waitExpiredRow({ ...base, waitedSince: 1 }).id).not.toBe(
      waitExpiredRow({ ...base, scope: "o/acme", waitedSince: 1 }).id,
    );
    expect(stopRow(stop).id).not.toBe(stopRow({ ...stop, phase: "reserve" }).id);
    expect(waitStartRow({ ...stop, at: 1 }).id).not.toBe(waitStartRow({ ...stop, at: 2 }).id);
    const count = { scope: "u/acme", running: 2, at: 1 };
    expect(runningCountRow({ ...count, change: 1 }).id).not.toBe(
      runningCountRow({ ...count, change: 2 }).id,
    );
  });
});
