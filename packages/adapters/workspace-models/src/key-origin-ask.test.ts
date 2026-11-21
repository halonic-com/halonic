import type { ModelScope, ResolvedModel, TurnEvent, TurnLog } from "@halonicjs/engine";
import type { ChatTurnRequest } from "@halonicjs/ports";
import { StopSource } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  askingModelResolver,
  type KeyOriginAnswer,
  type KeyOriginAskOptions,
  type KeyOriginQuestion,
  keyOriginWaitMs,
} from "./key-origin-ask.ts";
import { modelTexts } from "./model-texts.ts";
import { WorkspaceModelError } from "./workspace-providers.ts";

const gateway = "https://gateway.example.com";
const call: ChatTurnRequest = {
  hubId: "support",
  alias: "gateway/model-1",
  messages: [{ role: "user", content: "Hi" }],
  tools: [],
};
const model = { model: "model-1" } as unknown as ResolvedModel;

function refusal(): WorkspaceModelError {
  return new WorkspaceModelError(
    "key-origin-not-allowed",
    modelTexts.originNotAllowed("gateway", "fake-key", gateway),
    modelTexts.originNotAllowedFix("fake-key", gateway),
    { provider: "gateway", key: "fake-key", origin: gateway },
  );
}

/** A resolver that answers with each of `results` in turn, counting its calls. */
function resolverOf(...results: (ResolvedModel | Error)[]) {
  let calls = 0;
  const resolve = async () => {
    const result = results[Math.min(calls, results.length - 1)];
    calls += 1;
    if (result instanceof Error) throw result;
    return result as ResolvedModel;
  };
  return { resolve, calls: () => calls };
}

/** A run scope whose log keeps what is appended. */
function scopeOf(stop?: StopSource): ModelScope & { written: TurnEvent[] } {
  const written: TurnEvent[] = [];
  const log: TurnLog = {
    append: async (event) => {
      written.push(event);
    },
  };
  return { runId: "run_1", log, written, ...(stop === undefined ? {} : { stop: stop.signal }) };
}

/** Ask options whose person gives `answer`, saving first when it is `allowed`; `undefined` never answers. */
function askOf(answer: KeyOriginAnswer | undefined, overrides: Partial<KeyOriginAskOptions> = {}) {
  const asked: KeyOriginQuestion[] = [];
  const saved: [string, string][] = [];
  const signals: AbortSignal[] = [];
  const timers: { callback: () => void; delayMs: number; cleared: boolean }[] = [];
  const options: KeyOriginAskOptions = {
    mayAsk: () => true,
    ask: async (question, { save, signal }) => {
      asked.push(question);
      signals.push(signal);
      if (answer === undefined) return await new Promise<never>(() => {});
      if (answer === "allowed" && !(await save())) return "not-allowed";
      return answer;
    },
    allowOrigin: async (key, origin) => {
      saved.push([key, origin]);
      return true;
    },
    setTimer: (callback, delayMs) => {
      const timer = { callback, delayMs, cleared: false };
      timers.push(timer);
      return () => {
        timer.cleared = true;
      };
    },
    ...overrides,
  };
  return { options, asked, saved, signals, timers };
}

