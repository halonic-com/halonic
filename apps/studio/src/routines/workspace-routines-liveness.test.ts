import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup, weekly } from "./workspace-routines.test-helper.ts";

verifies("studio.workspace-liveness", () => {
  it("reads a routine's live state by its file and gives the page what the live version starts", async () => {
    const asked: string[] = [];
    const { host } = setup({
      liveness: async (path) => {
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
      liveness: async () => ({
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
