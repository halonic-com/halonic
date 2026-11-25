import type { PlacedRoutine } from "@halonicjs/routines";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { nextRoutineAt } from "./next-routine.ts";

const at = (iso: string) => new Date(iso);

/** A routine of the acme hub with `trigger`, on unless `enabled` says otherwise. */
function placed(id: string, trigger: object, enabled = true): PlacedRoutine {
  return {
    hub: "acme",
    routine: { id, enabled, trigger, catchUp: "last" },
  } as unknown as PlacedRoutine;
}

verifies("agent-host.engine-health-next-routine", () => {
  it("gives the earliest next start of the routines that are on", () => {
    const routines = [
      placed("digest", { schedule: "0 14 * * *" }),
      placed("sync", { every: "6h" }),
      placed("early", { schedule: "0 10 * * *" }, false),
    ];
    expect(nextRoutineAt(routines, at("2026-11-25T09:00:00Z"), "UTC")).toBe(
      "2026-11-25T12:00:00.000Z",
    );
  });

  it("reads a schedule without a zone in the computer's zone", () => {
    const routines = [placed("digest", { schedule: "0 14 * * *" })];
    expect(nextRoutineAt(routines, at("2026-11-25T09:00:00Z"), "Europe/Madrid")).toBe(
      "2026-11-25T13:00:00.000Z",
    );
  });

  it("skips a schedule that doesn't parse, and still gives the others", () => {
    const routines = [
      placed("broken", { schedule: "61 * * * *" }),
      placed("hourly", { every: "1h" }),
    ];
    expect(nextRoutineAt(routines, at("2026-11-25T09:20:00Z"), "UTC")).toBe(
      "2026-11-25T10:00:00.000Z",
    );
  });

  it("is null when no routine starts on a clock", () => {
    const routines = [placed("by-hand", { manual: true }), placed("off", { every: "1h" }, false)];
    expect(nextRoutineAt(routines, at("2026-11-25T09:00:00Z"), "UTC")).toBe(null);
    expect(nextRoutineAt([], at("2026-11-25T09:00:00Z"), "UTC")).toBe(null);
  });
});
