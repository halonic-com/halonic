import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { openAccount, period, step } from "./test/usage-case.ts";
import { reservationMarginMs } from "./usage-account.ts";

verifies("cloudflare-durable.usage-reserve", () => {
  describe("reserve", () => {
    it("lets many reserves at a limit take no more than the limit", () => {
      const { account } = openAccount();
      const answers = Array.from({ length: 50 }, (_, n) => account.reserve(step(`res_${n}`)));
      expect(answers.filter((answer) => answer.allowed)).toHaveLength(3);
      expect(answers[3]).toEqual({
        allowed: false,
        refusal: {
          code: "plan.cost",
          unit: "cost",
          used: 900,
          limit: 1_000,
          needed: 300,
          left: 100,
          resetsAt: period.end,
        },
      });
    });

    it("refuses an id with no room left for a correction's suffix", () => {
      const { account } = openAccount();
      expect(() => account.reserve(step("r".repeat(124)))).toThrow(RangeError);
      expect(account.reserve(step("r".repeat(123))).allowed).toBe(true);
    });

    it("holds the default for a step that gives no maximum", () => {
      const { account } = openAccount();
      for (let n = 0; n < 10; n++) expect(account.reserve(step(`res_${n}`, {})).allowed).toBe(true);
      expect(account.reserve(step("res_10", {}))).toMatchObject({
        refusal: { code: "plan.cost", used: 1_000, needed: 100 },
      });
    });
  });

  describe("settle", () => {
    it("charges what the step used and releases the rest", () => {
      const { account } = openAccount();
      account.reserve(step("res_1", { cost: 900 }));
      expect(account.settle("res_1", { cost: 200 })).toBe("settled");
      expect(account.reserve(step("res_2", { cost: 800 })).allowed).toBe(true);
    });

    it("changes nothing when it comes again, or for an id it never reserved", () => {
      const { account, outbox } = openAccount();
      account.reserve(step("res_1", { cost: 900 }));
      account.settle("res_1", { cost: 200 });
      expect(account.settle("res_1", { cost: 700 })).toBe("already-settled");
      expect(account.settle("res_9", { cost: 700 })).toBe("unknown");
      expect(outbox()).toHaveLength(1);
      expect(account.check("u_acme")).toEqual({ allowed: true });
    });
  });

  describe("a reservation that runs out", () => {
    it("is charged in full, and a late settle corrects that to what was used", () => {
      const { account, clock, outbox } = openAccount();
      account.reserve(step("res_1", { cost: 600 }));
      clock.nowMs += 60_000;
      account.reserve(step("res_2", { cost: 100 }));
      clock.nowMs += reservationMarginMs;

      expect(account.settleExpired()).toBe(clock.nowMs + 60_000);
      expect(account.reserve(step("res_3", { cost: 400 })).allowed).toBe(false);
      expect(account.settle("res_1", { cost: 100 })).toBe("corrected");
      expect(account.settle("res_1", { cost: 100 })).toBe("already-settled");
      expect(account.reserve(step("res_3", { cost: 400 })).allowed).toBe(true);

      const records = outbox().map((row) => (row.kind === "usage" ? row.record : row));
      expect(records).toMatchObject([
        { id: "res_1", kind: "step", units: { cost: 600 } },
        { id: "res_1:late", kind: "correction", units: { cost: -500 } },
      ]);
    });

    it("leaves the alarm nothing to do once none is held", () => {
      const { account } = openAccount();
      expect(account.settleExpired()).toBeNull();
    });
  });
});
