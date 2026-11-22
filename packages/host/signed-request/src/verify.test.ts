import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { signedRequestHeaders } from "./format.ts";
import {
  makeTestKey,
  receiver,
  signedAs,
  signingTime,
  type TestKey,
  usageRequest,
} from "./signed-request.test-helper.ts";
import { type ReceivedRequest, verifyRequest } from "./verify.ts";

const minute = 60_000;

function withHeader(
  request: ReceivedRequest,
  name: string,
  value: string | undefined,
): ReceivedRequest {
  const headers = new Headers(request.headers);
  if (value === undefined) {
    headers.delete(name);
  } else {
    headers.set(name, value);
  }
  return { ...request, headers };
}

async function setUp(): Promise<{
  key: TestKey;
  keys: Record<string, { publicKey: CryptoKey; product: string }>;
}> {
  const key = await makeTestKey("dep-1");
  return { key, keys: { "dep-1": { publicKey: key.publicKey, product: "prd_a" } } };
}

verifies("signed-request.verify", () => {
  it("accepts a request signed a minute ago and returns what it was signed for", async () => {
    const { key, keys } = await setUp();
    const request = await signedAs(usageRequest(), key, signingTime - minute);
    const result = await verifyRequest(request, receiver(keys));
    expect(result).toEqual({
      ok: true,
      value: {
        keyId: "dep-1",
        product: "prd_a",
        endUser: "usr_1",
        commandId: "cmd_1",
        signedAt: new Date(signingTime - minute),
      },
    });
  });

  describe("headers", () => {
    it.each([
      signedRequestHeaders.keyId,
      signedRequestHeaders.timestamp,
      signedRequestHeaders.nonce,
      signedRequestHeaders.signature,
    ])("refuses a request without %s", async (name) => {
      const { key, keys } = await setUp();
      const request = withHeader(await signedAs(usageRequest(), key), name, undefined);
      expect(await verifyRequest(request, receiver(keys))).toEqual({
        ok: false,
        error: "missing_header",
      });
    });

    it.each([
      [signedRequestHeaders.keyId, "dep 1"],
      [signedRequestHeaders.timestamp, "1.5"],
      [signedRequestHeaders.nonce, "AAAA"],
      [signedRequestHeaders.signature, "A".repeat(85)],
      [signedRequestHeaders.endUser, "usr 1"],
      [signedRequestHeaders.commandId, "cmd/1"],
    ])("refuses a malformed %s before looking up a key", async (name, value) => {
      const { key } = await setUp();
      let lookedUp = false;
      const context = {
        ...receiver({}),
        findKey: async () => {
          lookedUp = true;
          return undefined;
        },
      };
      const request = withHeader(await signedAs(usageRequest(), key), name, value);
      expect(await verifyRequest(request, context)).toEqual({
        ok: false,
        error: "malformed_header",
      });
      expect(lookedUp).toBe(false);
    });
  });

  it.each([
    ["6 minutes ago", signingTime - 6 * minute],
    ["6 minutes ahead", signingTime + 6 * minute],
  ])("refuses a request signed %s", async (_, time) => {
    const { key, keys } = await setUp();
    const request = await signedAs(usageRequest(), key, time);
    expect(await verifyRequest(request, receiver(keys))).toEqual({
      ok: false,
      error: "outside_time_window",
    });
  });

  it("accepts a request signed exactly 5 minutes ago", async () => {
    const { key, keys } = await setUp();
    const request = await signedAs(usageRequest(), key, signingTime - 5 * minute);
    expect((await verifyRequest(request, receiver(keys))).ok).toBe(true);
  });

  it("refuses a key the receiver doesn't accept now", async () => {
    const { key } = await setUp();
    const request = await signedAs(usageRequest(), key);
    expect(await verifyRequest(request, receiver({}))).toEqual({ ok: false, error: "unknown_key" });
  });

  it("refuses a request changed on the way", async () => {
    const { key, keys } = await setUp();
    const original = await signedAs(usageRequest(), key);
    const changed: ReceivedRequest[] = [
      { ...original, body: new TextEncoder().encode('{"records":[1]}') },
      { ...original, method: "PUT" },
      { ...original, url: "https://app.example.com/v1/other?batch=2" },
      { ...original, url: "https://app.example.com/v1/usage?batch=3" },
      { ...original, url: "https://evil.example.com/v1/usage?batch=2" },
      withHeader(original, signedRequestHeaders.endUser, "usr_2"),
      withHeader(original, signedRequestHeaders.endUser, undefined),
      withHeader(original, signedRequestHeaders.commandId, "cmd_2"),
      withHeader(original, signedRequestHeaders.timestamp, String(signingTime / 1000 + 1)),
    ];
    for (const request of changed) {
      expect(await verifyRequest(request, receiver(keys))).toEqual({
        ok: false,
        error: "bad_signature",
      });
    }
  });

  it("refuses a request signed for another product than the key's", async () => {
    const { key, keys } = await setUp();
    const request = await signedAs(usageRequest({ product: "prd_b" }), key);
    expect(await verifyRequest(request, receiver(keys))).toEqual({
      ok: false,
      error: "bad_signature",
    });
  });

  it("refuses a request signed for the other direction", async () => {
    const { key, keys } = await setUp();
    const request = await signedAs(usageRequest(), key);
    const context = receiver(keys, { direction: "cloud-to-deployment" });
    expect(await verifyRequest(request, context)).toEqual({ ok: false, error: "bad_signature" });
  });

  it("refuses a request signed by another key under the same id", async () => {
    const { keys } = await setUp();
    const impostor = await makeTestKey("dep-1");
    const request = await signedAs(usageRequest(), impostor);
    expect(await verifyRequest(request, receiver(keys))).toEqual({
      ok: false,
      error: "bad_signature",
    });
  });

  it("reads the method and host whatever their case", async () => {
    const { key, keys } = await setUp();
    const request = await signedAs(
      usageRequest({ method: "post", url: "https://APP.example.com/v1/usage?batch=2" }),
      key,
    );
    expect((await verifyRequest({ ...request, method: "POST" }, receiver(keys))).ok).toBe(true);
  });
});
