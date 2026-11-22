import { decodeBase64url } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { bodyHash, signedMessage, signedRequestHeaders } from "./format.ts";
import { signRequest } from "./sign.ts";
import {
  clockAt,
  countingBytes,
  makeTestKey,
  signedAs,
  signingTime,
  usageRequest,
} from "./signed-request.test-helper.ts";

const encoder = new TextEncoder();

verifies("signed-request.signed-message", () => {
  it("signs the message built from every covered part", async () => {
    const key = await makeTestKey("cmd-2026-11");
    const request = usageRequest();
    const { headers } = await signedAs(request, key);

    expect(headers.get(signedRequestHeaders.keyId)).toBe("cmd-2026-11");
    expect(headers.get(signedRequestHeaders.timestamp)).toBe(String(signingTime / 1000));
    expect(headers.get(signedRequestHeaders.nonce)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(headers.get(signedRequestHeaders.signature)).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(headers.get(signedRequestHeaders.endUser)).toBe("usr_1");
    expect(headers.get(signedRequestHeaders.commandId)).toBe("cmd_1");

    const message = signedMessage({
      direction: "deployment-to-cloud",
      keyId: "cmd-2026-11",
      method: "POST",
      host: "app.example.com",
      pathAndQuery: "/v1/usage?batch=2",
      product: "prd_a",
      endUser: "usr_1",
      commandId: "cmd_1",
      timestamp: String(signingTime / 1000),
      nonce: headers.get(signedRequestHeaders.nonce) ?? "",
      bodyHash: await bodyHash(request.body),
    });
    const signature = decodeBase64url(headers.get(signedRequestHeaders.signature) ?? "");
    expect(signature).toBeDefined();
    expect(
      await crypto.subtle.verify("Ed25519", key.publicKey, signature ?? new Uint8Array(), message),
    ).toBe(true);
  });

  it("writes the message as one JSON array after the format label", () => {
    const message = signedMessage({
      direction: "cloud-to-deployment",
      keyId: "k",
      method: "GET",
      host: "h",
      pathAndQuery: "/p",
      product: "prd_a",
      endUser: undefined,
      commandId: undefined,
      timestamp: "1",
      nonce: "n",
      bodyHash: "b",
    });
    expect(new TextDecoder().decode(message)).toBe(
      '["halonic-signed-request-v1","cloud-to-deployment","k","GET","h","/p","prd_a","","","1","n","b"]',
    );
  });

  it("leaves out the customer and command headers when there are none", async () => {
    const key = await makeTestKey("k1");
    const { headers } = await signedAs(
      usageRequest({ endUser: undefined, commandId: undefined }),
      key,
    );
    expect(headers.has(signedRequestHeaders.endUser)).toBe(false);
    expect(headers.has(signedRequestHeaders.commandId)).toBe(false);
  });

  it("gives a different signature when any covered part changes", async () => {
    const key = await makeTestKey("k1");
    const signatureOf = async (overrides: Parameters<typeof usageRequest>[0]) =>
      (await signedAs(usageRequest(overrides), key)).headers.get(signedRequestHeaders.signature);
    const original = await signatureOf({});
    const changes = [
      { method: "PUT" },
      { url: "https://other.example.com/v1/usage?batch=2" },
      { url: "https://app.example.com/v1/usage/x?batch=2" },
      { url: "https://app.example.com/v1/usage?batch=3" },
      { body: encoder.encode('{"records":[1]}') },
      { endUser: "usr_2" },
      { commandId: "cmd_2" },
      { product: "prd_b" },
      { direction: "cloud-to-deployment" as const },
    ];
    for (const change of changes) {
      expect(await signatureOf(change), JSON.stringify(change)).not.toBe(original);
    }
  });

  it("refuses a customer or command id the headers can't carry", async () => {
    const key = await makeTestKey("k1");
    const context = { key: key.signing, clock: clockAt(signingTime), randomBytes: countingBytes };
    await expect(signRequest(usageRequest({ endUser: "usr_1\nx" }), context)).rejects.toThrow(
      "customer id",
    );
    await expect(signRequest(usageRequest({ commandId: "" }), context)).rejects.toThrow(
      "command id",
    );
  });

  it("refuses a random source that gives the wrong number of bytes", async () => {
    const key = await makeTestKey("k1");
    const context = {
      key: key.signing,
      clock: clockAt(signingTime),
      randomBytes: () => new Uint8Array(15),
    };
    await expect(signRequest(usageRequest(), context)).rejects.toThrow("16 random bytes");
  });
});
