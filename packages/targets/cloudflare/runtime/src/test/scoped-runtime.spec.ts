/**
 * Each scope's runtime and run objects keep to that scope (HAL-17134). Run by
 * `scoped-runtime.test.ts`, inside workerd, against real D1, R2 and Durable Objects.
 */

import { env } from "cloudflare:workers";
import { writeDefinitionSnapshot } from "@halonicjs/adapter-cloudflare-storage";
import { checkClaims, type Principal, scopePrefix } from "@halonicjs/host-server";
import { started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import type { RuntimeEnv } from "../env.ts";
import { RunObject } from "../index.ts";
import { createScopedRuns, scopedRuntime } from "../scoped-runtime.ts";

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

/** An id tail no other case uses: 16 to 40 letters or digits, as scope ids need. */
function freshTail(): string {
  return `acme${crypto.randomUUID().replaceAll("-", "")}`;
}

/** The checked principal of a session in `scope`; an organisation's member when it is `o/`. */
function principalIn(scope: string, actor = `eu_${freshTail()}`): Principal {
  const isPersonal = scope.startsWith("u/");
  const claims = isPersonal
    ? { aud: "app", sub: scope.slice(2), scope }
    : { aud: "app", sub: actor, scope, role: "member" };
  const session = checkClaims(claims);
  if (session === null) throw new Error(`The test's claims for ${scope} were refused.`);
  return session.principal;
}

/** Appends a run in the principal's scope and runs its object's alarm, so the run list has it. */
async function storeRun(principal: Principal): Promise<string> {
  const { runStore } = scopedRuntime(configured, principal.scope);
  const runId = `r-${crypto.randomUUID()}`;
  expect(await runStore.append(runId, 0, [started(runId)])).toMatchObject({ ok: true });
  await RUN.get(RUN.idFromName(`${scopePrefix(principal.scope)}${runId}`)).runAlarm();
  return runId;
}

/** Checks that what `owner` stored, `other` can't list, read or find. */
async function expectApart(owner: Principal, other: Principal): Promise<void> {
  const scopedRuns = await createScopedRuns(configured);
  const runId = await storeRun(owner);
  const ownerRuns = scopedRuns(owner).runStore;
  const otherRuns = scopedRuns(other).runStore;
  expect((await ownerRuns.list()).map((run) => run.id)).toContain(runId);
  expect((await otherRuns.list()).map((run) => run.id)).not.toContain(runId);
  expect(await otherRuns.get(runId)).toBeNull();

  const ownerBlobs = scopedRuntime(configured, owner.scope).blobs;
  const otherBlobs = scopedRuntime(configured, other.scope).blobs;
  const ref = await ownerBlobs.put(new TextEncoder().encode(`order ${runId}`), "text/plain");
  expect(await ownerBlobs.get(ref.hash)).not.toBeNull();
  expect(await otherBlobs.get(ref.hash)).toBeNull();
}

describe("a scope's runtime", () => {
  it("keeps one personal scope's runs and blobs from another's", async () => {
    await expectApart(principalIn(`u/eu_${freshTail()}`), principalIn(`u/eu_${freshTail()}`));
  });

  it("keeps one organisation's runs and blobs from another's", async () => {
    await expectApart(principalIn(`o/org_${freshTail()}`), principalIn(`o/org_${freshTail()}`));
  });

  it("keeps a personal scope apart from an organisation whose id ends alike", async () => {
    const tail = freshTail();
    const personal = principalIn(`u/eu_${tail}`);
    const organisation = principalIn(`o/org_${tail}`, personal.actor);
    await expectApart(personal, organisation);
    await expectApart(organisation, personal);
  });

  it("names the run object of a scoped append under the scope's prefix", async () => {
    const principal = principalIn(`u/eu_${freshTail()}`);
    const runId = await storeRun(principal);
    const object = RUN.get(RUN.idFromName(`${scopePrefix(principal.scope)}${runId}`));
    expect(await object.namePrefix()).toBe(scopePrefix(principal.scope));
    expect(await RUN.get(RUN.idFromName(runId)).namePrefix()).toBeNull();
  });

  it("names the timer object of a scoped schedule under the scope's prefix", async () => {
    const principal = principalIn(`o/org_${freshTail()}`);
    const { scheduler } = scopedRuntime(configured, principal.scope);
    const key = `r-${crypto.randomUUID()}`;
    await scheduler.schedule(key, "t-1", new Date(Date.now() + 3_600_000).toISOString());
    const object = RUN.get(RUN.idFromName(`${scopePrefix(principal.scope)}${key}`));
    expect(await object.namePrefix()).toBe(scopePrefix(principal.scope));
  });

  it("reads the deployment's definitions, not a snapshot under the scope", async () => {
    const principal = principalIn(`u/eu_${freshTail()}`);
    const bucket = configured.DEFINITIONS as unknown as Parameters<
      typeof writeDefinitionSnapshot
    >[0];
    const indexes = { routines: [], runDefinitions: {} };
    await writeDefinitionSnapshot(bucket, { "deployed.md": "the deployer's" }, indexes);
    const underScope = scopePrefix(principal.scope);
    await writeDefinitionSnapshot(bucket, { "deployed.md": "the scope's" }, indexes, underScope);

    const { definitions } = scopedRuntime(configured, principal.scope);
    expect(await definitions.read("deployed.md")).toBe("the deployer's");
  });
});
