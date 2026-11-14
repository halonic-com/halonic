/**
 * Two runtimes with different scopes share no blob (HAL-6803). Run by `scope.test.ts`, inside
 * workerd, against a real R2 bucket.
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

  it("uses the deployment's own names without a scope", async () => {
    const unscoped = await createRuntime(configured);
    const again = await createRuntime(configured);
    const ref = await unscoped.blobs.put(new TextEncoder().encode("shared"), "text/plain");
    expect(await again.blobs.get(ref.hash)).not.toBeNull();
  });
});
