import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { openAccount, period, step } from "./test/usage-case.ts";

const owner = { runId: "run_1", actor: "u_acme" };
const marker = "acme-marker-7f3a";

verifies("cloudflare-durable.usage-outbox", () => {
  it("adds a row for each record, in the same change, and none for a repeat", () => {
    const { account, outbox } = openAccount();
    account.reserve(step("res_1"));
    account.settle("res_1", { cost: 120, harnessMs: 4_000 });
    account.record("call_1", owner, "model_call", { tokens: 900, cost: 30 });
    account.record("call_1", owner, "model_call", { tokens: 900, cost: 30 });

    expect(outbox()).toEqual([
      {
        kind: "usage",
        record: {
          id: "res_1",
          scope: "u/acme",
          ...owner,
          kind: "step",
          units: { cost: 120, harnessMs: 4_000 },
          reservedMax: { cost: 300 },
          periodStart: period.start,
          at: period.start,
        },
      },
      {
        kind: "usage",
        record: {
          id: "call_1",
          scope: "u/acme",
          ...owner,
          kind: "model_call",
          units: { tokens: 900, cost: 30 },
          periodStart: period.start,
          at: period.start,
        },
      },
    ]);
  });

  describe("what a row may hold", () => {
    it("keeps only typed fields, so text from a run reaches no row", () => {
      const { account, storage } = openAccount();
      const withNote = { ...owner, note: marker } as typeof owner;
      account.record("call_1", withNote, "model_call", { cost: 10 });
      expect(storage.dump()).not.toContain(marker);
    });

    it("refuses free text where an id goes, or a unit it doesn't count, and stores nothing", () => {
      const { account, storage } = openAccount();
      const before = storage.dump();
      expect(() =>
        account.record("call_1", { ...owner, actor: `${marker} said hi` }, "run", {}),
      ).toThrow(RangeError);
      expect(() => account.settle("res_1", { [marker]: 1 } as never)).toThrow(RangeError);
      expect(() => account.record("call_1", owner, "run", { cost: 0.5 })).toThrow(RangeError);
      expect(() => account.record("call_1", owner, marker as "run", {})).toThrow(RangeError);
      expect(storage.dump()).toBe(before);
    });

    it("refuses an object's own property names as ids, so no actor's spend is lost", () => {
      const { account, storage } = openAccount();
      const before = storage.dump();
      for (const actor of ["__proto__", "constructor", "prototype"]) {
        expect(() => account.record("call_1", { ...owner, actor }, "run", {})).toThrow(RangeError);
      }
      expect(storage.dump()).toBe(before);
    });

    it("gives every record its own id, so Cloud drops none that the account counts", () => {
      const { account } = openAccount();
      account.reserve(step("res_1"));
      expect(() => account.record("res_1", owner, "model_call", { cost: 1 })).toThrow(RangeError);
      expect(() => account.record("res_2:late", owner, "run", {})).toThrow(RangeError);
      expect(() => account.reserve(step("res_2:late"))).toThrow(RangeError);
      account.record("call_1", owner, "model_call", { cost: 1 });
      expect(() => account.reserve(step("call_1"))).toThrow(RangeError);
    });
  });

  it("reports 80% and 100% of a limit once each in a period", () => {
    const { account, outbox } = openAccount();
    for (const [n, cost] of [400, 450, 100, 300].entries()) {
      account.record(`call_${n}`, owner, "model_call", { cost });
    }
    const thresholds = outbox().filter((row) => row.kind === "threshold");
    expect(thresholds).toMatchObject([
      { unit: "cost", percent: 80, used: 850, limit: 1_000, periodStart: period.start },
      { unit: "cost", percent: 100, used: 1_250, limit: 1_000, periodStart: period.start },
    ]);
  });

  it("at its cap, warns once, takes no new work and still keeps what was used", () => {
    const { account, outbox } = openAccount(undefined, { outboxCap: 2 });
    account.reserve(step("res_1"));
    account.record("call_1", owner, "model_call", { cost: 10 });
    account.record("call_2", owner, "model_call", { cost: 10 });

    expect(account.reserve(step("res_2"))).toMatchObject({
      refusal: { code: "usage.outbox-full" },
    });
    expect(account.settle("res_1", { cost: 10 })).toBe("settled");
    expect(outbox().map((row) => row.kind)).toEqual(["usage", "usage", "outbox-full", "usage"]);
    expect(account.outboxSize()).toBe(4);
  });
});
