import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  goldenHeaders,
  goldenPublicKey,
  goldenRandomBytes,
  goldenRequest,
  goldenSigningKey,
  goldenTimeMs,
} from "./golden.ts";
import { importPublicKey } from "./keys.ts";
import { signRequest } from "./sign.ts";
import { clockAt, memoryNonceStore } from "./signed-request.test-helper.ts";
import { verifyRequest } from "./verify.ts";

verifies("signed-request.signed-message", () => {
  it("signs the golden request to exactly the golden headers", async () => {
    const headers = await signRequest(goldenRequest, {
      key: await goldenSigningKey(),
      clock: clockAt(goldenTimeMs),
      randomBytes: goldenRandomBytes,
    });

    expect(headers).toEqual(goldenHeaders);
  });

  it("verifies the golden headers with the golden public key", async () => {
    const publicKey = await importPublicKey(goldenPublicKey);
    if (!publicKey.ok) throw new Error(publicKey.error);

    const verified = await verifyRequest(
      { ...goldenRequest, headers: new Headers(goldenHeaders) },
      {
        direction: "deployment-to-cloud",
        findKey: async () => ({ publicKey: publicKey.value, product: goldenRequest.product }),
        nonces: memoryNonceStore(),
        clock: clockAt(goldenTimeMs),
      },
    );

    expect(verified.ok).toBe(true);
  });
});
