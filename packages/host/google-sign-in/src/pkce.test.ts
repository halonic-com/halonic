import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  base64urlOf32Bytes,
  fixedRandomBytes,
  wrongCountRandomBytes,
} from "./fixed-random.test-helper.ts";
import { createPkcePair, pkceChallenge } from "./pkce.ts";

// RFC 7636, appendix B: the verifier's 32 bytes, the verifier and its S256 challenge.
const rfcVerifierBytes = new Uint8Array([
  116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105,
  214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121,
]);
const rfcVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const rfcChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

verifies("google-sign-in.pkce", () => {
  it("matches the example in RFC 7636, appendix B", async () => {
    const pkce = await createPkcePair(fixedRandomBytes(rfcVerifierBytes));

    expect(pkce).toEqual({ verifier: rfcVerifier, challenge: rfcChallenge, method: "S256" });
    expect(await pkceChallenge(rfcVerifier)).toBe(rfcChallenge);
  });

  it("makes a new 43-character verifier and challenge each time from the platform's randomness", async () => {
    const first = await createPkcePair();
    const second = await createPkcePair();

    for (const pkce of [first, second]) {
      expect(pkce.verifier).toMatch(base64urlOf32Bytes);
      expect(pkce.challenge).toMatch(base64urlOf32Bytes);
      expect(pkce.challenge).not.toBe(pkce.verifier);
      expect(pkce.method).toBe("S256");
    }
    expect(second.verifier).not.toBe(first.verifier);
  });

  it("refuses a random source that gives too few or too many bytes", async () => {
    await expect(createPkcePair(wrongCountRandomBytes(31))).rejects.toThrow(
      "gave 31 bytes, but a sign-in secret needs 32",
    );
    await expect(createPkcePair(wrongCountRandomBytes(33))).rejects.toThrow("gave 33 bytes");
  });
});
