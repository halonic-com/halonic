import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RunState } from "../kernel/run-state.ts";
import { ConfigMeter } from "./config-meter.ts";
import type { MeterPrincipal } from "./meter.ts";
import { runEndUsageOf } from "./metered-usage.ts";

const ada: MeterPrincipal = {
  actor: "eu_ada00000000000001",
  scope: "u/eu_ada00000000000001",
  role: "owner",
};
const key = `config-meter/${ada.scope}`;

/** The value part of `Coordination` in memory: all the meter uses. */
class TestValues implements Pick<Coordination, "read" | "compareAndSet"> {
  readonly values = new Map<string, string>();

  async read(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async compareAndSet(key: string, expected: string | null, next: string | null): Promise<boolean> {
    if ((this.values.get(key) ?? null) !== expected) return false;
    if (next === null) this.values.delete(key);
    else this.values.set(key, next);
    return true;
  }
}

function meterWith(values: TestValues) {
  const clock = { at: new Date("2026-11-23T10:00:00.000Z"), now: () => new Date(clock.at) };
  const meter = new ConfigMeter({
    settings: { limits: [] },
    coordination: values,
    clock,
    ids: { next: (prefix: string) => `${prefix}1` },
    running: { count: async () => ({ scope: 0, actor: 0 }) },
  });
  return { meter, clock };
}

const runEnd = (runId: string) => runEndUsageOf({ runId, status: "completed" } as RunState);

/** The month's runs counted for the scope, and the ids of the ended runs it keeps. */
function storedOf(values: TestValues) {
  const stored = JSON.parse(values.values.get(key) ?? "null");
  return { runs: stored.pool["runs/2026-11"], ended: Object.keys(stored.ended ?? {}) };
}

verifies("engine.config-meter", () => {
  describe("a run's end", () => {
    it("counts once when it is recorded twice, and another run's end still counts", async () => {
      const values = new TestValues();
      const { meter } = meterWith(values);
      await meter.record(ada, runEnd("r-acme-1"));
      await meter.record(ada, runEnd("r-acme-1"));
      expect(storedOf(values).runs).toBe(1);
      await meter.record(ada, runEnd("r-acme-2"));
      expect(storedOf(values)).toEqual({ runs: 2, ended: ["r-acme-1", "r-acme-2"] });
    });

    it("reads counts stored before run ends were kept, and keeps them from then on", async () => {
      const values = new TestValues();
      const before = { pool: { "runs/2026-11": 3 }, members: {}, held: {} };
      values.values.set(key, JSON.stringify(before));
      const { meter } = meterWith(values);
      await meter.record(ada, runEnd("r-acme-1"));
      await meter.record(ada, runEnd("r-acme-1"));
      expect(storedOf(values)).toEqual({ runs: 4, ended: ["r-acme-1"] });
    });

    it("throws rather than counting from 0 when the kept ends aren't readable", async () => {
      const values = new TestValues();
      const stored = { pool: {}, members: {}, held: {}, ended: { "r-acme-1": "yesterday" } };
      values.values.set(key, JSON.stringify(stored));
      const { meter } = meterWith(values);
      await expect(meter.record(ada, runEnd("r-acme-1"))).rejects.toThrow(/isn't readable/);
    });

    it("counts again once two days have passed and its id is no longer kept", async () => {
      const values = new TestValues();
      const { meter, clock } = meterWith(values);
      await meter.record(ada, runEnd("r-acme-1"));
      clock.at = new Date("2026-11-25T09:59:59.999Z");
      await meter.record(ada, runEnd("r-acme-1"));
      expect(storedOf(values).runs).toBe(1);
      clock.at = new Date("2026-11-25T10:00:00.000Z");
      await meter.record(ada, runEnd("r-acme-2"));
      expect(storedOf(values).ended).toEqual(["r-acme-2"]);
      await meter.record(ada, runEnd("r-acme-1"));
      expect(storedOf(values).runs).toBe(3);
    });

    it("keeps the newest ids within 8 KiB, so a busy scope forgets its oldest ends first", async () => {
      const values = new TestValues();
      const { meter, clock } = meterWith(values);
      const ids = Array.from(
        { length: 300 },
        (_, index) => `r-acme-${String(index).padStart(32, "0")}`,
      );
      for (const [index, runId] of ids.entries()) {
        clock.at = new Date(Date.parse("2026-11-23T10:00:00.000Z") + index * 1000);
        await meter.record(ada, runEnd(runId));
      }
      const stored = JSON.parse(values.values.get(key) ?? "null");
      expect(new TextEncoder().encode(JSON.stringify(stored.ended)).length).toBeLessThanOrEqual(
        8 * 1024,
      );
      const { ended } = storedOf(values);
      expect(ended).toContain(ids.at(-1));
      expect(ended).not.toContain(ids[0]);
      await meter.record(ada, runEnd(ids.at(-1) ?? ""));
      expect(storedOf(values).runs).toBe(300);
    });
  });
});
