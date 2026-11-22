import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { liveVersionOf } from "./live-version.ts";
import { type ListedRoutine, RoutineList } from "./routine-list.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { MemoryRuns } from "./testing/memory-runs.ts";
import { TestVersions } from "./testing/test-versions.ts";

/** Wednesday 11 Nov 2026, 10:00 UTC. */
const now = new Date(Date.UTC(2026, 10, 11, 10, 0));

const weeklyPath = "hubs/reports/workflows/routines/weekly.routine.yaml";

/** The workflow `report` the routine starts, which finishes straight away. */
const report = {
  "hubs/reports/workflows/report.workflow.yaml": [
    "id: report",
    "name: Report",
    "initial: done",
    "states:",
    "  done:",
    "    type: final",
  ].join("\n"),
};

/** The routine "weekly", which starts workflow `report` on `schedule`. */
function weekly(schedule: string, more: readonly string[] = []): string {
  return [
    "id: weekly",
    "name: Weekly report",
    `trigger: { schedule: "${schedule}" }`,
    "run: { workflow: report }",
    ...more,
  ].join("\n");
}

/** The routines of these saved files, listed with the live version `versions` has. */
async function listedLive(
  versions: TestVersions,
  saved: Record<string, string>,
): Promise<ListedRoutine[]> {
  const store = new TestDefinitionStore(saved);
  const live = await liveVersionOf(versions);
  return new RoutineList(new MemoryRuns()).listRoutines(
    await loadWorkspace(store),
    now,
    "Europe/Amsterdam",
    { live, vcs: versions, saved: store },
  );
}

verifies("app.routine-list-live-schedule", () => {
  it("lists a saved change that isn't live by the live schedule", async () => {
    const versions = new TestVersions();
    versions.commit({ [weeklyPath]: weekly("0 9 * * 1") });

    const [routine] = await listedLive(versions, { [weeklyPath]: weekly("0 9 * * 0") });

    expect(routine).toMatchObject({
      name: "Weekly report",
      trigger: "Mondays at 09:00",
      // 09:00 in Amsterdam is 08:00 UTC in November.
      nextRun: "2026-11-16T08:00:00.000Z",
    });
  });

  it("keeps the saved name, and On or Off as saved, since Off counts at once", async () => {
    const versions = new TestVersions();
    versions.commit({ [weeklyPath]: weekly("0 9 * * 1") });

    const [routine] = await listedLive(versions, {
      [weeklyPath]: weekly("0 9 * * 0", ["enabled: false"]).replace("Weekly report", "Weekly"),
    });

    expect(routine).toMatchObject({
      name: "Weekly",
      enabled: false,
      trigger: "Mondays at 09:00",
      nextRun: null,
    });
  });

  it("takes the live schedule's time zone", async () => {
    const versions = new TestVersions();
    const live = weekly("0 9 * * 1").replace('" }', '", timezone: America/New_York }');
    versions.commit({ [weeklyPath]: live });

    const [routine] = await listedLive(versions, { [weeklyPath]: weekly("0 9 * * 0") });

    expect(routine?.timeZone).toBe("America/New_York");
    // 09:00 in New York is 14:00 UTC in November.
    expect(routine?.nextRun).toBe("2026-11-16T14:00:00.000Z");
  });

  // C610 #1 (HAL-15664): the scheduler leaves out a routine no version has.
  it("lists a routine that has never been live from its saved file, with no next run", async () => {
    const versions = new TestVersions();
    versions.commit({ "workspace.yaml": "id: acme\nname: Acme\n" });

    const [routine] = await listedLive(versions, { [weeklyPath]: weekly("0 9 * * 0") });

    expect(routine).toMatchObject({
      enabled: true,
      trigger: "Sundays at 09:00",
      nextRun: null,
      liveState: "never-live",
    });
  });

  // C610 #2 (HAL-15664): the watch runs the live routine, so its errors are the ones that count.
  it("counts the live version's errors, and the saved file's apart, while changes aren't live", async () => {
    const versions = new TestVersions();
    versions.commit({ ...report, [weeklyPath]: weekly("0 9 * * 1") });

    const [routine] = await listedLive(versions, {
      ...report,
      [weeklyPath]: weekly("0 9 * * 1").replace("workflow: report", "workflow: reprot"),
    });

    expect(routine).toMatchObject({
      trigger: "Mondays at 09:00",
      nextRun: "2026-11-16T08:00:00.000Z",
      problems: 0,
      savedProblems: 1,
      liveState: "not-live",
    });
  });

  it("lists a saved file that doesn't load as the live routine it runs", async () => {
    const versions = new TestVersions();
    versions.commit({ ...report, [weeklyPath]: weekly("0 9 * * 1") });

    const [routine] = await listedLive(versions, {
      ...report,
      [weeklyPath]: weekly("0 9 * * 1", ["overlap: sometimes"]),
    });

    expect(routine).toMatchObject({
      name: "Weekly report",
      trigger: "Mondays at 09:00",
      nextRun: "2026-11-16T08:00:00.000Z",
      problems: 0,
      savedProblems: 1,
      liveState: "not-live",
    });
  });

  it("counts the errors of the version that runs, live or not", async () => {
    const versions = new TestVersions();
    versions.commit({ [weeklyPath]: weekly("0 9 * * 1") });

    const [routine] = await listedLive(versions, { ...report, [weeklyPath]: weekly("0 9 * * 1") });

    expect(routine).toMatchObject({ problems: 0, liveState: "live" });
    const [changed] = await listedLive(versions, {
      ...report,
      [weeklyPath]: weekly("0 9 * * 2"),
    });
    expect(changed).toMatchObject({ problems: 1, savedProblems: 0, liveState: "not-live" });
  });
});
