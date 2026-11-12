import type { Agent } from "@halonicjs/format";
import {
  type ChatRequest,
  type ChatResponse,
  type LlmProvider,
  ModelCallError,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, textAnswer } from "../testing/scripted-model.ts";
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

/**
 * A provider that gives `answers` first, one per call, and then answers only
 * when its call is aborted, and then throws the abort's reason.
 */
class WaitingModel implements LlmProvider {
  readonly id = "waiting";
  readonly type = "test";
  readonly capabilities = { tools: true, jsonOutput: false, vision: false, streaming: false };
  readonly aborted: unknown[] = [];
  /** The agent of the call that waits, once it is made. */
  waitingFor: string | undefined;
  readonly #answers: ChatResponse[];
  #called = Promise.withResolvers<void>();
  /** Resolves once the first call that waits has been made. */
  readonly called = this.#called.promise;

  constructor(answers: ChatResponse[] = []) {
    this.#answers = [...answers];
  }

  chat(request: ChatRequest): Promise<ChatResponse> {
    const answer = this.#answers.shift();
    if (answer !== undefined) return Promise.resolve(answer);
    this.waitingFor = request.meta?.agentId;
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

/** A provider that ignores the abort: its call answers only when the test says so. */
class DeafModel implements LlmProvider {
  readonly id = "deaf";
  readonly type = "test";
  readonly capabilities = { tools: true, jsonOutput: false, vision: false, streaming: false };
  #called = Promise.withResolvers<void>();
  #answer = Promise.withResolvers<ChatResponse>();
  /** Resolves once the call has been made. */
  readonly called = this.#called.promise;

  chat(): Promise<ChatResponse> {
    this.#called.resolve();
    return this.#answer.promise;
  }

  /** Lets the call answer at last. */
  answer(response: ChatResponse): void {
    this.#answer.resolve(response);
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

/** An agent of the `acme` hub with the writer's defaults. */
function agent(id: string, fields: Partial<Agent> = {}): Agent {
  return { ...writerAgent(), id, name: id, ...fields };
}

/**
 * A run whose model call waits on the provider until it is aborted, with a
 * fallback model behind it. With `answers`, the provider gives those first.
 */
function stoppableRun(answers: ChatResponse[] = [], agents?: Readonly<Record<string, Agent>>) {
  const waiting = new WaitingModel(answers);
  const fallback = new CountingModel();
  const host = hostAbortOnStop();
  const setup = runsOn([], undefined, {
    model: {
      provider: waiting,
      model: "slow-1",
      fallback: [{ provider: fallback, model: "fallback-1" }],
    },
    abortOnStop: host.abortOnStop,
    ...(agents === undefined ? {} : { agents }),
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

    it("is aborted in a subagent's turn when the run is cancelled, without waiting for that turn", async () => {
      const { executor, runs, scheduler, waiting, fallback, host } = stoppableRun(
        [callAnswer(call("d-1", "delegate_checker", { task: "Check the reply to support" }))],
        { writer: agent("writer", { subagents: ["checker"] }), checker: agent("checker") },
      );
      await executor.start(replyStart);
      const due = scheduler.runDue();
      await waiting.called;
      expect(waiting.waitingFor).toBe("checker");

      await executor.cancel("run_1");
      await due;

      expect(waiting.aborted).toHaveLength(1);
      expect(fallback.calls).toBe(0);
      expect(typesOf(runs.logs.get("run_1"))).not.toContain("llm.fallback");
      expect(await runs.get("run_1")).toMatchObject({ reason: "cancelled" });
      expect(host.listening()).toBe(0);
    });

    it("doesn't hold up the cancel when the provider ignores the abort, and the run records nothing it gives (HAL-6677)", async () => {
      const deaf = new DeafModel();
      const { executor, runs, scheduler } = runsOn([], undefined, {
        model: { provider: deaf, model: "deaf-1" },
        abortOnStop: hostAbortOnStop().abortOnStop,
      });
      await executor.start(replyStart);
      const due = scheduler.runDue();
      await deaf.called;

      // The provider hasn't answered: a cancel that waited for it would never end.
      await executor.cancel("run_1");
      const cancelled = typesOf(runs.logs.get("run_1"));
      deaf.answer(textAnswer("Too late."));
      await due;

      expect(await runs.get("run_1")).toMatchObject({ reason: "cancelled" });
      expect(cancelled.at(-1)).toBe("run.failed");
      expect(typesOf(runs.logs.get("run_1"))).toEqual(cancelled);
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
