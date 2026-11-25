/**
 * The two-scope contract: every store a scope's runtime holds keeps to its scope (HAL-13216). Run
 * by `two-scope.test.ts`, inside workerd, against real D1, R2 and Durable Objects.
 */

import { env } from "cloudflare:workers";
import { defaultRoutinesObjectName } from "@halonicjs/adapter-cloudflare-durable";
import { parseScope, type Scope, scopePrefix } from "@halonicjs/host-server";
import type { RunStore } from "@halonicjs/ports";
import { completed, entered, started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import type { RuntimeEnv } from "../env.ts";
import { RunObject } from "../index.ts";
import type { Runtime } from "../runtime.ts";
import { scopedRuntime } from "../scoped-runtime.ts";

export { CoordinationObject, RoutinesObject } from "../index.ts";

type RunEvent = Awaited<ReturnType<RunStore["events"]>>[number];

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
const { ROUTINES } = env as unknown as { ROUTINES: DurableObjectNamespace };

/** One side of a pair: the scope and the runtime built for it. */
interface Side {
  readonly scope: Scope;
  readonly runtime: Runtime;
}

/** Writes in `owner`, then checks that `other` neither sees nor changes any of it. */
type StoreCase = (owner: Side, other: Side) => Promise<void>;

/** A part of the runtime that isn't a scope's store, and why. */
interface Shared {
  readonly shared: string;
}

/** A run id both scopes use, so a store that drops the scope would mix them up. */
const runId = "r-acme-order";
/** A key both scopes use, for timers, leases, values, counters and windows. */
const key = "acme-key";

/** Stores a run in the side's scope and runs its object's alarm, so the scope's run list has it. */
async function storeRun(side: Side, events: RunEvent[]): Promise<void> {
  const result = await side.runtime.runStore.append(runId, 0, events);
  expect(result).toMatchObject({ ok: true });
  await RUN.get(RUN.idFromName(`${scopePrefix(side.scope)}${runId}`)).runAlarm();
}

/** The events a subscription delivers until its stream ends. */
function subscribed(side: Side): Promise<RunEvent[]> {
  return new Promise((resolve, reject) => {
    const events: RunEvent[] = [];
    side.runtime.runEvents.subscribe(runId, 0, {
      onEvent: (event) => events.push(event),
      onClose: (error) => (error === undefined ? resolve(events) : reject(error)),
    });
  });
}

const ownerEvents = (): RunEvent[] => [started(runId), entered(runId, 2), entered(runId, 3)];

const runStoreCase: StoreCase = async (owner, other) => {
  await storeRun(owner, ownerEvents());
  expect(await other.runtime.runStore.get(runId)).toBeNull();
  expect(await other.runtime.runStore.snapshot(runId)).toBeNull();
  expect(await other.runtime.runStore.events(runId)).toEqual([]);
  expect(await other.runtime.runStore.list()).toEqual([]);
  // The same id is free in the other scope, and writing it there leaves the owner's run alone.
  await storeRun(other, [started(runId)]);
  expect(await owner.runtime.runStore.events(runId)).toEqual(ownerEvents());
};

/**
 * Every part of a scope's runtime, with the case that checks it keeps to its scope. Typed by the
 * runtime's keys, and checked against a built runtime below, so a new store can't skip the test.
 */
const storeCases: Record<keyof Runtime, StoreCase | Shared> = {
  clock: { shared: "the time, which holds nothing" },
  secrets: { shared: "the deployment's own secrets, set by the deployer and only read" },
  definitions: { shared: "the deployment's workspace, which every scope runs and only reads" },
  passwords: { shared: "a hasher, which holds nothing" },
  runStore: runStoreCase,
  runs: async (owner, other) => {
    await storeRun(owner, ownerEvents());
    expect((await owner.runtime.runs.list()).map((run) => run.id)).toEqual([runId]);
    expect(await other.runtime.runs.list()).toEqual([]);
    expect(await other.runtime.runs.list({ status: "running" })).toEqual([]);
  },
  ownership: async (owner, other) => {
    const byOwner = { startedBy: "eu_acmeowner", visibility: "private" } as const;
    const byOther = { startedBy: "eu_acmeother", visibility: "private" } as const;
    await owner.runtime.ownership.claim(runId, byOwner);
    expect(await other.runtime.ownership.get(runId)).toBeNull();
    expect(await other.runtime.runs.runIds()).toEqual([]);
    // The same id is free in the other scope, and claiming it there leaves the owner's claim alone.
    expect(await other.runtime.ownership.claim(runId, byOther)).toEqual(byOther);
    expect(await owner.runtime.ownership.get(runId)).toEqual(byOwner);
  },
  runEvents: async (owner, other) => {
    await storeRun(owner, ownerEvents());
    await other.runtime.runStore.append(runId, 0, [started(runId), completed(runId, 2)]);
    // The other scope's stream of the same id ends with its own two events, never the owner's.
    expect(await subscribed(other)).toEqual([started(runId), completed(runId, 2)]);
    expect(await owner.runtime.runStore.events(runId)).toEqual(ownerEvents());
  },
  scheduler: async (owner, other) => {
    const later = new Date(Date.now() + 3_600_000).toISOString();
    await owner.runtime.scheduler.schedule(key, "t-1", later);
    expect(await other.runtime.scheduler.pending(key)).toEqual([]);
    await other.runtime.scheduler.cancel(key, "t-1");
    await other.runtime.scheduler.schedule(key, "t-2", later);
    const pending = await owner.runtime.scheduler.pending(key);
    expect(pending.map((timer) => timer.timerId)).toEqual(["t-1"]);
    await owner.runtime.scheduler.cancel(key, "t-1");
    await other.runtime.scheduler.cancel(key, "t-2");
  },
  watchdog: async (owner, other) => {
    // A run whose last event is long past, so the owner's watchdog finds it stuck.
    await storeRun(owner, [started(runId, { at: "2026-01-01T00:00:00.000Z" })]);
    expect((await other.runtime.watchdog.sweep()).woken).toEqual([]);
    const woken = (await owner.runtime.watchdog.sweep()).woken;
    expect(woken.map((run) => run.runId)).toEqual([runId]);
  },
  routines: async (owner, other) => {
    await storeRun(owner, ownerEvents());
    // Each scope has a routines object of its own, apart from the other's and the deployment's.
    const objectOf = (side: Side) => (side.runtime.routines as unknown as DurableObjectStub).id;
    const deployments = ROUTINES.idFromName(defaultRoutinesObjectName);
    expect(objectOf(owner).equals(objectOf(other))).toBe(false);
    expect(objectOf(owner).equals(deployments)).toBe(false);
    // Only the deployment's routines object ticks; a scope's tick starts and changes nothing.
    await other.runtime.routines.tick(new Date().toISOString());
    expect(await other.runtime.runStore.list()).toEqual([]);
    expect((await owner.runtime.runStore.list()).map((run) => run.id)).toEqual([runId]);
  },
  blobs: async (owner, other) => {
    const bytes = new TextEncoder().encode("acme order 1");
    const ref = await owner.runtime.blobs.put(bytes, "text/plain");
    expect(await other.runtime.blobs.get(ref.hash)).toBeNull();
    expect(await other.runtime.blobs.hashes()).toEqual([]);
    // The same bytes have the same hash in the other scope, and are stored there on their own.
    expect((await other.runtime.blobs.put(bytes, "text/plain")).hash).toBe(ref.hash);
    expect(await owner.runtime.blobs.hashes()).toEqual([ref.hash]);
  },
  records: async (owner, other) => {
    const change = (values: Record<string, string>) => ({
      at: "2026-01-01T00:00:00.000Z",
      collection: "leads",
      id: "1",
      op: "add" as const,
      values,
    });
    await owner.runtime.records.append([change({ name: "Ada" })]);
    expect(await other.runtime.records.changes("leads")).toEqual([]);
    expect(await other.runtime.records.collections()).toEqual([]);
    await other.runtime.records.append([change({ name: "Grace" })]);
    await other.runtime.records.compact("leads");
    expect(await owner.runtime.records.changes("leads")).toEqual([change({ name: "Ada" })]);
  },
  tokens: async (owner, other) => {
    await owner.runtime.tokens.set("acme", "owner-token");
    expect(await other.runtime.tokens.get("acme")).toBeNull();
    await other.runtime.tokens.set("acme", "other-token");
    await other.runtime.tokens.remove("acme");
    expect(await owner.runtime.tokens.get("acme")).toBe("owner-token");
  },
  coordination: async (owner, other) => {
    const ours = owner.runtime.coordination;
    const theirs = other.runtime.coordination;
    const ourLease = await ours.tryAcquire(key, 60_000);
    const theirLease = await theirs.tryAcquire(key, 60_000);
    expect(ourLease).not.toBeNull();
    expect(theirLease).not.toBeNull();
    if (ourLease === null || theirLease === null) return;
    // Our lease means nothing to the other scope, and its own release leaves ours held.
    expect(await theirs.renew(ourLease, 60_000)).toBeNull();
    await theirs.release(ourLease);
    await theirs.release(theirLease);
    expect(await ours.tryAcquire(key, 60_000)).toBeNull();
    expect(await ours.renew(ourLease, 60_000)).not.toBeNull();

    expect(await ours.compareAndSet(key, null, "owner")).toBe(true);
    expect(await theirs.read(key)).toBeNull();
    expect(await theirs.compareAndSet(key, null, "other")).toBe(true);
    expect(await ours.read(key)).toBe("owner");

    expect(await ours.increment(key, 5)).toEqual({ applied: true, value: 5 });
    expect(await theirs.increment(key, 1)).toEqual({ applied: true, value: 1 });
    expect(await ours.increment(key, 1)).toEqual({ applied: true, value: 6 });

    expect((await ours.countInWindow(key, 60_000, 1)).allowed).toBe(true);
    expect((await theirs.countInWindow(key, 60_000, 1)).allowed).toBe(true);
  },
};

/** A scope id tail no other case uses: 16 to 40 letters or digits, as scope ids need. */
function freshTail(): string {
  return `acme${crypto.randomUUID().replaceAll("-", "")}`;
}

function sideOf(name: string): Side {
  const scope = parseScope(name);
  if (scope === null) throw new Error(`The test's scope ${name} was refused.`);
  return { scope, runtime: scopedRuntime(configured, scope) };
}

/**
 * The pairs every case runs on, each with fresh scopes. Their ids are built to collide: one
 * scope's id is the other's with a letter more, and a person and an organisation share a tail.
 */
const pairs: Record<string, () => [string, string]> = {
  "two people": () => {
    const tail = freshTail();
    return [`u/eu_${tail}`, `u/eu_${tail}b`];
  },
  "a person and an organisation": () => {
    const tail = freshTail();
    return [`u/eu_${tail}`, `o/org_${tail}`];
  },
  "two organisations": () => {
    const tail = freshTail();
    return [`o/org_${tail}b`, `o/org_${tail}`];
  },
};

describe("the two-scope contract", () => {
  it("has a case or a reason for every part of a scope's runtime", () => {
    const runtime = sideOf(`u/eu_${freshTail()}`).runtime;
    expect(Object.keys(runtime).sort()).toEqual(Object.keys(storeCases).sort());
  });

  for (const [store, check] of Object.entries(storeCases)) {
    if ("shared" in check) continue;
    for (const [pairName, names] of Object.entries(pairs)) {
      it(`keeps ${store} apart between ${pairName}, either way round`, async () => {
        const [first, second] = names();
        await check(sideOf(first), sideOf(second));
        const [again, other] = names();
        await check(sideOf(other), sideOf(again));
      });
    }
  }
});
