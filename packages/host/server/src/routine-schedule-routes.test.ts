import { EngineSchedule } from "@halonicjs/app/routines";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { testServer } from "./test-server.ts";

// A server with no password answers loopback names only; with one, it needs a session.
const loopback = "localhost";
const named = "halonic.acme.example";

/** A schedule that runs its routines, as `halonic serve`'s does from the start. */
function running(): EngineSchedule {
  const schedule = new EngineSchedule();
  schedule.pause(false);
  return schedule;
}

function pause(server: ReturnType<typeof testServer>, body: string, host = loopback) {
  return server.handle(
    new Request(`http://${host}/api/routines/pause`, {
      method: "PUT",
      headers: { host, "content-type": "application/json" },
      body,
    }),
  );
}

function health(server: ReturnType<typeof testServer>, host = loopback) {
  return server.handle(new Request(`http://${host}/api/routines/health`, { headers: { host } }));
}

describe("routine schedule routes", () => {
  verifies("server.routines", () => {
    it("pauses and resumes the routines, answering the health", async () => {
      const schedule = running();
      const server = testServer({ passwordHash: null, routineSchedule: schedule });

      const paused = await pause(server, '{"paused":true}');
      expect(paused.status).toBe(200);
      expect(await paused.json()).toMatchObject({ scheduling: true, paused: true });
      expect(schedule.health().paused).toBe(true);

      await pause(server, '{"paused":false}');
      expect(await (await health(server)).json()).toEqual({
        scheduling: true,
        paused: false,
        activeRuns: 0,
        runsWaiting: 0,
        lastTick: null,
        nextRoutineAt: null,
      });
    });

    it("answers 401 and changes nothing without a session when a password is set", async () => {
      const schedule = running();
      const server = testServer({ passwordHash: "hash", routineSchedule: schedule });

      expect((await pause(server, '{"paused":true}', named)).status).toBe(401);
      expect((await health(server, named)).status).toBe(401);
      expect(schedule.health().paused).toBe(false);
    });

    it("refuses a body that isn't exactly a true or false paused", async () => {
      const schedule = running();
      const server = testServer({ passwordHash: null, routineSchedule: schedule });

      for (const body of ['{"paused":"yes"}', '{"paused":true,"at":1}', "[true]", "paused"]) {
        expect((await pause(server, body)).status).toBe(400);
      }
      expect(schedule.health().paused).toBe(false);
    });

    it("answers 415 for a pause not sent as JSON, which a cross-site form can't send", async () => {
      const schedule = running();
      const server = testServer({ passwordHash: null, routineSchedule: schedule });
      const response = await server.handle(
        new Request(`http://${loopback}/api/routines/pause`, {
          method: "PUT",
          headers: { host: loopback, "content-type": "text/plain" },
          body: '{"paused":true}',
        }),
      );
      expect(response.status).toBe(415);
      expect(schedule.health().paused).toBe(false);
    });

    it("answers 404 when the host gives no routine schedule", async () => {
      const server = testServer({ passwordHash: null });
      expect((await health(server)).status).toBe(404);
      expect((await pause(server, '{"paused":true}')).status).toBe(404);
    });
  });
});
