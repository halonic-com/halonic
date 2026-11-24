// The usage object's scope, limits pull and alarm over a real Durable Object's storage (see
// `usage-object.test.ts`).

import { describe, expect, it } from "vitest";
import { defaultRunLeaseMs } from "../run-slots.ts";
import { reservationMarginMs } from "../usage-account.ts";
import { defaultPullRetryMs, UsageScope, type UsageScopeOptions } from "../usage-scope.ts";
import { usageStorageOf } from "../usage-storage.ts";
import type { UsageLimits } from "../usage-types.ts";
import { inObjectState } from "./state-host.ts";
import { SuiteClock } from "./suite-case.ts";

export { StateHostObject } from "./state-host.ts";

const acme = { actor: "u_acme", scope: "u/acme" };
const minute = 60_000;

/** A scope over the object's storage and alarm; Cloud answers its limits or can't be reached. */
function newScope(
  storage: DurableObjectStorage,
  cloudAnswers = false,
  options: Partial<UsageScopeOptions> = {},
) {
  const clock = new SuiteClock();
  const start = clock.now().getTime();
  const limits: UsageLimits = {
    version: 1,
    status: "active",
    period: { start, end: start + 30 * 24 * 60 * minute },
    limits: { cost: 1_000 },
    defaultReserve: { cost: 100 },
    maxRunning: 2,
  };
  const cloud = { pulls: 0, answer: cloudAnswers ? limits : null, errors: [] as unknown[] };
  const scope = new UsageScope({
    storage,
    alarm: { set: (atMs) => storage.setAlarm(atMs), clear: () => storage.deleteAlarm() },
    clock: () => clock,
    pullLimits: async () => {
      cloud.pulls++;
      return cloud.answer;
    },
    onPullError: (error) => cloud.errors.push(error),
    ...options,
  });
  return { scope, clock, limits, cloud, alarmAt: () => storage.getAlarm() };
}

const step = { id: "res_1", runId: "run_1", max: { cost: 300 }, timeLimitMs: minute };

describe("usage object storage", () => {
  it("stores a value changed in memory only when it is put", () =>
    inObjectState(({ storage }) => {
      const usage = usageStorageOf(storage);
      usage.transactionSync(() => usage.put("spent", { pool: { cost: 1 } }));
      const read = usage.get<{ pool: { cost: number } }>("spent");
      if (read !== undefined) read.pool.cost = 500;
      expect(usage.get("spent")).toEqual({ pool: { cost: 1 } });
    }));

  it("stores nothing of a transaction that throws", () =>
    inObjectState(({ storage }) => {
      const usage = usageStorageOf(storage);
      expect(() =>
        usage.transactionSync(() => {
          usage.put("spent", 1);
          throw new Error("the step broke");
        }),
      ).toThrow("the step broke");
      expect(usage.get("spent")).toBeUndefined();
    }));
});

describe("usage object scope", () => {
  it("refuses a call for another scope than its first, storing nothing", () =>
    inObjectState(async ({ storage }) => {
      const { scope, limits } = newScope(storage);
      expect(scope.applyLimits("u/acme", limits)).toBe("applied");
      const other = { actor: "u_acme", scope: "o/acme" };
      await expect(scope.reserve(other, step)).rejects.toThrow(RangeError);
      expect(() => scope.applyLimits("o/acme", { ...limits, version: 2 })).toThrow(RangeError);
      expect(scope.outboxSize("u/acme")).toBe(0);
      expect(await scope.reserve(acme, step)).toEqual({ allowed: true });
    }));

  it("refuses a scope other than the object's name, even on the first call", () =>
    inObjectState(({ storage }) => {
      const { scope, limits } = newScope(storage, false, { objectName: "u/acme" });
      expect(() => scope.applyLimits("o/acme", limits)).toThrow(RangeError);
      expect(storage.kv.get("scope")).toBeUndefined();
      expect(scope.applyLimits("u/acme", limits)).toBe("applied");
    }));

  it("refuses a scope that isn't a person's or an organisation's", () =>
    inObjectState(({ storage }) => {
      const { scope, limits } = newScope(storage);
      expect(() => scope.applyLimits("acme", limits)).toThrow(RangeError);
      expect(storage.kv.get("scope")).toBeUndefined();
    }));
});

describe("usage object nonces", () => {
  it("refuses a key's nonce again until its time ends, then takes it", () =>
    inObjectState(({ storage }) => {
      const { scope, clock } = newScope(storage);
      const keepUntilMs = clock.now().getTime() + 5 * minute;
      expect(scope.rememberNonce("u/acme", "cloud-1", "n1", keepUntilMs)).toBe("new");
      expect(scope.rememberNonce("u/acme", "cloud-1", "n1", keepUntilMs)).toBe("seen");
      expect(scope.rememberNonce("u/acme", "cloud-2", "n1", keepUntilMs)).toBe("new");
      // `verifyRequest` still takes a request signed `window` ago at exactly `keepUntilMs`.
      clock.advance(5 * minute);
      expect(scope.rememberNonce("u/acme", "cloud-1", "n1", keepUntilMs + minute)).toBe("seen");
      clock.advance(1);
      expect(scope.rememberNonce("u/acme", "cloud-1", "n1", keepUntilMs + minute)).toBe("new");
    }));

  it("drops nonces whose time has ended", () =>
    inObjectState(({ storage }) => {
      const { scope, clock } = newScope(storage);
      const keepUntilMs = clock.now().getTime() + minute;
      for (const nonce of ["n1", "n2", "n3"]) {
        scope.rememberNonce("u/acme", "cloud-1", nonce, keepUntilMs);
      }
      clock.advance(minute);
      scope.rememberNonce("u/acme", "cloud-1", "n4", keepUntilMs + minute);
      expect([...storage.kv.list({ prefix: "nonce:" })]).toHaveLength(4);
      clock.advance(1);
      scope.rememberNonce("u/acme", "cloud-1", "n5", keepUntilMs + minute);
      expect([...storage.kv.list({ prefix: "nonce:" })]).toHaveLength(2);
      clock.advance(minute);
      scope.rememberNonce("u/acme", "cloud-1", "n6", keepUntilMs + 3 * minute);
      expect([...storage.kv.list({ prefix: "nonce:" })]).toHaveLength(1);
    }));

  it("refuses a nonce for another scope than the object's", () =>
    inObjectState(({ storage }) => {
      const { scope } = newScope(storage, false, { objectName: "u/acme" });
      expect(() => scope.rememberNonce("o/acme", "cloud-1", "n1", Date.now())).toThrow(RangeError);
    }));
});

