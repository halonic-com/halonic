// The usage object's rate limit over a Durable Object's storage (see `usage-rate-scope.test.ts`).

import { describe, expect, it } from "vitest";
import { UsageScope } from "../usage-scope.ts";
import type { UsageLimits } from "../usage-types.ts";
import { inObjectState } from "./state-host.ts";
import { SuiteClock } from "./suite-case.ts";

export { StateHostObject } from "./state-host.ts";

const acme = { actor: "u_acme", scope: "u/acme" };
const minute = 60_000;

describe("usage object rate limit", () => {
  it("refuses past the limit before asking Cloud, and never refuses a heartbeat", () =>
    inObjectState(async ({ storage }) => {
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
      let pulls = 0;
      const scope = new UsageScope({
        storage,
        alarm: { set: (atMs) => storage.setAlarm(atMs), clear: () => storage.deleteAlarm() },
        clock: () => clock,
        pullLimits: async () => {
          pulls++;
          return null;
        },
        onPullError: (error) => {
          throw error;
        },
        rate: { windowMs: minute, perScope: 2, perActor: 2 },
      });
      expect(scope.applyLimits(acme.scope, limits)).toBe("applied");
      expect(await scope.startRun(acme, "run_1")).toEqual({ allowed: true });
      expect(await scope.check(acme)).toEqual({ allowed: true });
      const refused = await scope.check(acme);
      expect(refused).toMatchObject({ allowed: false, refusal: { code: "usage.rate" } });
      expect(await scope.renewRun(acme, "run_1")).toEqual({ allowed: true });
      expect(pulls).toBe(0);
    }));
});
