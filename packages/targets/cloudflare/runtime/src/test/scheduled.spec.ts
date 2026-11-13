/**
 * The Worker's `scheduled()` inside workerd, against real D1, R2 and Durable
 * Object bindings (HAL-8635). The routines object is the real one with a
 * listener that records its ticks. Run by `worker-scheduled.test.ts`.
 */

import { env } from "cloudflare:workers";
import { RoutinesObject } from "@halonicjs/adapter-cloudflare-durable";
import { describe, expect, it } from "vitest";
import type { RuntimeEnv } from "../env.ts";
import { worker } from "../worker.ts";

export { CoordinationObject, RunObject } from "../index.ts";

/** The times the routines object ticked for; the suite and the object share one workerd isolate. */
const ticks: string[] = [];

/** The real routines object, with the routine scheduler of `host/server` (HAL-195) replaced by a record. */
export class TickedRoutinesObject extends RoutinesObject {
  protected override tickListener() {
    return {
      onTick: async (at: string) => {
        ticks.push(at);
      },
    };
  }
}

// Test values made up for this file; the key is 32 bytes in base64url.
const configured = {
  ...(env as unknown as RuntimeEnv),
  HALONIC_SECRET_TOKEN_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  HALONIC_SECRET_SERVE_PASSWORD: "not-a-real-hash",
};

/** The controller Cloudflare passes: only the scheduled time is read. */
function cronFor(scheduledTime: number): ScheduledController {
  return { scheduledTime, cron: "* * * * *", noRetry() {} };
}

describe("scheduled() in workerd", () => {
  it("ticks the routines object for the cron's time, and the sweep over an empty run list passes", async () => {
    const time = Date.parse("2026-11-13T12:00:00.000Z");
    await worker.scheduled(cronFor(time), configured);
    expect(ticks).toContain("2026-11-13T12:00:00.000Z");
  });

  it("fails with the configuration error before any tick when a secret is missing", async () => {
    const before = ticks.length;
    const { HALONIC_SECRET_TOKEN_KEY: _key, ...withoutKey } = configured;
    await expect(worker.scheduled(cronFor(Date.now()), withoutKey as RuntimeEnv)).rejects.toThrow(
      "token-key",
    );
    expect(ticks).toHaveLength(before);
  });
});
