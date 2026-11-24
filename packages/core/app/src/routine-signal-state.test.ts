import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MAX_QUEUED } from "./routine-overlap.ts";
import { noSignals, readSignalState, writeSignalState } from "./routine-signal-state.ts";

verifies("app.scheduler-starts-signal-routines", () => {
  it("reads what it wrote, and nothing as an empty state", () => {
    const state = {
      decided: { "routine-a": "2026-11-03T10:00:30.000Z" },
      queue: { "billing/thanks": [{ id: "run-1:2", at: "2026-11-03T10:00:30.000Z" }] },
    };
    const { text } = writeSignalState(state);
    expect(readSignalState(text)).toEqual(state);
    expect(writeSignalState(noSignals()).text).toBeNull();
  });

  it("counts a damaged value as empty rather than stopping the routines", () => {
    expect(readSignalState("{not json")).toEqual(noSignals());
    expect(readSignalState('{"decided":[],"queue":{}}')).toEqual(noSignals());
    expect(readSignalState('{"decided":{},"queue":{"k":[{"id":1}]}}')).toEqual({
      decided: {},
      queue: { k: [] },
    });
  });

  it("keeps at most 100 queued signals a routine, and the oldest when the value is full", () => {
    const at = (n: number) => new Date(Date.UTC(2026, 10, 3, 10, 0, n)).toISOString();
    const signals = (key: string, count: number) =>
      Array.from({ length: count }, (_, n) => ({
        id: `${key}-run:${n}`.padEnd(300, "x"),
        at: at(n),
      }));
    const capped = writeSignalState({ decided: {}, queue: { a: signals("a", MAX_QUEUED + 2) } });
    expect(capped.dropped).toHaveLength(2);
    const full = writeSignalState({
      decided: {},
      queue: { a: signals("a", 100), b: signals("b", 100), c: signals("c", 100) },
    });
    expect((full.text ?? "").length).toBeLessThanOrEqual(60_000);
    expect(full.dropped.every(({ signal }) => signal.at >= at(50))).toBe(true);
  });
});
