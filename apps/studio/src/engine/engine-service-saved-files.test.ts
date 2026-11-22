// Each start reads the workspace's files as they are saved then, not as they were when the engine
// opened (HAL-16324): a later save of an agent or of Local only counts for the next run.

import type { SetTimer } from "@halonicjs/adapter-scheduler-node";
import type { HttpClient, IdGenerator } from "@halonicjs/ports";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acmeFiles, fakeShell, lockCalls, serviceOn } from "./engine-service.testing.ts";

const reply = { hubId: "support", workflowId: "reply" };

const routinePath = "hubs/support/workflows/routines/hourly.routine.yaml";
const hourly = [
  "id: hourly",
  "name: Hourly",
  'trigger: { schedule: "0 * * * *" }',
  "run: { workflow: reply }",
  "",
].join("\n");

/** Acme with a provider in the cloud and one on this computer; the writer starts on the cloud one. */
function acmeWithTwoProviders() {
  return acmeFiles(
    { writer: "model: cloud\n" },
    {
      "providers/far.yaml":
        "id: far\nname: Far\ntype: openai-compatible\nbaseUrl: https://models.acme.test/v1\n",
      "providers/near.yaml":
        "id: near\nname: Near\ntype: openai-compatible\nbaseUrl: http://127.0.0.1:18765/v1\nlocal: true\n",
      "models.yaml": [
        "aliases:",
        "  cloud: { provider: far, model: big }",
        "  home: { provider: near, model: small }",
        "",
      ].join("\n"),
    },
  );
}

/** A model server that answers every call at once, and keeps the address each call went to. */
function answeringServer(): HttpClient & { readonly hosts: string[] } {
  const hosts: string[] = [];
  return {
    hosts,
    fetch: async (url) => {
      hosts.push(new URL(url).host);
      const answer = {
        id: "answer-1",
        choices: [
          { index: 0, message: { role: "assistant", content: "Done." }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };
      return new Response(JSON.stringify(answer), {
        headers: { "content-type": "application/json" },
      });
    },
  };
}

/** A model server that takes each call and answers none until it is called off, so a run stays going. */
const hungServer: HttpClient = {
  fetch: (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }),
};

/** The page's timers, as the window sets them: a run's next step is one, due at once. */
const pageTimers: SetTimer = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
};

/** Ids that don't repeat, as the shell's don't. */
function countingIds(): IdGenerator {
  let next = 0;
  return {
    next: (prefix) => {
      next += 1;
      return `${prefix}${next}`;
    },
  };
}

