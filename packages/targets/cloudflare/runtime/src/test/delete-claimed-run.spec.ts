/**
 * Deleting a scope erases the object of a run that was claimed but never published to the run
 * list (HAL-13217). Run by `delete-claimed-run.test.ts`, inside workerd, against real D1, R2 and
 * Durable Objects.
 */

import { env } from "cloudflare:workers";
import { checkClaims, scopePrefix } from "@halonicjs/host-server";
import { entered, started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { deleteScope } from "../delete-scope.ts";
import type { RuntimeEnv } from "../env.ts";
import { RunObject } from "../index.ts";
import { createScopedRuns, scopedRuntime } from "../scoped-runtime.ts";

export { CoordinationObject, RoutinesObject } from "../index.ts";

/** The Worker's run object; the spec never runs its alarm, so the run is never published. */
export class AlarmRunObject extends RunObject {}

// Test values made up for this file; the key is 32 bytes in base64url.
const configured = {
  ...(env as unknown as RuntimeEnv),
  HALONIC_SECRET_TOKEN_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  HALONIC_SECRET_SERVE_PASSWORD: "not-a-real-hash",
};

const { RUN } = env as unknown as { RUN: DurableObjectNamespace<AlarmRunObject> };
const runId = "r-acme-claimed";

describe("deleting a scope with a claimed run", () => {
  it("erases the object of a run the run list holds only as claimed", async () => {
    const tail = crypto.randomUUID().replaceAll("-", "");
    const actor = `eu_acme${tail}`;
    const session = checkClaims({
      aud: "app",
      sub: actor,
      scope: `o/org_acme${tail}`,
      role: "member",
    });
    if (session === null) throw new Error("The test's claims were refused.");
    const { scope } = session.principal;
    const ports = (await createScopedRuns(configured))(session.principal);
    if (ports.ownership === undefined)
      throw new Error("The scope's runtime gives no ownership store.");

    await ports.ownership.claim(runId, { startedBy: actor, visibility: "private" });
    const { runStore } = scopedRuntime(configured, scope);
    await runStore.append(runId, 0, [started(runId), entered(runId, 2)]);
    const runObject = () => RUN.get(RUN.idFromName(`${scopePrefix(scope)}${runId}`));
    expect(await runObject().namePrefix()).toBe(scopePrefix(scope));
    expect(await ports.runStore.list()).toEqual([]);

    expect(await deleteScope(configured, scope)).toEqual({ runs: 1 });
    expect(await runObject().namePrefix()).toBeNull();
    expect(await runStore.events(runId)).toEqual([]);
  });
});
