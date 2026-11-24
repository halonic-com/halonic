/**
 * The deployment's scheduled routines start from the cron's tick, inside workerd, with the
 * Worker's real routines object, run objects and storage (HAL-17176). Run by
 * `worker-scheduled-routines.test.ts`.
 */

import { env } from "cloudflare:workers";
import {
  type IndexedRoutine,
  writeDefinitionSnapshot,
} from "@halonicjs/adapter-cloudflare-storage";
import { routineRunId } from "@halonicjs/app/routines";
import { describe, expect, it } from "vitest";
import type { RuntimeEnv } from "../env.ts";
import { deploymentWorkspaceId, RoutinesObject } from "../routines-object.ts";
import { createRuntime } from "../runtime.ts";
import { worker } from "../worker.ts";
import { acmeDefinitions } from "./acme-definitions.ts";

export { CoordinationObject, RunObject } from "../index.ts";

// Test values made up for this file; the key is 32 bytes in base64url.
const testSecrets = {
  HALONIC_SECRET_TOKEN_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  HALONIC_SECRET_SERVE_PASSWORD: "not-a-real-hash",
};

const configured = { ...(env as unknown as RuntimeEnv), ...testSecrets };

/** The time the routines objects read; the suite and the objects share one workerd isolate. */
let now = new Date("2026-11-13T12:00:30.000Z");

/**
 * The Worker's routines object, with the test's secrets in its `env` as `wrangler secret` would
 * put them there, and the suite's clock instead of the system's.
 */
export class ClockedRoutinesObject extends RoutinesObject {
  protected override clock = { now: () => new Date(now) };

  constructor(ctx: DurableObjectState, objectEnv: Cloudflare.Env) {
    super(ctx, { ...objectEnv, ...testSecrets } as Cloudflare.Env);
  }
}

/** A routine of the `acme` hub, every minute unless `schedule` says otherwise. */
function scheduled(
  id: string,
  run: IndexedRoutine["routine"]["run"],
  { enabled = true, schedule = "* * * * *" } = {},
): IndexedRoutine {
  return {
    hub: "acme",
    routine: {
      version: 1,
      id,
      name: id,
      enabled,
      trigger: { schedule },
      run,
      overlap: "allow",
      // Only times within a minute of now, so the tests may run in any order on their own days.
      catchUp: "none",
    },
  };
}

const handleOrder = { workflow: "handle-order", input: {} };

/**
 * The deployment's routines: one every minute, one disabled, and an agent routine, which the
 * Worker's engine can't start yet, due only at 12:04 on the 15th. One snapshot for the whole suite: a routines
 * object keeps the snapshot it first read, as a Worker version does.
 */
const routines = [
  scheduled("every-minute", handleOrder),
  scheduled("paused", handleOrder, { enabled: false }),
  scheduled("greet", { agent: "writer", prompt: "Say hello" }, { schedule: "4 12 15 * *" }),
];

let deployed: Promise<void> | undefined;

/** Writes the deployment's snapshot once; every test calls it, so each runs on its own too. */
function deploy(): Promise<void> {
  deployed ??= writeDefinitionSnapshot(
    configured.DEFINITIONS as unknown as Parameters<typeof writeDefinitionSnapshot>[0],
    {},
    { routines, runDefinitions: acmeDefinitions },
  ).then(() => undefined);
  return deployed;
}

/** Runs the Worker's cron at `time`, with the routines objects' clock at the same time. */
async function cronAt(time: string): Promise<void> {
  now = new Date(time);
  await worker.scheduled(
    { scheduledTime: now.getTime(), cron: "* * * * *", noRetry() {} },
    configured,
  );
}

/**
 * The first cron of a test, a minute before its own: the tests share the deployment's last tick
 * and run in any order, so this tick may find it set back or days behind, and its starts aren't
 * the test's.
 */
async function settleOn(day: string): Promise<void> {
  await cronAt(`2026-11-${day}T11:59:30.000Z`);
}

/** How many times the run of routine `key` due at `at` started; 0 when it doesn't exist. */
async function startsOf(key: string, at: string): Promise<number> {
  const runtime = await createRuntime(configured);
  const runId = routineRunId(deploymentWorkspaceId, key, new Date(at));
  if ((await runtime.runStore.get(runId)) === null) return 0;
  const events = await runtime.runStore.events(runId);
  return events.filter((event) => event.type === "run.started").length;
}

describe("scheduled routines on the deployment", () => {
  it("starts an enabled routine once per due minute, and a disabled one never", async () => {
    await deploy();
    await settleOn("13");
    await cronAt("2026-11-13T12:01:05.000Z");
    await cronAt("2026-11-13T12:01:40.000Z");
    await cronAt("2026-11-13T12:02:05.000Z");

    expect(await startsOf("acme/every-minute", "2026-11-13T12:01:00.000Z")).toBe(1);
    expect(await startsOf("acme/every-minute", "2026-11-13T12:02:00.000Z")).toBe(1);
    expect(await startsOf("acme/paused", "2026-11-13T12:01:00.000Z")).toBe(0);
    expect(await startsOf("acme/paused", "2026-11-13T12:02:00.000Z")).toBe(0);
  });

  it("starts nothing from a scope's routines object, whose routines are the deployment's", async () => {
    await deploy();
    await settleOn("14");
    now = new Date("2026-11-14T12:00:05.000Z");
    const { ROUTINES } = env as unknown as { ROUTINES: DurableObjectNamespace<RoutinesObject> };
    await ROUTINES.get(ROUTINES.idFromName("u/acme-user")).tick(now.toISOString());
    expect(await startsOf("acme/every-minute", "2026-11-14T12:00:00.000Z")).toBe(0);

    await cronAt("2026-11-14T12:00:10.000Z");
    expect(await startsOf("acme/every-minute", "2026-11-14T12:00:00.000Z")).toBe(1);
  });

  it("fails the cron run, naming the routine, when a due run can't start, and starts the others", async () => {
    await deploy();
    await settleOn("15");
    await cronAt("2026-11-15T12:03:05.000Z");
    const failed = await cronAt("2026-11-15T12:04:05.000Z").then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failed).toBeInstanceOf(AggregateError);
    const [tick] = (failed as AggregateError).errors as Error[];
    expect(tick?.message).toBe("The routine tick failed.");
    // The cause comes back from the routines object over RPC, with its message.
    expect(String(tick?.cause)).toContain(
      "Routine acme/greet couldn't start its run for 2026-11-15T12:04:00.000Z.",
    );
    expect(await startsOf("acme/every-minute", "2026-11-15T12:04:00.000Z")).toBe(1);
  });
});
