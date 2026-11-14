import { isRunTargetNotFound } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { RemoteHostError } from "./errors.ts";
import { errorBody, fakeHost, summaryOf } from "./fake-host.test-helper.ts";
import { createRemoteExecutor } from "./remote-executor.ts";

const baseUrl = "http://127.0.0.1:4173";

function executorFor(host: ReturnType<typeof fakeHost>) {
  return createRemoteExecutor({ baseUrl, fetch: host.fetch, reportError: () => {} });
}

verifies("executor-remote.runs", () => {
  describe("the run routes", () => {
    it("has the id remote", () => {
      expect(executorFor(fakeHost(() => Response.json({}))).id).toBe("remote");
    });

    it("sends a workflow start and returns the summary", async () => {
      const host = fakeHost(() => Response.json(summaryOf("run_1")));

      const summary = await executorFor(host).start({
        hubId: "acme",
        workflowId: "review",
        input: { topic: "x" },
        runId: "run_1",
      });

      expect(summary.id).toBe("run_1");
      expect(host.calls[0]).toMatchObject({
        method: "POST",
        path: "/api/runs",
        body: { hubId: "acme", workflowId: "review", input: { topic: "x" }, runId: "run_1" },
      });
      expect(host.calls[0]?.headers.get("content-type")).toBe("application/json");
    });

    it("sends an agent start", async () => {
      const host = fakeHost(() => Response.json(summaryOf("run_2")));

      await executorFor(host).startAgent({ hubId: "acme", agentId: "scribe", prompt: "hi" });

      expect(host.calls[0]).toMatchObject({
        path: "/api/agent-runs",
        body: { hubId: "acme", agentId: "scribe", prompt: "hi" },
      });
    });

    it.each([
      ["hub", "hub_not_found", "acme"],
      ["workflow", "workflow_not_found", "tidy"],
    ] as const)(
      "rejects a start with RunTargetNotFound for a missing %s",
      async (kind, code, id) => {
        const host = fakeHost(() => errorBody(404, code));

        const error = await executorFor(host)
          .start({ hubId: "acme", workflowId: "tidy", input: {} })
          .catch((thrown: unknown) => thrown);

        expect(isRunTargetNotFound(error)).toBe(true);
        expect(error).toMatchObject({ kind, id });
      },
    );

    it("rejects an agent start with RunTargetNotFound for a missing agent", async () => {
      const host = fakeHost(() => errorBody(404, "agent_not_found"));

      const error = await executorFor(host)
        .startAgent({ hubId: "acme", agentId: "scribe", prompt: "hi" })
        .catch((thrown: unknown) => thrown);

      expect(error).toMatchObject({ kind: "agent", id: "scribe" });
    });

    it("leaves any other start refusal as the host's error", async () => {
      const host = fakeHost(() => errorBody(403, "workspace_not_trusted"));

      await expect(
        executorFor(host).start({ hubId: "acme", workflowId: "tidy", input: {} }),
      ).rejects.toMatchObject({ status: 403, code: "workspace_not_trusted" });
    });

    it("refuses a start with a field the host would drop, before sending anything", async () => {
      const host = fakeHost(() => Response.json(summaryOf("run_1")));
      const executor = executorFor(host);

      await expect(
        executor.start({ hubId: "acme", workflowId: "tidy", input: {}, harness: "codex" }),
      ).rejects.toThrow(RangeError);
      await expect(
        executor.startAgent({
          hubId: "acme",
          agentId: "scribe",
          prompt: "hi",
          trigger: { type: "manual", at: "" } as never,
        }),
      ).rejects.toThrow("trigger");
      expect(host.calls).toEqual([]);
    });

    it("sends an event to one path segment, with the call id", async () => {
      const host = fakeHost(() => Response.json(summaryOf("run/1")));

      await executorFor(host).send("run/1", "approve", { note: "ok" }, { callId: "c1" });

      expect(host.calls[0]).toMatchObject({
        path: "/api/runs/run%2F1/events",
        body: { event: "approve", payload: { note: "ok" }, callId: "c1" },
      });
    });

    it("rejects an event the host refuses with the host's code", async () => {
      const host = fakeHost(() => errorBody(409, "event_not_accepted"));

      const error = await executorFor(host)
        .send("run_1", "approve")
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(RemoteHostError);
      expect(error).toMatchObject({ status: 409, code: "event_not_accepted" });
    });

    it("cancels a run", async () => {
      const host = fakeHost(() => Response.json(summaryOf("run_1")));

      await executorFor(host).cancel?.("run_1");

      expect(host.calls[0]).toMatchObject({ path: "/api/runs/run_1/cancel", body: {} });
    });

    it("rejects with a plain error when the host's refusal has no error body", async () => {
      const host = fakeHost(() => new Response("<html>bad gateway</html>", { status: 502 }));

      await expect(executorFor(host).cancel?.("run_1")).rejects.toMatchObject({
        status: 502,
        code: "unexpected_response",
      });
    });

    it("rejects an answer that is not a run", async () => {
      const host = fakeHost(() => Response.json({ nothing: true }));

      await expect(executorFor(host).cancel?.("run_1")).rejects.toMatchObject({
        code: "unexpected_response",
      });
    });
  });

  describe("chat turns", () => {
    const turn = { hubId: "acme", messages: [], tools: [] };

    it("sends the turn without its signal and returns the answer", async () => {
      const host = fakeHost(() => Response.json({ content: "hi", model: "m" }));

      const answer = await executorFor(host).chatTurn({
        ...turn,
        agent: { type: "openai", model: "m", secret: "openai-key", local: false },
        signal: new AbortController().signal,
      });

      expect(answer.content).toBe("hi");
      expect(host.calls[0]).toMatchObject({
        path: "/api/chat-turn",
        body: { hubId: "acme", agent: { secret: "openai-key" } },
      });
      expect(JSON.stringify(host.calls[0]?.body)).not.toContain("signal");
    });

    it("rejects a refused turn with the host's code", async () => {
      const host = fakeHost(() => errorBody(502, "model_call_failed"));

      await expect(executorFor(host).chatTurn(turn)).rejects.toMatchObject({
        code: "model_call_failed",
      });
    });

    it("rejects when the signal aborts the request", async () => {
      const controller = new AbortController();
      const host = fakeHost(
        (call) =>
          new Promise<Response>(() => {
            void call;
          }),
      );
      const executor = createRemoteExecutor({
        baseUrl,
        fetch: (request) =>
          new Promise<Response>((_resolve, reject) => {
            host.fetch(request).catch(reject);
            request.signal.addEventListener("abort", () => reject(request.signal.reason));
          }),
        reportError: () => {},
      });

      const turnPromise = executor.chatTurn({ ...turn, signal: controller.signal });
      controller.abort(new Error("stopped"));

      await expect(turnPromise).rejects.toThrow("stopped");
    });
  });
});