verifies("studio.engine-service", () => {
  describe("a start after a save", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("calls no model in the cloud once Local only is turned on", async () => {
      const shell = fakeShell();
      const files = acmeWithTwoProviders();
      const server = answeringServer();
      const service = serviceOn(shell, files, {
        http: server,
        ids: countingIds(),
        setTimer: pageTimers,
      });
      const first = await service.startRun(reply, {});
      await vi.advanceTimersByTimeAsync(0);
      const engine = await service.open();
      expect(server.hosts).toEqual(["models.acme.test"]);
      expect(await engine.runs.get(first.id)).not.toMatchObject({
        error: expect.stringMatching(/local/i),
      });

      await files.write("workspace.yaml", "id: acme\nname: Acme\nprivacy:\n  localOnly: true\n");
      const second = await service.startRun(reply, {});
      await vi.advanceTimersByTimeAsync(0);

      expect(server.hosts).toEqual(["models.acme.test"]);
      const reopened = await service.open();
      expect(await reopened.runs.get(second.id)).toMatchObject({
        status: "failed",
        reason: "local-only",
      });
      // The engine built for the old setting gave its lock back before the new one took it.
      expect(lockCalls(shell)).toEqual([
        "engine_lock_hold",
        "engine_lock_release",
        "engine_lock_hold",
      ]);
      await service.close();
    });

    it("runs the agent as saved since the engine opened, on the same engine", async () => {
      const shell = fakeShell();
      const files = acmeWithTwoProviders();
      const server = answeringServer();
      const service = serviceOn(shell, files, {
        http: server,
        ids: countingIds(),
        setTimer: pageTimers,
      });
      await service.startRun(reply, {});
      await vi.advanceTimersByTimeAsync(0);

      await files.write(
        "hubs/support/agents/writer.agent.yaml",
        "id: writer\nname: Writer\nmodel: home\n",
      );
      await service.startRun(reply, {});
      await vi.advanceTimersByTimeAsync(0);

      expect(server.hosts).toEqual(["models.acme.test", "127.0.0.1:18765"]);
      expect(lockCalls(shell)).toEqual(["engine_lock_hold"]);
      await service.close();
    });

    it("refuses while a run is going when Local only was turned on, and that run goes on", async () => {
      const shell = fakeShell();
      const files = acmeWithTwoProviders();
      const service = serviceOn(shell, files, {
        http: hungServer,
        ids: countingIds(),
        setTimer: pageTimers,
      });
      const going = await service.startRun(reply, {});
      await vi.advanceTimersByTimeAsync(0);

      await files.write("workspace.yaml", "id: acme\nname: Acme\nprivacy:\n  localOnly: true\n");

      await expect(service.startRun(reply, {})).rejects.toMatchObject({
        kind: "unavailable",
        message: "Local only was turned on or off in Acme, so this run didn't start.",
        fix: "Try again once the run that's going ends.",
      });
      const engine = await service.open();
      expect(await engine.runs.get(going.id)).toMatchObject({ status: "running" });
      expect(lockCalls(shell)).toEqual(["engine_lock_hold"]);
      await service.close();
    });

    it("cancels a going run after Local only was turned on, on the same engine", async () => {
      const shell = fakeShell();
      const files = acmeWithTwoProviders();
      const service = serviceOn(shell, files, {
        http: hungServer,
        ids: countingIds(),
        setTimer: pageTimers,
      });
      const going = await service.startRun(reply, {});
      await vi.advanceTimersByTimeAsync(0);

      await files.write("workspace.yaml", "id: acme\nname: Acme\nprivacy:\n  localOnly: true\n");

      expect(await service.cancel(going.id)).toMatchObject({
        status: "failed",
        reason: "cancelled",
      });
      expect(lockCalls(shell)).toEqual(["engine_lock_hold"]);
      await service.close();
    });

    it("doesn't count a run an earlier engine left going as going", async () => {
      const shell = fakeShell();
      const files = acmeWithTwoProviders();
      const options = { http: hungServer, ids: countingIds(), setTimer: pageTimers };
      const earlier = serviceOn(shell, files, options);
      await earlier.startRun(reply, {});
      await vi.advanceTimersByTimeAsync(0);
      await earlier.close();
      const service = serviceOn(shell, files, options);
      await service.open();

      await files.write("workspace.yaml", "id: acme\nname: Acme\nprivacy:\n  localOnly: true\n");

      await expect(service.startRun(reply, {})).resolves.toMatchObject({ id: expect.any(String) });
      await service.close();
    });

    it("refuses a routine's start once Local only is turned on, then opens a new engine", async () => {
      vi.useRealTimers();
      const files = acmeFiles({}, { [routinePath]: hourly });
      let now = new Date("2026-11-20T10:00:30.000Z");
      const wakeUps = new Set<() => void>();
      const errors: unknown[] = [];
      const shell = fakeShell();
      const service = serviceOn(shell, files, {
        clock: { now: () => now },
        setTimer: (callback) => {
          wakeUps.add(callback);
          return () => wakeUps.delete(callback);
        },
        ids: countingIds(),
        reportError: (error) => errors.push(error),
      });
      await service.open();
      await waitUntil("the scheduler's wake-up", () => wakeUps.size > 0);

      await files.write("workspace.yaml", "id: acme\nname: Acme\nprivacy:\n  localOnly: true\n");
      now = new Date("2026-11-20T11:00:30.000Z");
      for (const wakeUp of [...wakeUps]) wakeUp();
      await waitUntil("the new engine", () => lockCalls(shell).length === 3);

      expect(errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining("Local only was turned on or off in Acme"),
        }),
      );
      expect(lockCalls(shell)).toEqual([
        "engine_lock_hold",
        "engine_lock_release",
        "engine_lock_hold",
      ]);
      await service.close();
    });

    it("checks the trust of the files as saved", async () => {
      const files = acmeWithTwoProviders();
      const checked: LoadedWorkspace[] = [];
      const mayStart = async (workspace: LoadedWorkspace) => {
        checked.push(workspace);
        return true;
      };
      const service = serviceOn(fakeShell(), files, { mayStart });
      await service.openForStart();

      await files.write("hubs/support/agents/editor.agent.yaml", "id: editor\nname: Editor\n");
      await service.openForStart();

      const agents = filesOf(checked.at(-1) as LoadedWorkspace, "agent").map(
        (file) => file.value.id,
      );
      expect(agents).toContain("editor");
      await service.close();
    });
  });
});
