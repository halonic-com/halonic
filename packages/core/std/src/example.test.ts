import { describe, expect, it } from "vitest";
import { runExample } from "../examples/ids-results-and-events.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", () => {
    expect(runExample()).toEqual({
      appId: "run_mjuohs00_abababab",
      testId: "run_1",
      time: "2026-01-01T00:00:00.000Z",
      doubled: { ok: true, value: 42 },
      failed: { ok: false, error: "no file" },
      names: ["weekly-report", "weekly-report-2"],
      same: true,
      saved: ["hubs/support/hub.yaml"],
    });
  });
});
