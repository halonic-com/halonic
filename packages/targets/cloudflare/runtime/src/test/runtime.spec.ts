/**
 * The wiring inside workerd, against real D1, R2 and Durable Object bindings
 * (HAL-8632). Run by `runtime.test.ts`.
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

describe("the wiring in workerd", () => {
  it("keeps a token in the record store, sealed with the configured key", async () => {
    const { tokens } = await createRuntime(configured);
    await tokens.set("wiring-test", "token-value");
    expect(await tokens.get("wiring-test")).toBe("token-value");
  });

  it("keeps a blob in R2", async () => {
    const { blobs } = await createRuntime(configured);
    const ref = await blobs.put(new TextEncoder().encode("hello"), "text/plain");
    const bytes = await blobs.get(ref.hash);
    expect(new TextDecoder().decode(bytes ?? new Uint8Array())).toBe("hello");
  });

  it("takes a lease from the coordination object", async () => {
    const { coordination } = await createRuntime(configured);
    expect(await coordination.tryAcquire("wiring-test", 60_000)).toMatchObject({
      key: "wiring-test",
    });
  });

  it("sweeps an empty run list without waking anything", async () => {
    const { watchdog } = await createRuntime(configured);
    expect(await watchdog.sweep()).toEqual({ woken: [], failed: [], deferred: 0 });
  });

  it("refuses to wire when the token key is missing", async () => {
    const { HALONIC_SECRET_TOKEN_KEY: _key, ...withoutKey } = configured;
    await expect(createRuntime(withoutKey as RuntimeEnv)).rejects.toThrow("token-key");
  });
});
