import { loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { routineClocks } from "./routine-clocks.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

function routineFile(id: string, name: string, trigger: string): string {
  return [`id: ${id}`, `name: ${name}`, `trigger: ${trigger}`, "run: { workflow: report }"].join(
    "\n",
  );
}

async function clocksOf(files: Record<string, string>) {
  return routineClocks(await loadWorkspace(new TestDefinitionStore(files)));
}

describe("routineClocks", () => {
  it("gives each routine's name and schedule by its key, without the time zone", async () => {
    const clocks = await clocksOf({
      "hubs/reports/workflows/routines/weekly.routine.yaml": routineFile(
        "weekly",
        "Weekly report",
        '{ schedule: "0 9 * * 1", timezone: Europe/Amsterdam }',
      ),
      "workflows/routines/sweep.routine.yaml": routineFile("sweep", "Inbox sweep", "{ every: 2h }"),
    });

    expect(clocks.get("reports/weekly")).toEqual({
      name: "Weekly report",
      schedule: "Mondays at 09:00",
    });
    expect(clocks.get("@workspace/sweep")).toEqual({
      name: "Inbox sweep",
      schedule: "Every 2 hours (UTC)",
    });
  });

  it("has no schedule for a routine that isn't on a clock, or whose schedule doesn't parse", async () => {
    const clocks = await clocksOf({
      "workflows/routines/by-hand.routine.yaml": routineFile(
        "by-hand",
        "By hand",
        "{ manual: true }",
      ),
      "workflows/routines/broken.routine.yaml": routineFile(
        "broken",
        "Broken",
        '{ schedule: "61 * * * *" }',
      ),
    });

    expect(clocks.get("@workspace/by-hand")).toEqual({ name: "By hand", schedule: undefined });
    expect(clocks.get("@workspace/broken")).toEqual({ name: "Broken", schedule: undefined });
  });
});
