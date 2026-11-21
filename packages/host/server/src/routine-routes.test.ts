import { AgentRunsNotAvailable, RunTargetNotFound } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { placedRoutine, sendTo, testEngine } from "./engine-server.test-helper.ts";

const runNow = "/api/routines/acme/digest/run";

verifies("server.engine-routines", () => {
  describe("GET /api/routines", () => {
    it("lists every routine with its key and when it next starts on its own", async () => {
      const { server } = testEngine({
        routines: [
          placedRoutine(),
          placedRoutine({ id: "paused", name: "Paused", enabled: false }),
          placedRoutine({ id: "button", name: "Button", trigger: { manual: true } }, null),
          placedRoutine({ id: "broken", name: "Broken", trigger: { schedule: "99 * * * *" } }),
        ],
      });
      const answer = await sendTo(server, "GET", "/api/routines");
      expect(answer.status).toBe(200);
      // The test clock stands at 10:00 UTC, so a daily 08:00 starts next tomorrow.
      expect(await answer.json()).toEqual({
        routines: [
          {
            key: "acme/digest",
            hubId: "acme",
            id: "digest",
            name: "Morning digest",
            enabled: true,
            nextRun: "2026-11-13T08:00:00.000Z",
          },
          {
            key: "acme/paused",
            hubId: "acme",
            id: "paused",
            name: "Paused",
            enabled: false,
            nextRun: null,
          },
          {
            key: "@workspace/button",
            hubId: null,
            id: "button",
            name: "Button",
            enabled: true,
            nextRun: null,
          },
          {
            key: "acme/broken",
            hubId: "acme",
            id: "broken",
            name: "Broken",
            enabled: true,
            nextRun: null,
          },
        ],
      });
    });
  });

  describe("POST /api/routines/<key>/run", () => {
    it("starts the routine's workflow now, as a manual trigger with its key", async () => {
      const { server, calls } = testEngine({ routines: [placedRoutine()] });
      const answer = await sendTo(server, "POST", runNow);
      expect(answer.status).toBe(201);
      expect(await answer.json()).toEqual({ runId: "run_1" });
      expect(calls.started).toEqual([
        {
          hubId: "acme",
          workflowId: "send-digest",
          input: { at: "2026-11-12T10:00:00.000Z" },
          trigger: { type: "manual", routineId: "acme/digest", at: "2026-11-12T10:00:00.000Z" },
        },
      ]);
    });

    it("answers 409 routine_off for a routine that is switched off, and starts nothing", async () => {
      const { server, calls } = testEngine({ routines: [placedRoutine({ enabled: false })] });
      const answer = await sendTo(server, "POST", runNow);
      expect(answer.status).toBe(409);
      expect(await answer.json()).toMatchObject({ code: "routine_off" });
      expect(calls.started).toEqual([]);
    });

    it("starts an agent, in the hub a workspace-level routine names", async () => {
      const run = { hub: "acme", agent: "writer", prompt: "Write at {{trigger.at}}" };
      const { server, calls } = testEngine({ routines: [placedRoutine({ run }, null)] });
      const answer = await sendTo(server, "POST", "/api/routines/@workspace/digest/run");
      expect(answer.status).toBe(201);
      expect(calls.started).toEqual([
        {
          hubId: "acme",
          agentId: "writer",
          prompt: "Write at 2026-11-12T10:00:00.000Z",
          trigger: {
            type: "manual",
            routineId: "@workspace/digest",
            at: "2026-11-12T10:00:00.000Z",
          },
        },
      ]);
    });

    it("checks trust first: an untrusted workspace answers 403 and reads no routine", async () => {
      const trust = { state: "changed", message: "Changed." } as const;
      const { server, calls } = testEngine({ routines: [placedRoutine()], trust });
      const answer = await sendTo(server, "POST", "/api/routines/acme/nothing/run");
      expect(answer.status).toBe(403);
      expect(await answer.json()).toMatchObject({ code: "workspace_not_trusted" });
      expect(calls.listed).toEqual([]);
      expect(calls.started).toEqual([]);
    });

    it("answers 404 routine_not_found for an unknown routine or a key that can't be one", async () => {
      const { server, calls } = testEngine({ routines: [placedRoutine()] });
      for (const path of ["/api/routines/acme/other/run", "/api/routines/acme/a%20b/run"]) {
        const answer = await sendTo(server, "POST", path);
        expect(answer.status, path).toBe(404);
        expect(await answer.json(), path).toMatchObject({ code: "routine_not_found" });
      }
      expect(calls.started).toEqual([]);
    });

    it("answers 404 hub_not_found for a workspace-level routine that names no hub", async () => {
      const { server, calls } = testEngine({ routines: [placedRoutine({}, null)] });
      const answer = await sendTo(server, "POST", "/api/routines/@workspace/digest/run");
      expect(answer.status).toBe(404);
      expect(await answer.json()).toMatchObject({ code: "hub_not_found" });
      expect(calls.started).toEqual([]);
    });

    it("answers 404 when the target is gone, and 501 while agent runs aren't built", async () => {
      const gone = new RunTargetNotFound("workflow", "send-digest", "No such workflow.");
      const missing = testEngine({ routines: [placedRoutine()], startFails: gone });
      const missingAnswer = await sendTo(missing.server, "POST", runNow);
      expect(missingAnswer.status).toBe(404);
      expect(await missingAnswer.json()).toMatchObject({ code: "workflow_not_found" });
      const notBuilt = new AgentRunsNotAvailable("not built yet");
      const agents = testEngine({ routines: [placedRoutine()], startFails: notBuilt });
      expect((await sendTo(agents.server, "POST", runNow)).status).toBe(501);
    });

    it("answers 400 with validate's reason for an input that names no trigger value, and starts nothing", async () => {
      const run = { workflow: "send-digest", input: { day: "{{trigger.date}}" } };
      const { server, calls } = testEngine({ routines: [placedRoutine({ run })] });
      const answer = await sendTo(server, "POST", runNow);
      expect(answer.status).toBe(400);
      expect(await answer.json()).toEqual({
        code: "invalid_input",
        message:
          "{{trigger.date}} isn't a trigger value. Use {{trigger.at}} or {{trigger.lastRun}}.",
      });
      expect(calls.started).toEqual([]);
    });

    it("takes only an empty JSON object", async () => {
      const { server, calls } = testEngine({ routines: [placedRoutine()] });
      expect((await sendTo(server, "POST", runNow, { type: "text/plain" })).status).toBe(415);
      for (const body of ['{"input":{}}', "[]", "nope"]) {
        expect((await sendTo(server, "POST", runNow, { body })).status, body).toBe(400);
      }
      expect(calls.started).toEqual([]);
    });
  });
});
