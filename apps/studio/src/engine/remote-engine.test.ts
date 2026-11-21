import { runExecutorVersion } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { tauriEngineFetch } from "@halonicjs/studio-services";
import { EngineNotAnswering } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import type { RoutineRunStart } from "./engine-service.ts";
import { openRemoteEngine, RemoteEngine } from "./remote-engine.ts";

interface EngineCall {
  readonly route: string;
  readonly params: Record<string, unknown>;
  readonly body?: unknown;
}

type EngineAnswer = { status: number; body: unknown };

const noEngine = {
  kind: "engine_unavailable",
  message: "no engine runs for this window's workspace",
};

/**
 * The shell's `engine_request`, answering each route from `routes`; a route with no answer is
 * refused as if no engine ran. `calls` holds what the page sent.
 */
function engineShell(routes: Record<string, (call: EngineCall) => EngineAnswer> = {}) {
  const calls: EngineCall[] = [];
  const ipc = {
    invoke: async (command: string, args?: Record<string, unknown>) => {
      if (command !== "engine_request") throw `command ${command} not allowed`;
      const call = args as unknown as EngineCall;
      calls.push(call);
      const answer = routes[call.route];
      if (answer === undefined) throw noEngine;
      return answer(call);
    },
    transformCallback: () => 1,
    unregisterCallback: () => {},
  };
  return { ipc, calls };
}

function remoteOn(routes: Record<string, (call: EngineCall) => EngineAnswer>) {
  const { ipc, calls } = engineShell(routes);
  return {
    engine: new RemoteEngine({ fetch: tauriEngineFetch(ipc), reportError: vi.fn() }),
    calls,
  };
}

const run = (id: string, status = "running") => ({ id, status, lastSeq: 1 });
const nightly: RoutineRunStart = {
  workflow: { hubId: "acme", workflowId: "digest", input: {} },
};
const nightlyTrigger = { routineKey: "@workspace/nightly", at: "2026-11-21T08:00:00.000Z" };

