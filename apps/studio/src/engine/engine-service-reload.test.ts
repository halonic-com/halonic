// A page reload as a crash (HAL-13344): the old page's engine stops where it is, without a close,
// and the reloaded page opens a new one in the same window, on the same shell stores.

import type { SetTimer } from "@halonicjs/adapter-scheduler-node";
import type { HttpClient, IdGenerator } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acmeFiles, fakeShell, lockCalls, serviceOn } from "./engine-service.testing.ts";

/** Acme with the writer on a local server, and a workflow that waits for `approve`. */
function acmeOnLocalServer() {
  return acmeFiles(
    { writer: "model: slow\n" },
    {
      "providers/hang.yaml":
        "id: hang\nname: Hang\ntype: openai-compatible\nbaseUrl: http://127.0.0.1:18765/v1\nlocal: true\n",
      "models.yaml": "aliases:\n  slow:\n    provider: hang\n    model: slow\n",
      "hubs/support/workflows/approval.workflow.yaml": [
        "id: approval",
        "name: Approval",
        "initial: decide",
        "states:",
        "  decide: { type: wait, description: Approve the reply, on: [{ to: done, event: approve }] }",
        "  done: { type: final }",
        "",
      ].join("\n"),
    },
  );
}

/** A model server that takes each request and never answers, and counts them. */
function hungServer(): HttpClient & { readonly calls: () => number } {
  let count = 0;
  return {
    calls: () => count,
    fetch: () => {
      count += 1;
      return new Promise<Response>(() => {});
    },
  };
}

/** The page's timers, as the window sets them: a run's next step is one, due at once on the fixed clock. */
const pageTimers: SetTimer = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
};

/** Ids that don't repeat across the two pages, as the shell's real ids don't. */
function countingIds(): IdGenerator {
  let next = 0;
  return {
    next: (prefix) => {
      next += 1;
      return `${prefix}${next}`;
    },
  };
}

verifies("studio.engine-reload", () => {
  describe("a page reload", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("ends a run whose model call was going as interrupted, and doesn't call the model again", async () => {
      const shell = fakeShell();
      const files = acmeOnLocalServer();
      const ids = countingIds();
      const server = hungServer();
      const before = serviceOn(shell, files, { http: server, ids, setTimer: pageTimers });
      const { id } = await before.startRun({ hubId: "support", workflowId: "reply" }, {});
      await vi.advanceTimersByTimeAsync(0);
      expect(server.calls()).toBe(1);

      // The reload: the old page's engine is never closed, and the window keeps its lock.
      const after = serviceOn(shell, files, { http: server, ids, setTimer: pageTimers });
      const engine = await after.open();
      // Whatever the new engine's scheduler finds due fires before the checks.
      await vi.advanceTimersByTimeAsync(0);

      expect(await engine.executor.endLostRuns()).toBe(1);
      expect(await engine.runs.get(id)).toMatchObject({
        status: "failed",
        reason: "interrupted",
        state: "write",
      });
      expect(server.calls()).toBe(1);
      expect(lockCalls(shell)).toEqual(["engine_lock_hold", "engine_lock_hold"]);
      await after.close();
    });

    it("leaves a waiting run waiting, and it goes on once when its answer comes", async () => {
      const shell = fakeShell();
      const files = acmeOnLocalServer();
      const ids = countingIds();
      const before = serviceOn(shell, files, { ids, setTimer: pageTimers });
      const { id } = await before.startRun({ hubId: "support", workflowId: "approval" }, {});

      const after = serviceOn(shell, files, { ids, setTimer: pageTimers });
      const engine = await after.open();
      await vi.advanceTimersByTimeAsync(0);

      expect(await engine.executor.endLostRuns()).toBe(0);
      expect(await engine.runs.get(id)).toMatchObject({ status: "waiting" });
      await engine.executor.send(id, "approve");
      await vi.advanceTimersByTimeAsync(0);

      const types = (await engine.runs.events(id)).map((event) => event.type);
      expect(types.filter((type) => type === "run.started")).toHaveLength(1);
      expect(types.filter((type) => type === "run.completed")).toHaveLength(1);
      expect(await engine.runs.get(id)).toMatchObject({ status: "completed" });
      await after.close();
    });
  });
});
