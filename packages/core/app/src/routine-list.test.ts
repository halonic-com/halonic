import type { RunEventBody, RunKind } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { type ListedRoutine, RoutineList } from "./routine-list.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { MemoryRuns } from "./testing/memory-runs.ts";

/** Wednesday 11 Nov 2026, 10:00 UTC. */
const now = new Date(Date.UTC(2026, 10, 11, 10, 0));

function routineFile(id: string, trigger: string, more: readonly string[] = []): string {
  return [
    `id: ${id}`,
    `name: ${id} routine`,
    `trigger: ${trigger}`,
    "run: { workflow: report }",
    ...more,
  ].join("\n");
}

function routinePath(id: string): string {
  return `hubs/reports/workflows/routines/${id}.routine.yaml`;
}

/** The start of a run of `report`, by the routine `reports/<routineId>`, or by hand when it is `null`. */
function startedBy(routineId: string | null, kind: RunKind = "run"): RunEventBody {
  return {
    type: "run.started",
    hubId: "reports",
    workflowId: "report",
    input: {},
    kind,
    definitionsVersion: "v1",
    ...(routineId === null
      ? {}
      : {
          trigger: {
            type: "schedule",
            routineId: `reports/${routineId}`,
            at: "2026-11-09T08:00:00.000Z",
          },
        }),
  };
}

async function listed(
  files: Record<string, string>,
  runs = new MemoryRuns(),
): Promise<ListedRoutine[]> {
  const workspace = await loadWorkspace(new TestDefinitionStore(files));
  return new RoutineList(runs).listRoutines(workspace, now, "Europe/Amsterdam");
}

verifies("app.routine-list", () => {
  describe("each field of a row", () => {
    it("gives the key, hub, id, name and whether it's on", async () => {
      const [routine] = await listed({
        [routinePath("weekly")]: routineFile("weekly", "{ every: 1d }"),
      });

      expect(routine).toMatchObject({
        key: "reports/weekly",
        hubId: "reports",
        routineId: "weekly",
        name: "weekly routine",
        enabled: true,
      });
    });

    it("keys a routine at the workspace root by @workspace", async () => {
      const [routine] = await listed({
        "workflows/routines/backup.routine.yaml": [
          "id: backup",
          "name: Backup",
          "trigger: { every: 1d }",
          "run: { hub: reports, workflow: report }",
        ].join("\n"),
      });

      expect(routine).toMatchObject({ key: "@workspace/backup", hubId: null });
    });

    it("writes the trigger in words and reads a schedule in the zone given", async () => {
      const [routine] = await listed({
        [routinePath("weekly")]: routineFile("weekly", '{ schedule: "0 9 * * 1" }'),
      });

      expect(routine?.trigger).toBe("Mondays at 09:00");
      // 09:00 in Amsterdam is 08:00 UTC in November.
      expect(routine?.nextRun).toBe("2026-11-16T08:00:00.000Z");
    });

    it("has no next run for a routine that's off, or one no clock starts", async () => {
      const routines = await listed({
        [routinePath("off")]: routineFile("off", "{ every: 15m }", ["enabled: false"]),
        [routinePath("on-demand")]: routineFile("on-demand", "{ manual: true }"),
      });

      expect(routines.map((each) => [each.routineId, each.trigger, each.nextRun])).toEqual([
        ["off", "Every 15 minutes", null],
        ["on-demand", "Manual only", null],
      ]);
    });

    it("gives the newest run each routine started as its last run", async () => {
      const runs = new MemoryRuns();
      runs.add("run_old", "2026-11-09T08:00:00.000Z", [startedBy("weekly")]);
      runs.add("run_new", "2026-11-10T08:00:00.000Z", [startedBy("weekly")]);
      runs.add("run_by_hand", "2026-11-11T09:00:00.000Z", [startedBy(null)]);

      const routines = await listed(
        {
          [routinePath("weekly")]: routineFile("weekly", "{ every: 1d }"),
          [routinePath("never")]: routineFile("never", "{ every: 1d }"),
        },
        runs,
      );

      expect(routines.map((each) => [each.routineId, each.lastRun?.id ?? null])).toEqual([
        ["never", null],
        ["weekly", "run_new"],
      ]);
    });

    it("never counts a test run as the last run", async () => {
      const runs = new MemoryRuns();
      runs.add("run_test", "2026-11-10T08:00:00.000Z", [startedBy("weekly", "test")]);

      const [routine] = await listed(
        { [routinePath("weekly")]: routineFile("weekly", "{ every: 1d }") },
        runs,
      );

      expect(routine?.lastRun).toBeNull();
    });
  });

  it("lists a routine whose schedule doesn't parse, with no next run, and the rest after it", async () => {
    const routines = await listed({
      [routinePath("broken")]: routineFile("broken", '{ schedule: "61 * * * *" }'),
      [routinePath("daily")]: routineFile("daily", "{ every: 1d }"),
    });

    expect(routines.map((each) => [each.routineId, each.nextRun])).toEqual([
      ["broken", null],
      ["daily", "2026-11-12T00:00:00.000Z"],
    ]);
  });
});