verifies("cli.key-origin-ask", () => {
  it("saves the refused address after Allow, logs it and picks the model once more", async () => {
    const resolver = resolverOf(refusal(), model);
    const ask = askOf("allowed");
    const scope = scopeOf(new StopSource());

    const picked = await askingModelResolver(resolver.resolve, ask.options)(call, scope);

    expect(picked).toBe(model);
    expect(resolver.calls()).toBe(2);
    expect(ask.asked).toEqual([
      { provider: "gateway", key: "fake-key", origin: gateway, runId: "run_1" },
    ]);
    expect(ask.saved).toEqual([["fake-key", gateway]]);
    expect(scope.written).toEqual([
      {
        type: "key-origin.answered",
        provider: "gateway",
        key: "fake-key",
        origin: gateway,
        answer: "allowed",
      },
    ]);
    expect(ask.timers).toMatchObject([{ delayMs: keyOriginWaitMs, cleared: true }]);
    expect(ask.signals[0]?.aborted).toBe(true);
  });

  it("fails with the refusal after Don't allow, and logs the answer", async () => {
    const resolver = resolverOf(refusal());
    const ask = askOf("not-allowed");
    const scope = scopeOf();

    const failure = await askingModelResolver(resolver.resolve, ask.options)(call, scope).catch(
      (error: unknown) => error,
    );

    expect(failure).toMatchObject({ code: "key-origin-not-allowed" });
    expect(resolver.calls()).toBe(1);
    expect(ask.saved).toEqual([]);
    expect(scope.written).toMatchObject([{ type: "key-origin.answered", answer: "not-allowed" }]);
  });

  it("asks nobody when the host may not ask, such as for a scheduled run", async () => {
    const resolver = resolverOf(refusal());
    const ask = askOf("allowed", { mayAsk: () => false });
    const scope = scopeOf();

    await expect(
      askingModelResolver(resolver.resolve, ask.options)(call, scope),
    ).rejects.toMatchObject({ code: "key-origin-not-allowed" });
    expect(ask.asked).toEqual([]);
    expect(scope.written).toEqual([]);
  });

  it("passes any other error on and asks nobody", async () => {
    const other = new WorkspaceModelError(
      "untrusted-provider-address",
      modelTexts.untrustedAddress("gateway", gateway),
      modelTexts.untrustedAddressFix("gateway"),
    );
    const ask = askOf("allowed");

    await expect(
      askingModelResolver(resolverOf(other).resolve, ask.options)(call, scopeOf()),
    ).rejects.toBe(other);
    expect(ask.asked).toEqual([]);
  });

  it("fails with the refusal after the wait times out, closes the question and logs nothing", async () => {
    const ask = askOf(undefined);
    const scope = scopeOf();
    const asking = askingModelResolver(resolverOf(refusal()).resolve, ask.options)(call, scope);
    await Promise.resolve();
    await Promise.resolve();

    ask.timers[0]?.callback();

    await expect(asking).rejects.toMatchObject({ code: "key-origin-not-allowed" });
    expect(ask.signals[0]?.aborted).toBe(true);
    expect(scope.written).toEqual([]);
  });

  it("fails with the refusal when the call is stopped while it waits, and asks nobody once it is stopped", async () => {
    const stop = new StopSource();
    const ask = askOf(undefined);
    const scope = scopeOf(stop);
    const asking = askingModelResolver(resolverOf(refusal()).resolve, ask.options)(call, scope);
    await Promise.resolve();
    await Promise.resolve();

    stop.stop(new Error("The run was cancelled."));

    await expect(asking).rejects.toMatchObject({ code: "key-origin-not-allowed" });
    expect(ask.signals[0]?.aborted).toBe(true);
    expect(scope.written).toEqual([]);
    const later = askOf("allowed");
    await expect(
      askingModelResolver(resolverOf(refusal()).resolve, later.options)(call, scope),
    ).rejects.toMatchObject({ code: "key-origin-not-allowed" });
    expect(later.asked).toEqual([]);
  });

  it("fails with the refusal when the question can't be asked", async () => {
    const ask = askOf("allowed", {
      ask: async () => {
        throw new Error("No window to ask in.");
      },
    });

    await expect(
      askingModelResolver(resolverOf(refusal()).resolve, ask.options)(call, scopeOf()),
    ).rejects.toMatchObject({ code: "key-origin-not-allowed" });
  });

  it("asks once: a second refusal after Allow fails the call", async () => {
    const resolver = resolverOf(refusal(), refusal());
    const ask = askOf("allowed");

    await expect(
      askingModelResolver(resolver.resolve, ask.options)(call, scopeOf()),
    ).rejects.toMatchObject({ code: "key-origin-not-allowed" });
    expect(resolver.calls()).toBe(2);
    expect(ask.asked).toHaveLength(1);
  });

  it("asks about a chat turn outside a run without a run id, and logs nothing", async () => {
    const ask = askOf("allowed");

    await askingModelResolver(resolverOf(refusal(), model).resolve, ask.options)(call);

    expect(ask.asked).toEqual([{ provider: "gateway", key: "fake-key", origin: gateway }]);
  });
});
