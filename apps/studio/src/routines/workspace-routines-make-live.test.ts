import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup, weekly } from "./workspace-routines.test-helper.ts";

verifies("studio.workspace-routines-make-live", () => {
  it("opens Create version with only the routine's own file, and answers what it answered", async () => {
    const opened: (readonly string[])[] = [];
    const names: (string | undefined)[] = [];
    const { host } = setup({
      versionDialog: async (paths, options) => {
        opened.push(paths);
        names.push(options?.name);
        return opened.length === 1 ? "made" : "cancelled";
      },
    });
    expect(await host.makeLive?.(weekly, { name: "Weekly report" })).toBe("made");
    expect(await host.makeLive?.({ hubId: null, id: "daily" })).toBe("cancelled");
    expect(names).toEqual(["Weekly report", undefined]);
    expect(opened).toEqual([
      ["hubs/acme/workflows/routines/weekly-report.routine.yaml"],
      ["workflows/routines/daily.routine.yaml"],
    ]);
  });

  it("has no Make live where the app can't open Create version", () => {
    expect(setup().host.makeLive).toBeUndefined();
  });
});
