// The page's engine starts the workspace's routines on time (HAL-14205), as `halonic routines
// watch` does: on the engine's tick, with a catch-up as it opens, and never once it has closed.

import {
  MemoryCoordination,
  type MemoryDefinitionStore,
  MemoryRunStore,
} from "@halonicjs/adapter-memory";
import type { LocalExecutor, RoutineEngine } from "@halonicjs/engine";
import type { RunSummary } from "@halonicjs/events";
import type { Clock, StartRunRequest } from "@halonicjs/ports";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { pageRoutines } from "./engine-routines.ts";
import { acmeFiles, fakeShell, serviceOn } from "./engine-service.testing.ts";

const hourly = [
  "id: hourly",
  "name: Hourly",
  'trigger: { schedule: "0 * * * *" }',
  "run: { workflow: reply }",
  "",
].join("\n");

const routinePath = "hubs/support/workflows/routines/hourly.routine.yaml";

/** A clock the test moves, and the scheduler's wake-ups, which the test fires. */
function fakeTime(start: string) {
  let now = new Date(start);
  const pending = new Set<() => void>();
  return {
    clock: { now: () => now },
    setTimer: (callback: () => void) => {
      pending.add(callback);
      return () => pending.delete(callback);
    },
    /** Whether the scheduler has set a wake-up, which it does once it has read its timers. */
    armed: () => pending.size > 0,
    /** Moves the clock to `time`, as when the computer wakes from sleep, and fires every wake-up. */
    wakeAt(time: string) {
      now = new Date(time);
      const due = [...pending];
      pending.clear();
      for (const callback of due) callback();
    },
  };
}

/** A service on Acme with `routine` saved, in the folder `location`, on a moving clock. */
function serviceWith(
  routine: string,
  time: ReturnType<typeof fakeTime>,
  { agents = {}, location = "/acme" }: { agents?: Record<string, string>; location?: string } = {},
) {
  const errors: unknown[] = [];
  let count = 0;
  const service = serviceOn(fakeShell(), acmeFiles(agents, { [routinePath]: routine }), {
    location,
    clock: time.clock,
    setTimer: time.setTimer,
    ids: { next: (prefix) => `${prefix}${++count}` },
    reportError: (error) => errors.push(error),
  });
  return { service, errors };
}

/** `files`, whose reads wait while held, so a test can stop a tick halfway. */
function heldFiles(files: MemoryDefinitionStore) {
  const read = files.read.bind(files);
  let gate: Promise<void> | undefined;
  let open = () => {};
  let waiting = 0;
  files.read = async (path) => {
    if (gate !== undefined) {
      waiting += 1;
      await gate;
    }
    return read(path);
  };
  return {
    files,
    hold: () => {
      gate = new Promise((resolve) => {
        open = resolve;
      });
    },
    isWaiting: () => waiting > 0,
    release: () => {
      gate = undefined;
      open();
    },
  };
}

/** The engine's parts the routines use, in memory. The executor is never called: the test's check refuses every start. */
function enginePartsOn(clock: Clock): RoutineEngine {
  return {
    executor: { id: "held" } as unknown as LocalExecutor,
    runs: new MemoryRunStore(),
    clock,
    coordination: new MemoryCoordination(clock),
  };
}

/** The runs the routine started, by the time each was due. */
async function routineRuns(
  service: ReturnType<typeof serviceWith>["service"],
): Promise<RunSummary[]> {
  const runs = await (await service.open()).runs.list();
  return runs.filter((run) => run.trigger?.routineId === "support/hourly");
}

