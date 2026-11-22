import type { RoutineVersions } from "@halonicjs/app/routines";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { historyUnreadable } from "./routine-liveness.ts";
import { setup, weekly, weeklyFile } from "./workspace-routines.test-helper.ts";

/** Acme's `daily-digest`: every day at 7, it runs `analyst` too. */
const dailyFile = weeklyFile
  .replace("Weekly report", "Daily digest")
  .replace('"0 9 * * 1"', '"0 7 * * *"');

/** What every routine's live version says here: live, so the saved file is what runs. */
const live: Omit<RoutineVersions, "live"> = {
  saved: null,
  savedProblems: [],
  liveState: { state: "live" },
};

const analyst = { kind: "agent", hubId: "acme", id: "analyst" } as const;

verifies("studio.workspace-routines-list-liveness", () => {
  it("reads the history once for the whole Routines list and Triggers section", async () => {
    let reads = 0;
    const { host } = setup(
      {
        liveness: async () => {
          reads += 1;
          return async () => ({ ...live, live: null });
        },
      },
      [],
      { "hubs/acme/workflows/routines/daily-digest.routine.yaml": dailyFile },
    );

    expect(await host.list()).toHaveLength(2);
    expect(reads).toBe(1);
    expect(await host.startingRoutines(analyst)).toHaveLength(2);
    expect(reads).toBe(2);
  });

  it("lists the saved routines when the history can't be read, and only the page fails", async () => {
    const unreadable = new Error("git status failed");
    const reported: unknown[] = [];
    const { host } = setup({
      liveness: () => Promise.reject(unreadable),
      reportError: (error) => reported.push(error),
    });

    expect(await host.list()).toEqual([
      expect.objectContaining({
        summary: "Mondays at 09:00 (Europe/Amsterdam) → Analyst",
        nextRun: "2026-11-23T08:00:00.000Z",
      }),
    ]);
    expect(await host.startingRoutines(analyst)).toEqual([
      expect.objectContaining({ nextRun: "2026-11-23T08:00:00.000Z" }),
    ]);
    expect(reported).toEqual([unreadable, unreadable]);
    // C600 #3 (HAL-15607): the page said the engine wasn't answering; it names the history now.
    await expect(host.read(weekly)).rejects.toMatchObject({
      kind: "unavailable",
      message: historyUnreadable,
      cause: unreadable,
    });
  });

  it("lists a routine as saved when only its own live version can't be read", async () => {
    const unreadable = new Error("git diff failed");
    const reported: unknown[] = [];
    const { host } = setup({
      liveness: async () => () => Promise.reject(unreadable),
      reportError: (error) => reported.push(error),
    });

    expect((await host.list())[0]?.nextRun).toBe("2026-11-23T08:00:00.000Z");
    expect(reported).toEqual([unreadable]);
    await expect(host.nextTimes(weekly, 1)).rejects.toMatchObject({ message: historyUnreadable });
  });

  it("keeps a history failure's own reason for the page", async () => {
    const locked = new KindedError(
      "unavailable",
      "Another program is using this workspace's history right now.",
    );
    const { host } = setup({ liveness: () => Promise.reject(locked), reportError: () => {} });

    await expect(host.read(weekly)).rejects.toBe(locked);
  });
});