verifies("studio.remote-engine", () => {
  describe("openRemoteEngine", () => {
    it("gives the engine when the shell's engine answers hello", async () => {
      const { ipc, calls } = engineShell({
        "GET /api/hello": () => ({ status: 200, body: { runExecutorVersion } }),
      });

      const engine = await openRemoteEngine({ fetch: tauriEngineFetch(ipc), reportError: vi.fn() });

      expect(engine).toBeInstanceOf(RemoteEngine);
      expect(calls).toEqual([{ route: "GET /api/hello", params: {} }]);
    });

    it("gives none, and reports nothing, when the shell has no engine", async () => {
      const reportError = vi.fn();

      const engine = await openRemoteEngine({
        fetch: tauriEngineFetch(engineShell().ipc),
        reportError,
      });

      expect(engine).toBeUndefined();
      expect(reportError).not.toHaveBeenCalled();
    });

    it("gives none, and reports why, when the call fails another way", async () => {
      const reportError = vi.fn();
      const failing = {
        invoke: async () => null,
        transformCallback: () => 1,
        unregisterCallback: () => {},
      };

      const engine = await openRemoteEngine({ fetch: tauriEngineFetch(failing), reportError });

      expect(engine).toBeUndefined();
      expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ kind: "answer_invalid" }));
    });
  });

  describe("RemoteEngine", () => {
    it("starts a run with POST /api/runs, without a trigger the engine records itself", async () => {
      const { engine, calls } = remoteOn({
        "POST /api/runs": () => ({ status: 201, body: run("r1") }),
      });

      await expect(
        engine.startRun({ hubId: "acme", workflowId: "reply" }, { topic: "tea" }),
      ).resolves.toEqual({ id: "r1" });

      expect(calls).toEqual([
        {
          route: "POST /api/runs",
          params: {},
          body: { hubId: "acme", workflowId: "reply", input: { topic: "tea" } },
        },
      ]);
    });

    it("leaves the executor's own errors as they are, such as a workflow that isn't there", async () => {
      const { engine } = remoteOn({
        "POST /api/runs": () => ({
          status: 404,
          body: { code: "workflow_not_found", message: "There is no such workflow." },
        }),
      });

      await expect(
        engine.startRun({ hubId: "acme", workflowId: "gone" }, {}),
      ).rejects.toMatchObject({
        name: "RunTargetNotFound",
      });
    });

    it("runs a routine now by its key, and gives its run's id", async () => {
      const { engine, calls } = remoteOn({
        "POST /api/routines/{hub}/{routine}/run": () => ({ status: 201, body: { runId: "r2" } }),
      });

      await expect(engine.startRoutine(nightly, nightlyTrigger)).resolves.toEqual({ id: "r2" });

      expect(calls).toEqual([
        {
          route: "POST /api/routines/{hub}/{routine}/run",
          params: { hub: "@workspace", routine: "nightly" },
          body: {},
        },
      ]);
    });

    it("words the engine's refusals of Run now by kind, with the engine's sentence", async () => {
      const answers: [EngineAnswer, string, string][] = [
        [
          { status: 409, body: { code: "routine_off", message: "This routine is switched off." } },
          "conflict",
          "This routine is switched off.",
        ],
        [
          { status: 403, body: { code: "workspace_not_trusted", message: "Not trusted." } },
          "denied",
          "Not trusted.",
        ],
        [{ status: 502, body: null }, "unavailable", "The engine answered 502."],
      ];
      for (const [answer, kind, message] of answers) {
        const { engine } = remoteOn({ "POST /api/routines/{hub}/{routine}/run": () => answer });

        const error = await engine.startRoutine(nightly, nightlyTrigger).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(KindedError);
        expect(error).toMatchObject({ kind, message });
      }
    });

    it("fails Run now when the engine's answer names no run", async () => {
      const { engine } = remoteOn({
        "POST /api/routines/{hub}/{routine}/run": () => ({ status: 201, body: null }),
      });

      await expect(engine.startRoutine(nightly, nightlyTrigger)).rejects.toMatchObject({
        kind: "unavailable",
        message: "The engine's answer to Run now named no run.",
      });
    });

    it("lists the waiting runs from the engine, and fails on a list it can't read", async () => {
      const waiting = remoteOn({
        "GET /api/waiting-runs": () => ({ status: 200, body: { runs: [run("r3", "waiting")] } }),
      });
      await expect(waiting.engine.waiting()).resolves.toEqual([run("r3", "waiting")]);

      const unreadable = remoteOn({
        "GET /api/waiting-runs": () => ({ status: 200, body: { runs: "r3" } }),
      });
      await expect(unreadable.engine.waiting()).rejects.toMatchObject({ kind: "unavailable" });
    });

    it("sends an answer to a wait step and cancels a run through the engine", async () => {
      const { engine, calls } = remoteOn({
        "GET /api/hello": () => ({ status: 200, body: { runExecutorVersion } }),
        "POST /api/runs/{run}/events": () => ({ status: 200, body: run("r 4") }),
        "POST /api/runs/{run}/cancel": () => ({ status: 200, body: run("r 4", "failed") }),
      });
      const wait = { state: "review", since: "2026-11-21T08:00:00.000Z" };

      await expect(engine.send("r 4", "approved", { ok: true }, { wait })).resolves.toMatchObject({
        id: "r 4",
      });
      await expect(engine.cancel("r 4")).resolves.toMatchObject({ status: "failed" });

      expect(calls.map(({ route, params }) => ({ route, params }))).toEqual([
        { route: "GET /api/hello", params: {} },
        { route: "POST /api/runs/{run}/events", params: { run: "r 4" } },
        { route: "POST /api/runs/{run}/cancel", params: { run: "r 4" } },
      ]);
      expect(calls[1]?.body).toEqual({ event: "approved", payload: { ok: true }, wait });
    });

    it("fails every call as not answering once the engine has gone", async () => {
      const { engine } = remoteOn({});

      for (const call of [
        () => engine.startRun({ hubId: "acme", workflowId: "reply" }, {}),
        () => engine.startRoutine(nightly, nightlyTrigger),
        () => engine.waiting(),
        () => engine.send("r1", "approve"),
        () => engine.cancel("r1"),
      ]) {
        const error = await call().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(EngineNotAnswering);
        expect(error).toMatchObject({
          cause: expect.objectContaining({ kind: "engine_unavailable" }),
        });
      }
    });

    it("leaves the page nothing to refuse ahead of the engine", () => {
      expect(remoteOn({}).engine.pageRuns).toEqual({ runsHarnesses: true, startsConnectors: true });
    });
  });
});
