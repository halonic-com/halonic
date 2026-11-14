import { createRemoteExecutor } from "@halonicjs/adapter-executor-remote";
import type { RunEvent } from "@halonicjs/events";
import { createServer, MemoryRequestCountStore } from "@halonicjs/host-server";
import type { RunEventListener } from "@halonicjs/ports";
import { runExecutorContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeEngine } from "./fake-engine.test-helper.ts";
import { type Listening, listenOnNode } from "./listen.ts";

const open: Listening[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((listening) => listening.close()));
});

/** A real host on a free loopback port, in front of a fake engine, with no password. */
async function serve() {
  const engine = new FakeEngine();
  const logged: unknown[] = [];
  const listening = await listenOnNode({
    createServer: (allowedHosts) =>
      createServer({
        config: {
          deploymentId: "acme",
          version: "0.1.0",
          minAppVersion: "0.1.0",
          allowedHosts,
          maxBodyBytes: 64 * 1024,
        },
        ports: {
          runs: engine,
          runStore: {
            list: async () => [...engine.runs.values()],
            get: async (id) => engine.runs.get(id) ?? null,
          },
          secrets: { get: async () => null },
          passwordHasher: {
            hash: async () => "",
            verify: async () => false,
            needsRehash: () => false,
          },
          coordination: {} as never,
          trust: { check: async () => ({ state: "trusted", message: "" }) },
          webhooks: { find: async () => null },
          requestCounts: new MemoryRequestCountStore(),
          errorLog: { record: (error) => logged.push(error) },
          clock: { now: () => new Date() },
          ids: { next: (prefix) => `${prefix}_1` },
        },
      }),
    port: 0,
    network: false,
    passwordIsSet: false,
    report: () => {},
    logError: (error) => logged.push(error),
  });
  open.push(listening);
  const executor = createRemoteExecutor({
    baseUrl: `http://127.0.0.1:${listening.port}`,
    reportError: (error) => logged.push(error),
  });
  return { engine, executor, logged };
}

runExecutorContract("remote executor against a served host", async () => {
  const { engine, executor } = await serve();
  return {
    executor,
    missing: {
      hubId: "acme",
      unknownHubId: "no-hub",
      unknownWorkflowId: "no-workflow",
      unknownAgentId: "no-agent",
    },
    async waitForApproval() {
      const run = await executor.start({ hubId: "acme", workflowId: "review", input: {} });
      engine.awaitApproval(run.id, "call-1");
      return { runId: run.id, event: "approve", callId: "call-1" };
    },
  };
});

verifies("executor-remote.runs", () => {
  describe("over a real connection", () => {
    it("answers a chat turn", async () => {
      const { executor } = await serve();

      const answer = await executor.chatTurn({ hubId: "acme", messages: [], tools: [] });

      expect(answer.content).toBe("hello");
    });

    it("stops the model call on the host when the caller aborts a chat turn", async () => {
      const { engine, executor } = await serve();
      engine.holdTurns = true;
      const controller = new AbortController();

      const turn = executor.chatTurn({
        hubId: "acme",
        messages: [],
        tools: [],
        signal: controller.signal,
      });
      while (engine.lastTurnSignal === undefined) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      controller.abort(new Error("stopped"));

      await expect(turn).rejects.toThrow("stopped");
      await vi.waitFor(() => expect(engine.lastTurnSignal?.aborted).toBe(true));
    });

    it("cancels a run and ends its stream", async () => {
      const { engine, executor } = await serve();
      const run = await executor.start({ hubId: "acme", workflowId: "review", input: {} });

      const cancelled = await executor.cancel?.(run.id);

      expect(cancelled?.status).toBe("failed");
      expect(engine.runs.get(run.id)?.status).toBe("failed");
    });
  });
});

verifies("executor-remote.stream", () => {
  describe("over a real connection", () => {
    it("follows a run live and resumes after a seq", async () => {
      const { engine, executor } = await serve();
      const run = await executor.start({ hubId: "acme", workflowId: "review", input: {} });
      for (const seq of [1, 2, 3]) {
        engine.append(run.id, { seq, type: "run.started" } as unknown as RunEvent);
      }
      const seen: number[] = [];
      const closed = new Promise<Error | undefined>((resolve) => {
        const listener: RunEventListener = {
          onEvent: (event) => seen.push(event.seq),
          onClose: resolve,
        };
        executor.subscribe(run.id, 1, listener);
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      engine.append(run.id, { seq: 4, type: "run.completed" } as unknown as RunEvent);
      engine.end(run.id);

      expect(await closed).toBeUndefined();
      expect(seen).toEqual([2, 3, 4]);
    });

    it("closes with the host's error for a run that doesn't exist", async () => {
      const { executor } = await serve();
      const closed = new Promise<Error | undefined>((resolve) => {
        executor.subscribe("run_404", 0, { onEvent: () => {}, onClose: resolve });
      });

      expect(await closed).toMatchObject({ status: 404, code: "run_not_found" });
    });
  });
});
