import {
  type ChatRequest,
  type ChatResponse,
  type LlmProvider,
  ModelCallError,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { textAnswer } from "../testing/scripted-model.ts";
import type { AbortOnStop } from "./abort-on-stop.ts";
import { modelRunCancelledMessage } from "./live-calls.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

/** What a host passes: an `AbortController` per call, and the listener gone once the call ends. */
function hostAbortOnStop() {
  let listening = 0;
  const abortOnStop: AbortOnStop = async (stop, work) => {
    const controller = new AbortController();
    listening += 1;
    const remove = stop.onStop(() => controller.abort(stop.reason));
    try {
      return await work(controller.signal);
    } finally {
      remove();
      listening -= 1;
    }
  };
  return { abortOnStop, listening: () => listening };
}

/** A provider that answers only when its call is aborted, and then throws the abort's reason. */
class WaitingModel implements LlmProvider {
  readonly id = "waiting";
  readonly type = "test";
  readonly capabilities = { tools: true, jsonOutput: false, vision: false, streaming: false };
  readonly aborted: unknown[] = [];
  #called = Promise.withResolvers<void>();
  /** Resolves once the first call has been made. */
  readonly called = this.#called.promise;

  chat(request: ChatRequest): Promise<ChatResponse> {
    this.#called.resolve();
    return new Promise((_resolve, reject) => {
      request.signal?.addEventListener("abort", () => {
        this.aborted.push(request.signal?.reason);
        // How an offline provider fails, so the chain would move on if it took it for one.
        reject(new ModelCallError("offline", "fetch failed"));
      });
    });
  }
}

/** A provider that counts its calls and answers each one. */
class CountingModel implements LlmProvider {
  readonly id = "fallback";
  readonly type = "test";
  readonly capabilities = { tools: true, jsonOutput: false, vision: false, streaming: false };
  calls = 0;

  async chat(): Promise<ChatResponse> {
    this.calls += 1;
    return textAnswer("From the fallback.");
  }
}

function stoppableRun() {
  const waiting = new WaitingModel();
  const fallback = new CountingModel();
  const host = hostAbortOnStop();
  const setup = runsOn([], undefined, {
    model: {
      provider: waiting,
      model: "slow-1",
      fallback: [{ provider: fallback, model: "fallback-1" }],
    },
    abortOnStop: host.abortOnStop,
  });
  return { ...setup, waiting, fallback, host };
}

verifies("engine.model-call-stop", () => {
  describe("a model call going on", () => {
    it("is aborted when its run is cancelled, without trying the next model or recording a failure", async () => {
      const { executor, runs, scheduler, waiting, fallback, host } = stoppableRun();
      await executor.start(replyStart);
      const due = scheduler.runDue();
      await waiting.called;

      await executor.cancel("run_1");
      await due;

      expect(waiting.aborted).toHaveLength(1);
      expect((waiting.aborted[0] as Error).message).toBe(modelRunCancelledMessage);
      expect(fallback.calls).toBe(0);
      const types = typesOf(runs.logs.get("run_1"));
      expect(types).not.toContain("llm.fallback");
      expect(types.filter((type) => type === "run.failed")).toHaveLength(1);
      expect(types.at(-1)).toBe("run.failed");
      expect(await runs.get("run_1")).toMatchObject({ reason: "cancelled" });
      expect(host.listening()).toBe(0);
    });

    it("is aborted when the engine stops, and the run records nothing", async () => {
      const { executor, runs, scheduler, waiting, fallback } = stoppableRun();
      await executor.start(replyStart);
      const due = scheduler.runDue();
      await waiting.called;
      const before = typesOf(runs.logs.get("run_1"));

      await executor.close();
      await due;

      expect(waiting.aborted).toHaveLength(1);
      expect(fallback.calls).toBe(0);
      expect(typesOf(runs.logs.get("run_1"))).toEqual(before);
    });

    it("leaves no listener behind once it has answered", async () => {
      const host = hostAbortOnStop();
      const { executor, scheduler, runs } = runsOn([textAnswer("Dear support")], undefined, {
        abortOnStop: host.abortOnStop,
      });
      await executor.start(replyStart);
      await scheduler.runDue();

      expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
      expect(host.listening()).toBe(0);
    });
  });
});
