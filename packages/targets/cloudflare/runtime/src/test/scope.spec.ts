/**
 * Two runtimes with different scopes share no blob (HAL-6803), record or token (HAL-13216). Run by
 * `scope.test.ts`, inside workerd, against a real R2 bucket and D1 database.
 */

import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { RuntimeEnv } from "../env.ts";
import { createRuntime } from "../runtime.ts";

export { CoordinationObject, RoutinesObject, RunObject } from "../index.ts";

// Test values made up for this file; the key is 32 bytes in base64url.
const configured = {
  ...(env as unknown as RuntimeEnv),
  HALONIC_SECRET_TOKEN_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  HALONIC_SECRET_SERVE_PASSWORD: "not-a-real-hash",
};

describe("a runtime's scope", () => {
  it("keeps a blob from the runtime of another scope", async () => {
    const first = await createRuntime(configured, { scope: crypto.randomUUID() });
    const second = await createRuntime(configured, { scope: crypto.randomUUID() });
    const ref = await first.blobs.put(new TextEncoder().encode("hello"), "text/plain");
    expect(await first.blobs.get(ref.hash)).not.toBeNull();
    expect(await second.blobs.get(ref.hash)).toBeNull();
  });

  it("keeps a lease from the runtime of another scope", async () => {
    const first = await createRuntime(configured, { scope: crypto.randomUUID() });
    const second = await createRuntime(configured, { scope: crypto.randomUUID() });
    expect(await first.coordination.tryAcquire("scope-test", 60_000)).not.toBeNull();
    expect(await second.coordination.tryAcquire("scope-test", 60_000)).not.toBeNull();
  });

  it("keeps records and their collections from the runtime of another scope", async () => {
    const id = crypto.randomUUID();
    const first = await createRuntime(configured, { scope: `u/eu_${id}` });
    const second = await createRuntime(configured, { scope: `u/eu_${id}b` });
    const added = {
      at: "2026-01-01T00:00:00.000Z",
      collection: "leads",
      id: "1",
      op: "add" as const,
      values: { name: "Ada" },
    };
    await first.records.append([added]);
    expect(await second.records.changes("leads")).toEqual([]);
    expect(await second.records.collections()).toEqual([]);
    await second.records.compact("leads");
    expect(await first.records.changes("leads")).toEqual([added]);
  });

  it("keeps a sign-in token from the runtime of another scope", async () => {
    const id = crypto.randomUUID();
    const first = await createRuntime(configured, { scope: `o/org_${id}` });
    const second = await createRuntime(configured, { scope: `o/org_${id}b` });
    await first.tokens.set("acme", "first-scope-token");
    expect(await second.tokens.get("acme")).toBeNull();
    await second.tokens.set("acme", "second-scope-token");
    await second.tokens.remove("acme");
    expect(await first.tokens.get("acme")).toBe("first-scope-token");
  });

  it("uses the deployment's own names without a scope", async () => {
    const unscoped = await createRuntime(configured);
    const again = await createRuntime(configured);
    const ref = await unscoped.blobs.put(new TextEncoder().encode("shared"), "text/plain");
    expect(await again.blobs.get(ref.hash)).not.toBeNull();
  });
});
