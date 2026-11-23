// The page's routines come from the live version, as `halonic routines watch` reads them
// (HAL-14229): a saved change counts once it is made live, On and Off from the saved files.

import {
  MemoryCoordination,
  type MemoryDefinitionStore,
  MemoryRunStore,
  MemoryVcs,
} from "@halonicjs/adapter-memory";
import type { LocalExecutor, RoutineEngine } from "@halonicjs/engine";
import type { Clock, StartRunRequest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { pageRoutines } from "./engine-routines.ts";
import { acmeFiles } from "./engine-service.testing.ts";

const routinePath = "hubs/support/workflows/routines/hourly.routine.yaml";

/** A routine of the `reply` workflow on `schedule`, turned on or off. */
function routine(schedule: string, enabled = true): string {
  return [
    "id: hourly",
    "name: Hourly",
    `trigger: { schedule: "${schedule}" }`,
    "run: { workflow: reply }",
    `enabled: ${enabled}`,
    "",
  ].join("\n");
}

/** Acme's files in a repository: `live` is in its one version, then `saved` replaces it unless left out. */
async function acmeWithHistory(live: Record<string, string>, saved: Record<string, string> = {}) {
  const files = acmeFiles({}, live);
  const vcs = new MemoryVcs(files);
  await vcs.init();
  await vcs.stage((await files.list()) ?? []);
  await vcs.commit("First version");
  for (const [path, text] of Object.entries(saved)) await files.write(path, text);
  return { files, vcs };
}

/** What a tick at 11:00:30 starts, on routines read through `vcs` and `files`. */
async function startsAt1100(
  files: MemoryDefinitionStore,
  vcs: MemoryVcs,
): Promise<StartRunRequest[]> {
  let now = new Date("2026-11-20T10:00:30.000Z");
  const clock: Clock = { now: () => now };
  const starts: StartRunRequest[] = [];
  const routines = pageRoutines(
    await loadWorkspace(files),
    {
      location: "/acme",
      definitions: files,
      versions: vcs,
      timeZone: "UTC",
      reportError: () => {},
    },
    async (request) => {
      starts.push(request);
      throw new Error("Refused here, so the executor is never called.");
    },
  );
  const engine: RoutineEngine = {
    executor: { id: "held" } as unknown as LocalExecutor,
    runs: new MemoryRunStore(),
    clock,
    coordination: new MemoryCoordination(clock),
  };
  const ticks = routines.ticks(engine);
  // The engine opened at 10:00:30, so 11:00 is due on the next tick.
  await routines.catchUp();
  now = new Date("2026-11-20T11:00:30.000Z");
  await ticks.onTick("2026-11-20T11:00:30.000Z");
  return starts;
}

verifies("studio.engine-routines", () => {
  it("doesn't start a routine that has never been live", async () => {
    const { files, vcs } = await acmeWithHistory({}, { [routinePath]: routine("0 * * * *") });
    expect(await startsAt1100(files, vcs)).toEqual([]);
  });

  it("starts a routine on its live schedule, not on a saved change that isn't live yet", async () => {
    const { files, vcs } = await acmeWithHistory(
      { [routinePath]: routine("0 * * * *") },
      { [routinePath]: routine("0 3 * * *") },
    );
    const [live] = await vcs.log(1);
    const starts = await startsAt1100(files, vcs);
    expect(starts.map((request) => request.workflowId)).toEqual(["reply"]);
    // Its run records the live version, whose definitions the engine starts it from.
    expect(starts[0]?.version).toMatchObject({ reads: "live-version", commit: live?.hash });
  });

  it("starts nothing once the saved routine is turned off, though the live one is on", async () => {
    const { files, vcs } = await acmeWithHistory(
      { [routinePath]: routine("0 * * * *") },
      { [routinePath]: routine("0 * * * *", false) },
    );
    expect(await startsAt1100(files, vcs)).toEqual([]);
  });
});
