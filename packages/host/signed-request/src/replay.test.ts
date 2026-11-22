import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { signedRequestHeaders, timeWindowSeconds } from "./format.ts";
import {
  makeTestKey,
  memoryNonceStore,
  receiver,
  signedAs,
  signingTime,
  usageRequest,
} from "./signed-request.test-helper.ts";
import type { NonceStore } from "./verify.ts";
import { verifyRequest } from "./verify.ts";

verifies("signed-request.replay", () => {
  it("refuses the same request sent again a minute later", async () => {
    const key = await makeTestKey("dep-1");
    const keys = { "dep-1": { publicKey: key.publicKey, product: "prd_a" } };
    const nonces = memoryNonceStore();
    const request = await signedAs(usageRequest(), key);

    expect((await verifyRequest(request, receiver(keys, { nonces }))).ok).toBe(true);
    const again = receiver(keys, { nonces, time: signingTime + 60_000 });
    expect(await verifyRequest(request, again)).toEqual({ ok: false, error: "replayed" });
  });

  it("keeps the nonce until the timestamp leaves the window", async () => {
    const key = await makeTestKey("dep-1");
    const keys = { "dep-1": { publicKey: key.publicKey, product: "prd_a" } };
    const kept: Date[] = [];
    const nonces: NonceStore = {
      async remember(_keyId, _nonce, keepUntil) {
        kept.push(keepUntil);
        return "new";
      },
    };
    await verifyRequest(await signedAs(usageRequest(), key), receiver(keys, { nonces }));
    expect(kept).toEqual([new Date(signingTime + timeWindowSeconds * 1000)]);
  });

  it("records no nonce for a bad signature, so the genuine request still goes through", async () => {
    const key = await makeTestKey("dep-1");
    const keys = { "dep-1": { publicKey: key.publicKey, product: "prd_a" } };
    const nonces = memoryNonceStore();
    const genuine = await signedAs(usageRequest(), key);
    const forged = new Headers(genuine.headers);
    forged.set(signedRequestHeaders.signature, "A".repeat(86));

    expect(
      await verifyRequest({ ...genuine, headers: forged }, receiver(keys, { nonces })),
    ).toEqual({
      ok: false,
      error: "bad_signature",
    });
    expect(nonces.size()).toBe(0);
    expect((await verifyRequest(genuine, receiver(keys, { nonces }))).ok).toBe(true);
  });

  it("accepts the same nonce from two different keys", async () => {
    const first = await makeTestKey("dep-1");
    const second = await makeTestKey("dep-2");
    const keys = {
      "dep-1": { publicKey: first.publicKey, product: "prd_a" },
      "dep-2": { publicKey: second.publicKey, product: "prd_a" },
    };
    const nonces = memoryNonceStore();
    expect(
      (await verifyRequest(await signedAs(usageRequest(), first), receiver(keys, { nonces }))).ok,
    ).toBe(true);
    expect(
      (await verifyRequest(await signedAs(usageRequest(), second), receiver(keys, { nonces }))).ok,
    ).toBe(true);
  });
});
