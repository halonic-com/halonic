import type { ConfigMeterSettings, UsageLimit } from "@halonicjs/format";
import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RunState } from "../kernel/run-state.ts";
import { ConfigMeter, type RunningRuns } from "./config-meter.ts";
import type { MeterAnswer, MeterPrincipal, ReserveAnswer } from "./meter.ts";
import {
  type LoggedModelResponse,
  modelCallUsageOf,
  runEndUsageOf,
  stepTimesOf,
} from "./metered-usage.ts";

const organisationId = "org_acme0000000000001";
const ada: MeterPrincipal = {
  actor: "eu_ada00000000000001",
  scope: "u/eu_ada00000000000001",
  role: "owner",
};
const inOrganisation = (actor: string): MeterPrincipal => ({
  actor,
  scope: `o/${organisationId}`,
  role: "member",
});
const bea = inOrganisation("eu_bea00000000000001");
const cal = inOrganisation("eu_cal00000000000001");

/** The value part of `Coordination` in memory: all the meter uses. */
class TestValues implements Pick<Coordination, "read" | "compareAndSet"> {
  readonly values = new Map<string, string>();

  async read(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async compareAndSet(key: string, expected: string | null, next: string | null): Promise<boolean> {
    if ((this.values.get(key) ?? null) !== expected) return false;
    if (next === null) this.values.delete(key);
    else this.values.set(key, next);
    return true;
  }
}

function limit(
  unit: UsageLimit["unit"],
  amount: number,
  fields: Partial<UsageLimit> = {},
): UsageLimit {
  return { unit, amount, period: "month", action: "stop", ...fields };
}

function meterWith(
  settings: Partial<ConfigMeterSettings>,
  running = { scope: 0, actor: 0 },
  values: Pick<Coordination, "read" | "compareAndSet"> = new TestValues(),
) {
  const clock = { at: new Date("2026-11-23T10:00:00.000Z"), now: () => new Date(clock.at) };
  let made = 0;
  const ids = {
    next: (prefix: string) => {
      made += 1;
      return `${prefix}${made}`;
    },
  };
  const counter: RunningRuns = { count: async () => running };
  const meter = new ConfigMeter({
    settings: { limits: [], ...settings },
    coordination: values,
    clock,
    ids,
    running: counter,
  });
  return { meter, clock };
}

function modelCall(cost: number, fields: Partial<LoggedModelResponse> = {}) {
  return modelCallUsageOf({
    type: "llm.response",
    agent: "writer",
    provider: "acme-ai",
    model: "acme-1",
    usage: { inputTokens: 1000, outputTokens: 200 },
    latencyMs: 5,
    text: "",
    runId: "r-acme",
    seq: 2,
    at: "2026-11-23T10:00:00.000Z",
    cost,
    ...fields,
  });
}

const runEnd = runEndUsageOf({ runId: "r-acme", status: "completed" } as RunState);

function codeOf(answer: MeterAnswer | ReserveAnswer): string | undefined {
  return answer.allowed ? undefined : answer.stop.cause.code;
}

function detailOf(answer: MeterAnswer | ReserveAnswer): Readonly<Record<string, string>> {
  return answer.allowed ? {} : (answer.stop.cause.detail ?? {});
}

const organisation = (members: ConfigMeterSettings["organisations"]) => ({
  organisations: members,
});

verifies("engine.config-meter", () => {
  describe("a personal scope", () => {
    it("refuses a model call once the month's cost is used, until the month ends", async () => {
      const { meter, clock } = meterWith({ limits: [limit("cost", 5)] });
      await meter.record(ada, modelCall(5));
      const refused = await meter.check(ada, { kind: "model-call" });
      expect(codeOf(refused)).toBe("plan.cost");
      expect(detailOf(refused)).toMatchObject({
        used: "5",
        limit: "5",
        resetsAt: "2026-12-01T00:00:00.000Z",
        canUpgrade: "false",
      });
      clock.at = new Date("2026-12-01T00:00:00.000Z");
      expect(await meter.check(ada, { kind: "model-call" })).toEqual({ allowed: true });
    });

    it("refuses nothing at a notify limit, and counts nothing for a cached answer", async () => {
      const { meter } = meterWith({
        limits: [limit("cost", 1, { action: "notify" }), limit("steps", 1)],
      });
      await meter.record(ada, modelCall(3, { cached: true }));
      expect(await meter.check(ada, { kind: "model-call" })).toEqual({ allowed: true });
    });

    it("counts runs only against starting one", async () => {
      const { meter } = meterWith({ limits: [limit("runs", 2, { period: "day" })] });
      await meter.record(ada, runEnd);
      await meter.record(ada, runEndUsageOf({ runId: "r-acme-2", status: "failed" } as RunState));
      expect(codeOf(await meter.check(ada, { kind: "run-start" }))).toBe("plan.runs");
      expect(await meter.check(ada, { kind: "model-call" })).toEqual({ allowed: true });
    });

    it("counts the runs going against starting one, so parallel starts can't pass it", async () => {
      const runsPerDay = { limits: [limit("runs", 2, { period: "day" })] };
      const oneEnded = meterWith(runsPerDay, { scope: 1, actor: 1 }).meter;
      await oneEnded.record(ada, runEnd);
      const refused = await oneEnded.check(ada, { kind: "run-start" });
      expect(codeOf(refused)).toBe("plan.runs");
      expect(detailOf(refused)).toMatchObject({ used: "2", limit: "2" });
      const twoGoing = meterWith(runsPerDay, { scope: 2, actor: 2 }).meter;
      expect(codeOf(await twoGoing.check(ada, { kind: "run-start" }))).toBe("plan.runs");
      const oneGoing = meterWith(runsPerDay, { scope: 1, actor: 1 }).meter;
      expect(await oneGoing.check(ada, { kind: "run-start" })).toEqual({ allowed: true });
    });

    it("counts a call's input and output tokens", async () => {
      const { meter } = meterWith({ limits: [limit("tokens", 1200)] });
      await meter.record(ada, modelCall(0));
      expect(detailOf(await meter.check(ada, { kind: "harness-run" }))).toMatchObject({
        unit: "tokens",
        used: "1200",
      });
    });
  });

  describe("an organisation's scope", () => {
    const members = (share: UsageLimit[] = []) =>
      organisation([
        {
          id: organisationId,
          limits: [limit("cost", 100)],
          concurrency: 3,
          members: [
            { actor: bea.actor, role: "owner", limits: share, concurrency: 1 },
            { actor: cal.actor, role: "member" },
          ],
        },
      ]);

    it("refuses a member past their share while the pool has room, without an upgrade", async () => {
      const { meter } = meterWith(members([limit("cost", 10)]));
      await meter.record(cal, modelCall(30));
      await meter.record(bea, modelCall(10));
      const refused = await meter.check(bea, { kind: "model-call" });
      expect(codeOf(refused)).toBe("plan.member.cost");
      expect(detailOf(refused)).toMatchObject({ canUpgrade: "false", used: "10" });
      expect(await meter.check(cal, { kind: "model-call" })).toEqual({ allowed: true });
    });

    it("counts a member's runs going against their share and everyone's against the pool", async () => {
      const runs = organisation([
        {
          id: organisationId,
          limits: [limit("runs", 5, { period: "day" })],
          members: [
            { actor: bea.actor, role: "owner", limits: [limit("runs", 2, { period: "day" })] },
            { actor: cal.actor, role: "member" },
          ],
        },
      ]);
      const atShare = meterWith(runs, { scope: 2, actor: 2 }).meter;
      expect(codeOf(await atShare.check(bea, { kind: "run-start" }))).toBe("plan.member.runs");
      const atPool = meterWith(runs, { scope: 5, actor: 0 }).meter;
      expect(codeOf(await atPool.check(cal, { kind: "run-start" }))).toBe("plan.runs");
      const below = meterWith(runs, { scope: 4, actor: 1 }).meter;
      expect(await below.check(bea, { kind: "run-start" })).toEqual({ allowed: true });
    });

    it("refuses someone the organisation doesn't list, and a scope the file doesn't know", async () => {
      const { meter } = meterWith(members());
      const gone = inOrganisation("eu_dan00000000000001");
      expect(codeOf(await meter.check(gone, { kind: "model-call" }))).toBe("plan.member-removed");
      expect(codeOf(await meter.reserve(gone, { cost: 1 }))).toBe("plan.member-removed");
      const unknown = { ...bea, scope: "o/org_other000000000001" };
      expect(codeOf(await meter.check(unknown, { kind: "run-start" }))).toBe("plan.none");
      expect(codeOf(await meter.check({ ...bea, scope: "acme" }, { kind: "model-call" }))).toBe(
        "plan.none",
      );
    });

    it("refuses a start at the member's cap, then at the organisation's", async () => {
      const atMember = meterWith(members(), { scope: 1, actor: 1 }).meter;
      expect(detailOf(await atMember.check(bea, { kind: "run-start" }))).toEqual({
        running: "1",
        limit: "1",
        cap: "member",
      });
      const atScope = meterWith(members(), { scope: 3, actor: 0 }).meter;
      const refused = await atScope.check(cal, { kind: "run-start" });
      expect(codeOf(refused)).toBe("plan.concurrency");
      expect(detailOf(refused)).toMatchObject({ cap: "scope" });
      expect(await atScope.check(cal, { kind: "model-call" })).toEqual({ allowed: true });
    });
  });

  describe("reserve and settle", () => {
    it("holds back a step's maximum and refuses a second one that doesn't fit", async () => {
      const { meter } = meterWith({ limits: [limit("cost", 10)] });
      await meter.record(ada, modelCall(7));
      expect((await meter.reserve(ada, { cost: 2 })).allowed).toBe(true);
      const refused = await meter.reserve(ada, { cost: 2 });
      expect(codeOf(refused)).toBe("plan.cost");
      expect(detailOf(refused)).toMatchObject({ phase: "reserve", needed: "2", left: "1" });
    });

    it("checks the member's share and the pool in the same reservation", async () => {
      const { meter } = meterWith(
        organisation([
          {
            id: organisationId,
            limits: [limit("harnessMinutes", 60)],
            members: [
              { actor: bea.actor, role: "owner", limits: [limit("harnessMinutes", 20)] },
              { actor: cal.actor, role: "member" },
            ],
          },
        ]),
      );
      expect((await meter.reserve(cal, { minutes: 45 })).allowed).toBe(true);
      const refused = await meter.reserve(bea, { minutes: 20 });
      expect(codeOf(refused)).toBe("plan.harnessMinutes");
      expect(detailOf(refused)).toMatchObject({ needed: "20", left: "15" });
      expect(codeOf(await meter.reserve(bea, { minutes: 21 }))).toBe("plan.member.harnessMinutes");
    });

    it("lets go of the hold on settle and counts the harness time", async () => {
      const { meter, clock } = meterWith({ limits: [limit("harnessMinutes", 2)] });
      const startedAt = new Date(clock.at);
      const held = await meter.reserve(ada, { minutes: 2 });
      if (!held.allowed) throw new Error("expected the step to be held");
      expect(codeOf(await meter.check(ada, { kind: "harness-run" }))).toBe("plan.harnessMinutes");
      clock.at = new Date(startedAt.getTime() + 90_000);
      await meter.settle(held.reservation, stepTimesOf(clock, startedAt, startedAt));
      const left = await meter.reserve(ada, { minutes: 1 });
      expect(detailOf(left)).toMatchObject({ used: "1.5", left: "0.5" });
    });

    it("keeps a hold through the longest step and lets it lapse after two days", async () => {
      const { meter, clock } = meterWith({ limits: [limit("cost", 10)] });
      expect((await meter.reserve(ada, { cost: 10 })).allowed).toBe(true);
      expect(codeOf(await meter.check(ada, { kind: "model-call" }))).toBe("plan.cost");
      clock.at = new Date("2026-11-25T09:59:59.999Z");
      expect(codeOf(await meter.check(ada, { kind: "model-call" }))).toBe("plan.cost");
      clock.at = new Date("2026-11-25T10:00:00.000Z");
      expect(await meter.check(ada, { kind: "model-call" })).toEqual({ allowed: true });
    });

    it("refuses a unit the step sets no maximum for only once it is used up", async () => {
      const { meter } = meterWith({ limits: [limit("steps", 1, { period: "day" })] });
      expect((await meter.reserve(ada, { cost: 1 })).allowed).toBe(true);
      await meter.record(ada, modelCall(0));
      expect(codeOf(await meter.reserve(ada, { cost: 1 }))).toBe("plan.steps");
    });
  });

  it("refuses to be created with a limit per run or per step", () => {
    expect(() => meterWith({ limits: [limit("cost", 1, { period: "run" })] })).toThrow(
      /limit on cost per run can't be kept/,
    );
    const share = organisation([
      {
        id: organisationId,
        limits: [],
        members: [
          { actor: bea.actor, role: "owner", limits: [limit("steps", 5, { period: "step" })] },
        ],
      },
    ]);
    expect(() => meterWith(share)).toThrow(/steps per step/);
    expect(() =>
      meterWith({ limits: [limit("cost", 1, { period: "run", action: "notify" })] }),
    ).not.toThrow();
  });

  describe("its stored counts", () => {
    it("throws rather than counting from 0 when they aren't readable", async () => {
      const values = new TestValues();
      values.values.set(`config-meter/${ada.scope}`, JSON.stringify({ spent: 1 }));
      const { meter } = meterWith({ limits: [limit("cost", 5)] }, undefined, values);
      await expect(meter.check(ada, { kind: "model-call" })).rejects.toThrow(/isn't readable/);
    });

    it("throws rather than counting from 0 when a count isn't a whole number", async () => {
      const values = new TestValues();
      const stored = { pool: { "cost/2026-11": "5" }, members: {}, held: {} };
      values.values.set(`config-meter/${ada.scope}`, JSON.stringify(stored));
      const { meter } = meterWith({ limits: [limit("cost", 5)] }, undefined, values);
      await expect(meter.check(ada, { kind: "model-call" })).rejects.toThrow(/isn't readable/);
    });

    it("keeps a member's own counts only for the limits of their share", async () => {
      const values = new TestValues();
      const many = Array.from({ length: 300 }, (_, index) => ({
        actor: `eu_m${String(index).padStart(16, "0")}`,
        role: "member" as const,
      }));
      const share = { actor: bea.actor, role: "owner" as const, limits: [limit("cost", 10)] };
      const settings = organisation([
        { id: organisationId, limits: [limit("cost", 1000)], members: [share, ...many] },
      ]);
      const { meter } = meterWith(settings, undefined, values);
      for (const member of many) await meter.record(inOrganisation(member.actor), modelCall(1));
      await meter.record(bea, modelCall(2));
      const stored = JSON.parse(values.values.get(`config-meter/${bea.scope}`) ?? "null");
      expect(stored.members).toEqual({ [bea.actor]: { "cost/2026-11": 2_000_000 } });
      expect(stored.pool["cost/2026-11"]).toBe(302_000_000);
    });

    it("refuses to be created when the members' shares couldn't be stored", () => {
      const units: UsageLimit["unit"][] = ["runs", "steps", "tokens", "cost", "harnessMinutes"];
      const everyLimit = units.flatMap((unit) => [
        limit(unit, 1),
        limit(unit, 1, { period: "day" }),
      ]);
      const members = Array.from({ length: 100 }, (_, index) => ({
        actor: `eu_m${String(index).padStart(16, "0")}`,
        role: "member" as const,
        limits: everyLimit,
      }));
      const settings = organisation([{ id: organisationId, limits: [], members }]);
      expect(() => meterWith(settings)).toThrow(/gives too many members a share/);
      expect(() =>
        meterWith(
          organisation([{ id: organisationId, limits: [], members: members.slice(0, 20) }]),
        ),
      ).not.toThrow();
    });

    it("refuses a hold that would grow them past what can be stored", async () => {
      const values = new TestValues();
      const { meter } = meterWith({ limits: [limit("cost", 1_000_000)] }, undefined, values);
      const reserveUntilRefused = async () => {
        for (let held = 0; held < 2000; held += 1) await meter.reserve(ada, { cost: 1 });
      };
      await expect(reserveUntilRefused()).rejects.toThrow(/can't grow any further/);
      const stored = values.values.get(`config-meter/${ada.scope}`) ?? "";
      expect(new TextEncoder().encode(stored).length).toBeLessThanOrEqual(64 * 1024);
    });

    it("throws rather than dropping a use when they keep changing under it", async () => {
      const busy = new TestValues();
      busy.compareAndSet = async () => false;
      const { meter } = meterWith({ limits: [limit("cost", 5)] }, undefined, busy);
      await expect(meter.record(ada, modelCall(1))).rejects.toThrow(/kept changing/);
    });
  });
});
