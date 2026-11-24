/**
 * Deleting a scope empties every binding of it and leaves another scope whole (HAL-13216). Run by
 * `delete-scope.test.ts`, inside workerd, against real D1, R2 and Durable Objects.
 */

import { env } from "cloudflare:workers";
import { parseScope, type Scope, scopeName, scopePrefix } from "@halonicjs/host-server";
import { entered, started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { deleteScope, deleteScopeRoutes } from "../delete-scope.ts";
import type { RuntimeEnv } from "../env.ts";
import { RunObject } from "../index.ts";
import type { Runtime } from "../runtime.ts";
import { scopedRuntime } from "../scoped-runtime.ts";

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
const runId = "r-acme-order";
const key = "acme-key";
const later = "2099-01-01T00:00:00.000Z";

/** Two scopes whose ids collide: the second is the first with a letter more. */
function scopePair(kind: "u/eu_" | "o/org_"): [Scope, Scope] {
  const name = `${kind}acme${crypto.randomUUID().replaceAll("-", "")}`;
  const first = parseScope(name);
  const second = parseScope(`${name}b`);
  if (first === null || second === null) throw new Error("The test's scopes were refused.");
  return [first, second];
}

/** Puts something in every binding of the scope: a run with a timer, a lease, a counter, a blob, a record and a token. */
async function fill(scope: Scope): Promise<Runtime> {
  const runtime = scopedRuntime(configured, scope);
  await runtime.runStore.append(runId, 0, [started(runId), entered(runId, 2)]);
  await runtime.scheduler.schedule(runId, "t-1", later);
  await RUN.get(RUN.idFromName(`${scopePrefix(scope)}${runId}`)).runAlarm();
  await runtime.coordination.tryAcquire(key, 60_000);
  await runtime.coordination.increment(key, 5);
  await runtime.blobs.put(new TextEncoder().encode("acme order"), "text/plain");
  await runtime.records.append([
    { at: later, collection: "leads", id: "1", op: "add", values: { name: "Ada" } },
  ]);
  await runtime.tokens.set("acme", "a-token");
  return runtime;
}

/** Whether every binding of the scope is empty, read through a runtime built afresh. */
async function expectEmpty(scope: Scope): Promise<void> {
  const runtime = scopedRuntime(configured, scope);
  expect(await runtime.runs.list()).toEqual([]);
  expect(await runtime.runStore.events(runId)).toEqual([]);
  expect(await runtime.scheduler.pending(runId)).toEqual([]);
  expect(await RUN.get(RUN.idFromName(`${scopePrefix(scope)}${runId}`)).namePrefix()).toBeNull();
  expect(await runtime.coordination.tryAcquire(key, 60_000)).not.toBeNull();
  expect(await runtime.coordination.increment(key, 1)).toEqual({ applied: true, value: 1 });
  expect(await runtime.blobs.hashes()).toEqual([]);
  expect(await runtime.records.collections()).toEqual([]);
  expect(await runtime.tokens.get("acme")).toBeNull();
}

/** Whether the scope still holds everything `fill` put there. */
async function expectWhole(runtime: Runtime): Promise<void> {
  expect((await runtime.runs.list()).map((run) => run.id)).toEqual([runId]);
  expect(await runtime.runStore.events(runId)).toHaveLength(2);
  expect((await runtime.scheduler.pending(runId)).map((timer) => timer.timerId)).toEqual(["t-1"]);
  expect(await runtime.coordination.tryAcquire(key, 60_000)).toBeNull();
  expect(await runtime.coordination.increment(key, 1)).toEqual({ applied: true, value: 6 });
  expect(await runtime.blobs.hashes()).toHaveLength(1);
  // The token store keeps its tokens in a collection of its own.
  expect(await runtime.records.collections()).toEqual(["_tokens", "leads"]);
  expect(await runtime.tokens.get("acme")).toBe("a-token");
}

describe("deleting a scope", () => {
  for (const kind of ["u/eu_", "o/org_"] as const) {
    it(`empties every binding of a ${kind} scope and leaves the scope it is the start of whole`, async () => {
      const [deleted, kept] = scopePair(kind);
      await fill(deleted);
      const keptRuntime = await fill(kept);

      expect(await deleteScope(configured, deleted)).toEqual({ runs: 1 });
      await expectEmpty(deleted);
      await expectWhole(keptRuntime);
    });
  }

  it("can run again, after a delete and on a scope that holds nothing", async () => {
    const [deleted] = scopePair("u/eu_");
    await fill(deleted);
    await deleteScope(configured, deleted);
    expect(await deleteScope(configured, deleted)).toEqual({ runs: 0 });
    await expectEmpty(deleted);
  });

  it("answers the admin route with the runs it erased, and 400 bad_scope for a scope that isn't one", async () => {
    const [route] = deleteScopeRoutes();
    if (route === undefined) throw new Error("The delete route is missing.");
    const [deleted] = scopePair("o/org_");
    await fill(deleted);
    const ask = (query: string) =>
      route.handler(
        new Request(`https://halonic.example.com/admin/scopes/delete${query}`, { method: "POST" }),
        configured,
      );
    for (const query of [
      "",
      "?scope=",
      `?scope=${encodeURIComponent("u/eu_acme0123456789abcdef/")}`,
    ]) {
      const refused = await ask(query);
      expect(refused.status).toBe(400);
      expect(await refused.json()).toMatchObject({ code: "bad_scope" });
    }
    const done = await ask(`?scope=${encodeURIComponent(scopeName(deleted))}`);
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({ deleted: { runs: 1 } });
    await expectEmpty(deleted);
  });
});
