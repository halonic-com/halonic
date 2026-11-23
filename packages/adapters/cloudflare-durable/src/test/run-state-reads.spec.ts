// A read of a run object that was never written stores nothing (see `run-state.test.ts`).

import { started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { newState, rowsOf } from "./run-state-case.ts";
import { inObjectState } from "./state-host.ts";

export { StateHostObject } from "./state-host.ts";

/** The names of the tables in the object's storage. */
function tablesOf(storage: DurableObjectStorage): string[] {
  const rows = rowsOf(
    storage.sql.exec<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite%'",
    ),
  );
  return rows.map((row) => row.name).sort();
}

describe("RunState reads of a run never written", () => {
  it("answers as an empty run and leaves no tables and no alarm", () =>
    inObjectState(async ({ storage }) => {
      const { state } = newState(storage);
      expect(await state.events()).toEqual([]);
      expect(await state.snapshot()).toBeNull();
      expect(await state.summary()).toBeNull();
      expect(await state.health()).toEqual({ lastEventAt: null, ended: false, overdueMs: 0 });
      expect(await state.pending("r1")).toEqual([]);
      expect(await state.namePrefix()).toBeNull();
      await state.cancel("r1", "wait");
      await state.alarm();
      await expect(state.watch()).rejects.toThrow("This run has no events.");
      expect(tablesOf(storage)).toEqual([]);
      expect(await storage.getAlarm()).toBeNull();
    }));

  it("creates the tables on the first write", () =>
    inObjectState(async ({ storage }) => {
      const { state } = newState(storage);
      await state.append("r1", 0, [started("r1")]);
      expect(tablesOf(storage)).toEqual(["events", "name_prefix", "outbox", "snapshot", "timers"]);
      expect((await state.events()).map((event) => event.seq)).toEqual([1]);
    }));
});