verifies("studio.engine-routines", () => {
  it("starts a routine at its time while the engine is open", async () => {
    const time = fakeTime("2026-11-20T10:00:30.000Z");
    const { service } = serviceWith(hourly, time);
    await service.open();
    await waitUntil("the scheduler's wake-up", time.armed);

    time.wakeAt("2026-11-20T11:00:30.000Z");
    await waitUntil("the 11:00 run", async () => (await routineRuns(service)).length > 0);

    expect((await routineRuns(service)).map((run) => run.trigger?.at)).toEqual([
      "2026-11-20T11:00:00.000Z",
    ]);
    await service.close();
  });

  it("catches up on the time missed while no engine ran, as soon as it opens", async () => {
    const time = fakeTime("2026-11-20T10:00:30.000Z");
    const { service } = serviceWith(hourly, time);
    await service.open();
    await service.close();

    // The workspace was closed, or the computer slept, through 11:00, 12:00 and 13:00.
    time.wakeAt("2026-11-20T13:30:00.000Z");
    await service.open();
    await waitUntil("the catch-up run", async () => (await routineRuns(service)).length > 0);

    // `catchUp: last` by default: the newest time missed, once.
    expect((await routineRuns(service)).map((run) => run.trigger?.at)).toEqual([
      "2026-11-20T13:00:00.000Z",
    ]);
    await service.close();
  });

  it("starts a routine whose time comes while the catch-up still reads the files", async () => {
    const time = fakeTime("2026-11-20T10:00:30.000Z");
    const held = heldFiles(acmeFiles({}, { [routinePath]: hourly }));
    const starts: StartRunRequest[] = [];
    const routines = pageRoutines(
      await loadWorkspace(held.files),
      { location: "/acme", definitions: held.files, timeZone: "UTC", reportError: () => {} },
      async (request) => {
        starts.push(request);
        throw new Error("Refused here, so the executor is never called.");
      },
    );
    const ticks = routines.ticks(enginePartsOn(time.clock));

    held.hold();
    const catchingUp = routines.catchUp();
    await waitUntil("the catch-up reading the files", held.isWaiting);
    time.wakeAt("2026-11-20T11:00:30.000Z");
    const ticked = ticks.onTick("2026-11-20T11:00:30.000Z");
    held.release();
    await Promise.all([catchingUp, ticked]);

    expect(starts.map((request) => request.workflowId)).toEqual(["reply"]);
  });

  it("starts nothing once the engine has closed", async () => {
    const time = fakeTime("2026-11-20T10:00:30.000Z");
    const { service } = serviceWith(hourly, time);
    const engine = await service.open();
    await waitUntil("the scheduler's wake-up", time.armed);
    await service.close();

    time.wakeAt("2026-11-20T11:00:30.000Z");

    expect(await engine.runs.list()).toEqual([]);
  });

  it("refuses a routine whose workflow the page can't run, and says why", async () => {
    const time = fakeTime("2026-11-20T10:00:30.000Z");
    const { service, errors } = serviceWith(hourly, time, {
      agents: { writer: "connectors: [mail]\n" },
    });
    await service.open();
    await waitUntil("the scheduler's wake-up", time.armed);

    time.wakeAt("2026-11-20T11:00:30.000Z");
    await waitUntil("the refusal", () => errors.length > 0);

    expect(errors[0]).toMatchObject({ kind: "unavailable" });
    expect(await routineRuns(service)).toEqual([]);
    await service.close();
  });
});

describe("the routines' workspace id", () => {
  it("is the id in workspace.yaml, not the folder, so a copy elsewhere names the same runs", async () => {
    const idsIn = async (location: string) => {
      const time = fakeTime("2026-11-20T10:00:30.000Z");
      const { service } = serviceWith(hourly, time, { location });
      await service.open();
      await waitUntil("the scheduler's wake-up", time.armed);
      time.wakeAt("2026-11-20T11:00:30.000Z");
      await waitUntil("the 11:00 run", async () => (await routineRuns(service)).length > 0);
      const ids = (await routineRuns(service)).map((run) => run.id);
      await service.close();
      return ids;
    };

    expect(await idsIn("/elsewhere/acme-copy")).toEqual(await idsIn("/acme"));
  });
});
