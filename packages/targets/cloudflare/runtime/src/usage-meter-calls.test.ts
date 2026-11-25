import type { UsageAnswer, UsageRefusal } from "@halonicjs/adapter-cloudflare-durable";
import { modelCallUsageOf } from "@halonicjs/engine";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type UsageObjectCalls, UsageObjectMeter } from "./usage-meter.ts";

const ada = { actor: "eu_ada00000000000001", scope: "o/org_acme", role: "owner" } as const;

/** A usage object that answers `answer` and keeps every call it was given. */
function fakeObject(answer: UsageAnswer = { allowed: true }) {
  const seen: unknown[][] = [];
  const keep =
    <Answer>(name: string, answered: Answer) =>
    async (...args: unknown[]): Promise<Answer> => {
      seen.push([name, ...args]);
      return answered;
    };
  const object: UsageObjectCalls = {
    check: keep("check", answer),
    reserve: keep("reserve", answer),
    settle: keep("settle", "settled" as const),
    record: keep("record", undefined),
    stopRunning: keep("stopRunning", undefined),
  };
  const ids = { next: (prefix: string) => `${prefix}1` };
  const meter = new UsageObjectMeter({ objectOf: () => object, topRunId: "run_top", ids });
  return { meter, seen };
}

/** The cause the meter answers for an object that refuses with `refusal`. */
async function causeOf(refusal: UsageRefusal) {
  const { meter } = fakeObject({ allowed: false, refusal });
  const answer = await meter.check(ada, { kind: "model-call" });
  return answer.allowed ? undefined : answer.stop.cause;
}

verifies("runtime.usage-meter", () => {
  describe("UsageObjectMeter's calls", () => {
    it("holds and records a child run's step and call, with its model, under the top-level run", async () => {
      const { meter, seen } = fakeObject();
      await meter.reserve(ada, { cost: 0.5 });
      const call = modelCallUsageOf({
        type: "llm.response",
        agent: "writer",
        provider: "acme-ai",
        model: "acme-1",
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 3 },
        latencyMs: 5,
        text: "",
        runId: "run_child",
        seq: 4,
        at: "2026-11-23T10:00:00.000Z",
        cost: 0.1,
      });
      await meter.record(ada, call);
      const principal = { actor: ada.actor, scope: ada.scope };
      const step = { id: "res_1", runId: "run_top", max: { cost: 500_000 } };
      const amounts = { steps: 1, tokens: 15, cacheTokens: 3, cost: 100_000 };
      expect(seen).toEqual([
        ["reserve", principal, expect.objectContaining(step)],
        ["record", principal, "run_child:4", "run_top", "model_call", amounts, "acme-ai/acme-1"],
      ]);
    });

    it("settles a step's harness time with explicit zeros for the rest", async () => {
      const { meter, seen } = fakeObject();
      await meter.settle({ id: "res_1", principal: ada }, {
        wallMs: 2_000,
        harnessMs: 1_500,
      } as Parameters<UsageObjectMeter["settle"]>[1]);
      expect(seen).toEqual([
        [
          "settle",
          ada.scope,
          "res_1",
          { harnessMs: 1_500, cost: 0, steps: 0, tokens: 0, cacheTokens: 0, runs: 0 },
        ],
      ]);
    });
  });

  describe("UsageObjectMeter's stops", () => {
    it("maps the object's codes onto the plan's", async () => {
      expect((await causeOf({ code: "plan.none" }))?.code).toBe("plan.none");
      expect((await causeOf({ code: "plan.inactive" }))?.code).toBe("plan.suspended");
      expect((await causeOf({ code: "plan.member.inactive" }))?.code).toBe("plan.member-removed");
      const member = await causeOf({ code: "plan.member.concurrency", running: 1, limit: 1 });
      expect(member).toMatchObject({ code: "plan.concurrency", detail: { cap: "member" } });
    });

    it("keeps the object's load limits apart from the plan's", async () => {
      expect(await causeOf({ code: "usage.outbox-full" })).toMatchObject({
        kind: "limit_reached",
        code: "usage.outbox-full",
      });
      const rate = await causeOf({ code: "usage.rate", limit: 600, resetsAt: 0 });
      expect(rate).toMatchObject({
        code: "usage.rate",
        detail: { limit: "600", resetsAt: "1970-01-01T00:00:00.000Z" },
      });
    });

    it("names harness time in minutes", async () => {
      const cause = await causeOf({
        code: "plan.harnessMs",
        unit: "harnessMs",
        used: 120_000,
        limit: 120_000,
        needed: 0,
        left: 0,
        resetsAt: 0,
      });
      expect(cause).toMatchObject({
        code: "plan.harnessMinutes",
        detail: { unit: "harnessMinutes", used: "2", limit: "2", canUpgrade: "false" },
      });
    });
  });
});
