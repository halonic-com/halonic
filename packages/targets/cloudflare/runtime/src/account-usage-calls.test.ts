import type { UsageSummary } from "@halonicjs/adapter-cloudflare-durable";
import { checkClaims, type Principal } from "@halonicjs/host-server";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { accountUsageOf, createAccountUsage } from "./account-usage.ts";
import type { RuntimeEnv } from "./env.ts";

/** The principal of a made-up personal scope. */
function principalOf(id: string): Principal {
  const session = checkClaims({ aud: "app", sub: id, scope: `u/${id}` });
  if (session === null) throw new Error("The test's claims were refused.");
  return session.principal;
}

const periodEnd = Date.UTC(2026, 11, 2);
const proSummary: UsageSummary = {
  planName: "Pro",
  costPercent: 42,
  periodEnd,
  units: [
    { unit: "cost", percent: 42 },
    { unit: "harnessMs", percent: 82 },
  ],
};

verifies("runtime.account-usage", () => {
  describe("the account menu's usage calls", () => {
    it("asks the usage object named for the principal's scope, about that scope", async () => {
      const asked: string[] = [];
      const USAGE = {
        idFromName: (name: string) => name,
        get: (id: string) => ({
          summary: async (scope: string) => {
            asked.push(id, scope);
            return proSummary;
          },
        }),
      };
      const accountUsage = createAccountUsage({ USAGE } as unknown as RuntimeEnv);
      const answer = await accountUsage?.(principalOf("eu_acme0000000000001"));
      expect(answer).toEqual({
        plan: "Pro",
        usedPercent: 42,
        units: [
          { unit: "cost", percent: 42, resetsAt: "2026-12-02T00:00:00.000Z" },
          { unit: "harnessMs", percent: 82, resetsAt: "2026-12-02T00:00:00.000Z" },
        ],
      });
      expect(asked).toEqual(["u/eu_acme0000000000001", "u/eu_acme0000000000001"]);
    });

    it("answers no units while the object knows no limits", async () => {
      const none = { planName: null, costPercent: null, periodEnd: null, units: [] };
      const accountUsage = accountUsageOf(() => ({ summary: async () => none }));
      const answer = await accountUsage(principalOf("eu_acme0000000000003"));
      expect(answer).toEqual({ plan: null, usedPercent: null, units: [] });
    });

    it("fails when the summary fails, rather than answering a plan", async () => {
      const accountUsage = accountUsageOf(() => ({
        summary: () => Promise.reject(new Error("The usage object is unreachable.")),
      }));
      await expect(accountUsage(principalOf("eu_acme0000000000002"))).rejects.toThrow(
        "unreachable",
      );
    });

    it("gives no hook to a deployment without the usage binding", () => {
      expect(createAccountUsage({} as RuntimeEnv)).toBeUndefined();
    });
  });
});
