/**
 * The cron's watchdog sweeps every scope's runs with that scope's runtime (HAL-17158). Run by
 * `scoped-sweep.test.ts`, inside workerd, against real D1, R2 and Durable Objects.
 */

import { env } from "cloudflare:workers";
import { parseScope, type Scope, scopeName, scopePrefix } from "@halonicjs/host-server";
import { started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import type { RuntimeEnv } from "../env.ts";
import { RunObject } from "../index.ts";
import { buildRuntime, createRuntime, scopedKeyPrefix } from "../runtime.ts";
import { scopedRuntime } from "../scoped-runtime.ts";
import { sweepEveryScope } from "../scoped-sweep.ts";

export { CoordinationObject, RoutinesObject } from "../index.ts";

/** The Worker's run object, with its alarm callable, so the spec needn't wait for the platform's. */
export class AlarmRunObject extends RunObject {
  async runAlarm(): Promise<void> {
    await this.alarm();
  }
}

// Test values made up for this file; the key is 32 bytes in base64url.
const configured = {
  ...(env as unknown as RuntimeEnv),
  HALONIC_SECRET_TOKEN_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  HALONIC_SECRET_SERVE_PASSWORD: "not-a-real-hash",
};

const { RUN } = env as unknown as { RUN: DurableObjectNamespace<AlarmRunObject> };

/** A scope of `kind` with an id no other case uses. */
function freshScope(kind: "u/eu_" | "o/org_"): Scope {
  const scope = parseScope(`${kind}acme${crypto.randomUUID().replaceAll("-", "")}`);
  if (scope === null) throw new Error("The test's scope was refused.");
  return scope;
}

/**
 * Stores a run in the scope whose last event is long past, so the watchdog finds it stuck, and
 * runs its object's alarm, so the scope's run list has it as running.
 */
async function storeStuckRun(scope: Scope | string): Promise<string> {
  const { runStore } =
    typeof scope === "string"
      ? buildRuntime(configured, { scope, sharedDefinitions: true })
      : scopedRuntime(configured, scope);
  const prefix = typeof scope === "string" ? scopedKeyPrefix(scope) : scopePrefix(scope);
  const runId = `r-${crypto.randomUUID()}`;
  const event = started(runId, { at: "2026-01-01T00:00:00.000Z" });
  expect(await runStore.append(runId, 0, [event])).toMatchObject({ ok: true });
  await RUN.get(RUN.idFromName(`${prefix}${runId}`)).runAlarm();
  return runId;
}

describe("the cron's watchdog over every scope", () => {
  it("wakes a stuck run in a personal and in an organisation scope, each in its own scope", async () => {
    const personal = freshScope("u/eu_");
    const organisation = freshScope("o/org_");
    const personalRun = await storeStuckRun(personal);
    const organisationRun = await storeStuckRun(organisation);

    // A row under a name no principal has: the sweep builds no runtime for it, and doesn't fail.
    await storeStuckRun(`acme-legacy-${crypto.randomUUID()}`);

    const runtime = await createRuntime(configured);
    // Every scope the database holds in one sweep, so the turn by the minute can't skip these.
    const report = await sweepEveryScope(configured, runtime, { scopesPerSweep: 10_000 });

    expect(report.failures).toEqual([]);
    const ours = report.woken.filter((woken) =>
      [personalRun, organisationRun].includes(woken.runId),
    );
    expect(ours).toEqual([
      { scope: scopeName(organisation), runId: organisationRun },
      { scope: scopeName(personal), runId: personalRun },
    ]);
    for (const runId of [personalRun, organisationRun]) {
      expect(await RUN.get(RUN.idFromName(runId)).namePrefix()).toBeNull();
    }
  });
});