describe("usage object limits", () => {
  it("refuses with no limits when Cloud can't be reached", () =>
    inObjectState(async ({ storage }) => {
      const { scope, cloud } = newScope(storage);
      expect(await scope.check(acme)).toEqual({ allowed: false, refusal: { code: "plan.none" } });
      expect(await scope.startRun(acme, "run_1")).toMatchObject({ allowed: false });
      expect(cloud.pulls).toBe(1);
      expect(cloud.errors).toEqual([]);
    }));

  it("asks Cloud again only once a pull that found no limits is old enough", () =>
    inObjectState(async ({ storage }) => {
      const { scope, clock, cloud } = newScope(storage);
      await scope.check(acme);
      clock.advance(defaultPullRetryMs - 1);
      await scope.check(acme);
      expect(cloud.pulls).toBe(1);
      clock.advance(1);
      await scope.check(acme);
      expect(cloud.pulls).toBe(2);
    }));

  it("refuses with no limits when the pull throws, and reports the error", () =>
    inObjectState(async ({ storage }) => {
      const failure = new Error("Cloud is down");
      const pullLimits = () => Promise.reject(failure);
      const reported: unknown[] = [];
      const onPullError = (error: unknown) => reported.push(error);
      const { scope } = newScope(storage, false, { pullLimits, onPullError });
      expect(await scope.check(acme)).toEqual({ allowed: false, refusal: { code: "plan.none" } });
      expect(reported).toEqual([failure]);
    }));

  it("pulls limits once for parallel steps, then allows them", () =>
    inObjectState(async ({ storage }) => {
      const { scope, cloud } = newScope(storage, true);
      const answers = await Promise.all([scope.check(acme), scope.check(acme)]);
      expect(answers).toEqual([{ allowed: true }, { allowed: true }]);
      expect(cloud.pulls).toBe(1);
    }));

  it("counts limits past their period's end as none and pulls again", () =>
    inObjectState(async ({ storage }) => {
      const { scope, clock, limits, cloud } = newScope(storage);
      scope.applyLimits("u/acme", limits);
      expect(await scope.check(acme)).toEqual({ allowed: true });
      clock.advance(limits.period.end - limits.period.start);
      expect(await scope.check(acme)).toEqual({ allowed: false, refusal: { code: "plan.none" } });
      expect(cloud.pulls).toBe(1);
    }));
});

describe("usage object alarm", () => {
  it("is set for the earlier of a lease's end and a reservation's, and again after each", () =>
    inObjectState(async ({ storage }) => {
      const { scope, clock, limits, alarmAt } = newScope(storage);
      scope.applyLimits("u/acme", limits);
      const now = clock.now().getTime();
      await scope.reserve(acme, { ...step, timeLimitMs: 10 * minute });
      const expiry = now + 10 * minute + reservationMarginMs;
      expect(await alarmAt()).toBe(expiry);
      await scope.startRun(acme, "run_1");
      expect(await alarmAt()).toBe(now + defaultRunLeaseMs);
      clock.advance(defaultRunLeaseMs);
      await scope.alarm();
      expect(await alarmAt()).toBe(expiry);
      clock.advance(expiry - clock.now().getTime());
      await scope.alarm();
      expect(await alarmAt()).toBeNull();
      expect(scope.settle("u/acme", "res_1", { cost: 10 })).toBe("corrected");
    }));

  it("frees a lost run's slot when it fires, so another run starts at a full cap", () =>
    inObjectState(async ({ storage }) => {
      const { scope, clock, limits } = newScope(storage);
      scope.applyLimits("u/acme", { ...limits, maxRunning: 1 });
      await scope.startRun(acme, "run_lost");
      expect(await scope.startRun(acme, "run_2")).toMatchObject({ allowed: false });
      clock.advance(defaultRunLeaseMs);
      await scope.alarm();
      expect(await scope.startRun(acme, "run_2")).toEqual({ allowed: true });
      expect(await scope.renewRun(acme, "run_lost")).toMatchObject({ allowed: false });
    }));

  it("clears itself in an object that counts no scope yet", () =>
    inObjectState(async ({ storage }) => {
      const { scope, alarmAt } = newScope(storage);
      await storage.setAlarm(Date.now() + 365 * 24 * 60 * minute);
      await scope.alarm();
      expect(await alarmAt()).toBeNull();
    }));
});
