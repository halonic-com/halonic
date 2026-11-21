import type { Routine } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup, weekly, weeklyFile } from "./workspace-routines.test-helper.ts";

verifies("studio.workspace-liveness", () => {
  it("reads a routine's live state by its file and gives the page what the live version starts", async () => {
    const asked: string[] = [];
    const { host } = setup({
      liveness: async () => async (path) => {
        asked.push(path);
        return {
          live: {
            version: 1,
            id: "weekly-report",
            name: "Weekly report",
            enabled: true,
            trigger: { schedule: "0 9 * * 1" },
            run: { agent: "analyst", prompt: "Write the report." },
            overlap: "queue",
            catchUp: "none",
          },
          saved: null,
          savedProblems: [],
          liveState: { state: "not-live", since: "2026-11-18T10:42:00.000Z" },
        };
      },
    });
    expect(await host.read(weekly)).toMatchObject({
      everLive: true,
      changesNotLive: true,
      liveSince: "2026-11-18T10:42:00.000Z",
      live: {
        triggerSentence: "Mondays at 09:00",
        targetName: "Analyst",
        overlap: "queue",
        catchUp: "none",
      },
    });
    expect(asked).toEqual(["hubs/acme/workflows/routines/weekly-report.routine.yaml"]);
  });

  it("counts a routine no version has as never live, and one without the part as live", async () => {
    const never = setup({
      liveness: async () => async () => ({
        live: null,
        saved: null,
        savedProblems: [],
        liveState: { state: "never-versioned" },
      }),
    });
    expect(await never.host.read(weekly)).toMatchObject({
      everLive: false,
      changesNotLive: false,
      live: undefined,
    });
    expect(await setup().host.read(weekly)).toMatchObject({
      everLive: true,
      changesNotLive: false,
    });
  });
});

/** Acme's `weekly-report` as its live version has it: Analyst on Mondays at 9, Amsterdam time. */
const liveWeekly: Routine = {
  version: 1,
  id: "weekly-report",
  name: "Weekly report",
  enabled: true,
  trigger: { schedule: "0 9 * * 1", timezone: "Europe/Amsterdam" },
  run: { agent: "analyst", prompt: "Write the report." },
  overlap: "queue",
  catchUp: "none",
};

/** A host whose `weekly-report` is saved as `saved` while the live version is `live`. */
function savedButNotLive(saved: string, live: Routine | null, never = false) {
  return setup(
    {
      liveness: async () => async () => ({
        live,
        saved: null,
        savedProblems: [],
        liveState: never
          ? { state: "never-versioned" }
          : { state: "not-live", since: "2026-11-18T10:42:00.000Z" },
      }),
    },
    [],
    { "hubs/acme/workflows/routines/weekly-report.routine.yaml": saved },
  );
}

const mondaysAndWednesdays = weeklyFile.replace('"0 9 * * 1"', '"0 9 * * 1,3"');

verifies("studio.workspace-routines-live-schedule", () => {
  it("gives the summary, the rows and Next from the live schedule, and the When field from the saved one", async () => {
    const { host } = savedButNotLive(mondaysAndWednesdays, liveWeekly);
    const view = await host.read(weekly);
    expect(view.summary).toBe("Mondays at 09:00 (Europe/Amsterdam) → Analyst");
    expect(view.triggerSentence).toBe("Mondays, Wednesdays at 09:00 (Europe/Amsterdam)");
    expect((await host.nextTimes(weekly, 3)).times).toEqual([
      "2026-11-23T08:00:00.000Z",
      "2026-11-30T08:00:00.000Z",
      "2026-12-07T08:00:00.000Z",
    ]);
    expect(await host.list()).toEqual([
      expect.objectContaining({
        summary: "Mondays at 09:00 (Europe/Amsterdam) → Analyst",
        nextRun: "2026-11-23T08:00:00.000Z",
      }),
    ]);
    expect(await host.startingRoutines({ kind: "agent", hubId: "acme", id: "analyst" })).toEqual([
      expect.objectContaining({
        sentence: "Mondays at 09:00 (Europe/Amsterdam)",
        nextRun: "2026-11-23T08:00:00.000Z",
      }),
    ]);
  });

  it("takes On and Off from the saved file, as the scheduler does", async () => {
    const savedOff = `${mondaysAndWednesdays}enabled: false\n`;
    const off = savedButNotLive(savedOff, liveWeekly).host;
    expect((await off.list())[0]?.nextRun).toBeUndefined();
    expect(await off.nextTimes(weekly, 3)).toEqual({ times: [], atNextCheck: false });

    const on = savedButNotLive(weeklyFile, { ...liveWeekly, enabled: false }).host;
    expect((await on.list())[0]?.nextRun).toBe("2026-11-23T08:00:00.000Z");
  });

  it("follows the saved file for a routine that has never been live", async () => {
    const { host } = savedButNotLive(mondaysAndWednesdays, null, true);
    expect((await host.read(weekly)).summary).toBe(
      "Mondays, Wednesdays at 09:00 (Europe/Amsterdam) → Analyst",
    );
    expect((await host.list())[0]?.nextRun).toBe("2026-11-18T08:00:00.000Z");
  });
});
